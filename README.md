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
    perm('post', 'delete', { effect: 'deny' }),  // editors can't delete
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
- **Errores tipados** — `ConditionEvaluationError`, `StoreUnavailableError`, etc.
- **Auditoría** — `auditRole()` detecta god-mode wildcards sin condición
- **Deep freeze** — contexto inmutable, previene side effects en condiciones
- **Timeout** — condiciones con `Promise.race` y default 1000ms
- **Tree-shakeable** — `"sideEffects": false` + subpath exports
- **Branded types** — `UserId`, `RoleName`, `ResourceName`, `ActionName`

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
        // Podés consultar servicios externos
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

// Built-in helpers:
perm('task', 'edit', { scope: scopeTeam })   // mismo teamId
perm('project', 'read', { scope: scopeTenant }) // mismo tenantId

// O definí el tuyo:
const scopeDepartment = (ctx) =>
  ctx.userAttributes?.dept === ctx.resourceAttributes?.dept;
```

## API

### `Engine`

```ts
const engine = new Engine(store, options?);

// Evaluar un permiso
await engine.check(input): Promise<CheckResult>

// Evaluar lote (cache de roles por userId)
await engine.checkMany(inputs): Promise<CheckResult[]>

// Filtrar colección por permisos
await engine.filter(input): Promise<FilterResult>

// Debug trace con pasos
await engine.debug(input): Promise<DebugTrace>
```

### `EngineOptions`

```ts
{
  timeoutMs?: number;          // default 1000
  failOpen?: boolean;          // default false (DANGEROUS)
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

## Estructura

```
import { Engine } from 'polycyes'        // barrel
import { Engine } from 'polycyes/engine' // tree-shakeable
import { perm, role } from 'polycyes/helpers'
import type { Permission, Role } from 'polycyes/types'
```

## Licencia

MIT
