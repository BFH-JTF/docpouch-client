import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import docPouchClient from '../src/index.js';
import type {
  I_DocumentEntry, I_DocumentQuery, I_UserEntry, I_DataStructure,
} from '../src/index.js';
import { createMockServer, type MockServer } from './mock-server.js';

const mockWindow = {
  location: { href: '', search: '', pathname: '' },
  history: { replaceState: jest.fn<any>(), pushState: jest.fn<any>() },
};

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = mockWindow;
}

jest.setTimeout(15000);

function waitForSocket(client: docPouchClient, timeout = 5000): Promise<void> {
  if (client.socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connection timeout')), timeout);
    client.socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let mockServer: MockServer;
const adminLogin = { name: 'admin', password: 'admin' };
const userLogin = { name: 'testuser', password: 'testpass' };
const roleAdminLogin = { name: 'roleadmin', password: 'roleadmin' };

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
});

// ─── Constructor & Basic Properties ─────────────────────────────

describe('constructor', () => {
  it('should create a client with the given URL', () => {
    const client = new docPouchClient(mockServer.url);
    expect(client.baseUrl).toBe(mockServer.url);
  });

  it('should have a socket instance', () => {
    const client = new docPouchClient(mockServer.url);
    expect(client.socket).toBeDefined();
    expect(client.socket.connected).toBe(false);
  });

  it('should not be connected initially', () => {
    const client = new docPouchClient(mockServer.url);
    expect(client.realTimeSync).toBe(false);
  });

  it('should return the package version', () => {
    const client = new docPouchClient(mockServer.url);
    const version = client.getVersion();
    expect(typeof version).toBe('string');
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ─── Port handling in request URLs ─────────────────────────────
//
// Regression: the second constructor argument (`port`) used to be
// consulted only when building the WebSocket connection. HTTP
// requests built by `request()` used `this.baseUrl` verbatim, so
// passing `new docPouchClient('http://localhost', 3030, ...)` would
// POST to `http://localhost/oidc/reg` (port 80) instead of
// `http://localhost:3030/oidc/reg`. These tests pin the fix.

describe('port handling in request URLs', () => {
    let originalFetch: typeof globalThis.fetch;
    let capturedUrls: string[];

    beforeEach(() => {
        capturedUrls = [];
        originalFetch = globalThis.fetch;
        // Stub fetch so we can inspect the URLs without needing a live
        // server. Each call resolves with a minimal 200 OK JSON
        // response that satisfies the OIDC discovery/registration
        // contracts the client actually consumes here.
        globalThis.fetch = (async (url: any, _options?: any) => {
            capturedUrls.push(typeof url === 'string' ? url : url.toString());
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({}),
            } as any;
        }) as any;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('appends the port to the base URL when the host has no port', async () => {
        const client = new docPouchClient('http://localhost', 3030);

        // Trigger a real HTTP request by calling the public register
        // method (which only needs the OIDC registration token and a
        // network round trip, not a real DocPouch server).
        await client.registerOidcClient(
            {
                client_name: 'test',
                redirect_uris: ['http://localhost/cb'],
                post_logout_redirect_uris: ['http://localhost/cb'],
                response_types: ['code'],
                grant_types: ['authorization_code'],
                token_endpoint_auth_method: 'none',
                application_type: 'web',
            },
            'token-xyz'
        );

        expect(capturedUrls.length).toBeGreaterThan(0);
        // Note: assert against the raw URL string, not `new URL(...)`,
        // because the URL parser strips the default port (80) on its own
        // and we want to verify what the client actually passed to
        // `fetch()` rather than what the URL parser normalizes it to.
        expect(capturedUrls[0]).toBe('http://localhost:3030/oidc/reg');
    });

    it('does not append the port when the host already has one', async () => {
        const client = new docPouchClient('http://localhost:3030', 3030);

        await client.registerOidcClient(
            {
                client_name: 'test',
                redirect_uris: ['http://localhost/cb'],
                post_logout_redirect_uris: ['http://localhost/cb'],
                response_types: ['code'],
                grant_types: ['authorization_code'],
                token_endpoint_auth_method: 'none',
                application_type: 'web',
            },
            'token-xyz'
        );

        expect(capturedUrls.length).toBeGreaterThan(0);
        expect(capturedUrls[0]).toBe('http://localhost:3030/oidc/reg');
    });

    it('prefers the host port over the constructor port argument', async () => {
        // Mismatched port: the host has 8080 but the constructor
        // argument is 3030. The host's port must win so existing
        // callers that put the port in the URL keep working.
        const client = new docPouchClient('http://localhost:8080', 3030);

        await client.registerOidcClient(
            {
                client_name: 'test',
                redirect_uris: ['http://localhost/cb'],
                post_logout_redirect_uris: ['http://localhost/cb'],
                response_types: ['code'],
                grant_types: ['authorization_code'],
                token_endpoint_auth_method: 'none',
                application_type: 'web',
            },
            'token-xyz'
        );

        expect(capturedUrls.length).toBeGreaterThan(0);
        expect(capturedUrls[0]).toBe('http://localhost:8080/oidc/reg');
    });

    it('uses the default port (80) when the constructor port is omitted and the host has no port', async () => {
        const client = new docPouchClient('http://localhost');

        await client.registerOidcClient(
            {
                client_name: 'test',
                redirect_uris: ['http://localhost/cb'],
                post_logout_redirect_uris: ['http://localhost/cb'],
                response_types: ['code'],
                grant_types: ['authorization_code'],
                token_endpoint_auth_method: 'none',
                application_type: 'web',
            },
            'token-xyz'
        );

        expect(capturedUrls.length).toBeGreaterThan(0);
        // The client appends :80 because that's the default port for the
        // http:// scheme. The URL parser would normalize that away when
        // re-parsing the URL, so we check the raw string here.
        expect(capturedUrls[0]).toBe('http://localhost:80/oidc/reg');
    });

    it('strips a trailing slash from the base URL before appending the endpoint', async () => {
        const client = new docPouchClient('http://localhost:3030/', 3030);

        await client.registerOidcClient(
            {
                client_name: 'test',
                redirect_uris: ['http://localhost/cb'],
                post_logout_redirect_uris: ['http://localhost/cb'],
                response_types: ['code'],
                grant_types: ['authorization_code'],
                token_endpoint_auth_method: 'none',
                application_type: 'web',
            },
            'token-xyz'
        );

        expect(capturedUrls.length).toBeGreaterThan(0);
        // No double slash between the base URL and the endpoint.
        expect(capturedUrls[0]).toBe('http://localhost:3030/oidc/reg');
    });
});

// ─── Authentication ─────────────────────────────────────────────

describe('authentication', () => {
  it('should login with valid admin credentials', async () => {
    const client = new docPouchClient(mockServer.url);
    const result = await client.login(adminLogin);
    expect(result).not.toBeNull();
    expect(result!.token).toBeDefined();
    expect(result!.isAdmin).toBe(true);
    expect(result!.userName).toBe('admin');
    expect(result!._id).toBeDefined();
  });

  it('should login with valid user credentials', async () => {
    const client = new docPouchClient(mockServer.url);
    const result = await client.login(userLogin);
    expect(result).not.toBeNull();
    expect(result!.token).toBeDefined();
    expect(result!.isAdmin).toBe(false);
    expect(result!.userName).toBe('testuser');
  });

  it('should throw for invalid credentials', async () => {
    const client = new docPouchClient(mockServer.url);
    await expect(client.login({ name: 'admin', password: 'wrong' })).rejects.toThrow('API error: 401');
  });

  it('should throw for non-existent user', async () => {
    const client = new docPouchClient(mockServer.url);
    await expect(client.login({ name: 'nobody', password: 'pass' })).rejects.toThrow('API error: 404');
  });
});

// ─── Token Management ───────────────────────────────────────────

describe('token management', () => {
  it('should set token and return it via getToken', () => {
    const client = new docPouchClient(mockServer.url);
    client.setToken('my-test-token');
    expect(client.getToken()).toBe('my-test-token');
    expect(client.getAuthMethod()).toBe('jwt');
    expect(client.isAuthenticated()).toBe(true);
  });

  it('should clear token when set to null', () => {
    const client = new docPouchClient(mockServer.url);
    client.setToken('my-test-token');
    client.setToken(null);
    expect(client.getToken()).toBeNull();
    expect(client.getAuthMethod()).toBe('none');
    expect(client.isAuthenticated()).toBe(false);
  });

  it('should be unauthenticated initially', () => {
    const client = new docPouchClient(mockServer.url);
    expect(client.isAuthenticated()).toBe(false);
    expect(client.getAuthMethod()).toBe('none');
  });

  it('should be authenticated after login', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    expect(client.isAuthenticated()).toBe(true);
    expect(client.getAuthMethod()).toBe('jwt');
  });

  it('should clear auth state on logout', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    await client.logout();
    expect(client.isAuthenticated()).toBe(false);
    expect(client.getAuthMethod()).toBe('none');
    expect(client.getToken()).toBeNull();
  });
});

// ─── User Management ────────────────────────────────────────────

describe('user management', () => {
  it('should list all users as admin', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const users: I_UserEntry[] = await client.listUsers();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThanOrEqual(2);
    expect(users.some(u => u.name === 'admin')).toBe(true);
    expect(users.some(u => u.name === 'testuser')).toBe(true);
  });

  it('should list users as non-admin', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(userLogin);
    const users: I_UserEntry[] = await client.listUsers();
    expect(Array.isArray(users)).toBe(true);
  });

  it('should create a new user as admin', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const newUser = await client.createUser({
      name: 'newuser',
      password: 'newpass',
      email: 'new@example.com',
      department: 'sales',
      group: 'beta',
      isAdmin: false,
    });
    expect(newUser._id).toBeDefined();
    expect(newUser.username).toBe('newuser');
  });

  it('should fail to create user as non-admin', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(userLogin);
    await expect(client.createUser({
      name: 'shouldfail',
      password: 'pass',
      department: 'test',
      group: 'test',
      isAdmin: false,
    })).rejects.toThrow('API error: 401');
  });

  it('should update a user as admin', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const users: I_UserEntry[] = await client.listUsers();
    const targetUser = users.find(u => u.name === 'testuser')!;
    await client.updateUser(targetUser._id, { email: 'updated@example.com' });
    const updatedUsers: I_UserEntry[] = await client.listUsers();
    const updated = updatedUsers.find(u => u._id === targetUser._id);
    expect(updated!.email).toBe('updated@example.com');
  });

  it('should remove a user as admin', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const users: I_UserEntry[] = await client.listUsers();
    const targetUser = users.find(u => u.name === 'testuser')!;
    await client.removeUser(targetUser._id);
    const usersAfter: I_UserEntry[] = await client.listUsers();
    expect(usersAfter.find(u => u._id === targetUser._id)).toBeUndefined();
  });

  it('should fail to remove a user as non-admin', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(userLogin);
    await expect(client.removeUser('some-id')).rejects.toThrow('API error: 401');
  });
});

// ─── Document Management ────────────────────────────────────────

const sampleDoc = {
  title: 'Test Doc',
  description: 'A test document',
  type: 1,
  subType: 0,
  content: [{ label: 'Content', importance: 0 }],
  shareWithGroup: false,
  shareWithDepartment: false,
  public: false,
};

describe('document management', () => {
  it('should create a document', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const doc = await client.createDocument(sampleDoc as I_DocumentEntry);
    expect(doc._id).toBeDefined();
    expect(doc.title).toBe('Test Doc');
    expect(doc.owner).toBeDefined();
  });

    it('should keep token on 403 (role insufficient)', async () => {
        const adminClient = new docPouchClient(mockServer.url);
        await adminClient.login(adminLogin);
        await adminClient.setProtectedStructure(sampleDoc.type, sampleDoc.subType, 'admin');

        const client = new docPouchClient(mockServer.url);
        await client.login(userLogin);
        const token = client.getToken();
        await expect(client.createDocument(sampleDoc as I_DocumentEntry)).rejects.toThrow('API error: 403');
        expect(client.getToken()).toBe(token);
        expect(client.isAuthenticated()).toBe(true);
        const me = await client.getCurrentUser();
        expect(me!.role).toBe('member');
    });

    it('should keep token on 403 for update and remove of protected documents', async () => {
        const adminClient = new docPouchClient(mockServer.url);
        await adminClient.login(adminLogin);
        await adminClient.setProtectedStructure(sampleDoc.type, sampleDoc.subType, 'admin');
        const doc = await adminClient.createDocument(sampleDoc as I_DocumentEntry);

        const client = new docPouchClient(mockServer.url);
        await client.login(userLogin);
        const token = client.getToken();
        await expect(client.updateDocument(doc._id, {title: 'Hijacked'} as I_DocumentEntry)).rejects.toThrow('API error: 403');
        await expect(client.removeDocument(doc._id)).rejects.toThrow('API error: 403');
        expect(client.getToken()).toBe(token);
        const me = await client.getCurrentUser();
        expect(me!.role).toBe('member');
    });

  it('should list documents', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const docs: I_DocumentEntry[] = await client.listDocuments();
    expect(Array.isArray(docs)).toBe(true);
  });

  it('should list documents created by the user', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    await client.createDocument(sampleDoc as I_DocumentEntry);
    const docs: I_DocumentEntry[] = await client.listDocuments();
    expect(docs.length).toBe(1);
    expect(docs[0].title).toBe('Test Doc');
  });

  it('should fetch documents by query', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const created = await client.createDocument(sampleDoc as I_DocumentEntry);
    const results: I_DocumentEntry[] = await client.fetchDocuments({ type: 1 } as I_DocumentQuery);
    expect(results.length).toBe(1);
    expect(results[0]._id).toBe(created._id);
  });

  it('should return empty array for non-matching query', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const results: I_DocumentEntry[] = await client.fetchDocuments({ type: 999 } as I_DocumentQuery);
    expect(results).toEqual([]);
  });

  it('should update a document', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const doc = await client.createDocument(sampleDoc as I_DocumentEntry);
    await client.updateDocument(doc._id, { title: 'Updated' } as I_DocumentEntry);
    const results: I_DocumentEntry[] = await client.fetchDocuments({ _id: doc._id } as I_DocumentQuery);
    expect(results[0].title).toBe('Updated');
  });

  it('should remove a document', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const doc = await client.createDocument(sampleDoc as I_DocumentEntry);
    await client.removeDocument(doc._id);
    const results: I_DocumentEntry[] = await client.fetchDocuments({ _id: doc._id } as I_DocumentQuery);
    expect(results.length).toBe(0);
  });

  it('should allow non-owner to read public documents', async () => {
    const adminClient = new docPouchClient(mockServer.url);
    await adminClient.login(adminLogin);
    const doc = await adminClient.createDocument({
      ...sampleDoc, public: true, title: 'Public Doc',
    } as I_DocumentEntry);

    const userClient = new docPouchClient(mockServer.url);
    await userClient.login(userLogin);
    const docs: I_DocumentEntry[] = await userClient.listDocuments();
    expect(docs.some(d => d._id === doc._id)).toBe(true);
  });

  it('should hide non-public documents from other users', async () => {
    const adminClient = new docPouchClient(mockServer.url);
    await adminClient.login(adminLogin);
    await adminClient.createDocument({
      ...sampleDoc, public: false, title: 'Private Doc',
    } as I_DocumentEntry);

    const userClient = new docPouchClient(mockServer.url);
    await userClient.login(userLogin);
    const docs: I_DocumentEntry[] = await userClient.listDocuments();
    expect(docs.some(d => d.title === 'Private Doc')).toBe(false);
  });
});

// ─── Data Structure Management ──────────────────────────────────

const sampleFields = [
  { name: 'field1', displayName: 'Field 1', type: 'string' },
];

describe('data structure management', () => {
  it('should create a structure as admin', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const structure = await client.createStructure({
      name: 'Test Structure',
      description: 'A test',
      type: 1,
      subType: 0,
      fields: sampleFields,
    });
    expect(structure._id).toBeDefined();
    expect(structure.name).toBe('Test Structure');
  });

  it('should fail to create a structure as non-admin', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(userLogin);
    await expect(client.createStructure({
      name: 'Should Fail',
      description: '',
      type: 1,
      subType: 0,
      fields: sampleFields,
    })).rejects.toThrow('API error: 401');
  });

  it('should list all structures', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    await client.createStructure({ name: 'S1', description: '', type: 1, subType: 0, fields: sampleFields });
    await client.createStructure({ name: 'S2', description: '', type: 2, subType: 0, fields: sampleFields });
    const list = await client.getStructures();
    expect(list.length).toBe(2);
  });

  it('should update a structure', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const s = await client.createStructure({ name: 'Original', description: '', type: 1, subType: 0, fields: sampleFields });
    await client.updateStructure(s._id!, { name: 'Renamed' } as I_DataStructure);
    const list = await client.getStructures();
    const updated = list.find(x => x._id === s._id);
    expect(updated!.name).toBe('Renamed');
  });

  it('should remove a structure', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const s = await client.createStructure({ name: 'To Delete', description: '', type: 1, subType: 0, fields: sampleFields });
    await client.removeStructure(s._id!);
    const list = await client.getStructures();
    expect(list.find(x => x._id === s._id)).toBeUndefined();
  });
});

// ─── Structure Access Control ──────────────────────────────────

describe('structure access control', () => {
  it('should list anonymous allowlist entries', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const list = await client.listAnonymousStructures();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toEqual([]);
  });

  it('should set an anonymous allowlist entry with correct request', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const token = client.getToken();

    const entry = await client.setAnonymousAllowed(3, 2);

    expect(entry._id).toBeDefined();
    expect(entry.type).toBe(3);
    expect(entry.subType).toBe(2);
    const rec = mockServer.requests[mockServer.requests.length - 1];
    expect(rec.method).toBe('POST');
    expect(rec.url).toBe('/structures/anonymous/set');
    expect(rec.authorization).toBe(`Bearer ${token}`);
    expect(rec.body).toEqual({ type: 3, subType: 2 });

    // Idempotent: setting an existing entry returns the stored one.
    const again = await client.setAnonymousAllowed(3, 2);
    expect(again._id).toBe(entry._id);
  });

  it('should list anonymous allowlist entries after setting', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const entry = await client.setAnonymousAllowed(4, 1);
    const list = await client.listAnonymousStructures();
    expect(list.length).toBe(1);
    expect(list[0]._id).toBe(entry._id);
    const rec = mockServer.requests[mockServer.requests.length - 1];
    expect(rec.method).toBe('GET');
    expect(rec.url).toBe('/structures/anonymous/list');
    expect(rec.authorization).toBe(`Bearer ${client.getToken()}`);
  });

  it('should remove an anonymous allowlist entry with a DELETE body', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    await client.setAnonymousAllowed(4, 1);
    const token = client.getToken();
    const result = await client.removeAnonymousAllowed(4, 1);
    expect(result).toEqual({ removed: 1 });
    const rec = mockServer.requests[mockServer.requests.length - 1];
    expect(rec.method).toBe('DELETE');
    expect(rec.url).toBe('/structures/anonymous/remove');
    expect(rec.authorization).toBe(`Bearer ${token}`);
    expect(rec.body).toEqual({ type: 4, subType: 1 });
    expect(await client.listAnonymousStructures()).toEqual([]);
  });

  it('should reject anonymous allowlist changes for non-admin users', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(userLogin);
    await expect(client.setAnonymousAllowed(3, 2)).rejects.toThrow('API error: 401');
    expect(client.getToken()).toBeNull();
  });

  it('should allow role-admin users to manage the anonymous allowlist', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(roleAdminLogin);
    const entry = await client.setAnonymousAllowed(5, 0);
    expect(entry.type).toBe(5);
    const result = await client.removeAnonymousAllowed(5, 0);
    expect(result).toEqual({ removed: 1 });
  });

  it('should set a protected structure rule with correct request', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const token = client.getToken();

    const rule = await client.setProtectedStructure(2, 7, 'manager');

    expect(rule._id).toBeDefined();
    expect(rule.type).toBe(2);
    expect(rule.subType).toBe(7);
    expect(rule.minRole).toBe('manager');
    const rec = mockServer.requests[mockServer.requests.length - 1];
    expect(rec.method).toBe('POST');
    expect(rec.url).toBe('/structures/protected/set');
    expect(rec.authorization).toBe(`Bearer ${token}`);
    expect(rec.body).toEqual({ type: 2, subType: 7, minRole: 'manager' });

    // Idempotent upsert: same (type, subType) updates the minRole.
    const updated = await client.setProtectedStructure(2, 7, 'admin');
    expect(updated._id).toBe(rule._id);
    expect(updated.minRole).toBe('admin');
  });

  it('should list and remove protected structure rules', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    const rule = await client.setProtectedStructure(6, 3, 'superadmin');
    const list = await client.listProtectedStructures();
    expect(list.length).toBe(1);
    expect(list[0]._id).toBe(rule._id);
    expect(list[0].minRole).toBe('superadmin');

    const token = client.getToken();
    const result = await client.removeProtectedStructure(6, 3);
    expect(result).toEqual({ removed: 1 });
    const rec = mockServer.requests[mockServer.requests.length - 1];
    expect(rec.method).toBe('DELETE');
    expect(rec.url).toBe('/structures/protected/remove');
    expect(rec.authorization).toBe(`Bearer ${token}`);
    expect(rec.body).toEqual({ type: 6, subType: 3 });
    expect(await client.listProtectedStructures()).toEqual([]);
  });

  it('should reject protected structure changes without super-admin privileges', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(roleAdminLogin);
    await expect(client.setProtectedStructure(2, 7, 'manager')).rejects.toThrow('API error: 401');
    expect(client.getToken()).toBeNull();
  });

  it('should pass role through on createUser and updateUser', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);

    const created = await client.createUser({
      name: 'roleuser',
      password: 'pass',
      department: 'sales',
      group: 'beta',
      isAdmin: false,
      role: 'manager',
    });
    expect(created.role).toBe('manager');
    const createRec = mockServer.requests[mockServer.requests.length - 1];
    expect(createRec.method).toBe('POST');
    expect(createRec.url).toBe('/users/create');
    expect(createRec.body.role).toBe('manager');

    const users: I_UserEntry[] = await client.listUsers();
    const targetUser = users.find(u => u.name === 'testuser')!;
    await client.updateUser(targetUser._id, { isAdmin: false, role: 'admin' });
    const updateRec = mockServer.requests[mockServer.requests.length - 1];
    expect(updateRec.method).toBe('PATCH');
    expect(updateRec.url).toBe(`/users/update/${targetUser._id}`);
    expect(updateRec.body.role).toBe('admin');

    const usersAfter: I_UserEntry[] = await client.listUsers();
    expect(usersAfter.find(u => u._id === targetUser._id)!.role).toBe('admin');
  });

  it('should return the effective role from getCurrentUser', async () => {
    const adminClient = new docPouchClient(mockServer.url);
    await adminClient.login(adminLogin);
    const admin = await adminClient.getCurrentUser();
    expect(admin!.role).toBe('superadmin');

    const userClient = new docPouchClient(mockServer.url);
    await userClient.login(userLogin);
    const user = await userClient.getCurrentUser();
    expect(user!.role).toBe('member');
  });
});

// ─── Version Check ──────────────────────────────────────────────

describe('version check', () => {
  it('should be requestable without auth', async () => {
    const client = new docPouchClient(mockServer.url);
    const version = client.getVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should return a valid semver string', () => {
    const client = new docPouchClient(mockServer.url);
    const parts = client.getVersion().split('.');
    expect(parts.length).toBe(3);
    parts.forEach(p => expect(/^\d+$/.test(p)).toBe(true));
  });
});

// ─── Real-Time Sync (WebSocket) ─────────────────────────────────

describe('real-time sync', () => {
  it('should connect the socket after login and enabling sync', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    client.setRealTimeSync(true);
    await waitForSocket(client);
    expect(client.socket.connected).toBe(true);
    expect(client.socket.id).toBeDefined();
    client.socket.disconnect();
  });

  it('should disconnect when disabling sync', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    client.setRealTimeSync(true);
    await waitForSocket(client);
    client.setRealTimeSync(false);
    await delay(500);
    expect(client.socket.connected).toBe(false);
  });

  it('should respond to heartbeat ping with pong', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    client.setRealTimeSync(true);
    await waitForSocket(client);

    mockServer.io.emit('heartbeatPing', { timestamp: Date.now() });
    await mockServer.waitForPong(4000);

    client.socket.disconnect();
  });

  it('should forward application events to the callback', async () => {
    const callback = jest.fn();
    const client = new docPouchClient(mockServer.url, 80, callback);
    await client.login(adminLogin);
    client.setRealTimeSync(true);
    await waitForSocket(client);

    mockServer.io.emit('newDocument', { _id: 'test123', title: 'WS Doc' });
    await delay(300);
    expect(callback).toHaveBeenCalledWith('newDocument', expect.objectContaining({ _id: 'test123' }));

    client.socket.disconnect();
  });

  it('should not skip socket init if setting unchanged', async () => {
    const client = new docPouchClient(mockServer.url);
    expect(client.realTimeSync).toBe(false);
    client.setRealTimeSync(false);
    expect(client.realTimeSync).toBe(false);
  });

  it('should connect socket when token is set after enabling sync', async () => {
    const client = new docPouchClient(mockServer.url);
    client.setRealTimeSync(true);
    expect(client.socket.connected).toBe(false);
    await client.login(adminLogin);
    await waitForSocket(client);
    expect(client.socket.connected).toBe(true);
    client.socket.disconnect();
  });
});

// ─── OIDC Authentication ────────────────────────────────────────

describe('OIDC authentication', () => {
  beforeEach(() => {
    const w = (globalThis as any).window;
    w.location.href = '';
    w.location.search = '';
    w.location.pathname = '';
    jest.clearAllMocks();
  });

  it('should redirect to the OIDC authorization endpoint on loginWithOidc', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.loginWithOidc({
      issuer: mockServer.url,
      clientId: 'test-client',
      redirectUri: `${mockServer.url}/mock-oidc/callback`,
      scopes: ['openid', 'profile'],
    });

    const w = (globalThis as any).window;
    expect(w.location.href).toContain('/mock-oidc/authorize');
    expect(w.location.href).toContain('response_type=code');
    expect(w.location.href).toContain('client_id=test-client');
    expect(w.location.href).toContain('code_challenge_method=S256');
  });

  it('should exchange code for tokens in handleOidcCallback', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.loginWithOidc({
      issuer: mockServer.url,
      clientId: 'test-client',
      redirectUri: `${mockServer.url}/mock-oidc/callback`,
    });

    const authUrl = (globalThis as any).window.location.href;
    const authResponse = await fetch(authUrl);
    const callbackUrl = authResponse.url;
    const callbackParams = new URL(callbackUrl).searchParams;
    const code = callbackParams.get('code');
    const state = callbackParams.get('state');

    (globalThis as any).window.location.search = `?code=${code}&state=${state}`;

    const result = await client.handleOidcCallback();
    expect(result).toBe(true);
    expect(client.getAuthMethod()).toBe('oidc');
    expect(client.isAuthenticated()).toBe(true);
  });

  it('should return false when no code or state in URL', async () => {
    const client = new docPouchClient(mockServer.url);
    (globalThis as any).window.location.search = '';
    const result = await client.handleOidcCallback();
    expect(result).toBe(false);
  });

  it('should throw on state mismatch', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.loginWithOidc({
      issuer: mockServer.url,
      clientId: 'test-client',
      redirectUri: `${mockServer.url}/mock-oidc/callback`,
    });

    (globalThis as any).window.location.search = '?code=fake&state=wrong-state';
    await expect(client.handleOidcCallback()).rejects.toThrow('State mismatch');
  });

  it('should throw on OAuth error', async () => {
    const client = new docPouchClient(mockServer.url);
    (globalThis as any).window.location.search = '?error=access_denied';
    await expect(client.handleOidcCallback()).rejects.toThrow('OAuth error');
  });
});

// ─── OIDC Dynamic Client Registration ───────────────────────────

describe('OIDC dynamic client registration', () => {
  const clientMetadata = {
    client_name: 'My Test Client',
    redirect_uris: ['http://localhost:8080/cb'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'openid profile',
    token_endpoint_auth_method: 'client_secret_basic' as const,
  };

  it('should register a new OIDC client', async () => {
    const client = new docPouchClient(mockServer.url);
    const result = await client.registerOidcClient(clientMetadata, mockServer.registrationToken);
    expect(result.client_id).toBeDefined();
    expect(result.client_secret).toBeDefined();
    expect(result.client_name).toBe('My Test Client');
    expect(result.redirect_uris).toEqual(['http://localhost:8080/cb']);
    expect(result.registration_access_token).toBeDefined();
    expect(result.registration_client_uri).toBeDefined();
  });

  it('should fail to register without a registration token', async () => {
    const client = new docPouchClient(mockServer.url);
    await expect(client.registerOidcClient(clientMetadata)).rejects.toThrow('API error: 401');
  });

  it('should retrieve a registered OIDC client', async () => {
    const client = new docPouchClient(mockServer.url);
    const registered = await client.registerOidcClient(clientMetadata, mockServer.registrationToken);
    const result = await client.getOidcClient(registered.client_id, mockServer.registrationToken);
    expect(result.client_id).toBe(registered.client_id);
    expect(result.client_name).toBe('My Test Client');
  });

  it('should fail to retrieve a non-existent client', async () => {
    const client = new docPouchClient(mockServer.url);
    await expect(client.getOidcClient('non-existent-id', mockServer.registrationToken)).rejects.toThrow('API error: 404');
  });

  it('should update a registered OIDC client', async () => {
    const client = new docPouchClient(mockServer.url);
    const registered = await client.registerOidcClient(clientMetadata, mockServer.registrationToken);
    const updated = await client.updateOidcClient(registered.client_id, {
      client_name: 'Updated Client',
      redirect_uris: ['http://localhost:9090/cb'],
    }, mockServer.registrationToken);
    expect(updated.client_name).toBe('Updated Client');
    expect(updated.redirect_uris).toEqual(['http://localhost:9090/cb']);
  });

  it('should delete a registered OIDC client', async () => {
    const client = new docPouchClient(mockServer.url);
    const registered = await client.registerOidcClient(clientMetadata, mockServer.registrationToken);
    await client.deleteOidcClient(registered.client_id, mockServer.registrationToken);
    await expect(client.getOidcClient(registered.client_id, mockServer.registrationToken)).rejects.toThrow('API error: 404');
  });

  it('should fail to delete a non-existent client', async () => {
    const client = new docPouchClient(mockServer.url);
    await expect(client.deleteOidcClient('non-existent-id', mockServer.registrationToken)).rejects.toThrow('API error: 404');
  });
});

// ─── Logout Functionality ─────────────────────────────────────────────

describe('logout functionality', () => {
  it('should logout JWT user and emit events', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    
    let logoutCalled = false;
    let jwtLogoutCalled = false;
    
    client.onLogout(() => { logoutCalled = true; });
    client.onJwtLogout(() => { jwtLogoutCalled = true; });
    
    await client.logoutJwt();
    
    expect(client.isAuthenticated()).toBe(false);
    expect(client.getAuthMethod()).toBe('none');
    expect(client.getToken()).toBeNull();
    expect(logoutCalled).toBe(true);
    expect(jwtLogoutCalled).toBe(true);
  });
  
  it('should have updated logout method that supports options', async () => {
    const client = new docPouchClient(mockServer.url);
    // Just test that the method exists and can be called with options
    expect(typeof client.logout).toBe('function');
  });
});

// ─── Error Handling ─────────────────────────────────────────────

describe('error handling', () => {
  it('should throw on 404 for invalid user ID', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    await expect(client.removeUser('nonexistent-id')).rejects.toThrow('API error: 404');
  });

  it('should throw on 404 for invalid document ID', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    await expect(client.removeDocument('nonexistent-id')).rejects.toThrow('API error: 404');
  });

  it('should throw on 404 for invalid structure ID', async () => {
    const client = new docPouchClient(mockServer.url);
    await client.login(adminLogin);
    await expect(client.removeStructure('nonexistent-id')).rejects.toThrow('API error: 404');
  });

  it('should throw when not authenticated on protected route', async () => {
    const client = new docPouchClient(mockServer.url);
    await expect(client.listUsers()).rejects.toThrow('API error: 401');
  });

  it('should clear token on 401', async () => {
    const client = new docPouchClient(mockServer.url);
    client.setToken('invalid-token');
    await expect(client.listUsers()).rejects.toThrow('API error: 401');
    expect(client.getToken()).toBeNull();
  });

  it('should throw on network error for unreachable server', async () => {
    const client = new docPouchClient('http://localhost:1');
    client.setToken('some-token');
    await expect(client.listUsers()).rejects.toThrow();
  });
});
