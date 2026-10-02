import { APIGatewayProxyHandler } from "aws-lambda";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { autorInputSchema } from "@mgoncalves/contracts";
import { dynamo } from "../../common/dynamodb";
import { parseAutorItem } from "../../common/autorPersistence";
import { logger } from "../../common/logger";
import { sanitizePostHtml } from "../../common/sanitizer";
import { requireEnv } from "../../common/env";
import { parseJsonBody } from "../../common/httpBody";

const TABLE_NAME = requireEnv("AUTHORS_TABLE");
const ADMIN_ORIGIN = requireEnv("ADMIN_ORIGIN");

const headers = {
  "Access-Control-Allow-Origin": ADMIN_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

export const handler: APIGatewayProxyHandler = async (event, context) => {
  const requestId = context.awsRequestId;
  const { httpMethod, pathParameters, body } = event;
  const authorId = pathParameters?.id;

  logger.debug("admin_authors_request", { requestId, httpMethod, authorId });

  try {
    // 1. GET - fetch author by ID
    if (httpMethod === 'GET') {
      if (!authorId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Author ID is required" }) };
      }

      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { autor_id: authorId }
      });

      const result = await dynamo.send(command);

      if (!result.Item) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Author not found" }) };
      }

      const autor = parseAutorItem(result.Item, { requestId, autorId: authorId });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ autor })
      };
    }

    // 2. PUT - update/create author (upsert)
    if (httpMethod === 'PUT' || httpMethod === 'POST') {
      if (!body) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Body is required" }) };
      }

      // URL id takes precedence over the body id when both are present.
      const rawData = parseJsonBody(body);
      if (rawData === undefined) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
      }

      const parsed = autorInputSchema.safeParse(rawData);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
        logger.warn("admin_authors_validation_error", { requestId, issues });
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid author data", issues }) };
      }
      const data = parsed.data;
      const finalId = authorId || data.autor_id;

      if (!finalId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Author ID is required" }) };
      }

      // `bio` is rendered via dangerouslySetInnerHTML on the public blog
      // (PostFooter.tsx, AuthorBox.tsx): needs the same allowlist used on
      // conteudo_html (adminPosts), otherwise it's a direct stored XSS vector.
      const authorItem = {
        autor_id: finalId,
        nome_exibicao: data.nome_exibicao,
        bio: sanitizePostHtml(data.bio ?? ""),
        foto_avatar_url: data.foto_avatar_url,
        foto_avatar_alt_text: data.foto_avatar_alt_text,
        linkedin_url: data.linkedin_url,
        github_url: data.github_url,
        instagram_url: data.instagram_url,
        updated_at: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: authorItem
      });

      await dynamo.send(command);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: "Author saved successfully", autor: authorItem })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("admin_authors_error", { requestId, httpMethod, authorId, error: message });
    return { statusCode: 500, headers, body: JSON.stringify({ message: "Internal Server Error", requestId }) };
  }
};