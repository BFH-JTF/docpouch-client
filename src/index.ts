import type {
    I_UserEntry,
    I_UserLogin,
    I_UserCreation,
    I_UserUpdate,
    I_UserDisplay,
    I_DocumentEntry,
    I_DataStructure,
  I_LoginResponse, I_DocumentQuery, I_StructureCreation, I_WsMessage, I_EventString, I_DocumentType
} from "./types.js";
import {io, Socket} from "socket.io-client";
import packetJson from '../package.json'

/**
 * Client for interacting with docPouch API.
 */
export default class docPouchClient {
  /**
   * The base URL of the server.
   *
   * @type {string}
   */
  baseUrl: string;
  /**
   * Socket.IO socket instance for real-time communication with the server.
   *
   * @type {Socket}
   */
  socket: Socket;
  /**
   * Callback function to handle socket events.
   *
   * @type {(event: I_EventString, data: I_WsMessage) => void}
   */
  callbackFunction;
  /**
   * Flag indicating whether real-time synchronization is enabled.
   *
   * @type {boolean}
   */
  realTimeSync: boolean = false;
  /**
   * Authentication token used to authorize requests.
   *
   * @private
   * @type {string | null}
   */
  private authToken: string | null = null;
  /**
   * Flag indicating whether a connection attempt is in progress.
   *
   * @private
   * @type {boolean}
   */
  private connectionInProgress = false;

  /**
   * Creates an instance of docPouchClient.
   *
   * @param {string} host - The base URL for the server.
   * @param {number} [port=80] - The port number to connect to (default is 80).
   * @param {(event: I_EventString, data: I_WsMessage) => void} [callback] - Optional callback function for socket events.
   */
  constructor(host: string, port: number = 80, callback?: (event: I_EventString, data: I_WsMessage) => void) {
    this.baseUrl = host;
    const socketUrl = host.includes('://') ? host : `https://${host}`;
    const socketUrlWithPort = socketUrl.includes(':') && !socketUrl.endsWith(':')
        ? socketUrl
        : `${socketUrl}:${port}`;

    console.log(`Initializing Socket.IO with URL: ${socketUrlWithPort}, path: /socket.io`);

    this.socket = io(`${socketUrlWithPort}`, {
      autoConnect: false,
      transports: ['websocket'],  // Try websocket only first
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      forceNew: true,  // Force a new connection
      auth: {
        token: null  // Will be set later
      },
      path: '/socket.io'
    });

    this.callbackFunction = callback;

    this.setupPermanentSocketListeners();
  }

  /**
   * Sets the real-time synchronization status.
   *
   * @param {boolean} newRealTimeSync - The new real-time sync setting (true/false).
   */
  setRealTimeSync(newRealTimeSync: boolean) {
    console.log(`Setting realtime sync to: ${newRealTimeSync}. Current setting: ${this.realTimeSync}`);

    // Skip if the setting isn't changing
    if (newRealTimeSync === this.realTimeSync) {
      console.log("Realtime sync setting unchanged, skipping");
      return;
    }

    this.realTimeSync = newRealTimeSync;

    if (newRealTimeSync && this.authToken) {
      console.log("Activating realtime updates");

      // Ensure we're not in the middle of another connection attempt
      if (this.connectionInProgress) {
        console.log("Connection already in progress, waiting before initializing");
        setTimeout(() => this.initWebSocket(), 500);
      } else {
        this.initWebSocket();
      }
    } else if (!newRealTimeSync) {
      console.log("Deactivating realtime updates");
      if (this.socket.connected) {
        console.log("Disconnecting socket");
        this.socket.disconnect();
      }
    }
  }

  // User Administration Endpoints
  async login(credentials: I_UserLogin): Promise<I_LoginResponse | null> {
    const response = await this.request<I_LoginResponse>('/users/login', 'POST', credentials, false);
    if (response.token) {
      this.authToken = response.token;

      // Reconnect websocket with new token if realtime sync is enabled
      if (this.realTimeSync) {
        this.initWebSocket();
      }

      return {token: response.token, isAdmin: response.isAdmin};
    }
    return null;
  }

  async listUsers(): Promise<I_UserEntry[]> {
    return await this.request<I_UserEntry[]>('/users/list', 'GET');
  }

  async updateUser(userID: string, userData: I_UserUpdate): Promise<void> {
    await this.request<void>(`/users/update/${userID}`, 'PATCH', userData);
  }

  async createUser(userData: I_UserCreation): Promise<I_UserDisplay> {
    return await this.request<I_UserDisplay>('/users/create', 'POST', userData);
  }

  async removeUser(userID: string): Promise<void> {
    await this.request<void>(`/users/remove/${userID}`, 'DELETE');
  }

  // Document Management Endpoints
  async createDocument(document: I_DocumentEntry): Promise<I_DocumentEntry> {
    return await this.request<I_DocumentEntry>('/docs/create', 'POST', document);
  }

  async listDocuments(): Promise<I_DocumentEntry[]> {
    return await this.request<I_DocumentEntry[]>('/docs/list', 'GET');
  }

  async fetchDocument(queryObject: I_DocumentQuery): Promise<I_DocumentEntry[]> {
    return await this.request<I_DocumentEntry[]>(`/docs/fetch/`, 'POST', queryObject);
  }

  async updateDocument(documentID: string, documentData: I_DocumentEntry): Promise<void> {
    await this.request<void>(`/docs/update/${documentID}`, 'PATCH', documentData);
  }

  async removeDocument(documentID: string): Promise<void> {
    await this.request<void>(`/docs/remove/${documentID}`, 'DELETE');
  }

  // Data Structure Endpoints
  async createStructure(structure: I_StructureCreation): Promise<I_DataStructure> {
    return await this.request<I_DataStructure>('/structures/create', 'POST', structure);
  }

  async getStructures(): Promise<I_DataStructure[]> {
    return await this.request<I_DataStructure[]>('/structures/list', 'GET');
  }

  async updateStructure(structureID: string, structureData: I_DataStructure): Promise<void> {
    await this.request<void>(`/structures/update/${structureID}`, 'PATCH', structureData);
  }

  async removeStructure(structureID: string): Promise<void> {
    await this.request<void>(`/structures/remove/${structureID}`, 'DELETE');
  }

  // Data Type Endpoints
  async createType(type: I_DocumentType): Promise<I_DocumentType> {
    return await this.request<I_DocumentType>('/types/write', 'PATCH', type);
  }

  async removeType(typeID: string) {
    return await this.request<void>(`/types/remove/${typeID}`, 'DELETE');
  }

  async getTypes(): Promise<I_DocumentType[]> {
    return await this.request<I_DocumentType[]>('/types/list', 'GET');
  }

  async updateType(updatedType: I_DocumentType): Promise<void> {
    await this.request<void>(`/types/write`, 'PATCH', updatedType);
  }

  setToken(token: string | null): void {
    console.log("Setting token to:", token ? "***token***" : "null");

    const tokenChanged = this.authToken !== token;
    this.authToken = token;

    if (!tokenChanged) {
      console.log("Token unchanged, no need to reconnect");
      return;
    }

    // If we have a new token and realtime sync is enabled
    if (token && this.realTimeSync) {
      console.log("New token set, will initialize WebSocket");

      // Ensure any existing connection is closed first
      if (this.socket.connected) {
        console.log("Disconnecting existing socket before reconnecting with new token");
        this.socket.disconnect();
      }

      // Wait a moment for the disconnect to complete
      setTimeout(() => {
        console.log("Initializing WebSocket with new token");
        this.initWebSocket();
      }, 300);
    }
    // If token was cleared or realtime sync is disabled
    else if (this.socket.connected) {
      console.log("Token cleared or realtime sync disabled, disconnecting");
      this.socket.disconnect();
    }
  }

  getVersion() {
    return packetJson.version;
  }

  debugSocketConnection(): void {
    console.log("Socket connection debug info:");
    console.log("- Connected:", this.socket.connected);
    console.log("- Socket ID:", this.socket.id);
    console.log("- Auth token present:", !!this.authToken);
    console.log("- Connection in progress:", this.connectionInProgress);
    console.log("- Realtime sync enabled:", this.realTimeSync);
    console.log("- Socket options:", this.socket.io.opts);

    // Try to force reconnection
    if (!this.socket.connected && this.authToken && this.realTimeSync) {
      console.log("Attempting to force reconnection...");
      this.socket.auth = {token: this.authToken};
      this.socket.connect();
    }
  }

  /**
   * Sets up permanent socket listeners for the client.
   *
   * @private
   */
  private setupPermanentSocketListeners() {
    // These are permanent listeners that won't be removed
    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      this.connectionInProgress = false;
    });

    this.socket.on('connect', () => {
      console.log('Socket connected successfully with ID:', this.socket.id);
      this.connectionInProgress = false;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected. Reason:', reason);
      this.connectionInProgress = false;
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.connectionInProgress = false;
    });
  }

  /**
   * Initializes the WebSocket connection with the server.
   *
   * @private
   */
  private initWebSocket() {
    console.log("initWebSocket called. Auth token present:", !!this.authToken,
        "Connection in progress:", this.connectionInProgress,
        "Socket connected:", this.socket.connected);

    if (!this.authToken) {
      console.log("Skipping WebSocket initialization: No auth token");
      return;
    }

    if (this.connectionInProgress) {
      console.log("Connection already in progress, skipping initialization");
      return;
    }

    if (this.socket.connected) {
      console.log("Socket already connected with ID:", this.socket.id);
      return;
    }

    this.connectionInProgress = true;

    try {
      console.log("Setting up WebSocket connection with token");

      // Update the auth token
      this.socket.auth = {token: this.authToken};

      // Remove any dynamic event listeners that might have been added
      this.socket.offAny();

      // Set up event handler for application events
      this.socket.onAny((event: I_EventString, data: I_WsMessage) => {
        if (event === "heartbeatPing") {
          console.log("Ping event received:", data);
          this.socket.emit("heartbeatPong", Date.now());
        } else if (this.callbackFunction) {
          this.callbackFunction(event, data);
        }
      });

      // Connect to the server
      console.log("Connecting socket with auth token");
      this.socket.connect();

      // Add a timeout to detect if connection is taking too long
      setTimeout(() => {
        if (this.connectionInProgress) {
          console.warn("Socket connection attempt timed out after 5 seconds");
          this.connectionInProgress = false;

          // If we're still not connected after the timeout, try again with polling
          if (!this.socket.connected) {
            console.log("Retrying connection with polling transport");
            this.socket.io.opts.transports = ['polling', 'websocket'];
            this.socket.connect();
          }
        }
      }, 5000);
    } catch (error) {
      console.error('Error in initWebSocket:', error);
      this.connectionInProgress = false;
    }
  }

  private async request<T>(endpoint: string, method: string, body?: any, requiresAuth: boolean = true): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (requiresAuth && this.authToken)
      headers['Authorization'] = `Bearer ${this.authToken}`;
    if (this.socket.id)
      headers['X-Socket-ID'] = this.socket.id;

    const options: RequestInit = {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    };

    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const normalizedBaseUrl = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const url = `${normalizedBaseUrl}${normalizedEndpoint}`;
    const response = await fetch(url, options);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this.authToken = null;
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as T;
  }

}