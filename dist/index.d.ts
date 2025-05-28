import type { I_UserEntry, I_UserLogin, I_UserCreation, I_UserUpdate, I_UserDisplay, I_DocumentEntry, I_DataStructure, I_LoginResponse, I_DocumentQuery, I_StructureCreation, I_WsMessage, I_EventString } from "./types.js";
import { Socket } from "socket.io-client";
export default class Index {
    baseUrl: string;
    private token;
    socket: Socket;
    constructor(baseUrl: string, callback?: (event: I_EventString, data: I_WsMessage) => void);
    private request;
    login(credentials: I_UserLogin): Promise<I_LoginResponse | null>;
    listUsers(): Promise<I_UserEntry[]>;
    updateUser(userID: string, userData: I_UserUpdate): Promise<void>;
    createUser(userData: I_UserCreation): Promise<I_UserDisplay>;
    removeUser(userID: string): Promise<void>;
    createDocument(document: I_DocumentEntry): Promise<I_DocumentEntry>;
    listDocuments(): Promise<I_DocumentEntry[]>;
    fetchDocument(queryObject: I_DocumentQuery): Promise<I_DocumentEntry[]>;
    updateDocument(documentID: string, documentData: I_DocumentEntry): Promise<void>;
    removeDocument(documentID: string): Promise<void>;
    createStructure(structure: I_StructureCreation): Promise<I_DataStructure>;
    getStructures(): Promise<I_DataStructure[]>;
    updateStructure(structureID: string, structureData: I_DataStructure): Promise<void>;
    removeStructure(structureID: string): Promise<void>;
    setToken(token: string | null): void;
    getToken(): string | null;
    getVersion(): string;
}
