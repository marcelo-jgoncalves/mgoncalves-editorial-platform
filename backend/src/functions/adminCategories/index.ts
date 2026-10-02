import { APIGatewayProxyHandler } from "aws-lambda";
import { ScanCommand, GetCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { categoriaInputSchema } from "@mgoncalves/contracts";
import { dynamo } from "../../common/dynamodb";
import { parseCategoriaItem } from "../../common/categoriaPersistence";
import { logger } from "../../common/logger";
import { isConditionalCheckFailure } from "../../common/dynamoErrors";
import { requireEnv } from "../../common/env";
import { parseJsonBody } from "../../common/httpBody";

const TABLE_NAME = requireEnv("CATEGORIAS_TABLE");
const ADMIN_ORIGIN = requireEnv("ADMIN_ORIGIN");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": ADMIN_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handler: APIGatewayProxyHandler = async (event, context) => {
  const requestId = context.awsRequestId;

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, body: "", headers };
  }

  const { httpMethod, pathParameters, body } = event;
  const slug = pathParameters?.slug;

  logger.debug("admin_categorias_request", { requestId, httpMethod, slug });

  try {
    if (httpMethod === "GET" && !slug) {
      return await listCategorias(requestId);
    }

    if (httpMethod === "GET" && slug) {
      return await getCategoria(slug, requestId);
    }

    if (httpMethod === "POST") {
      if (!body) {
        return { statusCode: 400, body: JSON.stringify({ message: "Body is required" }), headers };
      }
      return await saveCategoria(parseJsonBody(body), true, requestId);
    }

    if (httpMethod === "PUT" && slug) {
      if (!body) {
        return { statusCode: 400, body: JSON.stringify({ message: "Body is required" }), headers };
      }
      const data = parseJsonBody(body);
      if ((data as { categoria_slug?: string } | undefined)?.categoria_slug !== slug) {
        return { statusCode: 400, body: JSON.stringify({ message: "Slug mismatch" }), headers };
      }
      return await saveCategoria(data, false, requestId);
    }

    if (httpMethod === "DELETE" && slug) {
      return await deleteCategoria(slug, requestId);
    }

    return { statusCode: 405, body: JSON.stringify({ message: "Method Not Allowed" }), headers };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("admin_categorias_error", { requestId, httpMethod, error: message });
    return { statusCode: 500, body: JSON.stringify({ message: "Internal Server Error", requestId }), headers };
  }
};

async function listCategorias(requestId: string) {
  const result = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME }));
  const items = (result.Items || [])
    .map((item) => parseCategoriaItem(item, { requestId }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  logger.info("categorias_listed", { requestId, count: items.length });
  return { statusCode: 200, body: JSON.stringify({ items, count: items.length }), headers };
}

async function getCategoria(slug: string, requestId: string) {
  const result = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { categoria_slug: slug } }));
  if (!result.Item) {
    return { statusCode: 404, body: JSON.stringify({ message: "Categoria not found" }), headers };
  }
  const categoria = parseCategoriaItem(result.Item, { requestId, categoriaSlug: slug });
  logger.info("categoria_fetched", { requestId, slug });
  return { statusCode: 200, body: JSON.stringify(categoria), headers };
}

async function saveCategoria(rawData: unknown, isNew: boolean, requestId: string) {
  const parsed = categoriaInputSchema.safeParse(rawData);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    logger.warn("admin_categorias_validation_error", { requestId, issues });
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid categoria data", issues }), headers };
  }
  const data = parsed.data;

  // A plain Put has no protection against overwriting: a create silently
  // replacing an existing categoria_slug, or an update silently recreating
  // one that was deleted between the admin loading the form and saving it.
  try {
    await dynamo.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: data,
      ConditionExpression: isNew ? "attribute_not_exists(categoria_slug)" : "attribute_exists(categoria_slug)",
    }));
  } catch (error) {
    if (isConditionalCheckFailure(error)) {
      return isNew
        ? { statusCode: 409, body: JSON.stringify({ message: "A categoria with this slug already exists" }), headers }
        : { statusCode: 404, body: JSON.stringify({ message: "Categoria not found" }), headers };
    }
    throw error;
  }
  logger.info("categoria_saved", { requestId, slug: data.categoria_slug });
  return { statusCode: 200, body: JSON.stringify({ message: "Categoria saved", categoria_slug: data.categoria_slug }), headers };
}

async function deleteCategoria(slug: string, requestId: string) {
  await dynamo.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { categoria_slug: slug } }));
  logger.info("categoria_deleted", { requestId, slug });
  return { statusCode: 200, body: JSON.stringify({ message: "Categoria deleted" }), headers };
}
