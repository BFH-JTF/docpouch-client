"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Index {
    constructor(baseUrl) {
        this.token = null;
        this.baseUrl = baseUrl;
    }
    async request(endpoint, method, body, requiresAuth = true) {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (requiresAuth && this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        const options = {
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
        return await response.json();
    }
    // User Administration Endpoints
    async login(credentials) {
        const response = await this.request('/users/login', 'POST', credentials, false);
        if (response.token) {
            this.token = response.token;
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
    async fetchDocument(documentID) {
        return await this.request(`/docs/fetch/${documentID}`, 'GET');
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
        this.token = token;
    }
    getToken() {
        return this.token;
    }
}
exports.default = Index;
module.exports = Index;
