# polycyes

> **Poly**cyes **i**s **y**our a**c**cess **e**xpression **s**ystem
> *(o simplemente "poly" + "yes" — porque el permiso dice que sí)*

Motor de autorización RBAC + ABAC para TypeScript. Framework-agnostic, tipado,
testeable. Sin DSLs externos, sin `.conf`, sin `policy.csv`. Las políticas se
definen en TypeScript — con autocompletado, type safety, y zero runtime
dependencies.

```bash
npm install polycyes
```

## Quick Start

```ts
import { Engine, InMemoryPolicyStore, perm, role, user } from 'polycyes';

const store = new InMemoryPolicyStore();
const engine = new Engine(store);

// Definir roles
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

// Evaluar
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

- **RBAC** — roles, permisos, herencia transitiva con detección de ciclos
- **ABAC** — condiciones como funciones síncronas o async `(ctx) => boolean | Promise<boolean>`
- **Scopes** — `any`, `own`, `none` + scopes custom (`(ctx) => boolean`)
- **Wildcards** — `perm("*", "*")`, `perm("post", "*")`, `perm("*", "read")`
- **Deny rules** — `effect: 'deny'` con precedencia sobre allow
- **Batch** — `engine.checkMany()` con cache de roles por usuario
- **Filter** — `engine.filter()` para row-level security
- **Debug** — `engine.debug()` retorna `DebugTrace` con cada paso de la evaluación
- **Cache** — `CachedPolicyStore` con TTL configurable, invalidación automática, y dedup de requests concurrentes
- **Decorators** — `LoggingPolicyStore`, `MetricsPolicyStore`, `FailOpenPolicyStore` (componibles)
- **Sin N+1** — `resolveRoles()` descubre roles padres en batch, zero calls individuales a `getRole()`
- **Errores tipados** — `ConditionEvaluationError`, `StoreUnavailableError`, `InvalidEngineOptionError`, etc.
- **Auditoría** — `auditRole()` detecta god-mode wildcards sin condición
- **Deep freeze** — contexto inmutable, previene side effects en condiciones
- **Timeout** — condiciones con `Promise.race` y default 1000ms (0 = sin timeout)
- **Tree-shakeable** — `"sideEffects": false` + subpath exports
- **Branded types** — `UserId`, `RoleName`, `ResourceName`, `ActionName`
- **Express adapter** — `polycyes/express` con middleware `authz()`

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

## Scopes Custom

```ts
import { scopeTeam, scopeTenant, scopeOrg } from 'polycyes';

perm('task', 'edit', { scope: scopeTeam })     // mismo teamId
perm('project', 'read', { scope: scopeTenant }) // mismo tenantId

// O definí el tuyo:
const scopeDepartment = (ctx) =>
  ctx.userAttributes?.dept === ctx.resourceAttributes?.dept;
```

## CachedPolicyStore

Wrapper con caché TTL para cualquier `PolicyStore`. Ideal para producción: reduce
la carga sobre el store subyacente sin cambiar nada más.

```ts
import { CachedPolicyStore } from 'polycyes/cached-store';

const store = new CachedPolicyStore({
  store: myDatabaseStore,  // cualquier PolicyStore
  ttl: 30_000,             // TTL global (default 30s)
  roleTtl: 10_000,         // TTL para roles (opcional)
  userRolesTtl: 60_000,    // TTL para user roles (opcional)
});

// ttl: 0 desactiva el caché — útil en tests o dev
const devStore = new CachedPolicyStore({ store, ttl: 0 });
```

- Cache por tipo: TTL distinto para roles vs user roles
- Invalidación automática en writes (`addRole`, `updateRole`, etc.)
- Dedup de requests concurrentes — N requests a la misma key = 1 fetch
- `clearCache()` + `cacheStats()` para monitoreo

## Store Decorators

Componé wrappers alrededor de cualquier `PolicyStore`:

```ts
import { MetricsPolicyStore, LoggingPolicyStore, FailOpenPolicyStore }
  from 'polycyes/store-decorators';

const store = new MetricsPolicyStore(
  new LoggingPolicyStore(
    new CachedPolicyStore({ store: new InMemoryPolicyStore(), ttl: 30_000 }),
    { includeArgs: false },
  ),
);

// Métricas en vivo
store.getMetrics()
// → { getRole: { count: 150, totalMs: 12.3, errors: 0 }, ... }
store.resetMetrics();
```

### LoggingPolicyStore

Logea cada operación con timing. Opciones: `includeArgs`, `includeResult`, `logger` custom.

### MetricsPolicyStore

Lleva contador de llamadas, tiempo acumulado y errores por método.
`getMetrics()` retorna snapshot inmutable. `resetMetrics()` reinicia todo.

### FailOpenPolicyStore

Implementa solo `PolicyReader`. Si el store lanza error, retorna `null`/`[]`
en vez de propagarlo. Para casos donde la autorización no debe romper la app.

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

## API

### `Engine`

```ts
const engine = new Engine(store, options?);

await engine.check(input): Promise<CheckResult>
await engine.checkMany(inputs): Promise<CheckResult[]>
await engine.filter(input): Promise<FilterResult>
await engine.debug(input): Promise<DebugTrace>
```

### `EngineOptions`

```ts
{
  timeoutMs?: number;          // default 1000, 0 = sin timeout
  failOpen?: boolean;          // default false (PELIGROSO)
  useIndex?: boolean;          // default true (O(1) permission lookup)
  disableRoleHintWarning?: boolean; // default false
}
```

### `PolicyStore`

Implementá `PolicyStore` para cualquier backend:

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
}

interface PolicyStore extends PolicyReader, PolicyWriter {}
```

## Subpath Exports

```
polycyse                     → barrel (todo)
polycyes/engine              → Engine
polycyes/store               → PolicyReader, PolicyWriter, PolicyStore
polycyes/types               → tipos (User, Role, Permission, CheckResult, etc.)
polycyes/errors              → todas las clases de error
polycyes/helpers             → perm(), role(), user(), scopeTeam, scopeTenant, scopeOrg
polycyes/memory-store        → InMemoryPolicyStore
polycyes/cached-store        → CachedPolicyStore + CachedPolicyStoreOptions + CacheStats
polycyes/store-decorators    → LoggingPolicyStore, MetricsPolicyStore, FailOpenPolicyStore
polycyes/express             → authz(), ExpressAuthzMapper
```

## Licencia

MIT
