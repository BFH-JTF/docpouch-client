import type { I_UserEntry, I_UserLogin, I_UserCreation, I_UserUpdate, I_UserDisplay, I_DocumentEntry, I_DataStructure, I_LoginResponse } from "./types.js";
export default class Index {
    baseUrl: string;
    private token;
    constructor(baseUrl: string);
    private request;
    login(credentials: I_UserLogin): Promise<I_LoginResponse | null>;
    listUsers(): Promise<I_UserEntry[]>;
    updateUser(userID: string, userData: I_UserUpdate): Promise<void>;
    createUser(userData: I_UserCreation): Promise<I_UserDisplay>;
    removeUser(userID: string): Promise<void>;
    createDocument(document: I_DocumentEntry): Promise<I_DocumentEntry>;
    listDocuments(): Promise<I_DocumentEntry[]>;
    fetchDocument(documentID: string): Promise<I_DocumentEntry>;
    updateDocument(documentID: string, documentData: I_DocumentEntry): Promise<void>;
    removeDocument(documentID: string): Promise<void>;
    createStructure(structure: I_DataStructure): Promise<I_DataStructure>;
    getStructures(): Promise<I_DataStructure[]>;
    updateStructure(structureID: string, structureData: I_DataStructure): Promise<void>;
    removeStructure(structureID: string): Promise<void>;
    setToken(token: string | null): void;
    getToken(): string | null;
}
