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
    private oidcConfig: I_OidcConfig | null = null;
    private oidcAccessToken: string | null = null;
    private oidcRefreshToken: string | null = null;
    private oidcIdToken: string | null = null;
    private oidcTokenExpiry: number = 0;
    private codeVerifier: string | null = null;
    private oidcState: string | null = null;
    private authMethod: 'jwt' | 'oidc' | 'none' = 'none';
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

        if (newRealTimeSync && (this.authToken || this.oidcAccessToken)) {
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
    /**
     * Authenticates a user and stores the returned token for subsequent requests.
     *
     * @param {I_UserLogin} credentials - Username and password credentials.
     * @returns {Promise<I_LoginResponse | null>} Login payload when successful, otherwise null.
     */
    async login(credentials: I_UserLogin): Promise<I_LoginResponse | null> {
        const response = await this.request<I_LoginResponse>('/users/login', 'POST', credentials, false);
        if (response.token) {
            this.authToken = response.token;
            this.authMethod = 'jwt';

            // Reconnect websocket with new token if realtime sync is enabled
            if (this.realTimeSync) {
                this.initWebSocket();
            }

            return {
                _id: response._id,
                token: response.token,
                isAdmin: response.isAdmin,
                userName: response.userName,
                expiresIn: response.expiresIn
            };
        }
        return null;
    }

    /**
     * Retrieves all users visible to the authenticated user.
     *
     * @returns {Promise<I_UserEntry[]>} A list of user entries.
     */
    async listUsers(): Promise<I_UserEntry[]> {
        return await this.request<I_UserEntry[]>('/users/list', 'GET');
    }

    /**
     * Updates a user by ID.
     *
     * @param {string} userID - The ID of the user to update.
     * @param {I_UserUpdate} userData - Partial user fields to update.
     * @returns {Promise<void>}
     */
    async updateUser(userID: string, userData: I_UserUpdate): Promise<void> {
        await this.request<void>(`/users/update/${userID}`, 'PATCH', userData);
    }

    /**
     * Creates a new user.
     *
     * @param {I_UserCreation} userData - Data used to create the user.
     * @returns {Promise<I_UserDisplay>} The created user payload returned by the API.
     */
    async createUser(userData: I_UserCreation): Promise<I_UserDisplay> {
        return await this.request<I_UserDisplay>('/users/create', 'POST', userData);
    }

    /**
     * Removes a user by ID.
     *
     * @param {string} userID - The ID of the user to remove.
     * @returns {Promise<void>}
     */
    async removeUser(userID: string): Promise<void> {
        await this.request<void>(`/users/remove/${userID}`, 'DELETE');
    }

    // Document Management Endpoints
    /**
     * Creates a new document.
     *
     * @param {I_DocumentEntry} document - The document payload to create.
     * @returns {Promise<I_DocumentEntry>} The created document.
     */
    async createDocument(document: I_DocumentEntry): Promise<I_DocumentEntry> {
        return await this.request<I_DocumentEntry>('/docs/create', 'POST', document);
    }

    /**
     * Retrieves all documents visible to the authenticated user.
     *
     * @returns {Promise<I_DocumentEntry[]>} A list of document entries.
     */
    async listDocuments(): Promise<I_DocumentEntry[]> {
        return await this.request<I_DocumentEntry[]>('/docs/list', 'GET');
    }

    /**
     * Fetches documents matching a query object.
     *
     * @param {I_DocumentQuery} queryObject - Query fields used for filtering.
     * @returns {Promise<I_DocumentEntry[]>} Matching documents.
     */
    async fetchDocuments(queryObject: I_DocumentQuery): Promise<I_DocumentEntry[]> {
        return await this.request<I_DocumentEntry[]>(`/docs/fetch/`, 'POST', queryObject);
    }

    /**
     * Updates a document by ID.
     *
     * @param {string} documentID - The ID of the document to update.
     * @param {I_DocumentEntry} documentData - Updated document payload.
     * @returns {Promise<void>}
     */
    async updateDocument(documentID: string, documentData: I_DocumentEntry): Promise<void> {
        await this.request<void>(`/docs/update/${documentID}`, 'PATCH', documentData);
    }

    /**
     * Removes a document by ID.
     *
     * @param {string} documentID - The ID of the document to remove.
     * @returns {Promise<void>}
     */
    async removeDocument(documentID: string): Promise<void> {
        await this.request<void>(`/docs/remove/${documentID}`, 'DELETE');
    }

    // Data Structure Endpoints
    /**
     * Creates a new data structure.
     *
     * @param {I_StructureCreation} structure - Data structure payload to create.
     * @returns {Promise<I_DataStructure>} The created data structure.
     */
    async createStructure(structure: I_StructureCreation): Promise<I_DataStructure> {
        return await this.request<I_DataStructure>('/structures/create', 'POST', structure);
    }

    /**
     * Retrieves all data structures.
     *
     * @returns {Promise<I_DataStructure[]>} A list of data structures.
     */
    async getStructures(): Promise<I_DataStructure[]> {
        return await this.request<I_DataStructure[]>('/structures/list', 'GET');
    }

    /**
     * Updates a data structure by ID.
     *
     * @param {string} structureID - The ID of the structure to update.
     * @param {I_DataStructure} structureData - Updated structure payload.
     * @returns {Promise<void>}
     */
    async updateStructure(structureID: string, structureData: I_DataStructure): Promise<void> {
        await this.request<void>(`/structures/update/${structureID}`, 'PATCH', structureData);
    }

    /**
     * Removes a data structure by ID.
     *
     * @param {string} structureID - The ID of the structure to remove.
     * @returns {Promise<void>}
     */
    async removeStructure(structureID: string): Promise<void> {
        await this.request<void>(`/structures/remove/${structureID}`, 'DELETE');
    }

    // Data Type Endpoints
    /**
     * Creates or writes a document type.
     *
     * @param {I_DocumentType} type - The type payload.
     * @returns {Promise<I_DocumentType>} The created or updated type.
     */
    async createType(type: I_DocumentType): Promise<I_DocumentType> {
        return await this.request<I_DocumentType>('/types/write', 'POST', type);
    }

    /**
     * Removes a document type by ID.
     *
     * @param {string} typeID - The ID of the type to remove.
     * @returns {Promise<void>}
     */
    async removeType(typeID: string) {
        return await this.request<void>(`/types/remove/${typeID}`, 'DELETE');
    }

    /**
     * Retrieves all document types.
     *
     * @returns {Promise<I_DocumentType[]>} A list of document types.
     */
    async getTypes(): Promise<I_DocumentType[]> {
        return await this.request<I_DocumentType[]>('/types/list', 'GET');
    }

    /**
     * Updates a document type.
     *
     * @param {I_DocumentType} updatedType - The full type payload to persist.
     * @returns {Promise<void>}
     */
    async updateType(updatedType: I_DocumentType): Promise<void> {
        await this.request<void>(`/types/write`, 'POST', updatedType);
    }

    /**
     * Sets or clears the authentication token used for API and WebSocket auth.
     *
     * @param {string | null} token - Bearer token to use, or null to clear it.
     */
    setToken(token: string | null): void {
        console.log("Setting token to:", token ? "***token***" : "null");

        this.authMethod = token ? 'jwt' : 'none';
        const tokenChanged = this.authToken !== token;
        this.authToken = token;
        if (!token) this.clearOidcTokens();

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

    /**
     * Returns the package version of this client.
     *
     * @returns {string} The semantic version string.
     */
    getVersion() {
        return packetJson.version;
    }

    /**
     * Logs socket diagnostics and attempts a reconnect when possible.
     *
     * @returns {void}
     */
    debugSocketConnection(): void {
        console.log("Socket connection debug info:");
        console.log("- Connected:", this.socket.connected);
        console.log("- Socket ID:", this.socket.id);
        console.log("- Auth token present:", !!this.authToken, "(method:", this.authMethod + ")");
        console.log("- OIDC access token present:", !!this.oidcAccessToken);
        console.log("- Connection in progress:", this.connectionInProgress);
        console.log("- Realtime sync enabled:", this.realTimeSync);
        console.log("- Socket options:", this.socket.io.opts);

        const activeToken = this.authMethod === 'oidc' ? this.oidcAccessToken : this.authToken;
        // Try to force reconnection
        if (!this.socket.connected && activeToken && this.realTimeSync) {
            console.log("Attempting to force reconnection...");
            this.socket.auth = {token: activeToken};
            this.socket.connect();
        }
    }

    // OIDC Authentication Methods

    /**
     * Initiates the OIDC authentication flow by redirecting to the authorization endpoint.
     *
     * @param {I_OidcConfig} config - OIDC provider configuration.
     * @returns {Promise<void>}
     */
    async loginWithOidc(config: I_OidcConfig): Promise<void> {
        this.oidcConfig = config;
        const response = await fetch(`${config.issuer}/.well-known/openid-configuration`);
        const discovery = await response.json();

        this.codeVerifier = this.generateCodeVerifier();
        this.oidcState = this.generateState();
        const codeChallenge = await this.generateCodeChallenge(this.codeVerifier!);

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: config.scopes?.join(' ') || 'openid profile',
            state: this.oidcState!,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });

        window.location.href = `${discovery.authorization_endpoint}?${params.toString()}`;
    }

    /**
     * Handles the OIDC callback by exchanging the authorization code for tokens.
     *
     * @returns {Promise<boolean>} True if the callback was handled successfully.
     */
    async handleOidcCallback(): Promise<boolean> {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');

        if (error) throw new Error(`OAuth error: ${error}`);
        if (!code || !state) return false;
        if (state !== this.oidcState) throw new Error('State mismatch');

        const discovery = await this.discoverOidc();
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: this.oidcConfig!.redirectUri,
            client_id: this.oidcConfig!.clientId,
            code_verifier: this.codeVerifier || ''
        });

        const response = await fetch(discovery.token_endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: body.toString()
        });

        if (!response.ok) throw new Error('Token exchange failed');
        const tokens: I_OidcTokenResponse = await response.json();
        this.setOidcTokens(tokens);

        if (this.realTimeSync) this.initWebSocket();

        return true;
    }

    /**
     * Ensures the OIDC access token is valid, refreshing it if necessary.
     *
     * @returns {Promise<string>} A valid access token.
     */
    async ensureValidOidcToken(): Promise<string> {
        if (this.authMethod !== 'oidc' || !this.oidcAccessToken)
            throw new Error('Not authenticated via OIDC');

        if (Date.now() >= this.oidcTokenExpiry - 60000) {
            await this.refreshOidcToken();
        }
        return this.oidcAccessToken!;
    }

    /**
     * Returns the current authentication method.
     *
     * @returns {'jwt' | 'oidc' | 'none'} The active auth method.
     */
    getAuthMethod(): 'jwt' | 'oidc' | 'none' {
        return this.authMethod;
    }

    /**
     * Checks whether the client is currently authenticated.
     *
     * @returns {boolean} True if authenticated.
     */
    isAuthenticated(): boolean {
        return this.authMethod !== 'none' && (
            this.authMethod === 'jwt'
                ? !!this.authToken
                : (this.oidcAccessToken !== null && Date.now() < this.oidcTokenExpiry)
        );
    }

    /**
     * Returns the current active token, regardless of auth method.
     *
     * @returns {string | null} The active token or null.
     */
    getToken(): string | null {
        return this.authMethod === 'oidc' ? this.oidcAccessToken : this.authToken;
    }

    /**
     * Logs out the client, clearing all tokens and disconnecting WebSocket.
     *
     * @returns {Promise<void>}
     */
    async logout(): Promise<void> {
        this.authToken = null;
        this.clearOidcTokens();
        this.authMethod = 'none';
        if (this.socket.connected) this.socket.disconnect();
        if (typeof window !== 'undefined' && window.location &&
            (window.location.search.includes('code=') || window.location.search.includes('state='))) {
            window.history.replaceState({}, '', window.location.pathname);
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
        const token = this.authMethod === 'oidc' ? this.oidcAccessToken : this.authToken;
        console.log("initWebSocket called. Auth token present:", !!this.authToken,
            "Connection in progress:", this.connectionInProgress,
            "Socket connected:", this.socket.connected,
            "Auth method:", this.authMethod);

        if (!token) {
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
            this.socket.auth = {token};

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

    /**
     * Sends an HTTP request to the configured docPouch backend.
     *
     * @template T
     * @param {string} endpoint - Relative API endpoint (with or without leading slash).
     * @param {string} method - HTTP method.
     * @param {any} [body] - Optional JSON body.
     * @param {boolean} [requiresAuth=true] - Whether the Authorization header should be attached.
     * @returns {Promise<T>} Parsed JSON response body.
     * @private
     */
    private async request<T>(endpoint: string, method: string, body?: any, requiresAuth: boolean = true): Promise<T> {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };

        const authToken = this.authMethod === 'oidc'
            ? await this.ensureValidOidcToken().catch(() => null)
            : this.authToken;

        if (requiresAuth && authToken)
            headers['Authorization'] = `Bearer ${authToken}`;
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

    // OIDC Private Helpers

    private async discoverOidc(): Promise<any> {
        const response = await fetch(`${this.oidcConfig!.issuer}/.well-known/openid-configuration`);
        return response.json();
    }

    private setOidcTokens(tokens: I_OidcTokenResponse): void {
        this.authMethod = 'oidc';
        this.oidcAccessToken = tokens.accessToken;
        this.oidcRefreshToken = tokens.refreshToken || this.oidcRefreshToken;
        this.oidcIdToken = tokens.idToken || null;
        this.oidcTokenExpiry = Date.now() + (tokens.expiresIn * 1000);
    }

    private clearOidcTokens(): void {
        this.oidcAccessToken = null;
        this.oidcRefreshToken = null;
        this.oidcIdToken = null;
        this.oidcTokenExpiry = 0;
        this.codeVerifier = null;
        this.oidcState = null;
        if (this.authMethod === 'oidc') this.authMethod = 'none';
    }

    private async refreshOidcToken(): Promise<void> {
        if (!this.oidcRefreshToken) throw new Error('No refresh token available');
        const discovery = await this.discoverOidc();
        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: this.oidcRefreshToken,
            client_id: this.oidcConfig!.clientId
        });

        const response = await fetch(discovery.token_endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: body.toString()
        });

        if (!response.ok) {
            this.clearOidcTokens();
            throw new Error('Token refresh failed');
        }
        const tokens: I_OidcTokenResponse = await response.json();
        this.setOidcTokens(tokens);
    }

    private generateCodeVerifier(): string {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        const array = new Uint8Array(64);
        crypto.getRandomValues(array);
        return Array.from(array, byte => charset[byte % charset.length]).join('');
    }

    private async generateCodeChallenge(verifier: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    private generateState(): string {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }
}

// Common type definitions for both frontend and backend

// User related types
export interface I_UserEntry extends I_UserCreation {
    _id: string;
}

export interface I_UserLogin {
    name: string;
    password: string;
}

export interface I_UserCreation {
    name: string;
    password: string;
    email?: string;
    department: string;
    group: string;
    isAdmin: boolean;
}

export interface I_UserUpdate {
    _id?: string;
    name?: string;
    password?: string;
    email?: string;
    department?: string;
    group?: string;
    isAdmin?: boolean;
}

export interface I_UserDisplay {
    _id: string;
    username: string;
    department: string;
    group: string;
    email?: string;
}

export interface I_LoginResponse {
    _id: string;
    token?: string;
    isAdmin: boolean;
    userName: string;
    expiresIn?: number;
}

export interface I_OidcConfig {
    issuer: string;
    clientId: string;
    redirectUri: string;
    scopes?: string[];
    clientSecret?: string;
}

export interface I_OidcTokenResponse {
    accessToken: string;
    refreshToken?: string;
    idToken?: string;
    expiresIn: number;
    tokenType: string;
    scope: string;
}

export interface I_OidcUserInfo {
    sub: string;
    name?: string;
    email?: string;
}

export interface I_AuthState {
    method: 'jwt' | 'oidc' | 'none';
    token: string | null;
    isAdmin: boolean;
    userName: string;
}

// Document related types
export interface I_DocumentEntry extends I_DocumentCreationOwned {
    _id: string;
}

export interface I_DocumentCreation {
    title: string;
    description?: string;
    type: number;
    subType: number;
    content: any;
    shareWithGroup: boolean;
    shareWithDepartment: boolean;
    public: boolean;
}


export interface I_DocumentCreationOwned extends I_DocumentCreation {
    owner: string;
}

export interface I_DocumentUpdate extends I_DocumentQuery {
    content?: any;
    description?: string;
}

export interface I_DocumentQuery {
    _id?: string;
    owner?: string;
    title?: string;
    type?: number;
    subType?: number;
    shareWithGroup?: boolean;
    shareWithDepartment?: boolean;
    public?: boolean;
}


// Structure related types
export interface I_DataStructure {
    _id?: string | undefined;
    name: string;
    description: string;
    fields: I_StructureField[];
}

export interface I_StructureField {
    name: string;
    displayName: string; //should not contain spaces or non-ASCII characters
    type: string;
    items?: string;
}

export interface I_StructureEntry {
    _id?: string;
    name: string;
    description: string;
    fields: I_StructureField[];
}


export interface I_StructureCreation {
    name: string;
    description?: string;
    fields: I_StructureField[];
}

export interface I_StructureUpdate {
    _id?: string
    name?: string;
    description?: string;
    fields?: I_StructureField[];
}

// Document type related types
export interface I_DocumentType {
    _id?: string;
    type: number;
    subType: number;
    name: string;
    description?: string;
    defaultStructureID?: string;
}

// WebSocket-related types
export type I_EventString = 'heartbeatPong' | "heartbeatPing" | "newDocument" | "newStructure" |
    "newUser" | "newType" | "removedID" | "changedDocument" | "changedStructure" | "changedUser" | "changedType" |
    "removedUser" | "removedStructure" | "removedDocument" | "removedType";

export interface I_WsMessage {
    newDocument?: I_DocumentEntry;
    newStructure?: I_StructureEntry;
    newUser?: I_UserEntry;
    removedID?: string;
    changedDocument?: I_DocumentUpdate;
    changedStructure?: I_StructureUpdate;
    changedUser?: I_UserUpdate;
    confirmSubscription?: boolean;
    confirmUnsubscription?: boolean;
    heartbeatPing?: number;
    heartbeatPong?: number;
    newType?: I_DocumentType;
}
