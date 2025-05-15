import type {
    I_UserEntry,
    I_UserLogin,
    I_UserCreation,
    I_UserUpdate,
    I_UserDisplay,
    I_DocumentEntry,
    I_DataStructure,
    I_LoginResponse, I_DocumentQuery
} from "./types.js";

export default class Index {
    baseUrl: string;
    private token: string | null = null;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private async request<T>(endpoint: string, method: string, body?: any, requiresAuth: boolean = true): Promise<T> {
        const headers: HeadersInit = {
            'Content-Type': 'application/json'
        };

        if (requiresAuth && this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const options: RequestInit = {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        };

        const response = await fetch(`${this.baseUrl}${endpoint}`, options);

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                this.token = null;
            }
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        return await response.json() as T;
    }

    // User Administration Endpoints
    async login(credentials: I_UserLogin): Promise<I_LoginResponse | null> {
        const response = await this.request<I_LoginResponse>('/users/login', 'POST', credentials, false);
        if (response.token) {
            this.token = response.token;
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
        return await this.request<I_DocumentEntry[]>(`/docs/fetch/`, 'GET');
    }

    async updateDocument(documentID: string, documentData: I_DocumentEntry): Promise<void> {
        await this.request<void>(`/docs/update/${documentID}`, 'PATCH', documentData);
    }

    async removeDocument(documentID: string): Promise<void> {
        await this.request<void>(`/docs/remove/${documentID}`, 'DELETE');
    }

    // Data Structure Endpoints
    async createStructure(structure: I_DataStructure): Promise<I_DataStructure> {
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
        this.token = token;
    }

    getToken() {
        return this.token;
    }
}

module.exports = Index;