import type {
    I_UserEntry,
    I_UserLogin,
    I_UserCreation,
    I_UserUpdate,
    I_UserDisplay,
    I_DocumentEntry,
    I_DataStructure,
    I_LoginResponse, I_DocumentQuery, I_StructureCreation, I_WsMessage, I_EventString
} from "./types.js";
import {io, Socket} from "socket.io-client";
import packetJson from '../package.json'

export default class dbPouchClient {
    baseUrl: string;
    private authToken: string | null = null;
    socket: Socket;
    callbackFunction;
    realTimeSync: boolean = false;

    constructor(host: string, port: number, callback?: (event: I_EventString, data: I_WsMessage) => void) {
        this.baseUrl = host;
        this.socket = io(host + ':' + port, {
            autoConnect: false,
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            path: '/socket.io'
        });

        // Set the callback function
        this.callbackFunction = callback;
    }

    setRealTimeSync = (realTimeSync: boolean) => {
        if (this.authToken) {
            this.realTimeSync = realTimeSync;
            if (realTimeSync)
                this.initWebSocket();
            else
                this.socket.disconnect();
        }
    }

    private initWebSocket() {
        // Disconnect if already connected
        if (this.socket.connected) {
            this.socket.disconnect();
        }

        // Create new socket with auth
        this.socket = io(this.baseUrl, {
            autoConnect: true,
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            auth: {
                token: this.authToken
            },
            path: '/socket.io'
        });

        // Set up event handlers
        this.socket.onAny((event: I_EventString, data: I_WsMessage) => {
            if (event === "heartbeatPing") {
                console.log("Ping event received:", data);
                this.socket.emit("heartbeatPong", Date.now());
            }
            else if (this.callbackFunction){
                this.callbackFunction(event, data);
            }
        });

        // Handle connection errors
        this.socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error.message);

            // If the error is authentication-related, we might want to handle it specially
            if (error.message.includes('Authentication error')) {
                console.warn('Socket authentication failed. Token may be invalid.');
            }
        });

        // Confirm when connected
        this.socket.on('connect', () => {
            console.log('Socket connected successfully with authentication');
        });
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

        const response = await fetch(`${this.baseUrl}${endpoint}`, options);

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                this.authToken = null;
            }
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        return await response.json() as T;
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

    setToken(token: string | null): void {
        this.authToken = token;

        // If realtime sync is enabled, reinitialize the socket with the new token
        if (this.realTimeSync && token) {
            this.initWebSocket();
        } else if (this.socket.connected) {
            this.socket.disconnect();
        }
    }

    getToken() {
        return this.authToken;
    }

    getVersion() {
        return packetJson.version;
    }

    // Websocket Endpoints
    async subscribe(): Promise<void> {
        if (this.socket.connected) {
            this.socket.emit("subscribe");
        } else if (this.authToken) {
            // If not connected but we have a token, connect first
            this.initWebSocket();
            // Wait for connection before subscribing
            this.socket.once('connect', () => {
                this.socket.emit("subscribe");
            });
        }
    }

    async unsubscribe(): Promise<void> {
        if (this.socket.connected) {
            this.socket.emit("unsubscribe");
        }
    }
}

module.exports = dbPouchClient;