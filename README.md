# docpouch-client

A TypeScript client library for interacting with the [docPouch](https://github.com/BFH-JTF/doc-pouch) database API.
Supports JWT and OIDC (OpenID Connect) authentication.

## Table of Contents

- [Description](#description)
- [Installation](#installation)
- [Usage](#usage)
    - [Initializing the Client](#initializing-the-client)
    - [JWT Authentication](#jwt-authentication)
    - [OIDC Authentication](#oidc-authentication)
    - [OIDC Dynamic Client Registration](#oidc-dynamic-client-registration)
  - [Session Management & Auth State](#session-management--auth-state)
  - [Event-Driven Logout](#event-driven-logout)
  - [Convenience OIDC Methods](#convenience-oidc-methods)
    - [User Management](#user-management)
    - [Document Management](#document-management)
    - [Data Structure Management](#data-structure-management)
    - [Structure Access Control](#structure-access-control)
    - [Real-Time Synchronization](#real-time-synchronization)
- [Error Handling](#error-handling)
- [API Reference](#api-reference)
- [Types](#types)
- [License](#license)

## Description

docpouch-client provides a simple and intuitive interface to access the docPouch API, allowing you to manage users,
documents, and data structures. It supports real-time synchronization via WebSockets and two authentication
methods: traditional JWT (username/password) and OpenID Connect (OIDC).

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

### JWT Authentication

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

// Check authentication state
console.log(client.isAuthenticated());   // boolean
console.log(client.getAuthMethod());     // 'jwt' | 'oidc' | 'none'
console.log(client.getToken());          // string | null
```

### OIDC Authentication

```typescript
// Initiate OIDC login (redirects the browser to the identity provider)
await client.loginWithOidc({
    issuer: 'https://your-oidc-provider.com',
    clientId: 'your-client-id',
    redirectUri: 'https://yourapp.com/callback',
    scopes: ['openid', 'profile', 'email']
});

// Set OIDC config after a page reload (before handling the callback)
client.setOidcConfig({
    issuer: 'https://your-oidc-provider.com',
    clientId: 'your-client-id',
    redirectUri: 'https://yourapp.com/callback'
});

// Handle the OIDC callback on your redirect page
const handled = await client.handleOidcCallback();
if (handled) {
    console.log('OIDC login successful');
}

// The access token is automatically refreshed when needed
const validToken = await client.ensureValidOidcToken();

// Log out (for OIDC, redirects to the end-session endpoint)
await client.logout();

// Log out with custom redirect URI and ID token hint
await client.logout({
    redirectUri: 'https://yourapp.com/logged-out',
    idTokenHint: 'id-token-from-login'
});

// Explicit OIDC logout (throws if not authenticated via OIDC)
await client.logoutOidc({
    redirectUri: 'https://yourapp.com/logged-out'
});

// Client-side-only JWT logout (throws if not authenticated via JWT)
await client.logoutJwt();
```

### OIDC Dynamic Client Registration

```typescript
// Register a new OIDC client
const registered = await client.registerOidcClient({
    client_name: 'My Application',
    redirect_uris: ['https://yourapp.com/callback'],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_basic'
});
console.log(registered.client_id);

// Retrieve an existing client registration
const clientInfo = await client.getOidcClient('client-id');

// Update a client registration
await client.updateOidcClient('client-id', {
    client_name: 'Updated Application Name'
});

// Delete a client registration
await client.deleteOidcClient('client-id');
```

### Session Management & Auth State

```typescript
// On page load, restore the authentication state automatically.
// This is the recommended entry point for applications:
const authState = await client.initAuth();
// authState: { method: 'jwt' | 'oidc' | 'none', token: string | null, isAdmin: boolean, userName: string }

if (authState.method === 'none') {
    // No active session — show login page
} else {
    // Session restored — proceed with authenticated UI
    console.log(`Authenticated via ${authState.method}`);
}

// Manually persist the current auth method to localStorage
client.persistAuthMethod('oidc');

// Clear all local auth state without redirecting to an OIDC end-session endpoint
client.clearAuth();

// Check whether the user just returned from an OIDC logout redirect
if (client.wasJustLoggedOut()) {
    console.log('User logged out via OIDC provider');
}

// Manually restore an OIDC session from localStorage
const restored = client.restoreOidcSession();
```

### Event-Driven Logout

```typescript
// Listen for any logout event (JWT or OIDC)
client.onLogout(() => {
    console.log('User logged out');
    // Redirect to login page, update UI, etc.
});

// Listen specifically for OIDC logout
client.onOidcLogout(() => {
    console.log('OIDC session ended');
});

// Listen specifically for JWT logout
client.onJwtLogout(() => {
    console.log('JWT session ended');
});
```

### Convenience OIDC Methods

```typescript
// Fetch the OIDC client config from the server
const config = await client.fetchOidcClientConfig();
if (config) {
    console.log(`OIDC available at ${config.issuer}`);
}

// Fetch the currently authenticated user's profile
const user = await client.getCurrentUser();
if (user) {
    console.log(`Hello, ${user.name}`);
}

// Ensure an OIDC client is registered (auto-registers if needed)
const clientId = await client.ensureOidcClient(
    'https://yourapp.com/callback',
    undefined,  // optional registration token
    { clientName: 'My App', postLogoutRedirectUri: 'https://yourapp.com/' }
);

// One-call OIDC login: fetches config (or registers client) and redirects
await client.startOidcLogin('optional-registration-token');

// Derive the OIDC issuer from the client's baseUrl
const issuer = client.getOidcIssuer();

// Get the post-logout redirect URI stored in localStorage
const uri = client.getPostLogoutRedirectUri();
```

### User Management

```typescript
// List all users (each entry includes the effective `role`)
const users = await client.listUsers();

// Create a new user
const newUser = await client.createUser({
    name: 'newuser',
    password: 'password',
    department: 'IT',
    group: 'Developers',
    isAdmin: false,
    role: 'manager'      // optional, server defaults to 'member'
});

// Update a user (role changes require super-admin privileges)
await client.updateUser('user-id', {
    department: 'Engineering',
    group: 'Frontend',
    role: 'admin'
});

// Remove a user
await client.removeUser('user-id');
```

### Document Management

```typescript
// Create a new document
const newDocument = await client.createDocument({
    _id: 'document-id',
    owner: 'user-id',
    title: 'Mission Statement',
    type: 17,
    subType: 11,
    content: '{"msg": "We strive for a world that..."}',
    shareWithGroup: false,
    shareWithDepartment: false,
    public: false
});

// Create an anonymous document
const anonymousDocument = await client.createDocument({
    title: 'Anonymous Feedback',
    type: 17,
    subType: 11,
    content: '{"msg": "This is anonymous feedback"}',
    shareWithGroup: false,
    shareWithDepartment: false,
    public: false,
    anonymous: true  // Document will be owned by admin user
});
```

### Data Structure Management

```typescript
// Create a new data structure (type and subType are required by the server)
const newStructure = await client.createStructure({
    name: "Data resulting from Vision-Mission-Value-Canvas",
    type: 17,
    subType: 11,
    fields: [
        {
            name: "mission_value_statement",
            displayName: "Mission value statement",
            type: "string"
        },
    ]
});

// Update a data structure
await client.updateStructure('structure-id', {
    _id: 'structure-id',
    name: 'Updated Structure Title',
    description: 'Updated structure description',
    type: 17,
    subType: 11,
    fields: [
        {name: 'new_field', displayName: 'New Field Name', type: 'number'}
    ]
});

// Delete a data structure
await client.removeStructure('structure-id');

// List all data structures
const structures = await client.getStructures();
```

### Structure Access Control

Structures can be allowlisted for anonymous document creation and protected by a minimum role:

```typescript
// Allow anonymous documents of a structure type (admin privileges, idempotent)
const entry = await client.setAnonymousAllowed(17, 11);

// List all anonymous allowlist entries (any user)
const anonymous = await client.listAnonymousStructures();

// Remove an allowlist entry (admin privileges)
await client.removeAnonymousAllowed(17, 11);

// Protect a structure with a minimum role (super-admin privileges, idempotent)
const rule = await client.setProtectedStructure(17, 11, 'manager');

// List all protection rules (any user)
const rules = await client.listProtectedStructures();

// Remove a protection rule (super-admin privileges)
await client.removeProtectedStructure(17, 11);
```

A user's effective role is `isAdmin ? 'superadmin' : (role ?? 'member')`. The
optional `role` field is stored on users and can be set via `createUser` and
`updateUser` (super-admin only). Creating, changing or removing a document of
a protected structure — as owner or via shared access — requires an effective
role of at least the structure's `minRole`. See [Error Handling](#error-handling)
for the related error codes.

### Real-Time Synchronization

```typescript
// Enable real-time sync (WebSocket connection is established automatically)
client.setRealTimeSync(true);

// Disable real-time sync
client.setRealTimeSync(false);

// Debug the socket connection state
client.debugSocketConnection();

// Get the client library version
console.log(client.getVersion());
```

## Error Handling

All API methods throw exceptions on failure. Use try/catch to handle errors:

```typescript
try {
    const documents = await client.listDocuments();
} catch (error) {
    if (error instanceof Error) {
        console.error(`API error: ${error.message}`);
        // error.message will be something like "API error: 401 Unauthorized"
    }
}
```

Authentication failures (HTTP 401) automatically clear the stored JWT token.
HTTP 403 (insufficient role, e.g. `ROLE_REQUIRED_FOR_STRUCTURE`) keeps the
token, since it is still valid.

### Server error codes

DocPouch returns structured error codes in the response body. The client
throws a plain `Error("API error: <status> <statusText>")`, so match on the
request endpoint and HTTP status to map back to the code:

| Code | HTTP | Endpoints | Meaning |
|---|---|---|---|
| `ANONYMOUS_NOT_ALLOWED_FOR_STRUCTURE` | 400 | `POST /docs/create` (with `anonymous: true`) | The structure (type/subType) is not allowlisted for anonymous document creation |
| `ROLE_REQUIRED_FOR_STRUCTURE` | 403 | `POST /docs/create`, `PATCH /docs/update/:id`, `DELETE /docs/remove/:id` | The user's effective role is below the protected structure's `minRole`; applies to owners and shared-access users alike |

In addition, the structure access control endpoints answer `401` when
privileges are insufficient (`POST/DELETE /structures/anonymous/set|remove`
require admin, `POST/DELETE /structures/protected/set|remove` and role changes
via `PATCH /users/update/:id` require super-admin).

## API Reference

### Client Class

#### Constructor

- `new docPouchClient(host: string, port?: number, callback?: (event: I_EventString, data: I_WsMessage) => void)`

#### Methods

**Authentication & Session**

- `login(credentials: I_UserLogin): Promise<I_LoginResponse | null>` — JWT login
- `setToken(token: string | null): void` — Set or clear the JWT token
- `getToken(): string | null` — Returns the active token (JWT or OIDC)
- `getAuthMethod(): 'jwt' | 'oidc' | 'none'` — Returns current auth method
- `isAuthenticated(): boolean` — Checks if the client is authenticated
- `logout(options?: LogoutOptions): Promise<void>` — Clears all tokens and disconnects WebSocket; for OIDC, redirects to
  the end-session endpoint
- `logoutOidc(options?: LogoutOptions): Promise<void>` — Explicit OIDC logout (redirects to /end_session)
- `logoutJwt(): Promise<void>` — Client-side-only JWT logout
- `getVersion(): string` — Returns the package version

**OIDC Authentication**

- `loginWithOidc(config: I_OidcConfig): Promise<void>` — Initiates OIDC authorization code flow (PKCE)
- `handleOidcCallback(): Promise<boolean>` — Handles the OIDC redirect callback
- `ensureValidOidcToken(): Promise<string>` — Returns a valid OIDC access token, refreshing if needed
- `setOidcConfig(config: I_OidcConfig): void` — Sets the OIDC configuration for callback handling (use after page
  reload)
- `fetchOidcClientConfig(): Promise<I_OidcClientConfig | null>` — Fetches OIDC client config from the server
-
`ensureOidcClient(redirectUri: string, registrationToken?: string, options?: { clientName?: string; postLogoutRedirectUri?: string }): Promise<string>` —
Auto-registers or updates an OIDC client
- `startOidcLogin(registrationToken?: string): Promise<void>` — Convenience method: fetches config and initiates OIDC
  login
- `getOidcIssuer(): string` — Derives the OIDC issuer URL from the client's baseUrl
- `getPostLogoutRedirectUri(): string | null` — Returns the stored post-logout redirect URI

**Session Management**

- `initAuth(): Promise<I_AuthState>` — Restores authentication state (JWT/OIDC) on page load; recommended entry point
- `clearAuth(): void` — Clears all local auth state without OIDC redirect
- `restoreOidcSession(): boolean` — Restores OIDC session from localStorage
- `wasJustLoggedOut(): boolean` — Checks if user just returned from an OIDC logout redirect
- `persistAuthMethod(method: 'jwt' | 'oidc'): void` — Persists auth method to localStorage
- `clearPersistedAuthState(): void` — Removes all docpouch localStorage keys

**Event-Driven Logout**

- `onLogout(callback: () => void): void` — Listen for any logout event
- `onOidcLogout(callback: () => void): void` — Listen for OIDC-specific logout
- `onJwtLogout(callback: () => void): void` — Listen for JWT-specific logout

**OIDC Dynamic Client Registration**

-
`registerOidcClient(registration: I_OidcClientRegistration, registrationToken?: string): Promise<I_OidcClientResponse>`
- `getOidcClient(clientId: string, registrationToken?: string): Promise<I_OidcClientResponse>`
-
`updateOidcClient(clientId: string, registration: I_OidcClientRegistration, registrationToken?: string): Promise<I_OidcClientResponse>`
- `deleteOidcClient(clientId: string, registrationToken?: string): Promise<void>`

**Real-Time Sync**
- `setRealTimeSync(newRealTimeSync: boolean): void`
- `debugSocketConnection(): void`

**User Management**
- `listUsers(): Promise<I_UserEntry[]>`
- `updateUser(userID: string, userData: I_UserUpdate): Promise<void>`
- `createUser(userData: I_UserCreation): Promise<I_UserDisplay>`
- `removeUser(userID: string): Promise<void>`

**Document Management**
- `createDocument(document: I_DocumentEntry): Promise<I_DocumentEntry>`
- `listDocuments(): Promise<I_DocumentEntry[]>`
- `fetchDocuments(queryObject: I_DocumentQuery): Promise<I_DocumentEntry[]>`
- `updateDocument(documentID: string, documentData: I_DocumentEntry): Promise<void>`
- `removeDocument(documentID: string): Promise<void>`

**Data Structure Management**
- `createStructure(structure: I_StructureCreation): Promise<I_DataStructure>`
- `getStructures(): Promise<I_DataStructure[]>`
- `updateStructure(structureID: string, structureData: I_DataStructure): Promise<void>`
- `removeStructure(structureID: string): Promise<void>`

**Structure Access Control**
- `listAnonymousStructures(): Promise<I_AnonymousStructureEntry[]>` — Lists all anonymous-document allowlist entries (any user)
- `setAnonymousAllowed(type: number, subType: number): Promise<I_AnonymousStructureEntry>` — Allowlists a structure for anonymous documents (admin, idempotent)
- `removeAnonymousAllowed(type: number, subType: number): Promise<{removed: number}>` — Removes an allowlist entry (admin)
- `listProtectedStructures(): Promise<I_ProtectedStructureEntry[]>` — Lists all protected structure rules (any user)
- `setProtectedStructure(type: number, subType: number, minRole: I_ProtectionRole): Promise<I_ProtectedStructureEntry>` — Creates/updates a protection rule (super-admin, idempotent)
- `removeProtectedStructure(type: number, subType: number): Promise<{removed: number}>` — Removes a protection rule (super-admin)

## Types

### I_Role

```typescript
'member' | 'manager' | 'admin' | 'superadmin'
```

### I_AssignableRole

```typescript
'member' | 'manager' | 'admin'   // stored on users; superadmin is expressed by isAdmin
```

### I_ProtectionRole

```typescript
'manager' | 'admin' | 'superadmin'   // minRole for protected structures
```

### I_UserEntry

```typescript
{
    _id: string;
    name: string;
    password: string;
    email?: string;
    department: string;
    group: string;
    isAdmin: boolean;
    role?: I_AssignableRole;  // effective role = isAdmin ? 'superadmin' : (role ?? 'member')
}
```

### I_UserLogin

```typescript
{
    name: string;
    password: string;
}
```

### I_UserDisplay

```typescript
{
    _id: string;
    username: string;
    department: string;
    group: string;
    email?: string;
    role?: I_AssignableRole;
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
    role?: I_AssignableRole;  // server defaults to 'member'
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
    role?: I_AssignableRole;  // super-admin only; server 401s otherwise (own account included)
}
```

### I_LoginResponse

```typescript
{
    _id: string;
    token?: string;
    isAdmin: boolean;
    userName: string;
    expiresIn?: number;
}
```

### I_OidcConfig

```typescript
{
    issuer: string;
    clientId: string;
    redirectUri: string;
    scope?: string;
    scopes?: string[];
    clientSecret?: string;
    postLogoutRedirectUri?: string;
}
```

### I_OidcClientConfig

Extends `I_OidcConfig` with:

```typescript
{
    ...I_OidcConfig;
    configured?: boolean;
    apiBaseUrl?: string;
}
```

### LogoutOptions

```typescript
{
    redirectUri?: string;     // Where to redirect after OIDC logout (default: app root)
    idTokenHint?: string;     // Optional ID token hint for logout confirmation
}
```

### I_OidcTokenResponse

```typescript
{
    accessToken: string;
    refreshToken?: string;
    idToken?: string;
    expiresIn: number;
    tokenType: string;
    scope: string;
}
```

### I_OidcUserInfo

```typescript
{
    sub: string;
    name?: string;
    email?: string;
}
```

### I_OidcClientRegistration

```typescript
{
    client_name: string;
    redirect_uris: string[];
    post_logout_redirect_uris?: string[];
    grant_types?: string[];
    response_types?: string[];
    scope?: string;
    token_endpoint_auth_method?: 'client_secret_basic' | 'client_secret_post' | 'none';
    application_type?: 'web' | 'native';
    logo_uri?: string;
    client_uri?: string;
    policy_uri?: string;
    tos_uri?: string;
}
```

### I_OidcClientResponse

```typescript
{
    client_id: string;
    client_secret?: string;
    client_secret_expires_at?: number;
    client_id_issued_at?: number;
    registration_access_token?: string;
    registration_client_uri?: string;
    client_name?: string;
    redirect_uris?: string[];
    post_logout_redirect_uris?: string[];
    grant_types?: string[];
    response_types?: string[];
    scope?: string;
    token_endpoint_auth_method?: string;
}
```

### I_AuthState

```typescript
{
    method: 'jwt' | 'oidc' | 'none';
    token: string | null;
    isAdmin: boolean;
    userName: string;
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
    public: boolean;
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
    public: boolean;
    anonymous?: boolean;  // If true, document will be owned by admin user
}
```

### I_DocumentCreationOwned

```typescript
{
    owner: string;
    title: string;
    description?: string;
    type: number;
    subType: number;
    content: any;
    shareWithGroup: boolean;
    shareWithDepartment: boolean;
    public: boolean;
    anonymous?: boolean;  // If true, document will be owned by admin user (owner field will be overridden)
}
```

### I_DocumentUpdate

```typescript
{
    _id?: string;
    owner?: string;
    title?: string;
    type?: number;
    subType?: number;
    shareWithGroup?: boolean;
    shareWithDepartment?: boolean;
    public?: boolean;
    content?: any;
    description?: string;
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
    public?: boolean;
}
```

### I_DataStructure

```typescript
{
    _id?: string;
    name: string;
    description: string;
    type: number;
    subType: number;
    fields: I_StructureField[];
}
```

### I_StructureCreation

```typescript
{
    name: string;
    description?: string;
    type: number;             // required by the server schema
    subType: number;          // required by the server schema
    fields: I_StructureField[];
}
```

### I_StructureUpdate

```typescript
{
    _id?: string;
    name?: string;
    description?: string;
    type: number;             // required (not optional — structureUpdateSchema has .required())
    subType: number;          // required (not optional — structureUpdateSchema has .required())
    fields?: I_StructureField[];
}
```

### I_StructureField

```typescript
{
    name: string;
    displayName: string;
    type: string;
    items?: string;
}
```

### I_AnonymousStructureEntry

```typescript
{
    _id?: string;
    type: number;
    subType: number;
}
```

### I_ProtectedStructureEntry

```typescript
{
    _id?: string;
    type: number;
    subType: number;
    minRole: I_ProtectionRole;  // lowest role that may create, change or remove documents of this structure
}
```

### I_EventString

```typescript
'heartbeatPong' | 'heartbeatPing' | 'newDocument' | 'newStructure' |
'newUser' | 'newType' | 'removedID' | 'changedDocument' |
'changedStructure' | 'changedUser' | 'changedType' | 'removedUser' |
'removedStructure' | 'removedDocument' | 'removedType'
```

### I_WsMessage

```typescript
{
    newDocument?: I_DocumentEntry;
    newStructure?: I_DataStructure;
    newUser?: I_UserEntry;
    removedID?: string;
    changedDocument?: I_DocumentUpdate;
    changedStructure?: I_StructureUpdate;
    changedUser?: I_UserUpdate;
    confirmSubscription?: boolean;
    confirmUnsubscription?: boolean;
    heartbeatPing?: number;
    heartbeatPong?: number;
}
```

## License

[MIT](LICENSE)
