// requireEnv-style module-load guard isn't used here (ADMIN_SESSIONS_TABLE
// is read via plain process.env, not requireEnv), so no env var needs to be
// set before the import below.
import { GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from './dynamodb';
import { createSession, getSession, deleteSession, SESSION_TTL_SECONDS } from './adminSessionStore';

jest.mock('./dynamodb', () => ({
  dynamo: { send: jest.fn() },
}));

const mockSend = dynamo.send as jest.Mock;

beforeEach(() => {
  mockSend.mockReset();
});

describe('createSession', () => {
  it('persists a session with the correct TTL window and returns it', async () => {
    mockSend.mockResolvedValueOnce({});
    const before = Math.floor(Date.now() / 1000);

    const session = await createSession('user-sub-1', 'e@x.com', 'user1');

    expect(session.sub).toBe('user-sub-1');
    expect(session.email).toBe('e@x.com');
    expect(session.username).toBe('user1');
    expect(session.session_id).toBeTruthy();
    expect(session.expires_at).toBeGreaterThanOrEqual(before + SESSION_TTL_SECONDS);
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(PutCommand);
  });
});

describe('getSession', () => {
  it('returns null when the item does not exist', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    expect(await getSession('nao-existe')).toBeNull();
  });

  it('returns the session when expires_at is in the future', async () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    mockSend.mockResolvedValueOnce({
      Item: { session_id: 'abc', sub: 's1', email: 'e@x.com', username: 'u1', expires_at: future },
    });

    const session = await getSession('abc');
    expect(session?.sub).toBe('s1');
  });

  // The whole reason this manual check exists (adminSessionStore.ts's own
  // comment: "real expiration checked here via expires_at, never relying
  // only on DynamoDB's TTL") - DynamoDB TTL sweeps are best-effort and can
  // take up to 48h, so an item past its expires_at can still be physically
  // present in the table. This is the scenario that actually proves the
  // claim; nothing tested it directly until this quality-axis pass on
  // Block 2 (docs/book/cases/CASE-008).
  it('returns null for an item whose expires_at has passed, even though DynamoDB TTL has not swept it yet', async () => {
    const past = Math.floor(Date.now() / 1000) - 1;
    mockSend.mockResolvedValueOnce({
      Item: { session_id: 'abc', sub: 's1', email: 'e@x.com', username: 'u1', expires_at: past },
    });

    const session = await getSession('abc');
    expect(session).toBeNull();
  });

  it('calls DynamoDB with the correct key', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    await getSession('abc-123');

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(GetCommand);
    expect(cmd.input.Key).toEqual({ session_id: 'abc-123' });
  });
});

describe('deleteSession', () => {
  it('sends a DeleteCommand with the correct key', async () => {
    mockSend.mockResolvedValueOnce({});
    await deleteSession('abc-123');

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(DeleteCommand);
    expect(cmd.input.Key).toEqual({ session_id: 'abc-123' });
  });
});
