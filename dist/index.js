import { io } from "socket.io-client";
import packetJson from '../package.json';
export default class dbPouchClient {
    constructor(host, port, callback) {
        this.authToken = null;
        this.realTimeSync = false;
        this.setRealTimeSync = (realTimeSync) => {
            if (this.authToken) {
                this.realTimeSync = realTimeSync;
                if (realTimeSync)
                    this.initWebSocket();
                else
                    this.socket.disconnect();
            }
        };
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
    initWebSocket() {
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
        this.socket.onAny((event, data) => {
            if (event === "heartbeatPing") {
                console.log("Ping event received:", data);
                this.socket.emit("heartbeatPong", Date.now());
            }
            else if (this.callbackFunction) {
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
    async request(endpoint, method, body, requiresAuth = true) {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (requiresAuth && this.authToken)
            headers['Authorization'] = `Bearer ${this.authToken}`;
        if (this.socket.id)
            headers['X-Socket-ID'] = this.socket.id;
        const options = {
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
        return await response.json();
    }
    // User Administration Endpoints
    async login(credentials) {
        const response = await this.request('/users/login', 'POST', credentials, false);
        if (response.token) {
            this.authToken = response.token;
            // Reconnect websocket with new token if realtime sync is enabled
            if (this.realTimeSync) {
                this.initWebSocket();
            }
            return { token: response.token, isAdmin: response.isAdmin };
        }
        return null;
    }
    async listUsers() {
        return await this.request('/users/list', 'GET');
    }
    async updateUser(userID, userData) {
        await this.request(`/users/update/${userID}`, 'PATCH', userData);
    }
    async createUser(userData) {
        return await this.request('/users/create', 'POST', userData);
    }
    async removeUser(userID) {
        await this.request(`/users/remove/${userID}`, 'DELETE');
    }
    // Document Management Endpoints
    async createDocument(document) {
        return await this.request('/docs/create', 'POST', document);
    }
    async listDocuments() {
        return await this.request('/docs/list', 'GET');
    }
    async fetchDocument(queryObject) {
        return await this.request(`/docs/fetch/`, 'POST', queryObject);
    }
    async updateDocument(documentID, documentData) {
        await this.request(`/docs/update/${documentID}`, 'PATCH', documentData);
    }
    async removeDocument(documentID) {
        await this.request(`/docs/remove/${documentID}`, 'DELETE');
    }
    // Data Structure Endpoints
    async createStructure(structure) {
        return await this.request('/structures/create', 'POST', structure);
    }
    async getStructures() {
        return await this.request('/structures/list', 'GET');
    }
    async updateStructure(structureID, structureData) {
        await this.request(`/structures/update/${structureID}`, 'PATCH', structureData);
    }
    async removeStructure(structureID) {
        await this.request(`/structures/remove/${structureID}`, 'DELETE');
    }
    setToken(token) {
        this.authToken = token;
        // If realtime sync is enabled, reinitialize the socket with the new token
        if (this.realTimeSync && token) {
            this.initWebSocket();
        }
        else if (this.socket.connected) {
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
    async subscribe() {
        if (this.socket.connected) {
            this.socket.emit("subscribe");
        }
        else if (this.authToken) {
            // If not connected but we have a token, connect first
            this.initWebSocket();
            // Wait for connection before subscribing
            this.socket.once('connect', () => {
                this.socket.emit("subscribe");
            });
        }
    }
    async unsubscribe() {
        if (this.socket.connected) {
            this.socket.emit("unsubscribe");
        }
    }
}
module.exports = dbPouchClient;
