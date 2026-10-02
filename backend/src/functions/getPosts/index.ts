import { APIGatewayProxyHandler, APIGatewayProxyEventQueryStringParameters } from "aws-lambda";
import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo } from "../../common/dynamodb";
import { logger } from "../../common/logger";
import { getPostCounters } from "../../common/postCounters";
import { getCategoriaNomeMap, attachCategoriaNome } from "../../common/categorias";
import { parsePostListItems, parseFullPostItems } from "../../common/postPersistence";
import { requireEnv } from "../../common/env";

const TABLE_NAME = requireEnv("POSTS_TABLE");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*", 
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const handler: APIGatewayProxyHandler = async (event, context) => {
  const requestId = context.awsRequestId;
  const { queryStringParameters, pathParameters, resource } = event;

  logger.debug("get_posts_request", { requestId, resource, queryStringParameters });

  try {
    if (resource.includes("/posts/recentes")) {
      return await getRecentPosts(queryStringParameters, requestId);
    }
    if (resource.includes("/posts/populares")) {
      return await getPopularPosts(queryStringParameters, requestId);
    }
    if (resource.includes("/categoria/") && pathParameters?.slug) {
      return await getPostsByCategory(pathParameters.slug, queryStringParameters, requestId);
    }
    if (resource.includes("/busca") || queryStringParameters?.q) {
      return await searchPosts(queryStringParameters?.q || "", queryStringParameters, requestId);
    }
    if (resource.includes("/projeto")) {
      return await getProjectPosts(queryStringParameters, requestId);
    }
    return await getAllPosts(queryStringParameters, requestId);

  } catch (error) {
    if (error instanceof InvalidNextTokenError) {
      logger.warn("get_posts_invalid_next_token", { requestId, resource });
      return { statusCode: 400, body: JSON.stringify({ message: "Invalid nextToken", requestId }), headers };
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error("get_posts_error", { requestId, resource, error: message });
    return { statusCode: 500, body: JSON.stringify({ message: "Internal Server Error", requestId }), headers };
  }
};

function toTitleCase(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Both user-controlled inputs need bounds: an unclamped ?limit reads the
// whole GSI in one request (cheap RCU abuse), and a malformed nextToken
// would otherwise throw inside JSON.parse/atob and surface as a 500,
// polluting the 5xx-based availability SLI with what is really a client error.
const MAX_LIMIT = 50;

function parseLimit(raw: string | undefined, fallback: number): number {
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_LIMIT);
}

class InvalidNextTokenError extends Error {}

function parseNextToken(token: string | undefined): Record<string, unknown> | undefined {
  if (!token) return undefined;
  try {
    const decoded: unknown = JSON.parse(atob(token));
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      throw new Error("not an object");
    }
    return decoded as Record<string, unknown>;
  } catch {
    throw new InvalidNextTokenError("Malformed nextToken");
  }
}

async function getProjectPosts(queryParams: APIGatewayProxyEventQueryStringParameters | null, requestId?: string) {
  const limit = parseLimit(queryParams?.limit, 8);
  const nextToken = queryParams?.nextToken;

  const postsCommand = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "ProjetoPorData_v2",
    KeyConditionExpression: "e_projeto_marker = :val",
    FilterExpression: "#status = :published",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":val": "PROJ", ":published": "Publicado" },
    ScanIndexForward: true,
    Limit: limit,
    ExclusiveStartKey: parseNextToken(nextToken),
  });

  // totalCount comes from the aggregated counter (postCounters.ts), not a
  // 2nd Query: avoids doubling the read cost on every request just to
  // show "Page X of Y".
  const [result, counters, categoriaMap] = await Promise.all([
    dynamo.send(postsCommand),
    getPostCounters(),
    getCategoriaNomeMap(),
  ]);

  const newNextToken = result.LastEvaluatedKey
    ? btoa(JSON.stringify(result.LastEvaluatedKey))
    : null;
  const totalCount = counters.total_projeto_publicado;
  const posts = attachCategoriaNome(parsePostListItems(result.Items || [], { requestId }), categoriaMap);

  logger.info("project_posts_fetched", { requestId, count: posts.length, totalCount });
  return {
    statusCode: 200,
    body: JSON.stringify({ posts, nextToken: newNextToken, totalCount }),
    headers
  };
}

async function searchPosts(term: string, queryParams: APIGatewayProxyEventQueryStringParameters | null, requestId?: string) {
  if (!term || term.trim() === "") {
    return { statusCode: 200, body: JSON.stringify({ posts: [], termo_busca: term }), headers };
  }

  const nextToken = queryParams?.nextToken;

  const tLower = term.toLowerCase();
  const tUpper = term.toUpperCase();
  const tTitle = toTitleCase(term);

  // No Limit: Limit on ScanCommand applies BEFORE the FilterExpression,
  // which would make DynamoDB read only N items and return 0 results even
  // when matching posts exist. The Scan reads the whole table instead.
  const command = new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: `
      (#status = :published) AND (
        (contains(titulo, :t1) OR contains(titulo, :t2) OR contains(titulo, :t3))
        OR
        (contains(resumo, :t1) OR contains(resumo, :t2) OR contains(resumo, :t3))
      )
    `,
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":t1": tLower, ":t2": tUpper, ":t3": tTitle, ":published": "Publicado"
    },
    ExclusiveStartKey: parseNextToken(nextToken)
  });

  const [result, categoriaMap] = await Promise.all([dynamo.send(command), getCategoriaNomeMap()]);
  const newNextToken = result.LastEvaluatedKey ? btoa(JSON.stringify(result.LastEvaluatedKey)) : null;
  // Full-item Scan (no ProjectionExpression): the stricter full schema
  // applies here, not postListItemSchema — see parseFullPostItems' comment.
  const posts = attachCategoriaNome(parseFullPostItems(result.Items || [], { requestId }), categoriaMap);

  logger.info("search_posts_fetched", { requestId, term, count: posts.length });
  return { statusCode: 200, body: JSON.stringify({ termo_busca: term, posts, nextToken: newNextToken }), headers };
}

async function getPopularPosts(queryParams: APIGatewayProxyEventQueryStringParameters | null, requestId?: string) {
  const limit = parseLimit(queryParams?.limit, 6);

  const command = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "PopularesPorData_v2",
    KeyConditionExpression: "e_popular_marker = :popular",
    FilterExpression: "#status = :published",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":popular": "POP", ":published": "Publicado" },
    ScanIndexForward: false,
    Limit: limit,
  });

  const [result, categoriaMap] = await Promise.all([dynamo.send(command), getCategoriaNomeMap()]);
  const posts = attachCategoriaNome(parsePostListItems(result.Items || [], { requestId }), categoriaMap);
  logger.info("popular_posts_fetched", { requestId, count: posts.length });
  return {
    statusCode: 200,
    body: JSON.stringify({ posts }),
    headers,
  };
}

async function getRecentPosts(queryParams: APIGatewayProxyEventQueryStringParameters | null, requestId?: string) {
  const limit = parseLimit(queryParams?.limit, 6);
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "StatusPorData",
    KeyConditionExpression: "#status = :status",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":status": "Publicado" },
    ScanIndexForward: false,
    Limit: limit
  });
  const [result, categoriaMap] = await Promise.all([dynamo.send(command), getCategoriaNomeMap()]);
  const posts = attachCategoriaNome(parsePostListItems(result.Items || [], { requestId }), categoriaMap);
  logger.info("recent_posts_fetched", { requestId, count: posts.length });
  return { statusCode: 200, body: JSON.stringify({ posts }), headers };
}

async function getAllPosts(queryParams: APIGatewayProxyEventQueryStringParameters | null, requestId?: string) {
  const limit = parseLimit(queryParams?.limit, 9);
  const nextToken = queryParams?.nextToken;

  const postsCommand = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "StatusPorData",
    KeyConditionExpression: "#status = :status",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":status": "Publicado" },
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: parseNextToken(nextToken)
  });

  // totalCount comes from the aggregated counter (postCounters.ts), not a
  // 2nd Query: this second query used to make /artigos the slowest route
  // under load, just to show "Page X of Y".
  const [result, counters, categoriaMap] = await Promise.all([
    dynamo.send(postsCommand),
    getPostCounters(),
    getCategoriaNomeMap(),
  ]);

  const newNextToken = result.LastEvaluatedKey ? btoa(JSON.stringify(result.LastEvaluatedKey)) : null;
  const totalCount = counters.total_publicado;
  const posts = attachCategoriaNome(parsePostListItems(result.Items || [], { requestId }), categoriaMap);

  logger.info("all_posts_fetched", { requestId, count: posts.length, totalCount });
  return {
    statusCode: 200,
    body: JSON.stringify({ posts, nextToken: newNextToken, totalCount }),
    headers
  };
}

async function getPostsByCategory(categorySlug: string, queryParams: APIGatewayProxyEventQueryStringParameters | null, requestId?: string) {
  const limit = parseLimit(queryParams?.limit, 9);
  const nextToken = queryParams?.nextToken;

  // No FilterExpression: Limit on QueryCommand counts items BEFORE the
  // filter, which would return fewer than limit results when the category
  // has drafts. Status is filtered in memory instead; volume per category is low.
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "CategoriaPorData",
    KeyConditionExpression: "categoria_slug = :cat",
    ExpressionAttributeValues: { ":cat": categorySlug },
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: parseNextToken(nextToken)
  });

  const [result, categoriaMap] = await Promise.all([dynamo.send(command), getCategoriaNomeMap()]);
  const validItems = parsePostListItems(result.Items || [], { requestId });
  const publishedPosts = validItems.filter((item) => item.status === "Publicado");
  const posts = attachCategoriaNome(publishedPosts, categoriaMap);
  const newNextToken = result.LastEvaluatedKey ? btoa(JSON.stringify(result.LastEvaluatedKey)) : null;
  const categoryName = categoriaMap.get(categorySlug) || categorySlug;

  logger.info("category_posts_fetched", { requestId, categorySlug, count: posts.length });
  return {
    statusCode: 200,
    body: JSON.stringify({ posts, nextToken: newNextToken, category: { slug: categorySlug, nome: categoryName } }),
    headers
  };
}