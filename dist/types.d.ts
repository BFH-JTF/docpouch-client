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
export interface I_DocumentEntry extends I_DocumentCreationOwned {
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
export interface I_DocumentUpdate extends I_DocumentQuery {
    _id: string;
    content?: any;
    description?: string;
}
export interface I_DocumentQuery {
    _id?: string;
    owner?: string;
    title?: string;
    type?: number;
    subType?: number;
}
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
export interface I_StructureUpdate {
    _id: string;
    name?: string;
    description?: string;
    reference?: any;
    fields?: any[];
}
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
    ping?: number;
    pong?: number;
}
