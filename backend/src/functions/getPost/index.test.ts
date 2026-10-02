// requireEnv() throws at module load if POSTS_TABLE is unset: this must
// run before the `./index` import below, not in beforeAll (too late).
process.env.POSTS_TABLE = 'test-posts-table';
process.env.CATEGORIAS_TABLE = 'test-categorias-table';

import { APIGatewayEventRequestContext, APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from './index';
import { dynamo } from '../../common/dynamodb';

jest.mock('../../common/dynamodb', () => ({
  dynamo: { send: jest.fn() },
}));

const mockSend = dynamo.send as jest.Mock;

const ctx = {
  awsRequestId: 'req-test-123',
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'getPost',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123:function:getPost',
  memoryLimitInMB: '128',
  logGroupName: '/aws/lambda/getPost',
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
    path: '/posts/test-slug',
    pathParameters: { slug: 'test-slug' },
    queryStringParameters: null,
    requestContext: {} as APIGatewayEventRequestContext,
    resource: '/posts/{slug}',
    stageVariables: null,
    ...overrides,
  };
}

// A minimal valid post: every field parsePostItem's schema requires.
// "post not found" tests below don't need this (Rascunho/Programado are
// rejected by the status check before parsePostItem ever runs), but every
// "post found" test does, since a real Publicado item always has all of it.
const BASE_PUBLISHED_POST = {
  slug: 'test-slug',
  titulo: 'My Post',
  conteudo_html: '<p>Content</p>',
  resumo: 'Resumo',
  imagem_destaque_url: 'https://example.com/img.jpg',
  imagem_destaque_alt_text: 'Alt text',
  categoria_slug: 'aws',
  autor_id: 'marcelo-goncalves',
  status: 'Publicado',
  data_publicacao: '2026-01-01T00:00:00.000Z',
  data_atualizacao: '2026-01-01T00:00:00.000Z',
  tempo_leitura_min: 5,
  e_popular: 0,
  e_projeto: 0,
  version: 1,
};

beforeAll(() => {
  process.env.POSTS_TABLE = 'test-posts-table';
  process.env.CATEGORIAS_TABLE = 'test-categorias-table';
  process.env.LOG_LEVEL = 'ERROR';
});

beforeEach(() => {
  mockSend.mockReset();
  // Default fallback for the categorias Scan fired after a found post
  // (getCategoriaNomeMap): individual tests still queue their own
  // mockResolvedValueOnce for the post GetItem they assert on.
  mockSend.mockImplementation(() => Promise.resolve({ Items: [] }));
});

describe('getPost handler', () => {
  describe('input validation', () => {
    it('returns 400 when slug is missing', async () => {
      const result = await handler(event({ pathParameters: null }), ctx, jest.fn());
      expect(result?.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns 400 when pathParameters is empty object', async () => {
      const result = await handler(event({ pathParameters: {} }), ctx, jest.fn());
      expect(result?.statusCode).toBe(400);
    });
  });

  describe('post not found', () => {
    it('returns 404 when DynamoDB returns no item', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });
      const result = await handler(event(), ctx, jest.fn());
      expect(result?.statusCode).toBe(404);
    });

    it('returns 404 when post status is Rascunho', async () => {
      mockSend.mockResolvedValueOnce({ Item: { slug: 'test-slug', status: 'Rascunho', titulo: 'Test' } });
      const result = await handler(event(), ctx, jest.fn());
      expect(result?.statusCode).toBe(404);
    });

    it('returns 404 when post status is Programado', async () => {
      mockSend.mockResolvedValueOnce({ Item: { slug: 'test-slug', status: 'Programado', titulo: 'Test' } });
      const result = await handler(event(), ctx, jest.fn());
      expect(result?.statusCode).toBe(404);
    });
  });

  describe('post found', () => {
    it('returns 200 with post data when status is Publicado', async () => {
      mockSend.mockResolvedValueOnce({ Item: BASE_PUBLISHED_POST });

      const result = await handler(event(), ctx, jest.fn());

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body ?? '{}');
      expect(body.post).toEqual(BASE_PUBLISHED_POST);
    });

    it('returns 200 for a legacy post with no version field (real dev data has these)', async () => {
      const { version, ...legacyPost } = BASE_PUBLISHED_POST;
      void version;
      mockSend.mockResolvedValueOnce({ Item: legacyPost });

      const result = await handler(event(), ctx, jest.fn());

      expect(result?.statusCode).toBe(200);
    });

    it('calls DynamoDB with correct key', async () => {
      mockSend.mockResolvedValueOnce({ Item: BASE_PUBLISHED_POST });
      await handler(event(), ctx, jest.fn());

      const sentCommand = mockSend.mock.calls[0][0];
      expect(sentCommand.input.Key).toEqual({ slug: 'test-slug' });
    });

    it('response includes CORS headers', async () => {
      mockSend.mockResolvedValueOnce({ Item: BASE_PUBLISHED_POST });
      const result = await handler(event(), ctx, jest.fn());
      expect(result?.headers?.['Access-Control-Allow-Origin']).toBe('*');
    });

    it('anexa category com o nome real da tabela categorias, não o slug', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { ...BASE_PUBLISHED_POST, categoria_slug: 'devops-automacao' },
      });
      mockSend.mockResolvedValueOnce({
        Items: [{ categoria_slug: 'devops-automacao', nome: 'DevOps & Automação' }],
      });

      const result = await handler(event(), ctx, jest.fn());

      const body = JSON.parse(result?.body ?? '{}');
      expect(body.category).toEqual({ categoria_slug: 'devops-automacao', nome_exibicao: 'DevOps & Automação' });
    });

    it('omite category quando o post não tem categoria_slug correspondente', async () => {
      mockSend.mockResolvedValueOnce({ Item: BASE_PUBLISHED_POST });
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await handler(event(), ctx, jest.fn());

      const body = JSON.parse(result?.body ?? '{}');
      expect(body.category).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('returns 500 when DynamoDB throws', async () => {
      mockSend.mockRejectedValueOnce(new Error('DynamoDB connection failed'));
      const result = await handler(event(), ctx, jest.fn());
      expect(result?.statusCode).toBe(500);
    });

    // parsePostItem's own comment claims corrupted data "fails loudly here
    // rather than reaching business logic silently malformed" - this is the
    // test that actually proves it, found missing during the Block 1
    // quality-axis audit (docs/book/cases/CASE-008).
    it('returns 500 (not 200 with malformed data) when a Publicado item is missing a required field', async () => {
      const { conteudo_html, ...corruptedItem } = BASE_PUBLISHED_POST;
      void conteudo_html;
      mockSend.mockResolvedValueOnce({ Item: corruptedItem });

      const result = await handler(event(), ctx, jest.fn());

      expect(result?.statusCode).toBe(500);
    });
  });
});
