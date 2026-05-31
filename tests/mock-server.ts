import express from 'express';
import { createServer, type Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import type { AddressInfo } from 'net';
import crypto from 'crypto';

export interface MockSession {
  userId: string;
  isAdmin: boolean;
  userName: string;
}

export interface MockUser {
  _id: string;
  name: string;
  password: string;
  email?: string;
  department: string;
  group: string;
  isAdmin: boolean;
}

export interface MockDocument {
  _id: string;
  owner: string;
  title: string;
  description?: string;
  type: number;
  subType: number;
  content: any;
  shareWithGroup: boolean;
  shareWithDepartment: boolean;
  public: boolean;
}

export interface MockStructure {
  _id: string;
  name: string;
  description: string;
  fields: { name: string; type: string; items?: string }[];
}

export interface MockType {
  _id: string;
  type: number;
  subType: number;
  name: string;
  description?: string;
  defaultStructureID?: string;
}

export interface MockServer {
  server: HttpServer;
  io: SocketIOServer;
  port: number;
  url: string;
  users: Map<string, MockUser>;
  documents: Map<string, MockDocument>;
  structures: Map<string, MockStructure>;
  types: Map<string, MockType>;
  sessions: Map<string, MockSession>;
  oidcClients: Map<string, any>;
  registrationToken: string;
  reset: () => void;
  waitForPong: (timeout?: number) => Promise<any>;
}

function generateId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map(b => b.toString(36).padStart(2, '0'))
    .join('');
}

export function createMockServer(): Promise<MockServer> {
  const app = express();
  const server = createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: '*' }
  });

  const users = new Map<string, MockUser>();
  const documents = new Map<string, MockDocument>();
  const structures = new Map<string, MockStructure>();
  const types = new Map<string, MockType>();
  const sessions = new Map<string, MockSession>();

  function seedData() {
    const adminId = generateId();
    users.set(adminId, {
      _id: adminId,
      name: 'admin',
      password: 'admin',
      email: 'admin@example.com',
      department: 'administration',
      group: 'auto-created',
      isAdmin: true,
    });

    const userId = generateId();
    users.set(userId, {
      _id: userId,
      name: 'testuser',
      password: 'testpass',
      email: 'test@example.com',
      department: 'engineering',
      group: 'alpha',
      isAdmin: false,
    });
  }

  function reset() {
    users.clear();
    documents.clear();
    structures.clear();
    types.clear();
    sessions.clear();
    seedData();
  }

  seedData();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  function authMiddleware(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.slice(7);
    const session = sessions.get(token);
    if (!session) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.session = session;
    next();
  }

  function adminMiddleware(req: any, res: any, next: any) {
    if (!req.session.isAdmin) {
      return res.status(401).json({ error: 'Admin access required' });
    }
    next();
  }

  function getTokenSession(token: string): MockSession | undefined {
    return sessions.get(token);
  }

  // Socket.IO auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('No token provided'));
    }
    const session = getTokenSession(token);
    if (!session) {
      return next(new Error('Invalid token'));
    }
    (socket as any).session = session;
    next();
  });

  let pongResolve: ((data: any) => void) | null = null;

  io.on('connection', (socket) => {
    socket.on('heartbeatPong', (data) => {
      if (pongResolve) {
        pongResolve(data);
        pongResolve = null;
      }
    });
  });

  // Auth endpoints
  app.post('/users/login', (req: any, res: any) => {
    const { name, password } = req.body;
    const user = Array.from(users.values()).find(u => u.name === name);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = generateId() + generateId();
    sessions.set(token, {
      userId: user._id,
      isAdmin: user.isAdmin,
      userName: user.name,
    });
    res.json({
      _id: user._id,
      token,
      isAdmin: user.isAdmin,
      userName: user.name,
    });
  });

  // User endpoints
  app.get('/users/list', authMiddleware, (req: any, res: any) => {
    const userList = Array.from(users.values()).map(u => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      department: u.department,
      group: u.group,
      isAdmin: u.isAdmin,
    }));
    res.json(userList);
  });

  app.post('/users/create', authMiddleware, adminMiddleware, (req: any, res: any) => {
    const { name, password, email, department, group, isAdmin } = req.body;
    const _id = generateId();
    const newUser: MockUser = {
      _id,
      name,
      password,
      email,
      department,
      group,
      isAdmin: isAdmin || false,
    };
    users.set(_id, newUser);
    io.emit('newUser', { _id, name, email, department, group });
    res.json({
      _id,
      username: name,
      email,
      department,
      group,
      isAdmin: newUser.isAdmin,
    });
  });

  app.patch('/users/update/:userID', authMiddleware, (req: any, res: any) => {
    const { userID } = req.params;
    const user = users.get(userID);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!req.session.isAdmin && req.session.userId !== userID) {
      return res.status(401).json({ error: 'Not authorized to update this user' });
    }
    const updates = req.body;
    if (updates.name !== undefined) user.name = updates.name;
    if (updates.password !== undefined) user.password = updates.password;
    if (updates.email !== undefined) user.email = updates.email;
    if (updates.department !== undefined) user.department = updates.department;
    if (updates.group !== undefined) user.group = updates.group;
    if (updates.isAdmin !== undefined && req.session.isAdmin) user.isAdmin = updates.isAdmin;
    users.set(userID, user);
    io.emit('changedUser', { _id: userID, ...updates });
    res.json({ success: true });
  });

  app.delete('/users/remove/:userID', authMiddleware, adminMiddleware, (req: any, res: any) => {
    const { userID } = req.params;
    if (!users.has(userID)) {
      return res.status(404).json({ error: 'User not found' });
    }
    users.delete(userID);
    Array.from(documents.entries()).filter(([_, d]) => d.owner === userID).forEach(([id]) => documents.delete(id));
    io.emit('removedUser', { removedID: userID });
    res.json({ success: true });
  });

  // Document endpoints
  app.post('/docs/create', authMiddleware, (req: any, res: any) => {
    const owner = req.session.userId;
    const _id = generateId();
    const doc: MockDocument = {
      _id,
      owner,
      title: req.body.title,
      description: req.body.description,
      type: req.body.type,
      subType: req.body.subType,
      content: req.body.content,
      shareWithGroup: req.body.shareWithGroup || false,
      shareWithDepartment: req.body.shareWithDepartment || false,
      public: req.body.public || false,
    };
    documents.set(_id, doc);
    io.emit('newDocument', { ...doc });
    res.json(doc);
  });

  app.get('/docs/list', authMiddleware, (req: any, res: any) => {
    const docList = Array.from(documents.values())
      .filter(d => canRead(req.session, d))
      .map(({ content, ...rest }) => rest);
    res.json(docList);
  });

  app.post('/docs/fetch', authMiddleware, (req: any, res: any) => {
    const query = req.body;
    const results = Array.from(documents.values())
      .filter(d => canRead(req.session, d))
      .filter(d => {
        if (query._id && d._id !== query._id) return false;
        if (query.owner && d.owner !== query.owner) return false;
        if (query.type !== undefined && d.type !== query.type) return false;
        if (query.subType !== undefined && d.subType !== query.subType) return false;
        if (query.title !== undefined && d.title !== query.title) return false;
        if (query.description !== undefined && d.description !== query.description) return false;
        if (query.shareWithGroup !== undefined && d.shareWithGroup !== query.shareWithGroup) return false;
        if (query.shareWithDepartment !== undefined && d.shareWithDepartment !== query.shareWithDepartment) return false;
        if (query.public !== undefined && d.public !== query.public) return false;
        return true;
      });
    res.json(results);
  });

  app.patch('/docs/update/:documentID', authMiddleware, (req: any, res: any) => {
    const { documentID } = req.params;
    const doc = documents.get(documentID);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (!req.session.isAdmin && doc.owner !== req.session.userId) {
      const canEdit = doc.shareWithGroup || doc.shareWithDepartment || doc.public;
      if (!canEdit) {
        return res.status(401).json({ error: 'Not authorized to update this document' });
      }
    }
    const updates = req.body;
    if (updates.title !== undefined) doc.title = updates.title;
    if (updates.description !== undefined) doc.description = updates.description;
    if (updates.type !== undefined) doc.type = updates.type;
    if (updates.subType !== undefined) doc.subType = updates.subType;
    if (updates.content !== undefined) doc.content = updates.content;
    if (updates.shareWithGroup !== undefined && doc.owner === req.session.userId) doc.shareWithGroup = updates.shareWithGroup;
    if (updates.shareWithDepartment !== undefined && doc.owner === req.session.userId) doc.shareWithDepartment = updates.shareWithDepartment;
    if (updates.public !== undefined && doc.owner === req.session.userId) doc.public = updates.public;
    documents.set(documentID, doc);
    io.emit('changedDocument', { _id: documentID, ...updates });
    res.json({ success: true });
  });

  app.delete('/docs/remove/:documentID', authMiddleware, (req: any, res: any) => {
    const { documentID } = req.params;
    const doc = documents.get(documentID);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (!req.session.isAdmin && doc.owner !== req.session.userId) {
      return res.status(401).json({ error: 'Not authorized to delete this document' });
    }
    documents.delete(documentID);
    io.emit('removedDocument', { removedID: documentID });
    res.json({ success: true });
  });

  // Structure endpoints
  app.post('/structures/create', authMiddleware, adminMiddleware, (req: any, res: any) => {
    const _id = generateId();
    const structure: MockStructure = {
      _id,
      name: req.body.name,
      description: req.body.description || '',
      fields: req.body.fields || [],
    };
    structures.set(_id, structure);
    io.emit('newStructure', { ...structure });
    res.json(structure);
  });

  app.get('/structures/list', authMiddleware, (req: any, res: any) => {
    const list = Array.from(structures.values());
    res.json(list);
  });

  app.patch('/structures/update/:structureID', authMiddleware, adminMiddleware, (req: any, res: any) => {
    const { structureID } = req.params;
    const structure = structures.get(structureID);
    if (!structure) {
      return res.status(404).json({ error: 'Structure not found' });
    }
    const updates = req.body;
    if (updates.name !== undefined) structure.name = updates.name;
    if (updates.description !== undefined) structure.description = updates.description;
    if (updates.fields !== undefined) structure.fields = updates.fields;
    structures.set(structureID, structure);
    io.emit('changedStructure', { _id: structureID, ...updates });
    res.json({ success: true });
  });

  app.delete('/structures/remove/:structureID', authMiddleware, adminMiddleware, (req: any, res: any) => {
    const { structureID } = req.params;
    if (!structures.has(structureID)) {
      return res.status(404).json({ error: 'Structure not found' });
    }
    structures.delete(structureID);
    io.emit('removedStructure', { removedID: structureID });
    res.json({ success: true });
  });

  // Type endpoints
  app.post('/types/write', authMiddleware, adminMiddleware, (req: any, res: any) => {
    let docType: MockType;
    if (req.body._id && types.has(req.body._id)) {
      docType = types.get(req.body._id)!;
      if (req.body.type !== undefined) docType.type = req.body.type;
      if (req.body.subType !== undefined) docType.subType = req.body.subType;
      if (req.body.name !== undefined) docType.name = req.body.name;
      if (req.body.description !== undefined) docType.description = req.body.description;
      if (req.body.defaultStructureID !== undefined) docType.defaultStructureID = req.body.defaultStructureID;
      types.set(req.body._id, docType);
      io.emit('changedType', { ...docType });
    } else {
      const _id = req.body._id || generateId();
      docType = {
        _id,
        type: req.body.type,
        subType: req.body.subType,
        name: req.body.name,
        description: req.body.description,
        defaultStructureID: req.body.defaultStructureID,
      };
      types.set(_id, docType);
      io.emit('newType', { ...docType });
    }
    res.json(docType);
  });

  app.get('/types/list', authMiddleware, (req: any, res: any) => {
    const list = Array.from(types.values());
    res.json(list);
  });

  app.delete('/types/remove/:typeID', authMiddleware, adminMiddleware, (req: any, res: any) => {
    const { typeID } = req.params;
    if (!types.has(typeID)) {
      return res.status(404).json({ error: 'Type not found' });
    }
    types.delete(typeID);
    io.emit('removedType', { removedID: typeID });
    res.json({ success: true });
  });

  // OIDC Dynamic Client Registration
  const oidcClients = new Map<string, any>();

  const registrationToken = 'mock-reg-token-' + generateId();

  app.post('/oidc/reg', (req: any, res: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${registrationToken}`) {
      return res.status(401).json({ error: 'Invalid or missing registration access token' });
    }
    const clientId = generateId();
    const clientSecret = generateId() + generateId();
    const client: any = {
      client_id: clientId,
      client_secret: clientSecret,
      client_secret_expires_at: 0,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      registration_access_token: 'reg-access-' + generateId(),
      registration_client_uri: `http://localhost:${port}/oidc/reg/${clientId}`,
      client_name: req.body.client_name,
      redirect_uris: req.body.redirect_uris || [],
      grant_types: req.body.grant_types || ['authorization_code'],
      response_types: req.body.response_types || ['code'],
      scope: req.body.scope || 'openid',
      token_endpoint_auth_method: req.body.token_endpoint_auth_method || 'client_secret_basic',
    };
    oidcClients.set(clientId, client);
    res.status(201).json(client);
  });

  app.get('/oidc/reg/:clientId', (req: any, res: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Invalid or missing registration access token' });
    }
    const client = oidcClients.get(req.params.clientId);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(client);
  });

  app.put('/oidc/reg/:clientId', (req: any, res: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Invalid or missing registration access token' });
    }
    const client = oidcClients.get(req.params.clientId);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    Object.assign(client, req.body);
    res.json(client);
  });

  app.delete('/oidc/reg/:clientId', (req: any, res: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Invalid or missing registration access token' });
    }
    const client = oidcClients.get(req.params.clientId);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    oidcClients.delete(req.params.clientId);
    res.status(204).send();
  });

  // Version check
  app.get('/version/check', (_req: any, res: any) => {
    res.json({
      hasUpdate: false,
      currentVersion: '1.7.1',
      latestVersion: '1.7.1',
    });
  });

  // OIDC endpoints
  app.get('/.well-known/openid-configuration', (req: any, res: any) => {
    res.json({
      issuer: `http://localhost:${port}`,
      authorization_endpoint: `http://localhost:${port}/mock-oidc/authorize`,
      token_endpoint: `http://localhost:${port}/mock-oidc/token`,
      jwks_uri: `http://localhost:${port}/mock-oidc/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
    });
  });

  let port: number;

  const oidcCodes = new Map<string, string>();

  app.post('/mock-oidc/token', (req: any, res: any) => {
    const { grant_type, code, code_verifier, refresh_token } = req.body;
    if (grant_type === 'authorization_code') {
      if (!code || !oidcCodes.has(code) || !code_verifier) {
        return res.status(400).json({ error: 'Invalid code or code_verifier' });
      }
      oidcCodes.delete(code);
      return res.json({
        access_token: 'mock-oidc-access-token-' + generateId(),
        refresh_token: 'mock-oidc-refresh-token-' + generateId(),
        id_token: 'mock-oidc-id-token-' + generateId(),
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'openid profile',
      });
    }
    if (grant_type === 'refresh_token') {
      return res.json({
        access_token: 'mock-oidc-access-token-' + generateId(),
        refresh_token: refresh_token,
        id_token: 'mock-oidc-id-token-' + generateId(),
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'openid profile',
      });
    }
    res.status(400).json({ error: 'Unsupported grant_type' });
  });

  app.get('/mock-oidc/authorize', (req: any, res: any) => {
    const code = generateId();
    const codeVerifier = req.query.code_challenge || 'mock-verifier';
    oidcCodes.set(code, codeVerifier as string);
    const redirectUri = req.query.redirect_uri;
    const state = req.query.state;
    const redirectUrl = `${redirectUri}?code=${code}&state=${state}`;
    res.redirect(redirectUrl);
  });

  return new Promise((resolve) => {
    server.listen(0, () => {
      port = (server.address() as AddressInfo).port;
      const waitForPong = (timeout = 3000): Promise<any> =>
        new Promise((resolve, reject) => {
          pongResolve = resolve;
          setTimeout(() => {
            if (pongResolve) {
              pongResolve = null;
              reject(new Error('Pong timeout'));
            }
          }, timeout);
        });

      resolve({
        server,
        io,
        port,
        url: `http://localhost:${port}`,
        users,
        documents,
        structures,
        types,
        sessions,
        oidcClients,
        registrationToken,
        reset,
        waitForPong,
      });
    });
  });
}

function canRead(session: any, doc: MockDocument): boolean {
  if (session.isAdmin) return true;
  if (doc.owner === session.userId) return true;
  if (doc.public) return true;
  return false;
}
