import Index from '../index.js';
import { Socket } from 'socket.io-client';
import packetJson from '../../package.json';
import {
  I_UserLogin,
  I_UserCreation,
  I_UserUpdate,
  I_DocumentEntry,
  I_DocumentQuery,
  I_StructureCreation,
  I_DataStructure,
  I_EventString,
  I_WsMessage
} from '../types.js';

// Mock socket.io-client
jest.mock('socket.io-client', () => {
  const mockSocket = {
    connect: jest.fn(),
    emit: jest.fn(),
    onAny: jest.fn(),
  };
  return {
    io: jest.fn(() => mockSocket),
    Socket: jest.requireActual('socket.io-client').Socket,
  };
});

// Mock fetch API
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.Mock;

describe('Index Class', () => {
  let index: Index;
  const baseUrl = 'http://example.com';

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    mockFetch.mockClear();

    // Create a new instance of Index for each test
    index = new Index(baseUrl);

    // Mock successful fetch response
    mockFetch.mockImplementation(() => 
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({}),
      })
    );
  });

  // Test constructor
  describe('constructor', () => {
    it('should initialize with the provided baseUrl', () => {
      expect(index.baseUrl).toBe(baseUrl);
    });

    it('should initialize socket with autoConnect: false by default', () => {
      expect(require('socket.io-client').io).toHaveBeenCalledWith(baseUrl, { autoConnect: false });
    });

    it('should connect socket and set up event handler when callback is provided', () => {
      const mockCallback = jest.fn();
      const indexWithCallback = new Index(baseUrl, mockCallback);

      expect(indexWithCallback.socket.connect).toHaveBeenCalled();
      expect(indexWithCallback.socket.onAny).toHaveBeenCalled();
    });
  });

  // Test utility methods
  describe('utility methods', () => {
    it('should set and get token correctly', () => {
      const token = 'test-token';
      index.setToken(token);
      expect(index.getToken()).toBe(token);
    });

    it('should return null when token is not set', () => {
      expect(index.getToken()).toBeNull();
    });

    it('should return the correct version', () => {
      // Mock package.json
      jest.mock('../../package.json', () => ({ version: '0.8.2' }), { virtual: true });

      // We need to re-create the index instance to pick up the mocked package.json
      const newIndex = new Index(baseUrl);
      expect(newIndex.getVersion()).toBe(packetJson.version);
    });
  });

  // Test user administration endpoints
  describe('user administration endpoints', () => {
    it('should login successfully and store token', async () => {
      const credentials: I_UserLogin = { name: 'testuser', password: 'password' };
      const mockResponse = { token: 'test-token', isAdmin: true };

      mockFetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(mockResponse),
        })
      );

      const result = await index.login(credentials);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/users/login`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(credentials),
        })
      );
      expect(result).toEqual(mockResponse);
      expect(index.getToken()).toBe('test-token');
    });

    it('should return null when login fails', async () => {
      const credentials: I_UserLogin = { name: 'testuser', password: 'wrong-password' };

      mockFetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({}),
        })
      );

      const result = await index.login(credentials);

      expect(result).toBeNull();
    });

    it('should list users', async () => {
      const mockUsers = [{ _id: '1', name: 'user1', password: 'pass1', department: 'dept1', group: 'group1', isAdmin: false }];

      mockFetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(mockUsers),
        })
      );

      const result = await index.listUsers();

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/users/list`,
        expect.objectContaining({
          method: 'GET',
        })
      );
      expect(result).toEqual(mockUsers);
    });

    it('should update a user', async () => {
      const userId = '1';
      const userData: I_UserUpdate = { name: 'updated-user', department: 'new-dept' };

      await index.updateUser(userId, userData);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/users/update/${userId}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(userData),
        })
      );
    });

    it('should create a user', async () => {
      const userData: I_UserCreation = {
        name: 'newuser',
        password: 'password',
        department: 'dept',
        group: 'group',
        isAdmin: false
      };
      const mockResponse = { _id: '2', username: 'newuser', department: 'dept', group: 'group' };

      mockFetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(mockResponse),
        })
      );

      const result = await index.createUser(userData);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/users/create`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(userData),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should remove a user', async () => {
      const userId = '1';

      await index.removeUser(userId);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/users/remove/${userId}`,
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  // Test document management endpoints
  describe('document management endpoints', () => {
    it('should create a document', async () => {
      const document: I_DocumentEntry = {
        _id: '1',
        title: 'Test Document',
        type: 1,
        subType: 2,
        content: { data: 'test content' },
        owner: 'user1'
      };

      mockFetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(document),
        })
      );

      const result = await index.createDocument(document);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/docs/create`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(document),
        })
      );
      expect(result).toEqual(document);
    });

    it('should list documents', async () => {
      const mockDocuments = [
        { _id: '1', title: 'Doc1', type: 1, subType: 1, content: {}, owner: 'user1' },
        { _id: '2', title: 'Doc2', type: 2, subType: 2, content: {}, owner: 'user2' }
      ];

      mockFetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(mockDocuments),
        })
      );

      const result = await index.listDocuments();

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/docs/list`,
        expect.objectContaining({
          method: 'GET',
        })
      );
      expect(result).toEqual(mockDocuments);
    });

    it('should fetch documents based on query', async () => {
      const query: I_DocumentQuery = { type: 1, owner: 'user1' };
      const mockDocuments = [
        { _id: '1', title: 'Doc1', type: 1, subType: 1, content: {}, owner: 'user1' }
      ];

      mockFetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(mockDocuments),
        })
      );

      const result = await index.fetchDocument(query);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/docs/fetch/`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(query),
        })
      );
      expect(result).toEqual(mockDocuments);
    });

    it('should update a document', async () => {
      const documentId = '1';
      const documentData: I_DocumentEntry = {
        _id: '1',
        title: 'Updated Document',
        type: 1,
        subType: 2,
        content: { data: 'updated content' },
        owner: 'user1'
      };

      await index.updateDocument(documentId, documentData);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/docs/update/${documentId}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(documentData),
        })
      );
    });

    it('should remove a document', async () => {
      const documentId = '1';

      await index.removeDocument(documentId);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/docs/remove/${documentId}`,
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  // Test data structure endpoints
  describe('data structure endpoints', () => {
    it('should create a structure', async () => {
      const structure: I_StructureCreation = {
        name: 'Test Structure',
        description: 'Test Description',
        fields: [{ name: 'field1', type: 'string' }]
      };
      const mockResponse: I_DataStructure = {
        _id: '1',
        name: 'Test Structure',
        description: 'Test Description',
        fields: [{ name: 'field1', type: 'string' }]
      };

      mockFetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(mockResponse),
        })
      );

      const result = await index.createStructure(structure);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/structures/create`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(structure),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should get structures', async () => {
      const mockStructures = [
        { _id: '1', name: 'Structure1', description: 'Desc1', fields: [] },
        { _id: '2', name: 'Structure2', description: 'Desc2', fields: [] }
      ];

      mockFetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(mockStructures),
        })
      );

      const result = await index.getStructures();

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/structures/list`,
        expect.objectContaining({
          method: 'GET',
        })
      );
      expect(result).toEqual(mockStructures);
    });

    it('should update a structure', async () => {
      const structureId = '1';
      const structureData: I_DataStructure = {
        name: 'Updated Structure',
        description: 'Updated Description',
        fields: [{ name: 'updatedField', type: 'number' }]
      };

      await index.updateStructure(structureId, structureData);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/structures/update/${structureId}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(structureData),
        })
      );
    });

    it('should remove a structure', async () => {
      const structureId = '1';

      await index.removeStructure(structureId);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/structures/remove/${structureId}`,
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  // Test error handling
  describe('error handling', () => {
    it('should throw an error when API request fails', async () => {
      mockFetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
      );

      await expect(index.listUsers()).rejects.toThrow('API error: 500 Internal Server Error');
    });

    it('should clear token when receiving 401 or 403 status', async () => {
      // Set a token first
      index.setToken('test-token');

      // Mock 401 response
      mockFetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
        })
      );

      await expect(index.listUsers()).rejects.toThrow('API error: 401 Unauthorized');
      expect(index.getToken()).toBeNull();
    });
  });

  // Test WebSocket functionality
  describe('WebSocket functionality', () => {
    it('should connect socket when callback is provided', () => {
      const mockCallback = jest.fn();
      const indexWithCallback = new Index(baseUrl, mockCallback);

      // Verify that connect was called
      expect(indexWithCallback.socket.connect).toHaveBeenCalled();
    });

    it('should set up event handler when callback is provided', () => {
      const mockCallback = jest.fn();
      const indexWithCallback = new Index(baseUrl, mockCallback);

      // Verify that onAny was called
      expect(indexWithCallback.socket.onAny).toHaveBeenCalled();
    });

    // Note: Testing the actual callback behavior would require more complex mocking
    // that's beyond the scope of this basic test suite. In a real-world scenario,
    // we would use a more sophisticated approach to test the WebSocket event handling.
  });
});
