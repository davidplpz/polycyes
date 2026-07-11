# polycyes

> **Poly**cyes **i**s **y**our a**c**cess **e**xpression **s**ystem  
> (or simply "poly" + "yes" — because the permission says yes)

> **[Español](README.es.md)**

RBAC + ABAC authorization engine for TypeScript. Framework-agnostic, typed,
testable. No DSLs, no `.conf`, no `policy.csv`. Policies are written in TypeScript
— with autocompletion, type safety, and zero runtime dependencies.

```bash
npm install polycyes
```

## Quick Start

```ts
import { Engine, InMemoryPolicyStore, perm, role, user } from 'polycyes';

const store = new InMemoryPolicyStore();
const engine = new Engine(store);

// Define roles
await store.addRole(role('viewer', {
  permissions: [perm('post', 'read')],
}));

await store.addRole(role('editor', {
  permissions: [
    perm('post', 'create'),
    perm('post', 'edit', { scope: 'own' }),
    perm('post', 'delete', { effect: 'deny' }),
  ],
  inherits: ['viewer'],
}));

await store.setUserRoles('usr_1', ['editor']);

// Evaluate
const result = await engine.check({
  user: user('usr_1', { roles: ['editor'] }),
  resource: 'post',
  action: 'edit',
  resourceInstance: { id: 'post_42', ownerId: 'usr_1' },
});

console.log(result.allowed); // true
console.log(result.reason);  // "granted by role 'editor'"
```

## Features

- **RBAC** — roles, permissions, transitive inheritance with cycle detection
- **ABAC** — conditions as sync or async functions `(ctx) => boolean | Promise<boolean>`
- **Scopes** — `any`, `own`, `none` + custom scopes (`(ctx) => boolean`)
- **Wildcards** — `perm("*", "*")`, `perm("post", "*")`, `perm("*", "read")`
- **Deny rules** — `effect: 'deny'` with precedence over allow
- **Batch** — `engine.checkMany()` with per-user role caching
- **Filter** — `engine.filter()` for row-level security
- **Debug** — `engine.debug()` returns `DebugTrace` with per-step evaluation
- **Store cache** — `CachedPolicyStore` with configurable TTL, auto-invalidation, and concurrent request dedup
- **Engine cache** — per-user resolved roles cache with configurable TTL (1000ms default)
- **Decorators** — `LoggingPolicyStore`, `MetricsPolicyStore`, `FailOpenPolicyStore` (composable)
- **Incremental roles** — `addUserRole`/`removeUserRole` for granular role assignments
- **No N+1** — `resolveRoles()` discovers parent roles in batch, zero individual `getRole()` calls
- **Typed errors** — `ConditionEvaluationError`, `StoreUnavailableError`, `InvalidEngineOptionError`, etc.
- **Audit** — `auditRole()` detects god-mode wildcards without conditions
- **Context freeze** — immutable context prevents side effects in conditions
- **Timeout** — conditions use `Promise.race` with 1000ms default (0 = no timeout)
- **Tree-shakeable** — `"sideEffects": false` + subpath exports
- **Branded types** — `UserId`, `RoleName`, `ResourceName`, `ActionName`
- **Express adapter** — `polycyes/express` with `authz()` middleware
- **NestJS adapter** — `polycyes/nestjs` with `PolycyesModule`, `PolycyesGuard`, `@Permissions`

## ABAC Example

```ts
const tenantAdmin = role('tenant-admin', {
  permissions: [
    perm('project', 'edit', {
      condition: (ctx) =>
        ctx.userAttributes?.tenantId === ctx.resourceAttributes?.tenantId,
    }),
    perm('billing', 'read', { scope: 'none' }),
    perm('project', '*', {
      condition: async (ctx) => {
        const isBlocked = await blocklistService.check(ctx.user.id);
        return !isBlocked;
      },
    }),
  ],
});
```

## Custom Scopes

```ts
import { scopeTeam, scopeTenant, scopeOrg } from 'polycyes';

perm('task', 'edit', { scope: scopeTeam })      // same teamId
perm('project', 'read', { scope: scopeTenant })  // same tenantId

// Or define your own:
const scopeDepartment = (ctx) =>
  ctx.userAttributes?.dept === ctx.resourceAttributes?.dept;
```

## CachedPolicyStore

TTL cache wrapper for any `PolicyStore`. Reduces load on the underlying store
with zero code changes.

```ts
import { CachedPolicyStore } from 'polycyes/cached-store';

const store = new CachedPolicyStore({
  store: myDatabaseStore,  // any PolicyStore
  ttl: 30_000,             // global TTL (default 30s)
  roleTtl: 10_000,         // per-type TTL for roles (optional)
  userRolesTtl: 60_000,    // per-type TTL for user roles (optional)
});

// ttl: 0 disables caching — useful for tests or dev
const devStore = new CachedPolicyStore({ store, ttl: 0 });
```

- Per-type TTL: separate expiry for roles vs user roles
- Auto-invalidation on writes (`addRole`, `updateRole`, etc.)
- Concurrent request dedup — N requests for the same key = 1 fetch
- `clearCache()` + `cacheStats()` for monitoring

## Store Decorators

Composable wrappers around any `PolicyStore`:

```ts
import { MetricsPolicyStore, LoggingPolicyStore, FailOpenPolicyStore }
  from 'polycyes/store-decorators';

const store = new MetricsPolicyStore(
  new LoggingPolicyStore(
    new CachedPolicyStore({ store: new InMemoryPolicyStore(), ttl: 30_000 }),
    { includeArgs: false },
  ),
);

// Live metrics
store.getMetrics()
// → { getRole: { count: 150, totalMs: 12.3, errors: 0 }, ... }
store.resetMetrics();
```

### LoggingPolicyStore

Logs every operation with timing. Options: `includeArgs`, `includeResult`, custom `logger`.

### MetricsPolicyStore

Tracks call count, total time, and errors per method.
`getMetrics()` returns an immutable snapshot. `resetMetrics()` clears all counters.

### FailOpenPolicyStore

Implements `PolicyStore` (full read + write). Reads return `null`/`[]` on store errors.
Writes delegate directly to the inner store. For cases where auth should never break the app.

## Express Adapter

```ts
import { authz } from 'polycyes/express';

app.delete('/posts/:id', authz(engine, {
  resource: (req) => 'post',
  action: (req) => 'delete',
  resourceInstance: (req) => ({
    id: req.params.id,
    ownerId: req.post.authorId,
  }),
}), controller);
```

## NestJS Adapter

```bash
npm install polycyes @nestjs/common @nestjs/core
```

### Module Setup

```ts
import { Module } from '@nestjs/common';
import { Engine, InMemoryPolicyStore } from 'polycyes';
import { PolycyesModule } from 'polycyes/nestjs';

const store = new InMemoryPolicyStore();
const engine = new Engine(store);

@Module({
  imports: [PolycyesModule.forRoot(engine)],
})
export class AppModule {}
```

### Guard Usage

```ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { PolycyesGuard, Permissions } from 'polycyes/nestjs';

@Injectable()
export class AuthGuard extends PolycyesGuard {}

@Controller('posts')
export class PostsController {
  @Get()
  @Permissions('post', 'read')
  async findAll() { /* ... */ }

  @Post()
  @Permissions('post', 'create')
  async create() { /* ... */ }

  @Delete(':id')
  @Permissions('post', 'delete')
  async remove(@Param('id') id: string) { /* ... */ }
}
```

### Custom User Extractor

By default, `PolycyesGuard` reads `req.user`. Override with `getUser`:

```ts
PolycyesModule.forRoot(engine, {
  getUser: (req) => user(req.user.sub),  // from JWT
  getResourceInstance: (req) => ({ id: req.params.id, ownerId: req.post.authorId }),
  getMetadata: (req) => ({ ip: req.ip }),
})
```

### Subpath Export

```
polycyes/nestjs              → PolycyesModule, PolycyesGuard, Permissions
```

### `Engine`

```ts
const engine = new Engine(store, options?);
// or
const engine = createEngine(store, options?);

await engine.check(input): Promise<CheckResult>
await engine.checkMany(inputs): Promise<CheckResult[]>
await engine.filter(input): Promise<FilterResult>
await engine.debug(input): Promise<DebugTrace>

// Monitoring
engine.getStore(): PolicyReader
engine.getCacheStats(): EngineCacheStats  // { resolvedRoles: { size, hits, misses } }
engine.clearCache(): void                 // flush resolved cache + reset stats
```

### `EngineOptions`

```ts
{
  timeoutMs?: number;          // default 1000, 0 = no timeout
  resolvedCacheTTL?: number;   // per-user resolved cache TTL (default 1000, 0 = disabled)
  failOpen?: boolean;          // default false (DANGEROUS)
  useIndex?: boolean;          // default true (O(1) permission lookup)
  disableRoleHintWarning?: boolean; // default false
}
```

### `PolicyStore`

Implement `PolicyStore` for any backend:

```ts
interface PolicyReader {
  getRole(name: string): Promise<Role | null>;
  getRolesByNames(names: string[]): Promise<Role[]>;
  getUserRoles(userId: string): Promise<string[]>;
}

interface PolicyWriter {
  addRole(role: Role): Promise<void>;
  updateRole(role: Role): Promise<void>;
  deleteRole(name: string): Promise<void>;
  setUserRoles(userId: string, roleNames: string[]): Promise<void>;
  addUserRole(userId: string, roleName: string): Promise<void>;
  removeUserRole(userId: string, roleName: string): Promise<void>;
}

interface PolicyStore extends PolicyReader, PolicyWriter {}
```

## Subpath Exports

```
polycyse                     → barrel (everything)
polycyes/engine              → Engine
polycyes/store               → PolicyReader, PolicyWriter, PolicyStore
polycyes/types               → types (User, Role, Permission, CheckResult, etc.)
polycyes/errors              → all error classes
polycyes/helpers             → perm(), role(), user(), scopeTeam, scopeTenant, scopeOrg
polycyes/memory-store        → InMemoryPolicyStore
polycyes/cached-store        → CachedPolicyStore + CachedPolicyStoreOptions + CacheStats
polycyes/store-decorators    → LoggingPolicyStore, MetricsPolicyStore, FailOpenPolicyStore
polycyes/express             → authz(), ExpressAuthzMapper
polycyes/nestjs              → PolycyesModule, PolycyesGuard, Permissions
```

## License

MIT
