// requireEnv() throws at module load if POSTS_TABLE/ADMIN_ORIGIN are unset:
// this must run before the `./index` import below, not in beforeAll (too late).
process.env.POSTS_TABLE = 'test-posts-table';
process.env.ADMIN_ORIGIN = 'https://test-admin.example.com';

import { APIGatewayEventRequestContext, APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from './index';
import { dynamo } from '../../common/dynamodb';
import { invalidatePostCache } from '../../common/cacheInvalidation';

jest.mock('../../common/dynamodb', () => ({
  dynamo: { send: jest.fn() },
}));

jest.mock('../../common/cacheInvalidation', () => ({
  invalidatePostCache: jest.fn(),
}));

const mockSend = dynamo.send as jest.Mock;
const mockInvalidatePostCache = invalidatePostCache as jest.Mock;

const ctx = {
  awsRequestId: 'req-admin-789',
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'adminPosts',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123:function:adminPosts',
  memoryLimitInMB: '128',
  logGroupName: '/aws/lambda/adminPosts',
  logStreamName: '2026/01/01/[$LATEST]test',
  getRemainingTimeInMillis: () => 30000,
  done: jest.fn(),
  fail: jest.fn(),
  succeed: jest.fn(),
} as Context;

function event(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: { Authorization: 'Bearer token' },
    httpMethod: 'GET',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    path: '/admin/posts',
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {} as APIGatewayEventRequestContext,
    resource: '/admin/posts',
    stageVariables: null,
    ...overrides,
  };
}

// The written Item lives in a different place depending on the write shape:
// plain Put (zero counter delta) vs TransactWrite (Put + counter ADD).
function writtenItem(cmd: { input: { Item?: unknown; TransactItems?: Array<{ Put?: { Item: unknown } }> } }) {
  return (cmd.input.Item ?? cmd.input.TransactItems?.[0]?.Put?.Item) as Record<string, unknown>;
}

const SAMPLE_POST = {
  slug: 'meu-post',
  titulo: 'Meu Post',
  autor_id: 'marcelo-goncalves',
  conteudo_html: '<p>Content</p>',
  resumo: 'Resumo',
  imagem_destaque_url: 'https://example.com/img.jpg',
  imagem_destaque_alt_text: 'Alt text',
  categoria_slug: 'aws',
  status: 'Publicado' as const,
  data_publicacao: '2026-01-01T00:00:00.000Z',
  data_atualizacao: '2026-01-01T00:00:00.000Z',
  tempo_leitura_min: 5,
  e_popular: 0,
  e_projeto: 0,
};

beforeAll(() => {
  process.env.POSTS_TABLE = 'test-posts-table';
  process.env.LOG_LEVEL = 'ERROR';
});

// Without this, values queued via mockResolvedValueOnce that a test doesn't
// consume leak into the next test, shifting the whole response queue.
beforeEach(() => {
  jest.resetAllMocks();
});

describe('adminPosts handler', () => {
  describe('OPTIONS (CORS preflight)', () => {
    it('returns 200 with empty body', async () => {
      const result = await handler(event({ httpMethod: 'OPTIONS' }), ctx, jest.fn());
      expect(result?.statusCode).toBe(200);
      expect(result?.body).toBe('');
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('GET /admin/posts (list all)', () => {
    it('queries all three statuses and merges results', async () => {
      const published = { slug: 'a', status: 'Publicado', titulo: 'A', categoria_slug: 'aws' };
      const draft = { slug: 'b', status: 'Rascunho', titulo: 'B', categoria_slug: 'aws' };
      const scheduled = { slug: 'c', status: 'Programado', titulo: 'C', categoria_slug: 'aws' };

      mockSend
        .mockResolvedValueOnce({ Items: [published] })
        .mockResolvedValueOnce({ Items: [draft] })
        .mockResolvedValueOnce({ Items: [scheduled] });

      const result = await handler(event({ httpMethod: 'GET' }), ctx, jest.fn());

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body ?? '{}');
      expect(body.count).toBe(3);
      expect(body.items).toHaveLength(3);
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('uses StatusPorData GSI for each status', async () => {
      mockSend.mockResolvedValue({ Items: [] });
      await handler(event({ httpMethod: 'GET' }), ctx, jest.fn());

      const calls = mockSend.mock.calls as Array<[{ input: { ExpressionAttributeValues: Record<string, string> } }]>;
      const statuses = calls.map((c) => c[0].input.ExpressionAttributeValues[':status']);
      expect(statuses).toEqual(['Publicado', 'Rascunho', 'Programado']);
    });

    it('envia as 3 queries em paralelo — todas chegam mesmo que uma retorne vazio', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [{ slug: 'a', status: 'Publicado', titulo: 'A', categoria_slug: 'aws' }] })
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [{ slug: 'c', status: 'Programado', titulo: 'C', categoria_slug: 'aws' }] });

      const result = await handler(event({ httpMethod: 'GET' }), ctx, jest.fn());
      const body = JSON.parse(result?.body ?? '{}');

      // Promise.all guarantees all 3 queries were fired
      expect(mockSend).toHaveBeenCalledTimes(3);
      // and the result combines items from all 3, even with an empty Rascunho
      expect(body.count).toBe(2);
      expect(body.items.map((i: { slug: string }) => i.slug)).toEqual(expect.arrayContaining(['a', 'c']));
    });

    it('usa ProjectionExpression para retornar apenas campos necessários', async () => {
      mockSend.mockResolvedValue({ Items: [] });
      await handler(event({ httpMethod: 'GET' }), ctx, jest.fn());

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.ProjectionExpression).toContain('slug');
      expect(cmd.input.ProjectionExpression).toContain('titulo');
    });
  });

  describe('GET /admin/posts/:slug (get one)', () => {
    it('returns the post when found', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, version: 1 } });

      const result = await handler(
        event({ httpMethod: 'GET', pathParameters: { slug: 'meu-post' } }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body ?? '{}');
      expect(body.slug).toBe('meu-post');
    });

    it('returns 404 when post not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await handler(
        event({ httpMethod: 'GET', pathParameters: { slug: 'nao-existe' } }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(404);
    });

    it('returns 200 for a legacy post with no version field (real dev data has these)', async () => {
      mockSend.mockResolvedValueOnce({ Item: SAMPLE_POST });

      const result = await handler(
        event({ httpMethod: 'GET', pathParameters: { slug: 'meu-post' } }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(200);
    });
  });

  describe('POST /admin/posts (create)', () => {
    it('creates a new post and returns 200', async () => {
      mockSend.mockResolvedValueOnce({}); // PutCommand
      mockSend.mockResolvedValueOnce({}); // counter (new post is Publicado, ADD total_publicado :1)

      const result = await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(SAMPLE_POST) }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(201);
      const body = JSON.parse(result?.body ?? '{}');
      expect(body.message).toBe('Post created');
      expect(body.slug).toBe('meu-post');
      expect(body.version).toBe(1);
      expect(body.data_atualizacao).toBeDefined();
    });

    it('incrementa total_publicado na MESMA transação do Put ao criar um post Publicado', async () => {
      mockSend.mockResolvedValueOnce({}); // TransactWriteCommand (Put + counter)

      await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(SAMPLE_POST) }),
        ctx,
        jest.fn(),
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      const transact = mockSend.mock.calls[0][0].input.TransactItems;
      expect(transact).toHaveLength(2);
      expect(transact[0].Put.Item.slug).toBe('meu-post');
      expect(transact[1].Update.UpdateExpression).toBe('ADD total_publicado :dt, total_projeto_publicado :dp');
      expect(transact[1].Update.ExpressionAttributeValues).toEqual({ ':dt': 1, ':dp': 0 });
    });

    it('usa um Put simples (sem transação) ao criar um Rascunho (delta zero)', async () => {
      mockSend.mockResolvedValueOnce({}); // PutCommand

      await handler(
        event({ httpMethod: 'POST', body: JSON.stringify({ ...SAMPLE_POST, status: 'Rascunho' }) }),
        ctx,
        jest.fn(),
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0][0].input.TransactItems).toBeUndefined();
    });

    it('invalida /post/{slug} e "/" ao criar um post já Publicado', async () => {
      mockSend.mockResolvedValueOnce({}); // PutCommand
      mockSend.mockResolvedValueOnce({}); // counter

      await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(SAMPLE_POST) }),
        ctx,
        jest.fn(),
      );

      expect(mockInvalidatePostCache).toHaveBeenCalledWith(['/post/meu-post', '/', '/artigos', '/todos-artigos', '/categoria/*']);
    });

    it('invalida só /post/{slug} (sem "/") ao criar um Rascunho', async () => {
      mockSend.mockResolvedValueOnce({}); // PutCommand

      await handler(
        event({ httpMethod: 'POST', body: JSON.stringify({ ...SAMPLE_POST, status: 'Rascunho' }) }),
        ctx,
        jest.fn(),
      );

      expect(mockInvalidatePostCache).toHaveBeenCalledWith(['/post/meu-post']);
    });

    it('returns 400 when slug is missing', async () => {
      const { slug, ...noSlug } = SAMPLE_POST;
      const result = await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(noSlug) }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns 400 when titulo is missing', async () => {
      const { titulo, ...noTitulo } = SAMPLE_POST;
      const result = await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(noTitulo) }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(400);
    });

    it('returns 400 when autor_id is missing', async () => {
      const { autor_id, ...noAutor } = SAMPLE_POST;
      const result = await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(noAutor) }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(400);
    });

    it('sets data_atualizacao automatically', async () => {
      mockSend.mockResolvedValueOnce({});
      await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(SAMPLE_POST) }),
        ctx,
        jest.fn(),
      );

      const sentCmd = mockSend.mock.calls[0][0];
      expect(writtenItem(sentCmd).data_atualizacao).toBeDefined();
    });

    it('converts e_popular and e_projeto to Number', async () => {
      mockSend.mockResolvedValueOnce({});
      const postWithBooleans = { ...SAMPLE_POST, e_popular: 1, e_projeto: 1 };
      await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(postWithBooleans) }),
        ctx,
        jest.fn(),
      );

      const sentCmd = mockSend.mock.calls[0][0];
      expect(typeof writtenItem(sentCmd).e_popular).toBe('number');
      expect(typeof writtenItem(sentCmd).e_projeto).toBe('number');
    });

    it('descarta campos desconhecidos (mass assignment / overposting)', async () => {
      mockSend.mockResolvedValueOnce({});
      const postWithExtra = { ...SAMPLE_POST, isAdmin: true, e_popular_marker: 'POP' };
      await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(postWithExtra) }),
        ctx,
        jest.fn(),
      );

      const sentCmd = mockSend.mock.calls[0][0];
      expect(writtenItem(sentCmd).isAdmin).toBeUndefined();
      // e_popular_marker is derived from e_popular server-side, never accepted from the client
      expect(writtenItem(sentCmd).e_popular_marker).toBeUndefined();
    });

    it('returns 400 when e_popular não é 0 ou 1', async () => {
      const postWithInvalidFlag = { ...SAMPLE_POST, e_popular: 2 };
      const result = await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(postWithInvalidFlag) }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns 409 when the slug already exists (ConditionExpression rejects the Put)', async () => {
      const conditionalError = Object.assign(new Error('The conditional request failed'), {
        name: 'ConditionalCheckFailedException',
      });
      mockSend.mockRejectedValueOnce(conditionalError);

      const result = await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(SAMPLE_POST) }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(409);
    });

    it('sends attribute_not_exists(slug) as the ConditionExpression', async () => {
      mockSend.mockResolvedValueOnce({}); // TransactWriteCommand (SAMPLE_POST is Publicado)
      await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(SAMPLE_POST) }),
        ctx,
        jest.fn(),
      );

      const sentCmd = mockSend.mock.calls[0][0];
      expect(sentCmd.input.TransactItems[0].Put.ConditionExpression).toBe('attribute_not_exists(slug)');
    });

    it('sets version to 1 on a brand-new post', async () => {
      mockSend.mockResolvedValueOnce({});
      await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(SAMPLE_POST) }),
        ctx,
        jest.fn(),
      );

      expect(writtenItem(mockSend.mock.calls[0][0]).version).toBe(1);
    });

    it('defaults status to Rascunho when omitted', async () => {
      mockSend.mockResolvedValueOnce({}); // PutCommand (Rascunho: zero delta, no transaction)
      const { status, ...noStatus } = SAMPLE_POST;

      await handler(
        event({ httpMethod: 'POST', body: JSON.stringify(noStatus) }),
        ctx,
        jest.fn(),
      );

      expect(writtenItem(mockSend.mock.calls[0][0]).status).toBe('Rascunho');
    });

    it('discards a client-sent version instead of accepting it', async () => {
      mockSend.mockResolvedValueOnce({});
      await handler(
        event({ httpMethod: 'POST', body: JSON.stringify({ ...SAMPLE_POST, version: 99 }) }),
        ctx,
        jest.fn(),
      );

      // Server always computes version itself on create: never the client-sent value.
      expect(writtenItem(mockSend.mock.calls[0][0]).version).toBe(1);
    });

    it('rejects a scheduled post with a past data_publicacao_programada', async () => {
      const result = await handler(
        event({
          httpMethod: 'POST',
          body: JSON.stringify({
            ...SAMPLE_POST,
            status: 'Programado',
            data_publicacao_programada: '2020-01-01T10:00:00.000Z',
          }),
        }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('normalizes data_publicacao_programada to full UTC ISO 8601 on a scheduled post', async () => {
      mockSend.mockResolvedValueOnce({}); // TransactWriteCommand (Programado: zero delta actually, see below)
      await handler(
        event({
          httpMethod: 'POST',
          body: JSON.stringify({
            ...SAMPLE_POST,
            status: 'Programado',
            data_publicacao_programada: '2099-01-01T10:00:00-03:00',
          }),
        }),
        ctx,
        jest.fn(),
      );

      expect(writtenItem(mockSend.mock.calls[0][0]).data_publicacao_programada).toBe(
        new Date('2099-01-01T10:00:00-03:00').toISOString(),
      );
    });

    it('rejects a scheduled post whose data_publicacao_programada has no explicit UTC offset (datetime-local raw shape)', async () => {
      const result = await handler(
        event({
          httpMethod: 'POST',
          body: JSON.stringify({
            ...SAMPLE_POST,
            status: 'Programado',
            data_publicacao_programada: '2099-01-01T10:00',
          }),
        }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /admin/posts/:slug (update)', () => {
    it('updates an existing post', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Publicado', e_projeto: 0, version: 1 } }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // PutCommand

      const result = await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ ...SAMPLE_POST, version: 1 }),
        }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(200);
      // same status (Publicado to Publicado) and same e_projeto: zero delta, no 3rd call
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('returns 400 when version is missing from the update payload', async () => {
      const result = await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify(SAMPLE_POST),
        }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('nunca grava data_publicacao vazia — cai para o valor existente quando o client manda "" (regressão: crashava o GSI esparso ProjetoPorData_v2)', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { ...SAMPLE_POST, status: 'Rascunho', e_projeto: 0, data_publicacao: '2026-05-01T00:00:00.000Z', version: 1 },
      }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // PutCommand

      await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ ...SAMPLE_POST, status: 'Rascunho', e_projeto: 1, data_publicacao: '', version: 1 }),
        }),
        ctx,
        jest.fn(),
      );

      const sentCmd = mockSend.mock.calls[1][0];
      expect(sentCmd.input.Item.data_publicacao).toBe('2026-05-01T00:00:00.000Z');
      expect(sentCmd.input.Item.data_publicacao).not.toBe('');
    });

    it('atualiza o contador (na transação do Put) quando o status muda de Rascunho para Publicado', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Rascunho', e_projeto: 0, version: 1 } }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // TransactWriteCommand (Put + contador)

      await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ ...SAMPLE_POST, version: 1 }), // SAMPLE_POST.status === 'Publicado'
        }),
        ctx,
        jest.fn(),
      );

      expect(mockSend).toHaveBeenCalledTimes(2);
      const transact = mockSend.mock.calls[1][0].input.TransactItems;
      expect(transact[1].Update.ExpressionAttributeValues).toEqual({ ':dt': 1, ':dp': 0 });
    });

    it('decrementa o contador (na transação do Put) quando o status muda de Publicado para Rascunho', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Publicado', e_projeto: 0, version: 1 } }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // TransactWriteCommand (Put + contador)

      await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ ...SAMPLE_POST, status: 'Rascunho', version: 1 }),
        }),
        ctx,
        jest.fn(),
      );

      const transact = mockSend.mock.calls[1][0].input.TransactItems;
      expect(transact[1].Update.ExpressionAttributeValues).toEqual({ ':dt': -1, ':dp': 0 });
    });

    it('invalida "/" também quando o status muda de Rascunho para Publicado', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Rascunho', e_projeto: 0, version: 1 } }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // TransactWriteCommand (Put + contador)

      await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ ...SAMPLE_POST, version: 1 }), // SAMPLE_POST.status === 'Publicado'
        }),
        ctx,
        jest.fn(),
      );

      expect(mockInvalidatePostCache).toHaveBeenCalledWith(['/post/meu-post', '/', '/artigos', '/todos-artigos', '/categoria/*']);
    });

    it('NÃO invalida "/" quando o post já era Publicado e continua Publicado (edição de conteúdo)', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Publicado', e_projeto: 0, version: 1 } }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // PutCommand

      await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ ...SAMPLE_POST, version: 1 }),
        }),
        ctx,
        jest.fn(),
      );

      expect(mockInvalidatePostCache).toHaveBeenCalledWith(['/post/meu-post']);
    });

    it('returns 400 on slug mismatch', async () => {
      const result = await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'outro-slug' },
          body: JSON.stringify({ ...SAMPLE_POST, version: 1 }),
        }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(400);
    });

    // Regression test: updatePostInputSchema used to require
    // slug/titulo/autor_id even though this merge logic already supported a
    // genuinely partial update. A body that omits slug entirely must not
    // trip the mismatch check above, and the existing item's other fields
    // must survive untouched.
    it('accepts a genuinely partial payload with no slug in the body, keeping the rest of the existing item', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, version: 4 } }); // Get
      mockSend.mockResolvedValueOnce({}); // Put

      const result = await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ version: 4, titulo: 'Novo título' }),
        }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(200);
      const item = writtenItem(mockSend.mock.calls[1][0]);
      expect(item.slug).toBe('meu-post');
      expect(item.titulo).toBe('Novo título');
      expect(item.autor_id).toBe(SAMPLE_POST.autor_id);
      expect(item.resumo).toBe(SAMPLE_POST.resumo);
    });

    it('returns 404 when updating a post that does not exist, without attempting a write', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined }); // Get finds nothing

      const result = await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ ...SAMPLE_POST, version: 1 }),
        }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(404);
      expect(mockSend).toHaveBeenCalledTimes(1); // only the Get, no Put attempted
    });

    it('sends attribute_exists(slug) as the ConditionExpression', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Publicado', e_projeto: 0, version: 1 } }); // Get
      mockSend.mockResolvedValueOnce({}); // Put

      await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ ...SAMPLE_POST, version: 1 }),
        }),
        ctx,
        jest.fn(),
      );

      expect(mockSend.mock.calls[1][0].input.ConditionExpression).toBe('attribute_exists(slug) AND #version = :expectedVersion');
    });

    it('increments version on update', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Publicado', e_projeto: 0, version: 4 } }); // Get
      mockSend.mockResolvedValueOnce({}); // Put

      await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ ...SAMPLE_POST, version: 4 }),
        }),
        ctx,
        jest.fn(),
      );

      expect(writtenItem(mockSend.mock.calls[1][0]).version).toBe(5);
    });

    it('sends the version-match clause built from the client-sent version', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Publicado', e_projeto: 0, version: 4 } }); // Get
      mockSend.mockResolvedValueOnce({}); // Put

      await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ ...SAMPLE_POST, version: 4 }),
        }),
        ctx,
        jest.fn(),
      );

      const cmd = mockSend.mock.calls[1][0].input;
      expect(cmd.ConditionExpression).toBe('attribute_exists(slug) AND #version = :expectedVersion');
      expect(cmd.ExpressionAttributeValues).toEqual({ ':expectedVersion': 4 });
    });

    it('returns 409 when the version sent by the client is stale (concurrent edit)', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Publicado', e_projeto: 0, version: 5 } }); // Get
      const conditionalError = Object.assign(new Error('The conditional request failed'), {
        name: 'ConditionalCheckFailedException',
      });
      mockSend.mockRejectedValueOnce(conditionalError);

      const result = await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ ...SAMPLE_POST, version: 4 }), // stale, real version is 5
        }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(409);
    });

    it('returns the updated slug/version/data_atualizacao in the response body', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Publicado', e_projeto: 0, version: 4 } }); // Get
      mockSend.mockResolvedValueOnce({}); // Put

      const result = await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ ...SAMPLE_POST, version: 4 }),
        }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body ?? '{}');
      expect(body.message).toBe('Post updated');
      expect(body.slug).toBe('meu-post');
      expect(body.version).toBe(5);
      expect(body.data_atualizacao).toBeDefined();
    });

    it('preserves a field not present in the PATCH payload (merges onto the existing item)', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { ...SAMPLE_POST, version: 1, subtitulo: 'Subtítulo original', topico: 'AWS' },
      }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // PutCommand

      const { subtitulo, topico, ...payloadWithoutOptionalFields } = SAMPLE_POST as Record<string, unknown>;
      await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ ...payloadWithoutOptionalFields, version: 1 }),
        }),
        ctx,
        jest.fn(),
      );

      const sentCmd = mockSend.mock.calls[1][0];
      expect(writtenItem(sentCmd).subtitulo).toBe('Subtítulo original');
      expect(writtenItem(sentCmd).topico).toBe('AWS');
    });

    it('removes a field when the client sends an explicit null (subtitulo)', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { ...SAMPLE_POST, version: 1, subtitulo: 'Subtítulo a remover' },
      }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // PutCommand

      await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ ...SAMPLE_POST, version: 1, subtitulo: null }),
        }),
        ctx,
        jest.fn(),
      );

      const sentCmd = mockSend.mock.calls[1][0];
      expect(writtenItem(sentCmd).subtitulo).toBeUndefined();
    });

    it('ignores a client-sent slug in the PATCH body — the URL path param is the only source of truth', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, version: 1 } }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // PutCommand

      await handler(
        event({
          httpMethod: 'PATCH',
          pathParameters: { slug: 'meu-post' },
          body: JSON.stringify({ ...SAMPLE_POST, version: 1 }),
        }),
        ctx,
        jest.fn(),
      );

      const sentCmd = mockSend.mock.calls[1][0];
      expect(writtenItem(sentCmd).slug).toBe('meu-post');
    });
  });

  describe('DELETE /admin/posts/:slug', () => {
    it('returns 400 when no version query param is sent', async () => {
      const result = await handler(
        event({ httpMethod: 'DELETE', pathParameters: { slug: 'meu-post' } }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(400);
      expect(JSON.parse(result?.body ?? '{}').message).toBe('version is required to delete a post');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns 400 when version is not a valid non-negative integer', async () => {
      const result = await handler(
        event({ httpMethod: 'DELETE', pathParameters: { slug: 'meu-post' }, queryStringParameters: { version: 'abc' } }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(400);
      expect(JSON.parse(result?.body ?? '{}').message).toBe('version must be a non-negative integer');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('deletes the post and returns 200', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Rascunho', e_projeto: 0, version: 1 } }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // DeleteCommand

      const result = await handler(
        event({ httpMethod: 'DELETE', pathParameters: { slug: 'meu-post' }, queryStringParameters: { version: '1' } }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(200);
      expect(JSON.parse(result?.body ?? '{}').message).toBe('Post deleted');
      // Rascunho didn't count toward the aggregate: zero delta, no 3rd call
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('calls DynamoDB DeleteCommand with correct key', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Rascunho', e_projeto: 0, version: 1 } }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // DeleteCommand
      await handler(
        event({ httpMethod: 'DELETE', pathParameters: { slug: 'meu-post' }, queryStringParameters: { version: '1' } }),
        ctx,
        jest.fn(),
      );

      const cmd = mockSend.mock.calls[1][0]; // call[0] is now the earlier Get
      expect(cmd.input.Key).toEqual({ slug: 'meu-post' });
    });

    it('returns 404 when the post no longer exists', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined }); // Get (not found)

      const result = await handler(
        event({ httpMethod: 'DELETE', pathParameters: { slug: 'meu-post' }, queryStringParameters: { version: '1' } }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(404);
      expect(mockSend).toHaveBeenCalledTimes(1); // just the Get, no Delete attempted
    });

    it('sends a version ConditionExpression on the plain DeleteCommand, checked against the client version', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Rascunho', e_projeto: 0, version: 3 } }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // DeleteCommand

      await handler(
        event({ httpMethod: 'DELETE', pathParameters: { slug: 'meu-post' }, queryStringParameters: { version: '3' } }),
        ctx,
        jest.fn(),
      );

      const cmd = mockSend.mock.calls[1][0];
      expect(cmd.input.ConditionExpression).toBe('attribute_exists(slug) AND (attribute_not_exists(#version) OR #version = :expectedVersion)');
      expect(cmd.input.ExpressionAttributeValues).toEqual({ ':expectedVersion': 3 });
    });

    it('sends a version ConditionExpression on the TransactWriteCommand Delete item', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Publicado', e_projeto: 1, version: 5 } }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // TransactWriteCommand

      await handler(
        event({ httpMethod: 'DELETE', pathParameters: { slug: 'meu-post' }, queryStringParameters: { version: '5' } }),
        ctx,
        jest.fn(),
      );

      const del = mockSend.mock.calls[1][0].input.TransactItems[0].Delete;
      expect(del.ConditionExpression).toBe('attribute_exists(slug) AND (attribute_not_exists(#version) OR #version = :expectedVersion)');
      expect(del.ExpressionAttributeValues).toEqual({ ':expectedVersion': 5 });
    });

    // The real bug this closes: the server used to read the CURRENT version
    // off DynamoDB and check the delete against that, which always passes,
    // even when the client's own view of the post is stale. Asserting the
    // client's (older) version ends up in the ConditionExpression is what
    // proves the fix, not just that a 409 happens on a DynamoDB-level error.
    it('checks the ConditionExpression against the client-supplied version, not the version just read from DynamoDB', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Publicado', e_projeto: 1, version: 6 } }); // Get: real version is already 6
      mockSend.mockResolvedValueOnce({}); // TransactWriteCommand

      await handler(
        // Client still thinks it's looking at version 5 (stale)
        event({ httpMethod: 'DELETE', pathParameters: { slug: 'meu-post' }, queryStringParameters: { version: '5' } }),
        ctx,
        jest.fn(),
      );

      const del = mockSend.mock.calls[1][0].input.TransactItems[0].Delete;
      expect(del.ExpressionAttributeValues).toEqual({ ':expectedVersion': 5 });
    });

    it('returns 409 when a concurrent update changed the version since the Get (plain Delete)', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Rascunho', e_projeto: 0, version: 3 } }); // Get (existing)
      const conditionalError = Object.assign(new Error('conditional check failed'), { name: 'ConditionalCheckFailedException' });
      mockSend.mockRejectedValueOnce(conditionalError); // DeleteCommand

      const result = await handler(
        event({ httpMethod: 'DELETE', pathParameters: { slug: 'meu-post' }, queryStringParameters: { version: '2' } }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(409);
      expect(JSON.parse(result?.body ?? '{}').message).toBe('Post was modified by someone else since it was loaded');
    });

    it('returns 409 when a concurrent update changed the version since the Get (TransactWrite)', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Publicado', e_projeto: 1, version: 5 } }); // Get (existing)
      const cancelledError = Object.assign(new Error('transaction cancelled'), {
        name: 'TransactionCanceledException',
        CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }],
      });
      mockSend.mockRejectedValueOnce(cancelledError); // TransactWriteCommand

      const result = await handler(
        event({ httpMethod: 'DELETE', pathParameters: { slug: 'meu-post' }, queryStringParameters: { version: '4' } }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(409);
      expect(JSON.parse(result?.body ?? '{}').message).toBe('Post was modified by someone else since it was loaded');
    });

    it('decrementa o contador (na transação do Delete) ao deletar um post Publicado', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Publicado', e_projeto: 1, version: 1 } }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // TransactWriteCommand (Delete + counter)

      await handler(
        event({ httpMethod: 'DELETE', pathParameters: { slug: 'meu-post' }, queryStringParameters: { version: '1' } }),
        ctx,
        jest.fn(),
      );

      expect(mockSend).toHaveBeenCalledTimes(2);
      const transact = mockSend.mock.calls[1][0].input.TransactItems;
      expect(transact[0].Delete.Key).toEqual({ slug: 'meu-post' });
      expect(transact[1].Update.ExpressionAttributeValues).toEqual({ ':dt': -1, ':dp': -1 });
    });

    it('invalida /post/{slug} e "/" ao deletar um post Publicado', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Publicado', e_projeto: 1, version: 1 } }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // TransactWriteCommand (Delete + counter)

      await handler(
        event({ httpMethod: 'DELETE', pathParameters: { slug: 'meu-post' }, queryStringParameters: { version: '1' } }),
        ctx,
        jest.fn(),
      );

      expect(mockInvalidatePostCache).toHaveBeenCalledWith(['/post/meu-post', '/', '/artigos', '/todos-artigos', '/categoria/*']);
    });

    it('invalida só /post/{slug} (sem "/") ao deletar um Rascunho', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...SAMPLE_POST, status: 'Rascunho', e_projeto: 0, version: 1 } }); // Get (existing)
      mockSend.mockResolvedValueOnce({}); // DeleteCommand

      await handler(
        event({ httpMethod: 'DELETE', pathParameters: { slug: 'meu-post' }, queryStringParameters: { version: '1' } }),
        ctx,
        jest.fn(),
      );

      expect(mockInvalidatePostCache).toHaveBeenCalledWith(['/post/meu-post']);
    });
  });

  describe('unknown method', () => {
    it('returns 405 Method Not Allowed', async () => {
      const result = await handler(event({ httpMethod: 'PUT' }), ctx, jest.fn());
      expect(result?.statusCode).toBe(405);
    });
  });

  describe('CORS headers', () => {
    it('all responses include Access-Control-Allow-Origin', async () => {
      mockSend.mockResolvedValue({ Items: [] });
      const result = await handler(event({ httpMethod: 'GET' }), ctx, jest.fn());
      expect(result?.headers?.['Access-Control-Allow-Origin']).toBe('https://test-admin.example.com');
    });
  });
});
