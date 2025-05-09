// Common type definitions for both frontend and backend

// User related types
export interface I_UserEntry extends I_UserCreation{
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
    isAdmin: boolean;
}

export interface I_UserUpdate {
    name?: string;
    password?: string;
    email?: string;
    isAdmin?: boolean;
}

export interface I_UserDisplay {
    _id: string;
    username: string;
    email?: string;
}

export interface I_LoginResponse {
    token: string;
    isAdmin: boolean;
}

// Document related types
export interface I_DocumentEntry extends I_DocumentCreationOwned{
    _id: string;
}

export interface I_DocumentCreation {
    title: string;
    description?: string;
    type: number;
    subType: number;
    content: any;
}

export interface I_DocumentCreationOwned extends I_DocumentCreation {
    owner: string;
}

// Structure related types
export interface I_DataStructure {
    _id?: string | undefined;
    name: string;
    description: string;
    reference?: any;
    fields: any[];
}

export interface I_StructureEntry {
    _id?: string;
    name: string;
    description: string;
    reference?: any;
    fields: any[];
}

export interface I_StructureCreation {
    name: string;
    description?: string;
    reference?: any;
    fields: any[];
}