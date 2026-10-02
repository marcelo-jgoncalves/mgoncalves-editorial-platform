// requireEnv() throws at module load if CATEGORIAS_TABLE/ADMIN_ORIGIN are
// unset: this must run before the `./index` import below, not in beforeAll
// (too late).
process.env.CATEGORIAS_TABLE = 'test-categorias-table';
process.env.ADMIN_ORIGIN = 'https://test-admin.example.com';

import { APIGatewayEventRequestContext, APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from './index';
import { dynamo } from '../../common/dynamodb';

jest.mock('../../common/dynamodb', () => ({
  dynamo: { send: jest.fn() },
}));

const mockSend = dynamo.send as jest.Mock;

const ctx = {
  awsRequestId: 'req-categorias-1',
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'adminCategories',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123:function:adminCategories',
  memoryLimitInMB: '128',
  logGroupName: '/aws/lambda/adminCategories',
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
    path: '/admin/categorias',
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {} as APIGatewayEventRequestContext,
    resource: '/admin/categorias',
    stageVariables: null,
    ...overrides,
  };
}

const SAMPLE_CATEGORIA = { categoria_slug: 'devops-automacao', nome: 'DevOps & Automação' };

const conditionalError = Object.assign(new Error('The conditional request failed'), {
  name: 'ConditionalCheckFailedException',
});

beforeAll(() => {
  process.env.CATEGORIAS_TABLE = 'test-categorias-table';
  process.env.LOG_LEVEL = 'ERROR';
});

beforeEach(() => {
  jest.resetAllMocks();
});

describe('adminCategories handler', () => {
  describe('GET /admin/categorias (list) and /:slug (get one)', () => {
    it('returns the categoria when found', async () => {
      mockSend.mockResolvedValueOnce({ Item: SAMPLE_CATEGORIA });
      const result = await handler(
        event({ pathParameters: { slug: 'devops-automacao' } }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(200);
      expect(JSON.parse(result?.body ?? '{}')).toEqual(SAMPLE_CATEGORIA);
    });

    it('returns 404 when the categoria is not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });
      const result = await handler(
        event({ pathParameters: { slug: 'nao-existe' } }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(404);
    });

    // parseCategoriaItem's failure path (Q1, docs/book/cases/CASE-008):
    // introduced by A1 but never actually tested until this quality-axis pass.
    it('returns 500 when the stored item is missing a required field', async () => {
      mockSend.mockResolvedValueOnce({ Item: { categoria_slug: 'devops-automacao' } }); // missing nome
      const result = await handler(
        event({ pathParameters: { slug: 'devops-automacao' } }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(500);
    });

    it('lists categorias sorted by nome, dropping a malformed item instead of failing the whole list', async () => {
      const malformed = { categoria_slug: 'sem-nome' }; // missing nome
      mockSend.mockResolvedValueOnce({
        Items: [{ categoria_slug: 'z-slug', nome: 'Zebra' }, malformed, SAMPLE_CATEGORIA],
      });
      const result = await handler(event({ pathParameters: null }), ctx, jest.fn());

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body ?? '{}');
      expect(body.count).toBe(2);
      expect(body.items.map((i: { categoria_slug: string }) => i.categoria_slug)).toEqual([
        'devops-automacao',
        'z-slug',
      ]);
    });
  });

  describe('POST /admin/categorias (create)', () => {
    it('creates a new categoria and returns 200', async () => {
      mockSend.mockResolvedValueOnce({});
      const result = await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(SAMPLE_CATEGORIA) }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(200);
    });

    it('sends attribute_not_exists(categoria_slug) as the ConditionExpression', async () => {
      mockSend.mockResolvedValueOnce({});
      await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(SAMPLE_CATEGORIA) }),
        ctx,
        jest.fn(),
      );
      expect(mockSend.mock.calls[0][0].input.ConditionExpression).toBe('attribute_not_exists(categoria_slug)');
    });

    it('returns 409 when the categoria_slug already exists', async () => {
      mockSend.mockRejectedValueOnce(conditionalError);
      const result = await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(SAMPLE_CATEGORIA) }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(409);
    });
  });

  describe('PUT /admin/categorias/:slug (update)', () => {
    it('updates an existing categoria and returns 200', async () => {
      mockSend.mockResolvedValueOnce({});
      const result = await handler(
        event({
          httpMethod: 'PUT',
          pathParameters: { slug: 'devops-automacao' },
          body: JSON.stringify(SAMPLE_CATEGORIA),
        }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(200);
      expect(mockSend.mock.calls[0][0].input.ConditionExpression).toBe('attribute_exists(categoria_slug)');
    });

    it('returns 404 when updating a categoria that does not exist', async () => {
      mockSend.mockRejectedValueOnce(conditionalError);
      const result = await handler(
        event({
          httpMethod: 'PUT',
          pathParameters: { slug: 'nao-existe' },
          body: JSON.stringify({ ...SAMPLE_CATEGORIA, categoria_slug: 'nao-existe' }),
        }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(404);
    });

    it('returns 400 on slug mismatch', async () => {
      const result = await handler(
        event({
          httpMethod: 'PUT',
          pathParameters: { slug: 'outro-slug' },
          body: JSON.stringify(SAMPLE_CATEGORIA),
        }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
