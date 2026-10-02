// requireEnv() throws at module load if AUTORES_TABLE is unset: this must
// run before the `./index` import below, not in beforeAll (too late).
process.env.AUTORES_TABLE = 'test-autores-table';

import { APIGatewayEventRequestContext, APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from './index';
import { dynamo } from '../../common/dynamodb';

jest.mock('../../common/dynamodb', () => ({
  dynamo: { send: jest.fn() },
}));

const mockSend = dynamo.send as jest.Mock;

const ctx = {
  awsRequestId: 'req-test-author-1',
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'getAuthor',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123:function:getAuthor',
  memoryLimitInMB: '128',
  logGroupName: '/aws/lambda/getAuthor',
  logStreamName: '2026/01/01/[$LATEST]test',
  getRemainingTimeInMillis: () => 30000,
  done: jest.fn(),
  fail: jest.fn(),
  succeed: jest.fn(),
} as Context;

function event(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    path: '/autores/marcelo-goncalves',
    pathParameters: { id: 'marcelo-goncalves' },
    queryStringParameters: null,
    requestContext: {} as APIGatewayEventRequestContext,
    resource: '/autores/{id}',
    stageVariables: null,
    ...overrides,
  };
}

const SAMPLE_AUTOR = {
  autor_id: 'marcelo-goncalves',
  nome_exibicao: 'Marcelo Gonçalves',
  bio: 'Bio curta',
  foto_avatar_url: 'https://example.com/avatar.jpg',
  foto_avatar_alt_text: 'Foto de Marcelo',
  linkedin_url: 'https://linkedin.com/in/x',
  github_url: 'https://github.com/x',
};

beforeAll(() => {
  process.env.AUTORES_TABLE = 'test-autores-table';
  process.env.LOG_LEVEL = 'ERROR';
});

beforeEach(() => {
  mockSend.mockReset();
});

describe('getAuthor handler', () => {
  it('returns 400 when id is missing', async () => {
    const result = await handler(event({ pathParameters: null }), ctx, jest.fn());
    expect(result?.statusCode).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 404 when DynamoDB returns no item', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const result = await handler(event(), ctx, jest.fn());
    expect(result?.statusCode).toBe(404);
  });

  it('returns 200 with the author when found', async () => {
    mockSend.mockResolvedValueOnce({ Item: SAMPLE_AUTOR });
    const result = await handler(event(), ctx, jest.fn());

    expect(result?.statusCode).toBe(200);
    const body = JSON.parse(result?.body ?? '{}');
    expect(body.autor).toEqual(SAMPLE_AUTOR);
  });

  // parseAutorItem's failure path (Q1, docs/book/cases/CASE-008): introduced
  // by the A1 fix but never actually tested until this quality-axis pass.
  it('returns 500 (not 200 with malformed data) when the stored item is missing a required field', async () => {
    const { nome_exibicao, ...corruptedItem } = SAMPLE_AUTOR;
    void nome_exibicao;
    mockSend.mockResolvedValueOnce({ Item: corruptedItem });

    const result = await handler(event(), ctx, jest.fn());

    expect(result?.statusCode).toBe(500);
  });
});
