// requireEnv() throws at module load if POSTS_TABLE is unset: this must
// run before the `./index` import below, not in beforeAll (too late).
process.env.POSTS_TABLE = 'test-posts-table';

import { APIGatewayEventRequestContext, APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from './index';
import { dynamo } from '../../common/dynamodb';

jest.mock('../../common/dynamodb', () => ({
  dynamo: { send: jest.fn() },
}));

const mockSend = dynamo.send as jest.Mock;

const ctx = {
  awsRequestId: 'req-test-456',
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'getPosts',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123:function:getPosts',
  memoryLimitInMB: '128',
  logGroupName: '/aws/lambda/getPosts',
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
    path: '/posts',
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {} as APIGatewayEventRequestContext,
    resource: '/posts',
    stageVariables: null,
    ...overrides,
  };
}

const POST_A = { slug: 'post-a', status: 'Publicado', titulo: 'Post A', categoria_slug: 'aws' };
const POST_B = { slug: 'post-b', status: 'Publicado', titulo: 'Post B', categoria_slug: 'aws' };

beforeAll(() => {
  process.env.POSTS_TABLE = 'test-posts-table';
  process.env.CATEGORIAS_TABLE = 'test-categorias-table';
  process.env.LOG_LEVEL = 'ERROR';
});

beforeEach(() => {
  mockSend.mockReset();
  // Default fallback for the categorias Scan every handler now fires
  // alongside the posts query (getCategoriaNomeMap): individual tests still
  // queue their own mockResolvedValueOnce for the calls they assert on;
  // this only backstops the untested category-lookup call.
  mockSend.mockImplementation(() => Promise.resolve({ Items: [] }));
});

describe('getPosts handler', () => {
  describe('/posts/recentes', () => {
    it('returns recent posts from StatusPorData GSI', async () => {
      mockSend.mockResolvedValueOnce({ Items: [POST_A, POST_B] });

      const result = await handler(event({ resource: '/posts/recentes' }), ctx, jest.fn());

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body ?? '{}');
      expect(body.posts).toHaveLength(2);
    });

    it('queries with ScanIndexForward false (newest first)', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });
      await handler(event({ resource: '/posts/recentes' }), ctx, jest.fn());

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.IndexName).toBe('StatusPorData');
      expect(cmd.input.ScanIndexForward).toBe(false);
      expect(cmd.input.Limit).toBe(6);
    });
  });

  describe('/posts/populares', () => {
    it('uses PopularesPorData_v2 GSI with e_popular_marker=POP', async () => {
      mockSend.mockResolvedValueOnce({ Items: [POST_A] });

      await handler(event({ resource: '/posts/populares' }), ctx, jest.fn());

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.IndexName).toBe('PopularesPorData_v2');
      expect(cmd.input.ExpressionAttributeValues[':popular']).toBe('POP');
    });

    it('filters only Publicado status', async () => {
      mockSend.mockResolvedValueOnce({ Items: [POST_A] });

      await handler(event({ resource: '/posts/populares' }), ctx, jest.fn());

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.ExpressionAttributeValues[':published']).toBe('Publicado');
    });

    it('returns posts array with status 200', async () => {
      mockSend.mockResolvedValueOnce({ Items: [POST_A, POST_B] });

      const result = await handler(event({ resource: '/posts/populares' }), ctx, jest.fn());

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body ?? '{}');
      expect(body.posts).toHaveLength(2);
    });

    it('uses default limit 6', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await handler(event({ resource: '/posts/populares' }), ctx, jest.fn());

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.Limit).toBe(6);
    });

    it('respects custom limit from query param', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await handler(
        event({ resource: '/posts/populares', queryStringParameters: { limit: '3' } }),
        ctx,
        jest.fn(),
      );

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.Limit).toBe(3);
    });

    it('orders newest first (ScanIndexForward false)', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await handler(event({ resource: '/posts/populares' }), ctx, jest.fn());

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.ScanIndexForward).toBe(false);
    });

    it('does NOT fall through to getAllPosts', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await handler(event({ resource: '/posts/populares' }), ctx, jest.fn());

      // getAllPosts fires 3 calls (item Query + counter GetCommand + categoria Scan);
      // populares fires only 2 (item Query + categoria Scan, no counter).
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('/categoria/:slug', () => {
    it('returns posts filtered by category and only Publicado', async () => {
      mockSend.mockResolvedValueOnce({ Items: [POST_A] });

      const result = await handler(
        event({ resource: '/categoria/{slug}', pathParameters: { slug: 'aws' } }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body ?? '{}');
      expect(body.posts).toHaveLength(1);
    });

    it('uses CategoriaPorData GSI and queries by slug', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });
      await handler(
        event({ resource: '/categoria/{slug}', pathParameters: { slug: 'devops' } }),
        ctx,
        jest.fn(),
      );

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.IndexName).toBe('CategoriaPorData');
      expect(cmd.input.ExpressionAttributeValues[':cat']).toBe('devops');
    });

    it('sem FilterExpression — evita truncação Limit+Filter no DynamoDB', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });
      await handler(
        event({ resource: '/categoria/{slug}', pathParameters: { slug: 'aws' } }),
        ctx,
        jest.fn(),
      );

      const cmd = mockSend.mock.calls[0][0];
      // FilterExpression on QueryCommand makes Limit count items BEFORE the
      // filter; without it, Limit counts only category items and we filter
      // status in memory.
      expect(cmd.input.FilterExpression).toBeUndefined();
    });

    it('anexa nome real da categoria a partir da tabela categorias, não do slug', async () => {
      const postComCategoria = { ...POST_A, categoria_slug: 'devops-automacao' };
      mockSend.mockResolvedValueOnce({ Items: [postComCategoria] }); // posts query
      mockSend.mockResolvedValueOnce({
        Items: [{ categoria_slug: 'devops-automacao', nome: 'DevOps & Automação' }],
      }); // categorias scan

      const result = await handler(
        event({ resource: '/categoria/{slug}', pathParameters: { slug: 'devops-automacao' } }),
        ctx,
        jest.fn(),
      );

      const body = JSON.parse(result?.body ?? '{}');
      // Real category name from the categorias table, not a Title-Case guess
      // from the slug (which would produce "Devops Automacao": wrong caps,
      // missing accent, missing "&").
      expect(body.posts[0].categoria.nome_exibicao).toBe('DevOps & Automação');
      expect(body.category.nome).toBe('DevOps & Automação');
    });

    it('filtra apenas posts Publicado em memória', async () => {
      const draft = { slug: 'draft', status: 'Rascunho', titulo: 'Draft', categoria_slug: 'aws' };
      mockSend.mockResolvedValueOnce({ Items: [POST_A, draft] });

      const result = await handler(
        event({ resource: '/categoria/{slug}', pathParameters: { slug: 'aws' } }),
        ctx,
        jest.fn(),
      );

      const body = JSON.parse(result?.body ?? '{}');
      expect(body.posts).toHaveLength(1);
      expect(body.posts[0].slug).toBe('post-a');
    });

    it('returns nextToken when DynamoDB has more results', async () => {
      const lastKey = { slug: 'post-x', status: 'Publicado', data_publicacao: '2026-01-01' };
      mockSend.mockResolvedValueOnce({ Items: [POST_A], LastEvaluatedKey: lastKey });

      const result = await handler(
        event({ resource: '/categoria/{slug}', pathParameters: { slug: 'aws' } }),
        ctx,
        jest.fn(),
      );

      const body = JSON.parse(result?.body ?? '{}');
      expect(body.nextToken).not.toBeNull();
    });
  });

  describe('/busca', () => {
    it('returns empty array for blank search term', async () => {
      const result = await handler(
        event({ resource: '/busca', queryStringParameters: { q: '' } }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(200);
      expect(JSON.parse(result?.body ?? '{}').posts).toHaveLength(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('searches with Publicado filter in ScanCommand', async () => {
      mockSend.mockResolvedValueOnce({ Items: [POST_A] });

      await handler(
        event({ resource: '/busca', queryStringParameters: { q: 'aws' } }),
        ctx,
        jest.fn(),
      );

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.ExpressionAttributeValues[':published']).toBe('Publicado');
    });

    it('does not set Limit (evita truncação pré-filtro do DynamoDB)', async () => {
      mockSend.mockResolvedValueOnce({ Items: [POST_A] });

      await handler(
        event({ resource: '/busca', queryStringParameters: { q: 'lambda' } }),
        ctx,
        jest.fn(),
      );

      const cmd = mockSend.mock.calls[0][0];
      // Limit on a ScanCommand with FilterExpression reads N items BEFORE
      // filtering: with Limit:9, if the first 9 items don't match, it
      // returns an empty array.
      expect(cmd.input.Limit).toBeUndefined();
    });

    it('searches título e resumo com três variantes de capitalização', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await handler(
        event({ resource: '/busca', queryStringParameters: { q: 'serverless' } }),
        ctx,
        jest.fn(),
      );

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.ExpressionAttributeValues[':t1']).toBe('serverless');   // lower
      expect(cmd.input.ExpressionAttributeValues[':t2']).toBe('SERVERLESS');   // upper
      expect(cmd.input.ExpressionAttributeValues[':t3']).toBe('Serverless');   // title
    });

    it('also triggers when queryStringParameters has q', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await handler(
        event({ resource: '/posts', queryStringParameters: { q: 'lambda' } }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(200);
    });
  });

  describe('/projeto', () => {
    it('uses ProjetoPorData_v2 GSI with Publicado filter', async () => {
      mockSend.mockResolvedValueOnce({ Items: [POST_A] }); // posts query
      mockSend.mockResolvedValueOnce({ Item: { total_projeto_publicado: 1 } }); // contador

      await handler(event({ resource: '/posts/projeto' }), ctx, jest.fn());

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.IndexName).toBe('ProjetoPorData_v2');
      expect(cmd.input.ExpressionAttributeValues[':published']).toBe('Publicado');
    });

    it('totalCount vem do contador agregado, não de uma 2ª Query', async () => {
      mockSend.mockResolvedValueOnce({ Items: [POST_A] }); // posts query
      mockSend.mockResolvedValueOnce({ Item: { total_projeto_publicado: 13 } }); // contador

      const result = await handler(event({ resource: '/posts/projeto' }), ctx, jest.fn());

      const body = JSON.parse(result?.body ?? '{}');
      expect(body.totalCount).toBe(13);
      // Counter's GetCommand, not another QueryCommand
      const counterCmd = mockSend.mock.calls[1][0];
      expect(counterCmd.input.Select).toBeUndefined();
    });
  });

  describe('default (all posts)', () => {
    it('returns all published posts with totalCount (vindo do contador agregado, não de uma 2ª Query)', async () => {
      mockSend.mockResolvedValueOnce({ Items: [POST_A, POST_B] });                // posts query
      mockSend.mockResolvedValueOnce({ Item: { total_publicado: 2 } });           // contador (GetCommand)

      const result = await handler(event(), ctx, jest.fn());

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body ?? '{}');
      expect(body.posts).toHaveLength(2);
      expect(body.totalCount).toBe(2);
    });

    // The point of A2 (docs/book/cases/CASE-008): one malformed item in a
    // GSI result must not 500 the whole public listing for every visitor.
    it('drops a malformed item (missing categoria_slug) and still returns the valid ones', async () => {
      const malformed = { slug: 'post-c', status: 'Publicado', titulo: 'Post C' }; // no categoria_slug
      mockSend.mockResolvedValueOnce({ Items: [POST_A, malformed, POST_B] });
      mockSend.mockResolvedValueOnce({ Item: { total_publicado: 3 } });

      const result = await handler(event(), ctx, jest.fn());

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body ?? '{}');
      expect(body.posts).toHaveLength(2);
      expect(body.posts.map((p: { slug: string }) => p.slug)).toEqual(['post-a', 'post-b']);
    });

    it('uses StatusPorData GSI with default limit 9', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });               // posts query
      mockSend.mockResolvedValueOnce({ Item: undefined });         // contador
      await handler(event(), ctx, jest.fn());

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.IndexName).toBe('StatusPorData');
      expect(cmd.input.Limit).toBe(9);
      expect(cmd.input.ExpressionAttributeValues[':status']).toBe('Publicado');
    });

    it('o contador é lido via GetCommand (não Query/COUNT) — não duplica RCU', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });                       // posts query
      mockSend.mockResolvedValueOnce({ Item: { total_publicado: 5 } });    // contador
      await handler(event(), ctx, jest.fn());

      const counterCmd = mockSend.mock.calls[1][0];
      expect(counterCmd.input.Select).toBeUndefined();
      expect(counterCmd.input.IndexName).toBeUndefined();
      expect(counterCmd.input.Key).toBeDefined();
    });

    it('respects custom limit from query param', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });        // posts query
      mockSend.mockResolvedValueOnce({ Item: undefined });  // contador
      await handler(event({ queryStringParameters: { limit: '3' } }), ctx, jest.fn());

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.Limit).toBe(3);
    });
  });

  describe('error handling', () => {
    it('returns 500 when DynamoDB throws', async () => {
      mockSend.mockRejectedValueOnce(new Error('Throttled'));
      const result = await handler(event(), ctx, jest.fn());
      expect(result?.statusCode).toBe(500);
    });
  });
});
