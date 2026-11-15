import { jest, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import docPouchClient from '../src/index.js';
import { createMockServer, type MockServer } from './mock-server.js';

jest.setTimeout(15000);

// ─── Browser-like environment stubs ─────────────────────────────
//
// The library touches Web Storage through bare `localStorage` /
// `sessionStorage` identifiers and through `window.localStorage` /
// `window.sessionStorage` guards. Node provides neither, so both
// global slots and the same objects must be visible on `window`.
// Fresh stubs are installed for every test so no state leaks between
// cases.

function createStorageStub(): Storage {
  const store: Record<string, string> = {};
  const stub = {
    getItem: jest.fn((key: string): string | null =>
      Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: jest.fn((key: string, value: string): void => {
      store[key] = String(value);
    }),
    removeItem: jest.fn((key: string): void => {
      delete store[key];
    }),
    clear: jest.fn((): void => {
      for (const key of Object.keys(store)) delete store[key];
    }),
    key: jest.fn((index: number): string | null =>
      Object.keys(store)[index] ?? null),
  };
  Object.defineProperty(stub, 'length', { get: () => Object.keys(store).length });
  return stub as unknown as Storage;
}

let localStorageStub: Storage;
let sessionStorageStub: Storage;

function installStorages(): void {
  localStorageStub = createStorageStub();
  sessionStorageStub = createStorageStub();
  const g = globalThis as any;
  g.localStorage = localStorageStub;
  g.sessionStorage = sessionStorageStub;
  g.window.localStorage = localStorageStub;
  g.window.sessionStorage = sessionStorageStub;
}

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    location: { href: '', search: '', pathname: '' },
    history: { replaceState: jest.fn<any>(), pushState: jest.fn<any>() },
  };
}
installStorages();

let mockServer: MockServer;

beforeAll(async () => {
  mockServer = await createMockServer();
});

afterEach(() => {
  mockServer.io.sockets.sockets.forEach(s => s.disconnect());
});

afterAll(() => {
  mockServer.io.close();
  mockServer.server.close();
});

beforeEach(() => {
  mockServer.reset();
  installStorages();
});

// Runs the full PKCE authorization-code flow against the mock server,
// mirroring the OIDC tests in docPouchClient.test.ts.
async function login(client: docPouchClient): Promise<void> {
  await client.loginWithOidc({
    issuer: mockServer.url,
    clientId: 'test-client',
    redirectUri: `${mockServer.url}/mock-oidc/callback`,
  });

  const w = (globalThis as any).window;
  const authUrl = w.location.href;
  const authResponse = await fetch(authUrl);
  const callbackParams = new URL(authResponse.url).searchParams;
  const code = callbackParams.get('code');
  const state = callbackParams.get('state');
  w.location.search = `?code=${code}&state=${state}`;
  w.location.href = '';

  const result = await client.handleOidcCallback();
  if (!result) throw new Error('handleOidcCallback failed');
}

const sessionOptions = { persistSession: 'session' as const };

// ─── Configurable OIDC session persistence ──────────────────────

describe('default persistence mode', () => {
  it('persists to localStorage by default (backward compatibility)', async () => {
    const client = new docPouchClient(mockServer.url);
    expect(client.getSessionPersistence()).toBe('local');

    await login(client);

    expect(localStorageStub.getItem('docpouch_oidc_session')).toBeTruthy();
    expect(sessionStorageStub.getItem('docpouch_oidc_session')).toBeNull();
  });
});

describe('session persistence mode', () => {
  it('persists the session key to sessionStorage only and restores it', async () => {
    const client = new docPouchClient(mockServer.url, 80, undefined, sessionOptions);
    await login(client);

    expect(sessionStorageStub.getItem('docpouch_oidc_session')).toBeTruthy();
    expect(localStorageStub.getItem('docpouch_oidc_session')).toBeNull();

    const restored = new docPouchClient(mockServer.url, 80, undefined, sessionOptions);
    expect(restored.restoreOidcSession()).toBe(true);
    expect(restored.getAuthMethod()).toBe('oidc');
    expect(restored.isAuthenticated()).toBe(true);
  });

  it('ignores a stale localStorage copy and purges it on restore miss', async () => {
    localStorageStub.setItem('docpouch_oidc_session', JSON.stringify({
      accessToken: 'stale-access-token',
      refreshToken: 'stale-refresh-token',
      idToken: null,
      expiry: Date.now() + 600000,
    }));

    const client = new docPouchClient(mockServer.url, 80, undefined, sessionOptions);
    // The selected storage (sessionStorage) has no copy → the leftover
    // localStorage entry must be ignored, not adopted.
    expect(client.restoreOidcSession()).toBe(false);
    expect(client.isAuthenticated()).toBe(false);

    // The stale copy is cleared by the restore miss.
    expect(localStorageStub.getItem('docpouch_oidc_session')).toBeNull();
  });
});

describe('memory persistence mode', () => {
  it('never writes the session to either storage, not even on token refresh', async () => {
    const client = new docPouchClient(mockServer.url, 80, undefined, { persistSession: 'memory' });
    await login(client);
    expect(client.isAuthenticated()).toBe(true);
    expect(localStorageStub.getItem('docpouch_oidc_session')).toBeNull();
    expect(sessionStorageStub.getItem('docpouch_oidc_session')).toBeNull();

    const tokenBefore = await client.ensureValidOidcToken();

    // Jump past the token expiry (expires_in: 3600 + the 60s refresh
    // buffer) to force a refresh.
    const realNow = Date.now.bind(Date);
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockImplementation(() => realNow() + 2 * 60 * 60 * 1000);
    let tokenAfter: string;
    try {
      tokenAfter = await client.ensureValidOidcToken();
    } finally {
      nowSpy.mockRestore();
    }

    expect(tokenAfter).not.toBe(tokenBefore);
    expect(localStorageStub.getItem('docpouch_oidc_session')).toBeNull();
    expect(sessionStorageStub.getItem('docpouch_oidc_session')).toBeNull();

    // A fresh instance cannot restore anything in memory mode.
    const fresh = new docPouchClient(mockServer.url, 80, undefined, { persistSession: 'memory' });
    expect(fresh.restoreOidcSession()).toBe(false);
  });
});

describe('setSessionPersistence migration', () => {
  it('migrates the active session copy and clears the previous storage', async () => {
    const client = new docPouchClient(mockServer.url);
    await login(client);
    expect(localStorageStub.getItem('docpouch_oidc_session')).toBeTruthy();

    client.setSessionPersistence('session');
    expect(client.getSessionPersistence()).toBe('session');
    expect(sessionStorageStub.getItem('docpouch_oidc_session')).toBeTruthy();
    expect(localStorageStub.getItem('docpouch_oidc_session')).toBeNull();
    expect(client.isAuthenticated()).toBe(true);

    client.setSessionPersistence('memory');
    expect(client.getSessionPersistence()).toBe('memory');
    expect(sessionStorageStub.getItem('docpouch_oidc_session')).toBeNull();
    expect(localStorageStub.getItem('docpouch_oidc_session')).toBeNull();
    expect(client.isAuthenticated()).toBe(true);
  });
});

describe('clearPersistedAuthState', () => {
  it('removes the OIDC session key from both storages', async () => {
    const client = new docPouchClient(mockServer.url, 80, undefined, sessionOptions);
    await login(client);
    expect(sessionStorageStub.getItem('docpouch_oidc_session')).toBeTruthy();

    // Simulate a stale copy left in the other storage.
    localStorageStub.setItem('docpouch_oidc_session', 'stale-copy');
    localStorageStub.setItem('authMethod', 'oidc');
    localStorageStub.setItem('isAdmin', 'true');

    client.clearPersistedAuthState();

    expect(localStorageStub.getItem('docpouch_oidc_session')).toBeNull();
    expect(sessionStorageStub.getItem('docpouch_oidc_session')).toBeNull();
    expect(localStorageStub.getItem('authMethod')).toBeNull();
    expect(localStorageStub.getItem('isAdmin')).toBeNull();
  });
});

describe('invalid persistence mode', () => {
  it('is rejected by the constructor and by setSessionPersistence', () => {
    expect(() => new docPouchClient(mockServer.url, 80, undefined,
      { persistSession: 'cookie' } as any)).toThrow(/Invalid session persistence mode/);

    const client = new docPouchClient(mockServer.url);
    expect(() => client.setSessionPersistence('cookie' as any))
      .toThrow(/Invalid session persistence mode/);
    expect(client.getSessionPersistence()).toBe('local');
  });
});
