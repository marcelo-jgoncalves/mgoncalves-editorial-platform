import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";
import { dynamo } from "../../common/dynamodb";
import { parseAutorItem } from "../../common/autorPersistence";
import { logger } from "../../common/logger";
import { requireEnv } from "../../common/env";

const TABLE_NAME = requireEnv("AUTORES_TABLE");

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

export const handler: APIGatewayProxyHandler = async (event, context) => {
  const requestId = context.awsRequestId;
  const id = event.pathParameters?.id;

  if (!id) {
    logger.warn("missing_author_id", { requestId });
    return { statusCode: 400, body: JSON.stringify({ message: "ID do autor é obrigatório" }), headers };
  }

  logger.debug("get_author_request", { requestId, authorId: id });

  try {
    const result = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { autor_id: id } }));

    if (!result.Item) {
      logger.info("author_not_found", { requestId, authorId: id });
      return { statusCode: 404, body: JSON.stringify({ message: "Autor não encontrado" }), headers };
    }

    const autor = parseAutorItem(result.Item, { requestId, autorId: id });
    logger.info("author_fetched", { requestId, authorId: id });
    return { statusCode: 200, body: JSON.stringify({ autor }), headers };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("get_author_error", { requestId, authorId: id, error: message });
    return { statusCode: 500, body: JSON.stringify({ message: "Internal Server Error", requestId }), headers };
  }
};
