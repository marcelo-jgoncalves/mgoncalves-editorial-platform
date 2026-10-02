import { APIGatewayProxyHandler } from "aws-lambda";
import { QueryCommand, GetCommand, PutCommand, DeleteCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo } from "../../common/dynamodb";
import { Post } from "../../common/types";
import { logger } from "../../common/logger";
import { sanitizePostHtml } from "../../common/sanitizer";
import { createPostInputSchema, updatePostInputSchema, UpdatePostInput } from "../../common/postSchema";
import { computeCounterDeltas, buildCounterTransactUpdate } from "../../common/postCounters";
import { invalidatePostCache } from "../../common/cacheInvalidation";
import { isConditionalCheckFailure } from "../../common/dynamoErrors";
import { requireEnv } from "../../common/env";
import { parseJsonBody } from "../../common/httpBody";
import { parsePostItem, parsePostListItems } from "../../common/postPersistence";

const TABLE_NAME = requireEnv("POSTS_TABLE");
const ADMIN_ORIGIN = requireEnv("ADMIN_ORIGIN");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": ADMIN_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Fields where the merge below treats an explicit `null` in the client
// payload as "delete this key from the persisted item": matches
// updatePostInputSchema's nullable fields exactly (packages/contracts/src/post.ts).
// DynamoDB's marshaller (common/dynamodb.ts, removeUndefinedValues: true)
// only strips `undefined`, not a literal `null`, so this has to be explicit.
const REMOVABLE_FIELDS = ["subtitulo", "imagem_lqip_base64"] as const;

export const handler: APIGatewayProxyHandler = async (event, context) => {
  const requestId = context.awsRequestId;

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, body: "", headers };
  }

  const { httpMethod, pathParameters, body, queryStringParameters } = event;
  const slug = pathParameters?.slug;

  logger.debug("admin_posts_request", { requestId, httpMethod, slug });

  try {
    if (httpMethod === "GET" && !slug) {
      return await listPosts(requestId);
    }

    if (httpMethod === "GET" && slug) {
      return await getPost(slug, requestId);
    }

    if (httpMethod === "POST") {
      if (!body) {
        return { statusCode: 400, body: JSON.stringify({ message: "Body is required" }), headers };
      }
      const postData = parseJsonBody(body);
      if (postData === undefined) {
        return { statusCode: 400, body: JSON.stringify({ message: "Invalid JSON body" }), headers };
      }
      return await savePost(postData, true, requestId);
    }

    // Partial PATCH: savePost() merges the payload onto the existing item.
    if (httpMethod === "PATCH" && slug) {
      if (!body) {
        return { statusCode: 400, body: JSON.stringify({ message: "Body is required" }), headers };
      }
      const postData = parseJsonBody(body);
      if (postData === undefined) {
        return { statusCode: 400, body: JSON.stringify({ message: "Invalid JSON body" }), headers };
      }
      // slug is optional on a partial PATCH payload now that
      // updatePostInputSchema doesn't require it: only reject when the
      // client actually sent one and it disagrees with the URL's {slug}.
      const bodySlug = (postData as { slug?: string }).slug;
      if (bodySlug !== undefined && bodySlug !== slug) {
        return { statusCode: 400, body: JSON.stringify({ message: "Slug mismatch" }), headers };
      }
      return await savePost(postData, false, requestId, slug);
    }

    // Requires the version known by the client via query string: see
    // deletePost() for why the version read by the backend at request time
    // isn't enough on its own.
    if (httpMethod === "DELETE" && slug) {
      return await deletePost(slug, queryStringParameters?.version, requestId);
    }

    return {
      statusCode: 405,
      body: JSON.stringify({ message: "Method Not Allowed" }),
      headers,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("admin_posts_error", { requestId, httpMethod, slug, error: message });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error", requestId }),
      headers,
    };
  }
};

async function listPosts(requestId?: string) {
  const statuses = ["Publicado", "Rascunho", "Programado"];

  const results = await Promise.all(
    statuses.map((status) =>
      dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "StatusPorData",
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": status },
        ProjectionExpression:
          "slug, titulo, #status, data_atualizacao, autor_id, categoria_slug, imagem_destaque_url, tempo_leitura_min, e_popular, e_projeto, version",
        ScanIndexForward: false,
      }))
    )
  );

  const rawItems = results.flatMap((r) => r.Items || []);
  const allItems = parsePostListItems(rawItems, { requestId });

  return {
    statusCode: 200,
    body: JSON.stringify({ items: allItems, count: allItems.length }),
    headers,
  };
}

async function getPost(slug: string, requestId?: string) {
  const result = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { slug }
  }));

  if (!result.Item) {
    return {
        statusCode: 404,
        body: JSON.stringify({ message: "Post not found" }),
        headers
    };
  }

  const post = parsePostItem(result.Item, { requestId, slug });

  return {
    statusCode: 200,
    body: JSON.stringify(post),
    headers,
  };
}

async function savePost(rawData: unknown, isNew: boolean, requestId?: string, urlSlug?: string) {
  const schema = isNew ? createPostInputSchema : updatePostInputSchema;
  const parsed = schema.safeParse(rawData);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    logger.warn("admin_posts_validation_error", { requestId, issues });
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid post data", issues }),
      headers,
    };
  }
  const data = parsed.data;

  // Read before the overwrite only to know the prior state (status/e_projeto)
  // and compute the delta for the aggregated counters (postCounters.ts).
  // urlSlug, not data.slug: slug is optional on updatePostInputSchema now
  // (a genuinely partial PATCH may omit it), and urlSlug is already the only
  // source of truth for which item an update targets (see the comment on
  // `item.slug` below).
  const existingItem = isNew
    ? undefined
    : (await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { slug: urlSlug } }))).Item;
  const existing = existingItem ? parsePostItem(existingItem, { requestId, slug: urlSlug }) : undefined;

  // Cheap early exit for the common (non-racing) case: the Get above already
  // tells us the post is gone, so there's no reason to sanitize HTML and
  // build the full item just to have the ConditionExpression reject it below.
  // The ConditionExpression remains the actual guarantee against a
  // create-vs-create or update-vs-delete race between this Get and the Put.
  if (!isNew && !existing) {
    return { statusCode: 404, body: JSON.stringify({ message: "Post not found" }), headers };
  }

  const now = new Date().toISOString();

  // PATCH semantics: an update's payload only overrides what it actually
  // sends: a field the admin form omits (or a future partial client that
  // only sends the diff) keeps its previous value instead of being wiped by
  // spreading `data` alone. On create there's no `existing` to merge onto.
  const merged: Record<string, unknown> = { ...(existing ?? {}), ...(data as Record<string, unknown>) };
  if (!isNew) {
    for (const field of REMOVABLE_FIELDS) {
      if ((data as Record<string, unknown>)[field] === null) delete merged[field];
    }
  }

  const ePopular: 0 | 1 = merged.e_popular === 1 ? 1 : 0;
  const eProjeto: 0 | 1 = merged.e_projeto === 1 ? 1 : 0;

  const item: Post = {
    ...(merged as unknown as Post),
    // slug is never taken from the client payload on update: the URL's
    // {slug} path param is the only source of truth, closing off a PATCH
    // body that tries to rewrite which item it's targeting.
    slug: isNew ? (data as { slug: string }).slug : urlSlug!,
    conteudo_html: sanitizePostHtml((merged.conteudo_html as string) ?? ""),
    data_atualizacao: now,
    // Never write an empty string: when e_popular/e_projeto=1, the sparse
    // GSIs (PopularesPorData_v2/ProjetoPorData_v2) use this field as the
    // range key, and an empty AttributeValue on an index key attribute is
    // rejected by DynamoDB. Falls back to the existing value on update, or
    // "now" on create/first time.
    data_publicacao: (merged.data_publicacao as string) || existing?.data_publicacao || now,
    e_popular: ePopular,
    e_projeto: eProjeto,
    // undefined is omitted by the marshaller (removeUndefinedValues: true in
    // common/dynamodb.ts): this is what makes the index sparse, the attribute
    // simply doesn't exist on the item when the flag is 0.
    e_popular_marker: ePopular === 1 ? "POP" : undefined,
    e_projeto_marker: eProjeto === 1 ? "PROJ" : undefined,
    tempo_leitura_min: Number(merged.tempo_leitura_min || 5),
    version: (existing?.version ?? 0) + 1,
  };

  // Put + counter ADD in one transaction: a crash between two sequential
  // writes would leave the aggregated counters drifted. The scheduled
  // postCounterReconciler detects and repairs this drift, but only on its
  // next run, so the transaction still matters to keep the window small.
  // Falls back to a plain Put when the write doesn't change the aggregates:
  // cheaper than a transaction.
  //
  // The base ConditionExpression is the actual protection against a slug
  // already existing on create (a plain Put with no condition silently
  // overwrites), or against updating a post deleted between the Get above
  // and this write (the race the pre-check above can't close). updatePostInputSchema
  // requires `version`, so the match clause below is unconditional on every
  // update, not best-effort: it always rejects a write based on stale data
  // from a second concurrent editor, see the 409 handling in usePostForm.ts's save().
  let conditionExpression = isNew ? "attribute_not_exists(slug)" : "attribute_exists(slug)";
  let expressionAttributeNames: Record<string, string> | undefined;
  let expressionAttributeValues: Record<string, unknown> | undefined;
  if (!isNew) {
    conditionExpression += " AND #version = :expectedVersion";
    expressionAttributeNames = { "#version": "version" };
    expressionAttributeValues = { ":expectedVersion": (data as UpdatePostInput).version };
  }

  const counterUpdate = buildCounterTransactUpdate(computeCounterDeltas(existing, item));
  try {
    if (counterUpdate) {
      await dynamo.send(new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: item,
              ConditionExpression: conditionExpression,
              ExpressionAttributeNames: expressionAttributeNames,
              ExpressionAttributeValues: expressionAttributeValues,
            },
          },
          counterUpdate,
        ],
      }));
    } else {
      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: conditionExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }));
    }
  } catch (error) {
    if (isConditionalCheckFailure(error)) {
      return isNew
        ? { statusCode: 409, body: JSON.stringify({ message: "A post with this slug already exists" }), headers }
        : { statusCode: 409, body: JSON.stringify({ message: "Post was modified by someone else since it was loaded" }), headers };
    }
    throw error;
  }

  // Post just became publicly countable (created already published, or
  // transitioned from Rascunho/Programado to Publicado): the home page
  // (recent posts) goes stale too, not just the post page.
  const ficouPublicado = item.status === "Publicado" && existing?.status !== "Publicado";
  await invalidatePostCache(ficouPublicado ? [`/post/${item.slug}`, "/", "/artigos", "/todos-artigos", "/categoria/*"] : [`/post/${item.slug}`]);

  return {
    statusCode: isNew ? 201 : 200,
    body: JSON.stringify({
      message: isNew ? "Post created" : "Post updated",
      slug: item.slug,
      version: item.version,
      data_atualizacao: item.data_atualizacao,
    }),
    headers,
  };
}

async function deletePost(slug: string, clientVersionRaw?: string, requestId?: string) {
  // Required, not optional: a version read by this handler off DynamoDB
  // right before the delete only protects the race between that read and
  // this write, not whether the user actually saw the version they're
  // removing. Without a client-supplied version, a user looking at a stale
  // v5 in their UI can silently delete a post that's really at v6 (edited
  // from another session/tab since) with no warning: the same staleness
  // PATCH already rejects with a 409 via its own required `version` field.
  if (clientVersionRaw === undefined) {
    return { statusCode: 400, body: JSON.stringify({ message: "version is required to delete a post" }), headers };
  }
  const clientVersion = Number(clientVersionRaw);
  if (!Number.isInteger(clientVersion) || clientVersion < 0) {
    return { statusCode: 400, body: JSON.stringify({ message: "version must be a non-negative integer" }), headers };
  }

  const existingItem = (await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { slug } }))).Item;

  if (!existingItem) {
    return { statusCode: 404, body: JSON.stringify({ message: "Post not found" }), headers };
  }

  const existing = parsePostItem(existingItem, { requestId, slug });

  // The leading attribute_exists(slug) is load-bearing, not redundant: once
  // the first delete in a race removes the item, "attribute_not_exists(version)"
  // alone is also true for the now-gone item, so a lone version clause would
  // let a second concurrent delete slip through and double-decrement the
  // counters. attribute_exists(slug) closes that by requiring the item to
  // still be there. "OR #version = :expectedVersion" still covers posts
  // saved before the version field existed (never re-saved since): there's
  // no real optimistic-lock value to check against those. The clause is
  // checked against the client's own version (not existing.version, read a
  // moment ago by this same request) so a second editor's concurrent update
  // between the client's last GET and this delete is rejected with a 409,
  // same as a stale PATCH.
  const deleteConditionExpression = "attribute_exists(slug) AND (attribute_not_exists(#version) OR #version = :expectedVersion)";
  const deleteExpressionAttributeNames = { "#version": "version" };
  const deleteExpressionAttributeValues = { ":expectedVersion": clientVersion };

  const counterUpdate = buildCounterTransactUpdate(computeCounterDeltas(existing, undefined));
  try {
    if (counterUpdate) {
      await dynamo.send(new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: TABLE_NAME,
              Key: { slug },
              ConditionExpression: deleteConditionExpression,
              ExpressionAttributeNames: deleteExpressionAttributeNames,
              ExpressionAttributeValues: deleteExpressionAttributeValues,
            },
          },
          counterUpdate,
        ],
      }));
    } else {
      await dynamo.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { slug },
        ConditionExpression: deleteConditionExpression,
        ExpressionAttributeNames: deleteExpressionAttributeNames,
        ExpressionAttributeValues: deleteExpressionAttributeValues,
      }));
    }
  } catch (error) {
    if (isConditionalCheckFailure(error)) {
      return { statusCode: 409, body: JSON.stringify({ message: "Post was modified by someone else since it was loaded" }), headers };
    }
    throw error;
  }

  await invalidatePostCache(existing?.status === "Publicado" ? [`/post/${slug}`, "/", "/artigos", "/todos-artigos", "/categoria/*"] : [`/post/${slug}`]);

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Post deleted" }),
    headers,
  };
}