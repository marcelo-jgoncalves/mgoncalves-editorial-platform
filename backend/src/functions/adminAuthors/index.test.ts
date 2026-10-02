// requireEnv() throws at module load if AUTHORS_TABLE/ADMIN_ORIGIN are unset:
// this must run before the `./index` import below, not in beforeAll (too late).
process.env.AUTHORS_TABLE = 'test-authors-table';
process.env.ADMIN_ORIGIN = 'https://test-admin.example.com';

import { APIGatewayEventRequestContext, APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from './index';
import { dynamo } from '../../common/dynamodb';

jest.mock('../../common/dynamodb', () => ({
  dynamo: { send: jest.fn() },
}));

const mockSend = dynamo.send as jest.Mock;

const ctx = {
  awsRequestId: 'req-admin-authors-1',
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'adminAuthors',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123:function:adminAuthors',
  memoryLimitInMB: '128',
  logGroupName: '/aws/lambda/adminAuthors',
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
    path: '/admin/authors',
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {} as APIGatewayEventRequestContext,
    resource: '/admin/authors',
    stageVariables: null,
    ...overrides,
  };
}

function writtenItem() {
  return mockSend.mock.calls[0][0].input.Item as Record<string, unknown>;
}

const SAMPLE_AUTOR = {
  autor_id: 'marcelo-goncalves',
  nome_exibicao: 'Marcelo Gonçalves',
  bio: 'Bio curta',
  foto_avatar_url: 'https://example.com/avatar.jpg',
  foto_avatar_alt_text: 'Foto de Marcelo',
  linkedin_url: 'https://linkedin.com/in/x',
  github_url: 'https://github.com/x',
  instagram_url: 'https://instagram.com/x',
};

beforeAll(() => {
  process.env.AUTHORS_TABLE = 'test-authors-table';
  process.env.LOG_LEVEL = 'ERROR';
});

beforeEach(() => {
  jest.resetAllMocks();
});

describe('adminAuthors handler', () => {
  describe('GET /admin/authors/:id', () => {
    it('returns 400 when id is missing', async () => {
      const result = await handler(event({ pathParameters: null }), ctx, jest.fn());
      expect(result?.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns 404 when the author is not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });
      const result = await handler(
        event({ pathParameters: { id: 'nao-existe' } }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(404);
    });

    it('returns 200 with the author when found', async () => {
      mockSend.mockResolvedValueOnce({ Item: SAMPLE_AUTOR });
      const result = await handler(
        event({ pathParameters: { id: 'marcelo-goncalves' } }),
        ctx,
        jest.fn(),
      );

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body ?? '{}');
      expect(body.autor).toEqual(SAMPLE_AUTOR);
    });

    it('calls DynamoDB with the correct key', async () => {
      mockSend.mockResolvedValueOnce({ Item: SAMPLE_AUTOR });
      await handler(event({ pathParameters: { id: 'marcelo-goncalves' } }), ctx, jest.fn());

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.Key).toEqual({ autor_id: 'marcelo-goncalves' });
    });

    // parseAutorItem's failure path (Q1, docs/book/cases/CASE-008):
    // introduced by the A1 fix but never actually tested until this
    // quality-axis pass on Block 1.
    it('returns 500 (not 200 with malformed data) when the stored item is missing a required field', async () => {
      mockSend.mockResolvedValueOnce({ Item: { autor_id: 'marcelo-goncalves' } }); // missing nome_exibicao
      const result = await handler(
        event({ pathParameters: { id: 'marcelo-goncalves' } }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(500);
    });
  });

  describe('PUT /admin/authors/:id (upsert)', () => {
    it('creates/updates the author and returns 200', async () => {
      mockSend.mockResolvedValueOnce({});
      const result = await handler(
        event({ httpMethod: 'PUT', pathParameters: { id: 'marcelo-goncalves' }, body: JSON.stringify(SAMPLE_AUTOR) }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body ?? '{}');
      expect(body.message).toBe('Author saved successfully');
      expect(body.autor.autor_id).toBe('marcelo-goncalves');
    });

    it('also accepts POST for the same upsert', async () => {
      mockSend.mockResolvedValueOnce({});
      const result = await handler(
        event({ httpMethod: 'POST', pathParameters: { id: 'marcelo-goncalves' }, body: JSON.stringify(SAMPLE_AUTOR) }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(200);
    });

    it('returns 400 when body is missing', async () => {
      const result = await handler(
        event({ httpMethod: 'PUT', pathParameters: { id: 'marcelo-goncalves' } }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns 400 on invalid JSON body', async () => {
      const result = await handler(
        event({ httpMethod: 'PUT', pathParameters: { id: 'marcelo-goncalves' }, body: '{not json' }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns 400 when nome_exibicao is missing', async () => {
      const { nome_exibicao, ...noNome } = SAMPLE_AUTOR;
      void nome_exibicao;
      const result = await handler(
        event({ httpMethod: 'PUT', pathParameters: { id: 'marcelo-goncalves' }, body: JSON.stringify(noNome) }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns 400 when neither the URL id nor the body autor_id is present', async () => {
      const { autor_id, ...noId } = SAMPLE_AUTOR;
      void autor_id;
      const result = await handler(
        event({ httpMethod: 'PUT', pathParameters: null, body: JSON.stringify(noId) }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('the URL id takes precedence over a different autor_id sent in the body', async () => {
      mockSend.mockResolvedValueOnce({});
      await handler(
        event({
          httpMethod: 'PUT',
          pathParameters: { id: 'url-wins' },
          body: JSON.stringify({ ...SAMPLE_AUTOR, autor_id: 'body-loses' }),
        }),
        ctx,
        jest.fn(),
      );

      expect(writtenItem().autor_id).toBe('url-wins');
    });

    it('falls back to the body autor_id when creating via POST with no URL id', async () => {
      mockSend.mockResolvedValueOnce({});
      await handler(
        event({ httpMethod: 'POST', pathParameters: null, body: JSON.stringify(SAMPLE_AUTOR) }),
        ctx,
        jest.fn(),
      );

      expect(writtenItem().autor_id).toBe('marcelo-goncalves');
    });

    it('discards unknown fields (mass assignment / overposting)', async () => {
      mockSend.mockResolvedValueOnce({});
      await handler(
        event({
          httpMethod: 'PUT',
          pathParameters: { id: 'marcelo-goncalves' },
          body: JSON.stringify({ ...SAMPLE_AUTOR, isAdmin: true }),
        }),
        ctx,
        jest.fn(),
      );

      expect(writtenItem().isAdmin).toBeUndefined();
    });

    it('sanitizes bio HTML before persisting (bio is rendered via dangerouslySetInnerHTML publicly)', async () => {
      mockSend.mockResolvedValueOnce({});
      await handler(
        event({
          httpMethod: 'PUT',
          pathParameters: { id: 'marcelo-goncalves' },
          body: JSON.stringify({ ...SAMPLE_AUTOR, bio: '<script>alert(1)</script><p>Bio real</p>' }),
        }),
        ctx,
        jest.fn(),
      );

      const bio = writtenItem().bio as string;
      expect(bio).not.toContain('<script>');
      expect(bio).toContain('Bio real');
    });

    it('sets updated_at on every save', async () => {
      mockSend.mockResolvedValueOnce({});
      await handler(
        event({ httpMethod: 'PUT', pathParameters: { id: 'marcelo-goncalves' }, body: JSON.stringify(SAMPLE_AUTOR) }),
        ctx,
        jest.fn(),
      );

      expect(writtenItem().updated_at).toBeDefined();
    });

    it('returns 500 when DynamoDB throws', async () => {
      mockSend.mockRejectedValueOnce(new Error('Throttled'));
      const result = await handler(
        event({ httpMethod: 'PUT', pathParameters: { id: 'marcelo-goncalves' }, body: JSON.stringify(SAMPLE_AUTOR) }),
        ctx,
        jest.fn(),
      );
      expect(result?.statusCode).toBe(500);
    });
  });

  describe('unknown method', () => {
    it('returns 405 for DELETE (not implemented)', async () => {
      const result = await handler(event({ httpMethod: 'DELETE' }), ctx, jest.fn());
      expect(result?.statusCode).toBe(405);
    });
  });

  describe('CORS headers', () => {
    it('all responses include Access-Control-Allow-Origin', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });
      const result = await handler(event({ pathParameters: { id: 'x' } }), ctx, jest.fn());
      expect(result?.headers?.['Access-Control-Allow-Origin']).toBe('https://test-admin.example.com');
    });
  });
});
