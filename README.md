# docpouch-client

A TypeScript client library for interacting with the [docPouch](https://github.com/BFH-JTF/doc-pouch) database API.

## Description

docpouch-client provides a simple and intuitive interface to access the docPouch API, allowing you to manage users,
documents, data structures, and document types. It also supports real-time synchronization via WebSockets.

## Installation

```bash
npm install docpouch-client
```

## Usage

### Initializing the Client

```typescript
import docPouchClient from 'docpouch-client';

// Initialize the client with the server URL
const client = new docPouchClient('https://your-docpouch-server.com', 80);

// Initialize with a callback for real-time updates
const client = new docPouchClient('https://your-docpouch-server.com', 80,
    (event, data) => {
        console.log(`Received event: ${event}`, data);
    }
);
```

### Authentication

```typescript
// Login to get an authentication token
const loginResponse = await client.login({
    name: 'username',
    password: 'password'
});

if (loginResponse) {
    console.log('Login successful!');
    console.log(`Token: ${loginResponse.token}`);
} else {
    console.log('Login failed');
}

// Set an existing token
client.setToken('your-auth-token');
```

### User Management

```typescript
// List all users
const users = await client.listUsers();

// Create a new user
const newUser = await client.createUser({
    name: 'newuser',
    password: 'password',
    department: 'IT',
    group: 'Developers',
    isAdmin: false
});

// Update a user
await client.updateUser('user-id', {
    department: 'Engineering',
    group: 'Frontend'
});

// Remove a user
await client.removeUser('user-id');
```

### Document Management

```typescript
// Create a new document
const newDocument = await client.createDocument({
    type: 17,
    subType: 11,
    title: "Mission Statement",
    content: "{\"msg\": \"We strive for a world that...\"}",
    shareWithGroup: false,
    shareWithDepartment: false
});

// Update a document
await client.updateDocument('document-id', {
    title: 'Updated Mission Statement',
    content: '{"msg": "Our updated mission..."}'
});

// Delete a document
await client.removeDocument('document-id');

// Fetch documents by query
const documents = await client.fetchDocuments([
    {type: 17, subType: 11}
]);
```

### Data Structure Management

```typescript
// Create a new data structure
const newStructure = await client.createStructure({
    name: "Data resulting from Vision-Mission-Value-Canvas",
    fields: [
        {
            name: "Mission value statement",
            type: "string"
        },
        // Add more fields as needed
    ]
});

// Update a data structure
await client.updateStructure('structure-id', {
    name: 'Updated Structure Title',
    fields: [
        {name: 'New Field Name', type: 'number'}
    ]
});

// Delete a data structure
await client.removeStructure('structure-id');

// List all data structures
const structures = await client.getStructures();
```

### Document Type Management

```typescript
// List all document types
const docTypes = await client.getTypes();

// Create a new document type
const newDocType = await client.createType({
    name: "HR Wages",
    description: "HR Wage information Document listing wages per personnel ID",
    type: 14,
    subType: 2,
    defaultStructureID: 'structure-id'
});

// Update a document type
await client.updateType({
    _id: 'doc-type-id',
    name: 'Updated HR Wages',
    type: 14,
    subType: 2
});

// Delete a document type
await client.removeType('doc-type-id');
```

## API Reference

### Client Class

#### Constructor

- `new docPouchClient(baseUrl: string, port: number, callback?: (event: string, data: any) => void)`

#### Methods

- `login(credentials: I_UserLogin): Promise<I_LoginResponse | null>`
- `setToken(token: string): void`
- `listUsers(): Promise<I_UserDisplay[]>`
- `createUser(userData: I_UserCreation): Promise<I_UserDisplay>`
- `updateUser(id: string, userData: I_UserUpdate): Promise<void>`
- `removeUser(id: string): Promise<void>`
- `createDocument(docData: I_DocumentCreation): Promise<I_DocumentEntry>`
- `updateDocument(id: string, docData: I_DocumentUpdate): Promise<void>`
- `removeDocument(id: string): Promise<void>`
- `listDocuments(): Promise<I_DocumentEntry[]>`
- `fetchDocuments(query: I_DocumentQuery[]): Promise<I_DocumentEntry[]>`
- `createStructure(structureData: I_StructureCreation): Promise<I_StructureEntry>`
- `updateStructure(id: string, structureData: I_StructureUpdate): Promise<void>`
- `removeStructure(id: string): Promise<void>`
- `getStructures(): Promise<I_StructureEntry[]>`
- `getTypes(): Promise<I_DocumentType[]>`
- `createType(typeData: I_DocumentType): Promise<void>`
- `updateType(typeData: I_DocumentType): Promise<void>`
- `removeType(id: string): Promise<void>`
- `setRealTimeSync(newRealTimeSync: boolean): void`
- `getVersion(): string`

## Types

### I_UserDisplay

```typescript
{
    _id: string;
    username: string;
    department: string;
    group: string;
    email?: string;
}
```

### I_UserCreation

```typescript
{
    name: string;
    password: string;
    email?: string;
    department: string;
    group: string;
    isAdmin: boolean;
}
```

### I_UserUpdate

```typescript
{
    _id?: string;
    name?: string;
    password?: string;
    email?: string;
    department?: string;
    group?: string;
    isAdmin?: boolean;
}
```

### I_DocumentEntry

```typescript
{
    _id: string;
    owner: string;
    title: string;
    description?: string;
    type: number;
    subType: number;
    content: any;
    shareWithGroup: boolean;
    shareWithDepartment: boolean;
}
```

### I_DocumentCreation

```typescript
{
    title: string;
    description?: string;
    type: number;
    subType: number;
    content: any;
    shareWithGroup: boolean;
    shareWithDepartment: boolean;
}
```

### I_DocumentQuery

```typescript
{
    _id?: string;
    owner?: string;
    title?: string;
    type?: number;
    subType?: number;
    shareWithGroup?: boolean;
    shareWithDepartment?: boolean;
}
```

### I_StructureEntry

```typescript
{
    _id?: string;
    name: string;
    description: string;
    fields: I_StructureField[];
}
```

### I_StructureCreation

```typescript
{
    name: string;
    description?: string;
    fields: I_StructureField[];
}
```

### I_StructureField

```typescript
{
    name: string;
    type: string;
    items?: string;
}
```

### I_DocumentType

```typescript
{
    _id ? : string;
    name: string;
    description ? : string;
    type: number;
    subType: number;
    defaultStructureID ? : string;
}
```
