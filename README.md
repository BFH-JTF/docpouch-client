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
await client.deleteDocument('document-id');

// Fetch documents by query
const documents = await client.fetchDocuments([
    {type: 17, subType: 11}
]);
```

### Data Structure Management

```typescript
// Create a new data structure
const newStructure = await client.createDataStructure({
    title: "Data resulting from Vision-Mission-Value-Canvas",
    fields: [
        {
            name: "Mission value statement",
            type: "string"
        },
        // Add more fields as needed
    ]
});

// Update a data structure
await client.updateDataStructure('structure-id', {
    title: 'Updated Structure Title',
    fields: [
        {name: 'New Field Name', type: 'number'}
    ]
});

// Delete a data structure
await client.deleteDataStructure('structure-id');

// List all data structures
const structures = await client.listDataStructures();
```

### Document Type Management

```typescript
// List all document types
const docTypes = await client.listDocumentTypes();

// Create or update a document type
const newDocType = await client.createOrUpdateDocumentType({
    name: "HR Wages",
    description: "HR Wage information Document listing wages per personnel ID",
    type: 14,
    subType: 2,
    defaultStructureID: 'structure-id'
});

// Delete a document type
await client.deleteDocumentType('doc-type-id');
```

## API Reference

### Client Class

#### Constructor

- `new docPouchClient(baseUrl: string, port: number, callback?: (event: string, data: any) => void)`

#### Methods

- `login(credentials: { name: string, password: string }): Promise<{ token: string } | null>`
- `setToken(token: string): void`
- `listUsers(): Promise<UserDisplay[]>`
- `createUser(userData: UserCreation): Promise<UserDisplay>`
- `updateUser(id: string, userData: UserUpdate): Promise<void>`
- `removeUser(id: string): Promise<void>`
- `createDocument(docData: NewDocument): Promise<Document>`
- `updateDocument(id: string, docData: Partial<Document>): Promise<void>`
- `deleteDocument(id: string): Promise<void>`
- `fetchDocuments(query: DocumentQuery[]): Promise<Document[]>`
- `createDataStructure(structureData: DataStructureCreation): Promise<DataStructure>`
- `updateDataStructure(id: string, structureData: Partial<DataStructure>): Promise<void>`
- `deleteDataStructure(id: string): Promise<void>`
- `listDataStructures(): Promise<DataStructure[]>`
- `listDocumentTypes(): Promise<DocumentTypeEdit[]>`
- `createOrUpdateDocumentType(typeData: DocumentTypeEdit): Promise<void>`
- `deleteDocumentType(id: string): Promise<void>`

## Types

### UserDisplay

```typescript
{
    _id: number;
    name: string;
    email ? : string;
    department: string;
    group: string;
}
```

### UserCreation

```typescript
{
    name: string;
    password: string;
    email ? : string;
    department: string;
    group: string;
    isAdmin: boolean;
}
```

### UserUpdate

```typescript
{
    name ? : string;
    password ? : string;
    email ? : string;
    isAdmin ? : boolean;
    department ? : string;
    group ? : string;
}
```

### Document

```typescript
{
    _id: string;
    type: number;
    subType: number;
    title: string;
    content: string;
    shareWithGroup: boolean;
    shareWithDepartment: boolean;
}
```

### NewDocument

```typescript
{
    type: number;
    subType: number;
    title: string;
    content: string;
    shareWithGroup: boolean;
    shareWithDepartment: boolean;
}
```

### DocumentQuery

```typescript
{
    _id ? : string;
    type ? : number;
    subType ? : number;
    title ? : string;
    description ? : string;
    shareWithGroup ? : boolean;
    shareWithDepartment ? : boolean;
}
```

### DataStructure

```typescript
{
    _id: number;
    title: string;
    fields: DataField[];
}
```

### DataStructureCreation

```typescript
{
    title: string;
    fields: DataField[];
}
```

### DataField

```typescript
{
    name: string;
    type: 'number' | 'string' | 'boolean' | 'array' | 'structure';
    items ? : string; // For array and structure types
}
```

### DocumentTypeEdit

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
