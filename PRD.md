# polycyes — PRD

> **Poly**cyes: **Poly**cyes **i**s you **y**our a**c**cess **e**xpression **s**ystem  
> *(o simplemente "poly" + "yes" — porque el permiso dice que sí)*

---

## 1. Resumen Ejecutivo

polycyes es un motor de autorización **framework-agnostic** para TypeScript que
implementa RBAC (Role-Based Access Control) y ABAC (Attribute-Based Access
Control) en un modelo único, tipado, y testeable.

A diferencia de Casbin (config en archivos `.conf` + CSV, sin type safety) u Oso
(requiere aprender su lenguaje Polar), polycyes define las políticas directamente
en TypeScript — con types, autocompletado, y sin DSLs externos.

### Filosofía

```
CONCEPTOS > CÓDIGO
  Entendé el modelo, después implementalo.

TYPE SAFETY > CONFIG FILES
  Que el compilador valide, no un runtime.

TESTEABILIDAD > MAGIA
  engine.check() sin HTTP, sin base de datos.

RAZÓN > BOOLEANO
  Saber POR QUÉ te denegaron es tan importante como saber que te denegaron.
```

---

## 2. Contexto y Problema

### 2.1 El problema

Cada aplicación con usuarios necesita control de acceso. Sin embargo:

- **Casbin**: El estándar de facto, pero sus políticas en archivos `.conf` + CSV
  son frágiles, sin type safety, y el debugging es manual. Intentá debuggear por
  qué `p, alice, data1, read` no funciona y perdés 30 minutos.
- **Oso**: Modelo conceptual sólido, pero requiere aprender Polar (su propio
  lenguaje). La empresa fue adquirida, el proyecto está en modo mantenimiento.
- **Permit.io / Authorizo / etc.**: Soluciones SaaS o implementaciones parciales.
- **Ladrillo propio**: Cada equipo reinventa la rueda, mal, y sin tests.
- **Soluciones monolíticas**: Están acopladas a un framework (Passport,
  NestJS Guards nativos), no son portables.

### 2.2 La solución

polycyes propone una **tercera vía**: un core model en TypeScript puro,
framework-agnostic, que cualquier backend pueda consumir mediante adaptadores
delgados.

```
         ┌─────────────┐
         │   NestJS    │
         │   Adapter   │
         ├─────────────┤
         │   Express   │
         │   Adapter   │
         ├─────────────┤     ┌──────────────────┐
         │   Fastify   │────▶│   polycyes core  │
         │   Adapter   │     │                  │
         ├─────────────┤     │  Engine + Model  │
         │   Next.js   │     │  + Store         │
         │   Adapter   │     └──────────────────┘
         ├─────────────┤
         │   ...otros  │
         └─────────────┘
```

---

## 3. Público Objetivo

| Perfil | Para qué le sirve |
|--------|-------------------|
| Backend dev (Node/TS) | Control de acceso sin acoplarse a un framework |
| Arquitecto de software | Modelo portable entre microservicios |
| Tech lead | Políticas tipadas, testeables, auditables |
| Startup | Prototipado rápido sin infraestructura externa |
| Proyecto existente | Migrar de Casbin/Oso sin cambiar la lógica de negocio |

### No es para

- Aplicaciones que necesitan un panel UI para administrar roles (aunque se puede
  construir encima del `PolicyStore`)
- Equipos que quieren una solución SaaS (Permit.io, Auth0, etc.)

---

## 4. Requisitos Funcionales

### 4.1 MVP (v0.1)

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-01 | Definir permisos con `{ resource, action, scope?, effect? }` | 🔴 Alta |
| RF-02 | Definir roles con permisos y herencia | 🔴 Alta |
| RF-03 | Evaluar `engine.check({ user, resource, action }) → CheckResult` | 🔴 Alta |
| RF-04 | Soportar scopes built-in (`any`, `own`, `none`) **+ scopes custom** (funciones) | 🔴 Alta |
| RF-05 | Soportar wildcards con namespaces: `"post:*"`, `"*.read"`, `"*"` | 🔴 Alta |
| RF-06 | Herencia transitiva de roles con límite de profundidad | 🔴 Alta |
| RF-07 | Detectar ciclos en herencia y lanzar error | 🔴 Alta |
| RF-08 | Condiciones ABAC como funciones `(ctx) => boolean` con try/catch | 🔴 Alta |
| RF-09 | Deny rules: soportar `effect: 'deny'` con precedencia sobre allow | 🔴 Alta |
| RF-10 | Composición de condiciones AND/OR (`conditionMode: 'all' | 'any'`) | 🟡 Media |
| RF-11 | `CheckResult` estructurado con `allowed`, `reason`, `matchedRole`, `deniedBy` | 🔴 Alta |
| RF-12 | `InMemoryPolicyStore` para dev y tests | 🔴 Alta |
| RF-13 | `PolicyStore` interface separada en `PolicyReader` + `PolicyWriter` | 🔴 Alta |
| RF-14 | `PolicyReader.getRolesByNames()` para batch loading (evitar N+1) | 🔴 Alta |
| RF-15 | `engine.checkMany()` para evaluación batch | 🔴 Alta |
| RF-16 | Tests del core engine (todos los escenarios, property-based testing) | 🔴 Alta |
| RF-17 | Errores tipados: `ConditionEvaluationError`, `DuplicateRoleError`, `HierarchyTooDeepError`, `EmptyConditionArrayError`, `ConditionTimeoutError`, `StoreUnavailableError`, `UnsafeRoleError`, `InvalidEngineOptionError` | 🟡 Media |
| RF-34 | Configurable per-condition timeout con fail-closed semantics (default 1000ms) — previene DoS por condiciones que nunca resuelven | 🔴 Alta |
| RF-35 | Fail-closed por defecto ante errores del store; opt-in `failOpen: true` en `EngineOptions` (segundo parámetro del constructor `Engine`) permite fail-open con warning explícito en `CheckResult.reason` | 🔴 Alta |
| RF-36 | `auditRole()`: static analysis pass ejecutado en `addRole()` — detecta `perm("*", "*")`, herencia sospechosa, scopes demasiado amplios; emite warnings via `onAuditWarning` callback o `console.warn` | 🔴 Alta |
| RF-37 | Dev-mode warning cuando `user.roles` hint no coincide con `store.getUserRoles()` | 🟡 Media |

### 4.2 Post-MVP (v0.2+)

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-18 | Adapter para Express.js | 🟡 Media |
| RF-19 | Adapter para NestJS (Guard + Module decorado) | 🟡 Media |
| RF-20 | Adapter para Fastify | 🟢 Baja |
| RF-21 | PolicyStore con SQLite | 🟡 Media |
| RF-22 | PolicyStore con PostgreSQL | 🟢 Baja |
| RF-23 | Condiciones serializables (objetos declarativos, no solo funciones) | 🟡 Media |
| RF-24 | Resource hierarchies con path-based matching (`"org:*:project"`) | 🟡 Media |
| RF-25 | Role activation conditions — activar/desactivar rol según atributos | 🟡 Media |
| RF-26 | Administración delegada: `setUserRoles` con scope (`project:proj_7`) | 🟡 Media |
| RF-27 | Serialización/deserialización de políticas a JSON/YAML | 🟡 Media |
| RF-28 | Field-level permissions (leer/escribir campos específicos de un recurso) | 🟢 Baja |
| RF-29 | Benchmark suite con datasets de 100/1k/10k roles | 🟢 Baja |

---

## 5. Arquitectura

### 5.1 Estructura del proyecto

```
polycyes/
├── src/
│   ├── index.ts           # Public API — todo lo que se exporta
│   ├── types.ts           # Modelo de datos central (User, Role, Permission, etc.)
│   ├── helpers.ts         # Helpers: perm(), role(), user()
│   ├── engine.ts          # Engine — motor de evaluación
│   ├── store.ts           # PolicyStore interface
│   ├── memory-store.ts    # InMemoryPolicyStore
│   └── errors.ts          # Errores custom
├── test/
│   └── engine.test.ts     # Tests del engine (esqueleto con casos)
├── PRD.md                 # Este documento
├── package.json
├── tsconfig.json
└── .gitignore
```

### 5.2 Flujo de evaluación

```
CheckInput
├── user:      { id, roles[], attributes? }
├── resource:  "post"                         ← string simple
├── action:    "edit"                         ← string simple
├── resourceInstance?: { id, ownerId, attributes? }
└── metadata?: { ip, time, etc. }

        │
        ▼
┌──────────────────────────────────────────────────┐
│ 1. Resolver roles                                │
│    getUserRoles(user.id) → ["editor"]            │
│    resolveRoles(["editor"]) → [Role(editor),     │
│                                Role(viewer)]     │
│    (con herencia transitiva)                     │
│    Validar ciclos                                │
├──────────────────────────────────────────────────┤
│ 2. Iterar permisos                               │
│    Por cada rol → por cada permission:           │
│                                                  │
│    ┌─ 2a. matchResource ──────────────────────┐  │
│    │  perm.resource === "post"                  │  │
│    │  input.resource === "post"   ✓             │  │
│    │  (o perm.resource === "*")                 │  │
│    └─────────────────────────────────────────┘  │
│         │ ✓                                     │
│    ┌─ 2b. matchAction ───────────────────────┐  │
│    │  perm.action === "edit"                    │  │
│    │  input.action === "edit"     ✓             │  │
│    │  (o perm.action === "*")                   │  │
│    └─────────────────────────────────────────┘  │
│         │ ✓                                     │
│    ┌─ 2c. matchScope ────────────────────────┐  │
│    │  scope === "any"    → true                 │  │
│    │  scope === "own"    → ownerId === userId   │  │
│    │  scope === "none"   → true                 │  │
│    └─────────────────────────────────────────┘  │
│         │ ✓                                     │
│    ┌─ 2d. matchCondition ────────────────────┐  │
│    │  ¿condition evaluada? → true?              │  │
│    │  (si no hay condition, pasa directo)       │  │
│    └─────────────────────────────────────────┘  │
│         │ ✓                                     │
│    → PERMISO CONCEDIDO                          │
├──────────────────────────────────────────────────┤
│ 3. Resultado                                     │
│    Si algún permiso pasó:                        │
│      → { allowed: true,  reason: "granted by    │
│         role 'admin'" }                          │
│    Si ningún permiso pasó:                       │
│      → { allowed: false, reason: "denied: no    │
│         matching permission..." }                │
└──────────────────────────────────────────────────┘
```

### 5.3 Diagrama de dependencias

```
index.ts
├── engine.ts
│   ├── types.ts
│   ├── store.ts
│   └── errors.ts
├── memory-store.ts
│   ├── store.ts
│   ├── types.ts
│   └── errors.ts
├── helpers.ts
│   └── types.ts
├── types.ts        ← 0 dependencias
├── store.ts
│   └── types.ts
└── errors.ts       ← 0 dependencias (solo Error nativo)
```

Capa más importante: **`types.ts`**. Sin dependencias. Todo el resto depende de
ella, no al revés. Esto permite que los adapters (Express, NestJS) solo
dependan de `types.ts` y del `Engine`, sin arrastrar stores ni helpers.

---

## 6. Modelo de Datos — Referencia Completa

### 6.1 `Permission`

```typescript
interface Permission {
  resource: string;        // "post" | "comment" | "*"
  action: string;          // "create" | "edit" | "*"
  scope?: PermissionScope; // "any" | "own" | "none"  (default: "any")
  effect?: PermissionEffect; // "allow" | "deny" (default: "allow")
  condition?: Condition;   // ABAC: (ctx) => boolean | Promise<boolean>
}
```

**Reglas de matching**:

| perm.resource | input.resource | ¿Match? |
|---------------|----------------|---------|
| `"post"` | `"post"` | ✅ |
| `"post"` | `"comment"` | ❌ |
| `"*"` | `"post"` | ✅ |
| `"*"` | `"anything"` | ✅ |

| perm.action | input.action | ¿Match? |
|-------------|--------------|---------|
| `"edit"` | `"edit"` | ✅ |
| `"edit"` | `"create"` | ❌ |
| `"*"` | `"edit"` | ✅ |

### 6.1.1 `PermissionEffect`

```typescript
type PermissionEffect = "allow" | "deny";
```

**Regla de precedencia**: `deny` siempre gana sobre `allow`. Si un permiso con
`effect: "deny"` matchea, el acceso se deniega inmediatamente, sin importar
cuántos permisos `allow` existan.

**Algoritmo de evaluación con deny (single-pass con tracking)**:

Importante: NO es un algoritmo "two-pass" (evaluar todos los allows y luego
todos los denys por separado). Es un **single pass** sobre roles y permisos
que trackea el mejor allow y el mejor deny por separado. Ver WARNING #22
en §16.8 — la versión anterior de esta sección era contradictoria con la
implementación en §8.

```
1. Iterar todos los roles resueltos (single pass, en orden)
2. Por cada rol, iterar sus permisos en orden
3. Por cada permiso que matchea resource+action+scope+condition:
   a. Si effect === 'deny':
      → Guardar como bestDeny
      → SHORT-CIRCUIT dentro del MISMO rol (no seguir iterando permisos de
        este rol): un deny de este rol es definitivo para este rol
      → Continuar con el siguiente rol (puede haber otro rol con un allow
        que se matchee contra el bestDeny al final)
   b. Si effect === 'allow':
      → Guardar como bestAllow (sin short-circuit — un deny posterior debe
        poder sobreescribir)
4. Al final del loop:
   a. Si bestDeny existe → DENIED (deny gana sobre allow)
   b. Si bestDeny no existe y bestAllow existe → ALLOWED
   c. Si ninguno → DENIED por defecto
```

**Punto clave**: el short-circuit de deny es **dentro del mismo rol**, no
global. Esto significa que si `role-a` tiene un deny para `post:edit` y
`role-b` tiene un allow para `post:edit`, ambos se evaluan y al final el
deny de `role-a` gana. Si los dos denys estuvieran en el mismo rol, el
primero encontrado determina `bestDeny` (los siguientes denies del mismo
rol se ignoran por el short-circuit interno).

**Ejemplo de uso**:
```typescript
// "Todos pueden leer documentos, excepto los confidenciales"
role('viewer', {
  permissions: [
    perm('document', 'read'), // allow por defecto
    perm('document', 'read', {
      effect: 'deny',
      condition: (ctx) => ctx.resourceAttributes?.classification === 'confidential',
    }),
  ],
});
```

**Nota**: Para v0.1, `effect` es opcional y defaultea a `"allow"`. Esto permite
agregar deny rules sin breaking changes en el futuro.

**Reglas de precedencia**: `deny` gana sobre `allow`. Si hay al menos un permiso con `effect: 'deny'` que matchea, el resultado es DENIED sin importar cuántos `allow` matcheen. Esto permite expresar "todos pueden X, excepto Y".

### 6.2 `PermissionScope`

**Scopes built-in**:

| Valor | Significado | Condición |
|-------|-------------|-----------|
| `"any"` | Cualquier recurso | Siempre true |
| `"own"` | Solo recursos del usuario | `resourceInstance.ownerId === user.id` |
| `"none"` | Acción sin recurso | Siempre true (no evalua resourceInstance) |

**Scopes custom** (extensibles por el usuario):

```typescript
type PermissionScope = 'any' | 'own' | 'none' | ScopeFunction;

type ScopeFunction = (ctx: EvalContext) => boolean;

// Helpers para scopes comunes:
scopeTeam   = (ctx) => ctx.resourceAttributes?.teamId === ctx.userAttributes?.teamId;
scopeTenant = (ctx) => ctx.resourceAttributes?.tenantId === ctx.userAttributes?.tenantId;
scopeOrg    = (ctx) => ctx.resourceAttributes?.orgId === ctx.userAttributes?.orgId;

// Uso:
perm('project', 'edit', { scope: scopeTenant })
perm('task',    'read', { scope: scopeTeam })
```

Los scopes custom son first-class citizens, evaluados con el mismo pipeline que los built-in. El usuario puede definir cualquier lógica de scope sin tocar el engine.

### 6.3 `Condition`

```typescript
type Condition = (ctx: EvalContext) => boolean | Promise<boolean>;
```

Las condiciones reciben el contexto completo de evaluación y deben devolver un
booleano (o una Promise de booleano). Son **el mecanismo ABAC** — permiten reglas como:

- "Solo puede publicar si pertenece al mismo departamento"
- "Solo puede acceder en horario laboral"
- "Solo puede editar si el recurso está en estado 'draft'"

**Importante**: La condición se evalúa **después** del scope. Si el scope ya
denegó, la condición ni se ejecuta.

**Seguridad de condiciones**:
- Las condiciones pueden ser **síncronas o asíncronas** (`Promise<boolean>`)
- Si una condición **lanza una excepción**, el engine la catchea y **deniega**
  (fail-closed) con razón `"denied: condition threw an exception"`
- Si una condición retorna un **valor no-booleano**, el engine **lanza
  `ConditionEvaluationError`** con `TypeError("Condition returned <type>,
  expected boolean")`. NO se trata silenciosamente como `false` — esto fue
  una vulnerabilidad CRÍTICA descubierta en la tercera ronda (ver §16.8) y
  se previene con validación estricta `typeof result === 'boolean'` en
  `matchConditions` (§8 Step 3b).
- Las condiciones se **envuelven con un timeout configurable** (default 1000ms).
  Si una condición nunca resuelve (`() => new Promise(() => {})`), se emite
  `ConditionTimeoutError` y se trata como **failed** (fail-closed). Esto
  previene DoS por condiciones maliciosas o servicios externos caídos.
- El `EvalContext` pasado a la condición debe ser **deep-frozen** (recursive
  `Object.freeze`) para evitar side effects que corrompan la evaluación. La
  función helper `deepFreeze(obj)` debe aplicarse a `user`, `user.attributes`,
  `resourceInstance`, `resourceInstance.attributes`, y `metadata`. Ver WARNING #7
  en §16.8 — un `Object.freeze` shallow deja los objetos anidados mutables.
- **`condition: undefined`** (no hay campo `condition` en el permiso) significa
  **"sin condiciones ABAC, siempre pasa"** — short-circuit a `true` en
  `matchConditions`. Este es el caso COMÚN de RBAC básico (la mayoría de los
  permisos no son ABAC, son solo `resource + action + scope`) y NO debe lanzar
  ningún error.
- **`condition: []`** (array explícitamente vacío) es un **error de
  configuración** y lanza `EmptyConditionArrayError`. Esto previene silent
  open-access cuando un factory produce `condition: []` con `conditionMode: 'all'`
  (el `[].every(...)` retorna `true` y concede acceso). Ver CRITICAL #2 en §16.8.
- **La distinción entre `undefined` y `[]` es semántica, no sintáctica**: el
  engine debe ser estricto al validar que la presencia de la propiedad `condition`
  en el objeto implica un array no vacío o una función, pero tolerar la
  ausencia total de la propiedad. Ver §8 Paso 3b para la implementación.

**Ejemplo de condición async**:
```typescript
perm('post', 'publish', {
  condition: async (ctx) => {
    const isBlocked = await externalService.isBlocked(ctx.user.id);
    return !isBlocked;
  },
})
```

#### 6.3.1 `deepFreeze` — Inmutabilidad recursiva del contexto

`Object.freeze` es **shallow**: solo congela las propiedades directas del
objeto, no sus objetos anidados. Para garantizar que la condición no pueda
mutar `ctx.user.attributes.department` ni `ctx.resourceInstance.attributes.tenantId`,
se requiere freeze recursivo:

```typescript
function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.values(obj).forEach(deepFreeze);
    Object.freeze(obj);
  }
  return obj;
}

// En buildEvalContext() — ANTES de pasar el ctx a matchConditions:
const ctx: EvalContext = {
  user: deepFreeze({ ...input.user, attributes: deepFreeze({ ...input.user.attributes }) }),
  resource: input.resource,
  action: input.action,
  resourceInstance: input.resourceInstance
    ? deepFreeze({ ...input.resourceInstance, attributes: deepFreeze({ ...input.resourceInstance.attributes }) })
    : undefined,
  metadata: input.metadata ? deepFreeze({ ...input.metadata }) : undefined,
  timeoutMs: this.options?.timeoutMs ?? 1000,  // CRITICAL #3 fix: populated from EngineOptions
  get userAttributes() { return this.user.attributes; },
  get resourceAttributes() { return this.resourceInstance?.attributes; },
};
```

El freeze es **mandatorio**. Sin él, una condición hostil podría mutar
`ctx.user.attributes.role = 'admin'` y alterar evaluaciones posteriores del
mismo `check()` (ver WARNING #7 en §16.8).

### 6.4 `Role`

```typescript
interface Role {
  name: string;              // "admin"
  description?: string;      // "Administrador del sistema"
  permissions: Permission[]; // Permisos directos del rol
  inherits?: string[];       // ["editor", "viewer"]
}
```

**Herencia**: Si `editor` hereda de `viewer`, entonces `editor` tiene TODOS los
permisos de `viewer` más los suyos propios.

**Advertencia**: El engine debe detectar ciclos. Si A → B → C → A, se lanza
`CircularRoleHierarchyError` con la cadena completa.

### 6.5 `User`

```typescript
interface User {
  id: string;
  /**
   * @deprecated HINT ONLY. The engine NEVER uses this field for authorization.
   * The store is the single source of truth (see §6.8, §8 Paso 1).
   * This field may be used for logging, pre-validation, or cache key generation,
   * but the actual authorization decision comes from `store.getUserRoles(user.id)`.
   * If you populate it, expect a runtime warning in dev builds when it differs
   * from the store's response (see WARNING #24 en §16.8).
   */
  roles: string[];
  attributes?: Record<string, unknown>; // { department: "engineering" }
}
```

Los `roles` se usan para buscar en el store. Los `attributes` se exponen en el
`EvalContext` para las condiciones ABAC.

### 6.6 `EvalContext`

```typescript
interface EvalContext {
  user: User;
  resource: string;                          // tipo de recurso
  action: string;                            // acción solicitada
  resourceInstance?: ResourceInstance;       // instancia (si aplica)
  metadata?: Record<string, unknown>;        // IP, tiempo, etc.
  /**
   * Per-condition timeout en milisegundos. Populated por `buildEvalContext`
   * desde `EngineOptions.timeoutMs` (default 1000ms si no se setea).
   * Usado por `matchConditions` (§8 Paso 3b) para envolver cada condición
   * con `Promise.race` contra `ConditionTimeoutError`. Ver RF-34, §7.1.
   */
  timeoutMs?: number;
  get userAttributes(): Record<string, unknown> | undefined;
  get resourceAttributes(): Record<string, unknown> | undefined;
}
```

Los getters `userAttributes` y `resourceAttributes` son atajos para no tener que
escribir `ctx.user.attributes` cada vez. El campo `timeoutMs` es populado por
`buildEvalContext` desde `EngineOptions.timeoutMs` (§6.3.1, §7.1) — no es
responsabilidad del caller setearlo.

### 6.7 `ResourceInstance`

```typescript
interface ResourceInstance {
  id?: string;
  ownerId?: string;
  attributes?: Record<string, unknown>;
}
```

### 6.8 `CheckInput`

```typescript
interface CheckInput {
  user: User;
  resource: string;             // "post"
  action: string;               // "edit"
  resourceInstance?: ResourceInstance;
  metadata?: Record<string, unknown>;
}
```

**⚠️ Seguridad — Fuente de verdad de roles**: El campo `user.roles` en
`CheckInput` es **opcional y NO es la fuente de verdad**. El engine SIEMPRE
obtiene los roles del store mediante `store.getUserRoles(user.id)`. El campo
`user.roles` se usa solo como hint para caching o logging, nunca para la
decisión de autorización. Esto previene **Role Injection attacks** donde un
caller malicioso podría forjar `user.roles: ["admin"]`.

### 6.9 `CheckResult`

```typescript
interface CheckResult {
  allowed: boolean;          // true | false
  reason: string;            // "granted by role 'admin'" | "denied: ..."
  matchedRole?: string;      // rol que concedió el acceso (si allowed)
  matchedPermission?: {      // permiso que matcheó (si allowed)
    resource: string;
    action: string;
    effect: 'allow' | 'deny';
  };
  deniedBy?: {               // por qué se denegó (si !allowed)
    type: 'no-roles' | 'no-match' | 'scope-failed' | 'condition-failed' | 'explicit-deny';
    detail: string;
  };
  evaluatedAt: Date;         // timestamp de evaluación (para auditoría)
}
```

**El `reason` no es opcional**. Cada evaluación produce una explicación legible. Los campos `matchedRole`, `matchedPermission` y `deniedBy` estructuran la información para auditoría y debugging.

---

## 7. API Pública

### 7.1 Engine

```typescript
class Engine {
  private readonly options: EngineOptions;

  constructor(store: PolicyReader, options: EngineOptions = {}) {
    this.store = store;
    this.options = options;

    // Validate options
    if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) {
      throw new InvalidEngineOptionError(`timeoutMs must be a positive finite number, got: ${options.timeoutMs}`);
    }
  }

  async check(input: CheckInput): Promise<CheckResult>
  async checkMany(inputs: CheckInput[]): Promise<CheckResult[]>
  async debug(input: CheckInput): Promise<DebugTrace>
  async filter(input: FilterInput): Promise<FilterResult>
}

interface EngineOptions {
  /** Default: 1000ms. Per-condition timeout. Configurable via this field. */
  timeoutMs?: number;
  /** Default: false. Si true, errores del store se traducen a `allowed: true` (fail-OPEN).
   *  DANGERO: en outage del store, el engine concede acceso. Solo usar cuando la
   *  disponibilidad sea más importante que la precisión de la autorización
   *  (ej: health checks, sistemas públicos de lectura). Ver §8 Paso 1. */
  failOpen?: boolean;
  /** Default: false. Si true, silencia los dev-mode warnings (ej: cuando
   *  `user.roles` hint difiere del store — ver §8 Paso 1, RF-37). */
  disableRoleHintWarning?: boolean;
}
```

### 7.1.1 Performance Budget (v0.1)

polycyes debe ser **muy rápido**. Este presupuesto de rendimiento guía las
decisiones de implementación y tradeoffs:

| Operación | Target P50 | Target P99 | Contexto |
|-----------|-----------|-----------|----------|
| `engine.check()` | < 50μs | < 500μs | 10 roles, 50 perms/rol, sin ABAC |
| `engine.check()` + ABAC sync | < 100μs | < 1ms | 10 roles, 50 perms/rol, condiciones síncronas |
| `engine.check()` + ABAC async | < 200μs | < 5ms | 10 roles, 50 perms/rol, condiciones async |
| `engine.check()` heavy | < 500μs | < 10ms | 100 roles, 500 perms/rol, ABAC sync |
| `engine.checkMany()` (100 inputs, same user) | < 1ms | < 10ms | Store batch 1×, ABAC sync |
| `store.getRolesByNames()` (InMemory) | < 10μs | < 100μs | 50 roles batch |
| Cold start (Engine + InMemoryStore) | < 500μs | < 2ms | Sin IO, constructor ligero |
| Bundle size (core engine + types + InMemoryStore, gzip) | < 5KB | < 8KB | Tree-shakeable, subpath exports |

**Decisiones de implementación que derivan de este budget**:

- **Permission index**: matching O(1) por `resource+action` en vez de iterar
  O(n × m). Ver §8.1.
- **Sin IO en hot path**: `check()` nunca hace IO directo. El store es async por
  definición de interfaz, pero `InMemoryPolicyStore` es síncrono. Stores externos
  (PostgreSQL, SQLite, HTTP) pagan IO fuera del engine.
- **Timeout sin overhead en caso normal**: `Promise.race` con `setTimeout` solo
  se activa si una condición cuelga. Caso normal: ~1μs overhead por condición.
- **`deepFreeze` una vez por `check()`**: Aplicado al `EvalContext` construido al
  inicio, no por permiso. RF-31.
- **`sanitizeInput` sin recursión en inputs simples**: Si no hay `attributes` ni
  `metadata`, la sanitización es O(1) — solo valida campos top-level.
- **`Promise.all` paraleliza condiciones**: `conditionMode: 'all'` resuelve en
  paralelo — el tiempo total es el de la condición más lenta, no la suma.

**Tradeoffs explícitos**:

| Sacrificamos | Por |
|-------------|-----|
| Memoria (índices de permisos extra) | Velocidad de matching O(n) → O(1) |
| Bundle size (código de índices) | Velocidad de matching |
| Precisión de timestamp | Velocidad: `Date.now()` en vez de `process.hrtime.bigint()` |
| `debug()` no apto para prod | Velocidad: `debug()` construye `DebugTrace` con arrays de pasos |
| `filter()` sin pushdown nativo | Velocidad en hot path: `filter()` evalua recurso por recurso |

**`check()`**: Evalúa si un usuario tiene permiso para realizar una acción sobre
un recurso. Retorna `CheckResult` con `allowed`, `reason`, y metadata.

**`debug()`**: Igual que `check()` pero retorna un `DebugTrace` con cada paso de
la evaluación. Útil para debugging y desarrollo. No debe usarse en producción
por performance.

**`filter()`**: Filtra una colección de recursos según los permisos del usuario.
Retorna solo los recursos sobre los que el usuario tiene permiso para la acción
especificada. Útil para row-level security en queries.

```typescript
interface FilterInput {
  user: User;
  action: string;
  resources: Array<{ id: string; ownerId?: string; attributes?: Record<string, unknown> }>;
  resourceType: string;
}

interface FilterResult {
  allowed: Array<{ id: string; ownerId?: string; attributes?: Record<string, unknown> }>;
  denied: Array<{ id: string; reason: string }>;
}
```

### 7.2 PolicyStore

El store se separa en dos interfaces (Interface Segregation Principle):

```typescript
// === PolicyReader: lo que necesita el Engine (hot path de autorización) ===
interface PolicyReader {
  getRole(name: string): Promise<Role | null>;
  getRolesByNames(names: string[]): Promise<Role[]>;  // batch loading — 1 query, no N
  getUserRoles(userId: string): Promise<string[]>;
}

/**
 * **Contrato de errores**: Todos los métodos de `PolicyReader` DEBEN lanzar
 * (throw) ante cualquier fallo — timeouts, errores de SQL, conexiones
 * caídas, deserialización, etc. El engine captura estas excepciones y las
 * re-lanza como `StoreUnavailableError`, manteniendo **fail-closed** por
 * defecto (§15 Pregunta 5, RF-35).
 *
 * Los adapters **NO deben** atrapar errores internamente y devolver arrays
 * vacíos o `null` para "seguir funcionando" — esto es un vector de privilege
 * escalation silenciosa (un store caído parecería "usuario sin roles").
 */

// === PolicyWriter: operaciones de administración ===
interface PolicyWriter {
  addRole(role: Role): Promise<void>;
  updateRole(role: Role): Promise<void>;
  deleteRole(name: string): Promise<void>;
  setUserRoles(userId: string, roleNames: string[]): Promise<void>;
}

// === PolicyStore: unión de ambas (para implementaciones que manejan todo) ===
interface PolicyStore extends PolicyReader, PolicyWriter {}
```

El `Engine` solo recibe `PolicyReader` en su constructor. Esto hace explícito que
el engine NUNCA escribe — solo lee. Las operaciones de administración quedan en
`PolicyWriter`, usadas por seeds, CLI tools, o admin panels.

**Importante**: `getRolesByNames(names)` permite resolver toda la cadena de
herencia en UNA sola llamada al store, eliminando el problema N+1 del diseño anterior.

### 7.3 InMemoryPolicyStore

Implementación completa en `memory-store.ts`. Todo en memoria, no persistente.
Ideal para tests y prototipado.

### 7.4 Helpers

```typescript
// Construir permisos
perm("post", "edit")                          // scope: "any"
perm("post", "edit", { scope: "own" })
perm("post", "edit", { condition: (ctx) => ... })

// Construir roles
role("admin", {
  description: "Administrador",
  permissions: [perm("*", "*")],
  inherits: ["editor"],
})

// Construir usuarios (tests/seeds)
user("usr_1", {
  roles: ["admin"],
  attributes: { department: "engineering" },
})
```

---

## 8. Algoritmo de Evaluación (detalle de implementación)

Este es el corazón de polycyes. La implementación del método `check()` en
`engine.ts` debe seguir estos pasos:

### Paso 1: Obtener roles del usuario

```typescript
let roleNames: string[];
try {
  roleNames = await store.getUserRoles(input.user.id);
} catch (err) {
  // FAIL-CLOSED por defecto: si el store falla, el engine rechaza la operación.
  // Nunca se debe conceder acceso cuando no se puede verificar la identidad
  // del solicitante. Por contrato (RF-35, §7.1), el engine RE-LANZA como
  // `StoreUnavailableError` — NO devuelve DENIED silencioso.
  //
  // Opt-in PELIGROSO: `failOpen: true` en EngineOptions cambia este
  // comportamiento para devolver `allowed: true` con un reason explícito de
  // seguridad. Solo usar en escenarios donde la disponibilidad importa más
  // que la precisión de la autorización (ej: health checks, sistemas de
  // lectura pública). El `reason` siempre lleva un warning visible para
  // que el caller sepa que está operando en fail-open.
  if (this.options?.failOpen) {
    return {
      allowed: true,
      reason: "granted: store unavailable, failOpen=true (SECURITY WARNING: not fail-closed)",
      evaluatedAt: new Date(),
    };
  }
  throw new StoreUnavailableError(err);
}

// Dev-only: warn si user.roles hint difiere del store (RF-37).
// Silenciado si `disableRoleHintWarning: true` en EngineOptions.
// Previene el footgun de poblar user.roles y asumir que el engine lo usa.
if (
  !this.options?.disableRoleHintWarning &&
  process.env.NODE_ENV !== 'production' &&
  Array.isArray(input.user.roles) &&
  input.user.roles.length > 0
) {
  const hint = [...input.user.roles].sort().join(',');
  const actual = [...roleNames].sort().join(',');
  if (hint !== actual) {
    console.warn(
      `[polycyes] user.roles hint (${input.user.roles}) differs from ` +
      `store response (${roleNames}). The store is authoritative — ` +
      `input.user.roles is a HINT ONLY and ignored for authorization.`
    );
  }
}

// Si roleNames está vacío → DENIED
```

**Decisión de diseño — RESUELTA**: `store.getUserRoles()` es la **única** fuente
de verdad para la asignación de roles. `input.user.roles` es informativo
(logging, pre-validación) pero nunca se usa para la decisión de autorización.
Si el caller ya tiene los roles cacheados (ej: claims JWT), debe implementar un
`CachedPolicyStore` que valide contra el store real periódicamente, no confiar
ciegamente en el input. Ver WARNING #24 en §16.8 — el campo está marcado como
`@deprecated` en el JSDoc y emite warning en dev cuando difiere del store.

### Paso 2: Resolver herencia

```typescript
const resolvedRoles = await resolveRoles(roleNames, store)
// resolveRoles usa store.getRolesByNames(roleNames) para cargar
// todos los roles base + heredados en una sola llamada batch.
```

Algoritmo:

```
función resolveRoles(names, store):
  todos = await store.getRolesByNames(names)   // batch: 1 query para N roles
  resueltos = new Map()
  
  función resolver(name, visitados, cadena):
    si name está en visitados → return
    agregar name a visitados
    
    role = todos.find(r => r.name === name)
    si role es null → return (rol no encontrado, se ignora)
    
    // Resolver padres recursivamente (herencia)
    si role tiene inherits:
      por cada parentName en inherits:
        si parentName está en cadena:
          lanzar CircularRoleHierarchyError(cadena + parentName)
        si cadena.length > 50:
          lanzar HierarchyTooDeepError(cadena)
        resolver(parentName, visitados, cadena + [parentName])
    
    // Agregar role si no estaba ya (los padres van primero por recursión)
    si !resueltos.has(role.name):
      resueltos.set(role.name, role)
  
  por cada name en names:
    resolver(name, new Set(), [name])
  
  retornar Array.from(resueltos.values())
```

**Límite de profundidad**: 50 niveles de herencia máximo. Si se excede, se lanza
`HierarchyTooDeepError`. Esto previene stack overflow en herencias maliciosas o
accidentales.

### Paso 3: Evaluar permisos (con deny rules)

```typescript
let bestAllow: { role: Role; permission: Permission } | null = null;
let bestDeny: { role: Role; permission: Permission } | null = null;

for (const role of resolvedRoles) {
  for (const permission of role.permissions) {
    if (!matchResource(input.resource, permission.resource)) continue
    if (!matchAction(input.action, permission.action)) continue
    if (!matchScope(input, permission.scope ?? "any")) continue

    const ctx = buildEvalContext(input)
    if (!await matchConditions(ctx, permission)) continue

    // Trackear el mejor match según effect
    if (permission.effect === 'deny') {
      bestDeny = { role, permission }
      break  // short-circuit deny DENTRO del MISMO rol: un deny de este rol
             // es definitivo. Continuar con el siguiente rol (puede haber
             // un allow en otro rol que compita, pero el deny gana al final).
             // Ver §6.1.1 y §16.8 WARNING #22.
    } else {
      if (!bestAllow) bestAllow = { role, permission }
      // seguir iterando: puede haber deny más adelante de otro rol
    }
  }
}

// Precedencia: deny gana sobre allow
if (bestDeny) {
  return {
    allowed: false,
    reason: `denied: explicit deny by role '${bestDeny.role.name}'`,
    deniedBy: { type: 'explicit-deny', detail: `permission ${bestDeny.permission.resource}:${bestDeny.permission.action}` },
    evaluatedAt: new Date(),
  }
}

if (bestAllow) {
  return {
    allowed: true,
    reason: `granted by role '${bestAllow.role.name}'`,
    matchedRole: bestAllow.role.name,
    matchedPermission: {
      resource: bestAllow.permission.resource,
      action: bestAllow.permission.action,
      effect: 'allow',
    },
    evaluatedAt: new Date(),
  }
}
```

### Paso 3b: Evaluación de condiciones (con try/catch)

```typescript
async function matchConditions(ctx: EvalContext, permission: Permission): Promise<boolean> {
  // Short-circuit: no condition (undefined) = siempre pasa.
  // Este es el caso COMÚN de RBAC básico sin ABAC: perm("post", "read")
  // NO debe lanzar error. La ausencia de condición es el comportamiento esperado.
  if (permission.condition === undefined) return true;

  const conditions = Array.isArray(permission.condition)
    ? permission.condition
    : [permission.condition];

  // Misconfiguration: array explícitamente vacío con conditionMode.
  // [].every(...) retorna `true` (silent open-access), por eso fallamos ruidoso.
  // Distinguir claramente este caso del anterior (undefined = ok, [] = error).
  if (conditions.length === 0) {
    throw new EmptyConditionArrayError(permission);
  }

  const mode = permission.conditionMode ?? 'all';

  try {
    const evaluated = await Promise.all(conditions.map(async (c) => {
      const TIMEOUT_MS = ctx.timeoutMs ?? 1000;
      const result = await Promise.race([
        Promise.resolve(c(ctx)),
        new Promise((_, reject) =>
          setTimeout(() => reject(new ConditionTimeoutError(permission, TIMEOUT_MS)), TIMEOUT_MS)
        ),
      ]);
      if (typeof result !== 'boolean') {
        throw new ConditionEvaluationError(permission, new TypeError(
          `Condition returned ${typeof result}, expected boolean`
        ));
      }
      return result;
    }));
    return mode === 'all' ? evaluated.every(Boolean) : evaluated.some(Boolean);
  } catch (err) {
    if (err instanceof ConditionTimeoutError) throw err;
    if (err instanceof EmptyConditionArrayError) throw err;
    throw new ConditionEvaluationError(permission, err);
  }
}
```

**Notas críticas de implementación**:

- `await Promise.all(...)` es **obligatorio**. Sin él, `conditions.every(c => c(ctx))`
  recibe una `Promise` (truthy) y devuelve `true` aunque la condición retorne
  `false`. Esta fue la vulnerabilidad **CRITICAL #1** descubierta en la tercera
  ronda de revisión (ver §16.8).
- `typeof result !== 'boolean'` rechaza cualquier retorno que no sea booleano
  (`undefined`, `null`, `0`, `"false"`, objetos, etc.) — fail-closed.
- `Promise.race` con `setTimeout` impone un timeout configurable. El valor
  proviene de `ctx.timeoutMs`, que es populado por `buildEvalContext` (§6.3.1)
  desde `EngineOptions.timeoutMs` (default 1000ms si no se setea — ver §7.1,
  RF-34). Una condición que nunca resuelve (`() => new Promise(() => {})`) es
  tratada como `false` con `ConditionTimeoutError` — previene DoS (ver §6.3,
  WARNING #6).
- `EmptyConditionArrayError` previene el bug **CRITICAL #2**: un array vacío
  retornaba `true` por `Array.prototype.every` sobre `[]`, lo que concedía
  acceso silencioso. Ahora falla ruidosamente.
- `matchedRole` corresponde al **primer rol iterado** cuyo allow matchea.
  Como ahora todas las condiciones se evalúan con `await Promise.all` antes de
  decidir, ya no es válido cortar al primer allow — hay que evaluar las
  condiciones de todos los permisos del rol para encontrar el mejor allow.

### 8.1 Permission Index — Matching O(1)

El algoritmo de §8 Paso 3 itera `resolvedRoles × permissions` en O(n × m).
Para un admin con herencia (10 roles, 500 permisos c/u), eso son 5000
iteraciones por `check()`. El **permission index** reduce esto a O(1):

```typescript
// Pre-computado UNA vez por buildEvalContext (o cacheado por Engine):
type PermissionIndex = Map<string, Map<string, Permission[]>>;
//                      recurso        acción       permisos

function buildPermissionIndex(roles: Role[]): PermissionIndex {
  const index: PermissionIndex = new Map();
  for (const role of roles) {
    for (const perm of role.permissions) {
      if (!index.has(perm.resource)) index.set(perm.resource, new Map());
      const actionMap = index.get(perm.resource)!;
      if (!actionMap.has(perm.action)) actionMap.set(perm.action, []);
      actionMap.get(perm.action)!.push(perm);

      // Wildcard expansion: "post:*" se indexa como action "*" para "post"
      if (perm.action === '*') {
        // Indexar como catch-all para este resource
        if (!actionMap.has('*')) actionMap.set('*', []);
        actionMap.get('*')!.push(perm);
      }
    }
  }
  return index;
}

// En check(), después de resolver roles:
const index = buildPermissionIndex(resolvedRoles);
const actionMap = index.get(input.resource);
// Si no hay match exacto, buscar wildcard "*"
const perms = actionMap?.get(input.action) ?? index.get('*')?.get(input.action) ?? [];

// Luego evaluar scope + condition solo sobre perms candidatos
for (const perm of perms) {
  if (!matchScope(input, perm.scope ?? 'any')) continue;
  if (!await matchConditions(ctx, perm)) continue;
  // ... trackear bestAllow / bestDeny
}
```

**Wildcard matching**:
- `resource: "post"` → busca `index.get("post")` primero, fallback a `index.get("*")`
- `action: "edit"` → busca `actionMap.get("edit")` primero, fallback a `actionMap.get("*")`
- `resource: "*"` → se indexa como clave `"*"` en el index — todos los checks
  tienen fallback a `"*"`
- Namespace wildcards (`"post:*"`, `"*.read"`) → se manejan con regex/generación
  de claves en el index (para v0.1, soporte completo de namespace en el index)

**Costo del index**: O(total_perms) para construirlo, O(1) por lookup.
Para el `InMemoryPolicyStore`, el index se construye cada vez que se resuelven
roles (no se cachea entre checks porque los roles pueden cambiar en el store).
Para stores externos con caché, el index se cachea junto con los roles.

**Cuándo NO usar index**:
- Menos de 50 permisos totales (overhead del Map > iteración lineal)
- Implementación: el Engine puede detectar umbral y elegir entre index y
  scan lineal automáticamente (auto-tuning).

### 8.2 `checkMany()` — Semántica de evaluación batch

`checkMany(inputs)` evalua N permisos en una sola llamada, optimizando el
caso de listados ("mostrar 100 posts que el usuario puede editar").

```typescript
async function checkMany(inputs: CheckInput[]): Promise<CheckResult[]> {
  // 1. Agrupar por userId para minimizar consultas al store
  const byUser = groupBy(inputs, (i) => i.user.id);

  // 2. CPU-bound caching local: getUserRoles() + resolveRoles() se llama
  //    UNA vez por usuario distinto, no por input
  const roleCache = new Map<string, { roles: string[]; resolved: Role[] }>();

  const results: CheckResult[] = [];
  for (const input of inputs) {
    const userId = input.user.id;
    if (!roleCache.has(userId)) {
      const roleNames = await store.getUserRoles(userId);
      const resolved = await resolveRoles(roleNames, store);
      roleCache.set(userId, { roles: roleNames, resolved });
    }
    const cache = roleCache.get(userId)!;

    // 2. Reemplazar input.user.roles con cache del store
    const safeInput = { ...input, user: { ...input.user, roles: cache.roles } };

    // 3. Evaluar individualmente (reusa el mismo index si los roles no cambian)
    results.push(await check(safeInput));
  }

  return results;
}
```

**Consistencia**: `checkMany()` garantiza consistencia **por-input** (cada
`CheckResult` refleja el estado del store en el momento de `getUserRoles()`).
No garantiza consistencia transaccional entre inputs — si entre el input #1
y el input #50 los roles del usuario cambian, los resultados pueden diferir.
Para consistencia transaccional, el caller debe pasar inputs del mismo usuario
en grupos o usar un snapshot del store.

**Semántica de fallo**: Si un input falla (condición lanza, store error),
los demás inputs NO se ven afectados — el error se propaga en ese
`CheckResult` individual. `checkMany()` nunca lanza como conjunto; cada
resultado es independiente. Esto es intencional: en un listado de 100
recursos, no querés que un permiso roto arruine los otros 99.

**Cache compartido**: El cache de `getUserRoles()` y `resolveRoles()` vive
SOLO dentro de la llamada a `checkMany()`. No persiste entre llamadas.
Para caché entre requests, usar `CachedPolicyStore`.

**Paralelismo**: La iteración sobre inputs es **secuencial** (no
`Promise.all`). Razón: (a) evita contención en stores compartidos, (b) el
cache por usuario funciona mejor secuencialmente, (c) para 100 inputs del
mismo usuario, el store se consulta 1 vez igual. Si el caller necesita
paralelismo entre usuarios, debe llamar `Promise.all([engine.check(a), engine.check(b)])`.

### Paso 4: Construir razón de denegación

El `deniedBy` en `CheckResult` es estructurado para que los callers puedan
manejar cada caso programáticamente (no solo con regex sobre `reason`):

```typescript
type DeniedBy = 
  | { type: 'no-roles';       detail: string }   // usuario sin roles
  | { type: 'no-match';       detail: string }   // ningún permiso matcheó resource+action
  | { type: 'scope-failed';   detail: string }   // scope no se cumplió
  | { type: 'condition-failed'; detail: string } // condición ABAC falló
  | { type: 'explicit-deny';  detail: string }   // deny rule matcheó
```

Ejemplos de `reason`:
- `"denied: user 'usr_1' has no roles"` → `deniedBy.type = 'no-roles'`
- `"denied: no matching permission for resource 'post' action 'delete'"` → `'no-match'`
- `"denied: scope 'own' requires resource.ownerId to match user.id"` → `'scope-failed'`
- `"denied: ABAC condition not met for role 'editor'"` → `'condition-failed'`
- `"denied: explicit deny by role 'moderator'"` → `'explicit-deny'`

---

## 9. Puntos de Extensión

### 9.1 Adapters de framework

Un adapter es una **capa delgada** que conecta polycyes con un framework web. El
contrato base es mínimo:

```typescript
// El adapter NO dicta cómo responder con 403 — eso lo hace el framework.
// El adapter solo construye CheckInput desde el contexto del framework.
interface AuthzInputMapper<TContext = unknown> {
  toCheckInput(context: TContext): CheckInput;
}
```

**Patrón de uso concreto**:

```typescript
// Express: el mapper extrae del req
class ExpressAuthzMapper implements AuthzInputMapper<Request> {
  toCheckInput(req: Request): CheckInput {
    return {
      user: req.user!,                          // de auth middleware
      resource: req.params.resource ?? 'unknown',
      action: req.method.toLowerCase(),         // GET→read, POST→create, etc.
      resourceInstance: req.params.id ? { id: req.params.id } : undefined,
    };
  }
}

// El middleware de Express es trivial:
function authz(engine: Engine, mapper: ExpressAuthzMapper) {
  return async (req, res, next) => {
    const input = mapper.toCheckInput(req);
    const result = await engine.check(input);
    if (!result.allowed) return res.status(403).json({ error: result.reason });
    next();
  };
}
```

**Adaptadores planeados**:

| Framework | Mecanismo |
|-----------|-----------|
| Express | Middleware con `AuthzInputMapper<Request>` |
| NestJS | `Guard` + `@SetMetadata('permission', {resource,action})` |
| Fastify | `onRequest` hook con `AuthzInputMapper<FastifyRequest>` |
| Next.js App Router | `middleware.ts` con `AuthzInputMapper<NextRequest>` |
| Hono | Middleware con `AuthzInputMapper<Context>` |
| Remix | `loader`/`action` con server-side check |

#### 9.1.1 Defense-in-depth: Validaciones engine-side

El store es la **fuente de verdad** para roles, pero el engine **no confía
ciegamente** en el adapter. Aunque §13.5 establece que el adapter es
responsable de obtener `ownerId` de DB (no de `req.body`), el engine realiza
**validaciones defensivas** sobre el `CheckInput` para prevenir vulnerabilidades
si el adapter está mal implementado (ver WARNING #8 en §16.8).

```typescript
// Dentro de buildEvalContext() — PRIMER paso, antes de cualquier otra cosa:
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

function stripDangerousKeys<T extends Record<string, unknown>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of DANGEROUS_KEYS) {
    delete (obj as Record<string, unknown>)[key];
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') stripDangerousKeys(value as Record<string, unknown>);
  }
  return obj;
}

function sanitizeInput(input: CheckInput): CheckInput {
  return {
    ...input,
    user: {
      ...input.user,
      attributes: stripDangerousKeys({ ...(input.user.attributes ?? {}) }) as User['attributes'],
    },
    resourceInstance: input.resourceInstance
      ? {
          ...input.resourceInstance,
          // ownerId también se sanitiza — un ownerId con keys raras es señal de tampering
          attributes: stripDangerousKeys({ ...(input.resourceInstance.attributes ?? {}) }) as Record<string, unknown>,
        }
      : undefined,
    metadata: stripDangerousKeys({ ...(input.metadata ?? {}) }) as Record<string, unknown>,
  };
}
```

**Qué valida el engine** (incluso si el adapter está correcto):

- `resourceInstance.id` no contiene keys de prototype pollution
- `user.attributes` no contiene `__proto__`, `constructor`, `prototype` (ni en
  sub-objetos anidados)
- `metadata` se sanitiza recursivamente

**Qué NO valida el engine** (responsabilidad del adapter):

- Que `ownerId` venga de DB y no de `req.body` — esto es lógica de aplicación.
- Que `user.id` exista en el sistema de auth — el adapter debe garantizarlo.

Esto convierte las recomendaciones de §13.5 en **defense-in-depth**: el adapter
debe hacerlo correctamente, pero si no lo hace, el engine tiene red de seguridad.

### 9.2 Stores custom

Cualquiera puede implementar `PolicyStore` para su backend:

```typescript
class PostgresPolicyStore implements PolicyStore {
  async getRoles(): Promise<Role[]> {
    const rows = await db.query('SELECT * FROM roles');
    return rows.map(row => ({
      name: row.name,
      permissions: JSON.parse(row.permissions),
      inherits: row.inherits,
    }));
  }
  // ... otros métodos
}
```

### 9.3 Estrategias de caché

El engine puede wrap-parsear cualquier store con caché:

```typescript
class CachedPolicyStore implements PolicyStore {
  constructor(
    private inner: PolicyStore,
    private cache: Map<string, Role> = new Map(),
  ) {}
  // delegar con caché
}
```

#### 9.3.1 Role Auditing (`auditRole`)

`auditRole()` es un **static analysis pass** que se ejecuta al construir políticas.
Detecta configuraciones peligrosas antes de que lleguen a producción, en vez de
dejar que un `perm("*", "*")` silenciosamente conceda god-mode (ver WARNING #10
en §16.8). Promovido a v0.1 como **RF-36**.

```typescript
// En InMemoryPolicyStore.addRole() — se ejecuta automáticamente:
auditRole(role: Role): AuditWarning[] {
  const warnings: AuditWarning[] = [];

  for (const permission of role.permissions) {
    // Detección de god-mode: perm("*", "*") sin condición restrictiva
    if (
      permission.resource === '*' &&
      permission.action === '*' &&
      !permission.condition
    ) {
      warnings.push({
        severity: 'high',
        code: 'WILDCARD_GOD_MODE',
        message: `Role '${role.name}' grants perm("*", "*") with no condition. This is a god-mode permission.`,
        role: role.name,
        permission,
      });
    }

    // Detección de herencia sospechosa: rol low-trust heredando de high-trust
    // (configurable: lista de roles low-trust hardcodeada en la policy)
    if (role.inherits?.includes('admin') && !role.permissions.length) {
      warnings.push({
        severity: 'medium',
        code: 'EMPTY_ROLE_INHERITS_HIGH_TRUST',
        message: `Role '${role.name}' has no direct permissions but inherits from 'admin'. Consider explicit allowlist.`,
        role: role.name,
        permission,
      });
    }
  }

  return warnings;
}

// El store emite warnings via console.warn por defecto:
interface AuditWarning {
  severity: 'low' | 'medium' | 'high';
  code: string;
  message: string;
  role: string;
  permission: Permission;
}
```

**Configuración** (en el constructor del `InMemoryPolicyStore`):

```typescript
new InMemoryPolicyStore({
  onAuditWarning: (warnings) => {
    warnings.forEach((w) => logger.warn({ audit: w }));
  },
  strictMode: true,    // true (default): throw si hay warnings 'high'
                        // false: solo loguea
});
```

En `strictMode: true` (default), cualquier warning de severidad `'high'`
(p. ej. `WILDCARD_GOD_MODE`) hace que `addRole()` lance `UnsafeRoleError`.
Esto previene el despliegue accidental de políticas god-mode en producción.

### 9.4 Eventos / Hooks (futuro)

Para logging, métricas, o webhooks:

```typescript
engine.on('check', (result, input) => {
  logger.info({ result, userId: input.user.id });
});
```

---

## 10. Casos de Uso Completos

### 10.1 Blog — RBAC básico

```typescript
// Definir roles
await store.addRole(role('viewer', {
  permissions: [perm('post', 'read')],
}));

await store.addRole(role('editor', {
  permissions: [
    perm('post', 'create'),
    perm('post', 'edit', { scope: 'own' }),
  ],
  inherits: ['viewer'],
}));

await store.addRole(role('admin', {
  permissions: [perm('post', '*', { scope: 'any' })],
  inherits: ['editor'],
}));

// Asignar
await store.setUserRoles('usr_1', ['editor']);
await store.setUserRoles('usr_2', ['admin']);

// Evaluar
await engine.check({
  user: { id: 'usr_1', roles: ['editor'] },
  resource: 'post',
  action: 'edit',
  resourceInstance: { id: 'post_1', ownerId: 'usr_1' },
});
// → { allowed: true, reason: "granted by role 'editor'" }

await engine.check({
  user: { id: 'usr_1', roles: ['editor'] },
  resource: 'post',
  action: 'delete',
});
// → { allowed: false, reason: "denied: ..." }
```

### 10.2 SaaS multi-tenant — ABAC

```typescript
const tenantAdmin = role('tenant-admin', {
  permissions: [
    perm('project', 'create'),
    perm('project', 'edit', {
      condition: (ctx) =>
        ctx.resourceAttributes?.tenantId === ctx.userAttributes?.tenantId,
    }),
    perm('project', 'delete', {
      condition: (ctx) =>
        ctx.resourceAttributes?.tenantId === ctx.userAttributes?.tenantId,
    }),
    perm('billing', 'read', { scope: 'none' }),
  ],
});

await engine.check({
  user: {
    id: 'usr_1',
    roles: ['tenant-admin'],
    attributes: { tenantId: 't_42' },
  },
  resource: 'project',
  action: 'edit',
  resourceInstance: {
    id: 'proj_7',
    attributes: { tenantId: 't_42' },
  },
});
// → { allowed: true, reason: "granted by role 'tenant-admin'" }
```

---

## 11. Roadmap

### v0.1 — MVP
- [x] Definir modelo de datos (`types.ts`)
- [x] Helpers (`perm()`, `role()`, `user()`)
- [x] `InMemoryPolicyStore` (implementa `PolicyReader` + `PolicyWriter`)
- [ ] `Engine.check()`: RBAC básico + scope + herencia + wildcards + deny rules
- [ ] `Engine.checkMany()`: evaluación batch con cache de roles por usuario (§8.2)
- [ ] `Engine.debug()`: debug trace con cada paso de la evaluación
- [ ] `Engine.filter()`: filtrado de colecciones por permiso (row-level security)
- [ ] Scopes custom (funciones)
- [ ] Wildcards con namespaces (`"post:*"`, `"*.read"`)
- [ ] Composición de condiciones AND/OR (`condition: Condition[]` + `conditionMode`)
- [ ] Errores tipados: `ConditionEvaluationError`, `DuplicateRoleError`, `HierarchyTooDeepError`, `EmptyConditionArrayError`, `ConditionTimeoutError`, `StoreUnavailableError`, `UnsafeRoleError`, `InvalidEngineOptionError`
- [ ] `auditRole()` en `InMemoryPolicyStore.addRole()` — detecta god-mode wildcards y herencia sospechosa (RF-36)
- [ ] Per-condition timeout con `Promise.race` y default 1000ms (RF-34)
- [ ] Fail-closed en `store.getUserRoles()` con `StoreUnavailableError` y opt-in `failOpen: true` en `EngineOptions` (RF-35)
- [ ] `CheckResult` estructurado (`matchedRole`, `matchedPermission`, `deniedBy`)
- [ ] Input validation (non-empty strings, prototype pollution protection)
- [ ] EvalContext frozen antes de pasar a condiciones (immutability)
- [ ] EvalContext construido UNA vez por `check()` (no por permiso)
- [ ] **Permission index para matching O(1) (§8.1)** — pre-indexar permisos por resource+action
- [ ] **`checkMany` con cache de roles por usuario (§8.2)** — getUserRoles() 1 vez por userId
- [ ] **Cumplir performance budget (§7.1.1)** — validar targets en CI
- [ ] Tests pasando (RBAC, deny rules, scope, herencia, condiciones, wildcards, ciclos)
- [ ] Tests de seguridad (async condition exploit, condition throws, empty ownerId)
- [ ] **Property-based testing con fast-check + invariantes (§13.6)**
- [ ] `"sideEffects": false` + subpath exports en `package.json`
- [ ] Publicar package en npm

### v0.2 — Adaptadores + Stores
- [ ] Adapter Express (`AuthzInputMapper<Request>`)
- [ ] Adapter NestJS (Guard + decorator)
- [ ] `CachedPolicyStore` wrapper (TTL, invalidación)
- [ ] Store SQLite (condiciones como funciones en dev, serializables en prod)
- [ ] Documentación de cada adapter con ejemplos
- [ ] Benchmark suite inicial (100/1k roles)

### v0.3 — Funcionalidad avanzada
- [ ] Condiciones serializables (`{ field, operator, value }`)
- [ ] Resource hierarchies con path-based matching (`"org:*:project"`)
- [ ] Role activation conditions
- [ ] Administración delegada (`setUserRoles` con `resourceScope`)
- [ ] Store PostgreSQL

### v0.4 — Madurez
- [ ] Benchmark suite exhaustiva (10k roles, edge runtime)
- [ ] Auto-tuning: permission index vs scan según umbral de permisos
- [ ] Serialización JSON/YAML de políticas
- [ ] Plugin system para hooks (logging, métricas, audit trail)
- [ ] Field-level permissions

### v1.0 — Producción
- [ ] 100% test coverage
- [ ] Performance budget validado en CI (§7.1.1 targets cumplidos)
- [ ] Cold start < 500μs en edge runtime
- [ ] Documentación completa con ejemplos reales
- [ ] CI/CD con GitHub Actions
- [ ] Edge runtime certification (Cloudflare Workers, Vercel Edge)

---

## 12. Decisiones Técnicas

### 12.1 ¿Por qué resource y action separados y no "post.edit"?

**Decisión**: `{ resource: "post", action: "edit" }` en vez de `"post.edit"`.

**Razón**: El matching con wildcards es más limpio. `"post.*"` vs `"post.edit"`
es más expresivo que parsear strings. Además, separar resource de action permite
que las condiciones ABAC accedan a cada uno individualmente sin hacer split de
strings.

### 12.2 ¿Por qué condiciones como funciones y no strings evaluados?

**Decisión**: `(ctx: EvalContext) => boolean` en vez de `"department == 'engineering'"`.

**Razón**: Type safety, autocompletado, y cero parsing. Las condiciones como
strings requieren un evaluador de expresiones (como el de Casbin) que es código
extra, frágil, y limitado. Con funciones tenés TypeScript completo.

**Tradeoff**: No podés serializar políticas con condiciones a JSON. Para la v0.1
esto está bien. En el futuro se puede agregar un sistema de condiciones
serializables (ej: objetos `{ field: "department", op: "eq", value: "engineering" }`).

### 12.3 ¿Por qué single package y no monorepo?

**Decisión**: Un solo package para la v0.1.

**Razón**: Hasta que no haya al menos un adapter, no tiene sentido la
complejidad de un monorepo con workspaces. Cuando exista `adapter-express`, se
evalúa si mover a monorepo.

### 12.4 ¿Por qué `structuredClone` en el store?

**Decisión**: `InMemoryPolicyStore` usa `structuredClone` al guardar roles.

**Razón**: Evitar mutaciones accidentales de las políticas desde afuera del
store. Si alguien modifica el objeto rol después de guardarlo, el store no se
ve afectado.

### 12.5 ¿Por qué deny > allow? (precedencia de efectos)

**Decisión**: `effect: 'deny'` tiene precedencia sobre `effect: 'allow'`. Si hay
al menos un deny que matchea, el resultado es DENIED.

**Razón**: Es el estándar de la industria (AWS IAM, Casbin, Oso, Kubernetes
RBAC). Sin deny rules, modelar "todos pueden X excepto Y" requiere condiciones
ABAC repetitivas y frágiles en cada permiso. Con deny, se expresa en una línea.

**Tradeoff**: Agrega complejidad al algoritmo de evaluación (hay que trackear
deny matches separados de allow matches). Pero el short-circuit en deny
(encontrado un deny → parar) mitiga el costo.

### 12.6 ¿Por qué scopes como funciones en vez de enum cerrado?

**Decisión**: `PermissionScope = 'any' | 'own' | 'none' | ScopeFunction` donde
`ScopeFunction = (ctx: EvalContext) => boolean`.

**Razón**: Los tres scopes hardcodeados no cubren ni el 30% de los casos reales.
Team, tenant, org, department, assigned — cada app tiene sus propios conceptos
de ownership. Darle al usuario la capacidad de definir sus propios scopes como
funciones tipadas es más poderoso que intentar predecir todos los scopes posibles.

**Tradeoff**: Los scopes custom no son serializables (mismo problema que las
condiciones). Para v0.1, esto es aceptable. En v0.2+, se puede agregar
`SerializableScope`.

### 12.7 ¿Por qué separar `PolicyReader` de `PolicyWriter`?

**Decisión**: El `Engine` recibe `PolicyReader` (solo lectura), no
`PolicyStore` completo.

**Razón**: Interface Segregation Principle. El engine NUNCA escribe. Darle
métodos de escritura es:
1. Confuso (¿el engine modifica el store?)
2. Inseguro (si alguien extiende el engine, tiene acceso a mutar políticas)
3. Innecesario (el engine solo consulta)

Además, permitir implementaciones separadas permite optimizar reader y writer
independientemente (ej: reader con réplicas read-only de PostgreSQL, writer
contra el primary).

### 12.8 ¿Por qué conditions pueden ser async?

**Decisión**: `Condition = (ctx: EvalContext) => boolean | Promise<boolean>`.

**Razón**: Casos reales de ABAC frecuentemente necesitan consultar servicios
externos (API de compliance, base de datos de bloqueos, servicio de fraud
detection). Obligar a que las condiciones sean síncronas fuerza al usuario a
hacer hacks como pre-cargar datos o usar variables globales.

**Tradeoff**: Un `await` por condición evaluada. Pero como las condiciones solo
se evalúan cuando resource+action+scope ya matchearon, el overhead es mínimo.

---

## 13. Security Considerations

polycyes es un sistema de autorización — la seguridad es su razón de ser. Esta
sección documenta el threat model, trust boundaries, y mitigaciones implementadas.

### 13.1 Threat Model

| Vector | Clase | Explotación | Mitigación |
|--------|-------|-------------|------------|
| **Role Injection** | Privilege escalation | Caller forja `user.roles: ["admin"]` | ✅ Store es única fuente de verdad (§8, Paso 1) |
| **Cycle Detection Bypass** | Misconfig exploitation | A→B→C→A aceptado silenciosamente | ✅ `CircularRoleHierarchyError` con cadena completa |
| **Async Condition Exploit** | Auth bypass | `async () => false` retorna Promise (truthy) | ✅ `await Promise.all()` + validación `typeof === 'boolean'` en `matchConditions` (§8 Step 3b) |
| **Empty Condition Array** | Silent open-access | `permission.condition = []` (array explícitamente vacío) con `conditionMode: 'all'` → `[].every()` → `true` | ✅ `EmptyConditionArrayError` — fail-loud en config bugs (§6.3, §8 Paso 3b). **NO confundir** con `permission.condition = undefined` (no-condition case) que es el caso COMÚN de RBAC básico y short-circuita a `true` sin error. |
| **Missing Condition (undefined)** | No aplica (es el happy path) | `permission.condition = undefined` — campo ausente en el permiso | ✅ Short-circuit a `true` en `matchConditions` (§8 Paso 3b) — RBAC básico sin ABAC siempre pasa. No es una vulnerabilidad, es el comportamiento esperado. |
| **Condition DoS (Timeout)** | Denial of service | Condición `() => new Promise(() => {})` cuelga `check()` | ✅ Configurable via `EngineOptions.timeoutMs` (default 1000ms, propagado a `EvalContext.timeoutMs` en `buildEvalContext`); fail-closed on timeout (`ConditionTimeoutError`) — ver RF-34, §7.1, §6.3.1, §8 Paso 3b |
| **Condition Exception DoS** | Denial of service | Condición lanza excepción, engine crashea | ✅ try/catch → `ConditionEvaluationError` → fail-closed |
| **Condition Side Effects** | Data tampering | Condición muta `ctx.user` mid-evaluation | ✅ `EvalContext` **deep-frozen** (recursive `Object.freeze` sobre `user`, `user.attributes`, `resourceInstance`, `resourceInstance.attributes`, `metadata`) — ver §6.3.1 |
| **TOCTOU Race** | Stale authorization | Rol eliminado entre `getUserRoles()` y evaluación | ⚠️ Responsabilidad del store (documentar) |
| **Reason Information Leak** | Reconnaissance | 403 responses revelan estructura de roles | ⚠️ Adapters deben sanitizar (dev vs prod) |
| **Forged ownerId** | Scope bypass | Adapter acepta `req.body.ownerId` del cliente | ✅ Engine rechaza prototype pollution en `ownerId` via `sanitizeInput` (§9.1.1); **adapter es responsable** de obtener `ownerId` de DB, nunca de `req.body` |
| **Prototype Pollution** | Code execution | `__proto__` keys en `metadata`/`attributes` | ✅ `sanitizeInput()` en `buildEvalContext` (§9.1.1) — strip recursivo de `__proto__`, `constructor`, `prototype` |
| **Wildcard Proliferation** | Privilege escalation via misconfig | Guest hereda `perm("*", "*")` accidentalmente | ✅ `auditRole()` ejecuta en `addRole()` y emite warning por `perm("*", "*")` o herencia de `*` desde rol low-trust. Opt-out via `strictMode: false` (RF-36, §9.3.1) |
| **Store Failure (Silent Grant)** | Privilege escalation | Store lanza excepción, adapter devuelve `[]`, engine concede `no-roles` deny — pero store caído = fail-open en la práctica | ✅ Engine es fail-closed por contrato: `StoreUnavailableError` en error del store, no swallow (RF-35, §8 Paso 1) |
| **Store Failure (Fail-Open)** | Privilege escalation via misconfig | Operador activa `failOpen: true` en `EngineOptions` sin entender el riesgo → outage del store concede acceso total | ⚠️ Default es fail-closed. `failOpen: true` es opt-in peligroso (RF-35, §7.1, §8 Paso 1); requiere justificación explícita y el `CheckResult.reason` lleva un warning visible |

### 13.2 Trust Boundaries

```
┌─────────────────────────────────────────────────────────┐
│ UNTRUSTED: Client HTTP Request                          │
│   req.body, req.params, req.headers                     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ TRUSTED: Adapter Layer                                  │
│   - Extrae user de auth middleware (JWT verified)       │
│   - Extrae resource/action de route params              │
│   - ownerId DEBE venir de DB query, NUNCA de req.body   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ TRUSTED: Engine                                         │
│   - Roles SIEMPRE del store, NUNCA de input.user.roles  │
│   - EvalContext frozen antes de pasar a condiciones     │
│   - Conditions wrapped en try/catch                     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ TRUSTED: PolicyStore                                    │
│   - Fuente de verdad de roles y asignaciones            │
│   - Responsable de atomicidad en lecturas               │
│   - structuredClone al guardar/retornar roles           │
└─────────────────────────────────────────────────────────┘
```

### 13.3 Input Validation

El engine valida TODO input antes de procesar:

```typescript
// En buildEvalContext o al inicio de check():
if (!input.user?.id || typeof input.user.id !== 'string') {
  throw new InvalidInputError('user.id is required and must be a non-empty string');
}
if (!input.resource || typeof input.resource !== 'string') {
  throw new InvalidInputError('resource is required and must be a non-empty string');
}
if (!input.action || typeof input.action !== 'string') {
  throw new InvalidInputError('action is required and must be a non-empty string');
}

// Strip prototype pollution keys
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
for (const key of DANGEROUS_KEYS) {
  delete input.metadata?.[key];
  delete input.user.attributes?.[key];
  delete input.resourceInstance?.attributes?.[key];
}
```

### 13.4 Reason Sanitization

El `reason` en `CheckResult` es invaluable para debugging pero peligroso en
producción. Los adapters DEBEN configurar el nivel de detalle:

```typescript
// Desarrollo: reason completo
{ allowed: false, reason: "denied: scope 'own' requires resource.ownerId to match user.id for role 'editor'" }

// Producción: reason genérico
{ allowed: false, reason: "forbidden" }

// Logs server-side: SIEMPRE reason completo
logger.warn({ userId: input.user.id, result });
```

### 13.5 Security Recommendations para Adapters

1. **NUNCA confiar en `req.body.ownerId`** — siempre obtener de DB query.
   El engine sanitiza prototype pollution en `ownerId` como **defense-in-depth**
   (§9.1.1), pero la responsabilidad primaria es del adapter.
2. **NUNCA pasar `reason` completo al cliente en producción** — usar mensaje genérico
3. **SIEMPRE loguear `CheckResult` completo server-side** — para auditoría
4. **Validar que `user` viene de auth middleware verificado** — no de headers custom
5. **Sanitizar `metadata` antes de pasar al engine** — strip `__proto__`, `constructor`
   (aunque el engine lo hace en `sanitizeInput()` como defense-in-depth, no
   confíes en eso como única línea de defensa)

**Adapter es responsable de la fuente** (DB query, no `req.body`), pero **el
engine valida que el input no contenga prototype pollution** como
defense-in-depth. Ver §9.1.1 y WARNING #8 en §16.8.

### 13.6 Property-Based Test Invariants

Para garantizar **precisión**, los tests de propiedad verifican invariantes
que deben cumplirse para TODA combinación de inputs válidos:

| Invariante | Falsifica | Cómo se prueba |
|-----------|-----------|----------------|
| **No hay decisión sin razón** | `CheckResult.reason` es `""` o está ausente | `fast-check` genera arrays de roles+permisos, verifica `reason.length > 0` siempre |
| **Fail-closed por defecto** | Store que lanza produce `allowed: true` | `store.getUserRoles()` mockeado para lanzar siempre → `StoreUnavailableError`, no `{ allowed: true }` |
| **Fail-open es explícito** | `failOpen: false` (default) produce `allowed: true` en error de store | Misma condición, verificar que `failOpen: false` nunca produce grant |
| **Deny > Allow siempre** | Deny y allow matching → `allowed: true` | Generar rol con deny+allow que matcheen → siempre `allowed: false` |
| **Herencia transitiva** | A ← B ← C: C tiene permisos de A pero engine deniega | Generar 3 niveles de herencia, verificar permiso del abuelo disponible |
| **Ciclo detectado** | A→B→C→A no lanza `CircularRoleHierarchyError` | `fast-check` genera DAGs con aristas aleatorias hasta detectar ciclo |
| **Sin side effects** | Condición muta `EvalContext` y altera segunda evaluación | Ejecutar misma condición 2× con `Object.is()` sobre ctx original vs post-evaluación |
| **Timeout fail-closed** | Condición que nunca resuelve → `ConditionEvaluationError`, no `undefined` | `() => new Promise(() => {})` con timeoutMs=10 → `ConditionTimeoutError` |
| **`checkMany` independencia** | Error en input #5 afecta resultado de input #1 | 100 inputs, uno con condición que lanza → solo ese result es error, otros intactos |
| **`checkMany` cache correcto** | getUserRoles() llamado N veces para N inputs del mismo usuario | Spy sobre store, verificar 1 sola llamada por userId en checkMany |
| **Input vacío falla rápido** | `user: { id: "" }` no lanza `InvalidInputError` | `fast-check` genera strings vacíos, null, undefined → verifican error antes de tocar store |
| **Scope `own` sin ownerId** | `scope: 'own'` sin resourceInstance → `allowed: true` | `scope: 'own'` con `resourceInstance: undefined` → scope no matchea |
| **Condition no booleana falla** | Condición retorna `"false"` (string) → pasa como falsy | `fast-check` genera strings, numbers, objects como retorno → `ConditionEvaluationError` |
| **Permission index vs scan lineal** | Index y scan dan resultados diferentes para mismo input | Ejecutar `check()` con index ON vs OFF → mismo `CheckResult.allowed` para todo input posible |

**Propiedades para `fast-check`**:

```typescript
import fc from 'fast-check';

// Generador de permiso válido (no vacío, no malformado)
const validPermission = fc.record({
  resource: fc.string({ minLength: 1, maxLength: 20 }),
  action: fc.string({ minLength: 1, maxLength: 20 }),
  scope: fc.constantFrom('any', 'own', 'none'),
  effect: fc.constantFrom('allow', 'deny'),
  condition: fc.constant(undefined),  // sin ABAC para tests de RBAC
});

// Propiedad: deny siempre gana sobre allow
fc.assert(
  fc.property(
    fc.array(validPermission, { minLength: 1, maxLength: 20 }),
    (permissions) => {
      const hasDeny = permissions.some(p => p.effect === 'deny');
      // ... setup engine con estos permisos en un rol
      // ... check contra input que matchea todos
      // => result.allowed === false si hay deny
    }
  )
);
```

---

## 14. Glosario

| Término | Definición |
|---------|------------|
| **RBAC** | Role-Based Access Control. Los permisos se asignan a roles, y los roles a usuarios. |
| **ABAC** | Attribute-Based Access Control. Los permisos se evalúan según atributos del usuario, recurso, y contexto. |
| **Scope** | Alcance de un permiso: ¿aplica a cualquier recurso, solo a los propios, o solo a los de tu equipo/tenant? Extensible con funciones custom. |
| **Condition** | Función u objeto declarativo que evalúa el contexto y devuelve true/false. Mecanismo para ABAC. |
| **Effect** | `'allow'` o `'deny'`. Un deny tiene precedencia sobre cualquier allow. |
| **Action** | Verbo que describe qué se hace sobre un recurso (create, read, edit, delete, publish, etc.). |
| **Resource** | Tipo de recurso sobre el que se actúa (post, comment, user, project, etc.). Soporta wildcards con namespace (`"post:*"`). |
| **ResourceInstance** | Instancia concreta de un recurso, con ID, owner, y atributos. |
| **PolicyReader** | Interfaz de solo lectura que el Engine usa. Define `getRole()`, `getRolesByNames()`, `getUserRoles()`. |
| **PolicyWriter** | Interfaz de escritura para administración. Define `addRole()`, `updateRole()`, `deleteRole()`, `setUserRoles()`. |
| **PolicyStore** | Unión de `PolicyReader` + `PolicyWriter`. Para implementaciones que manejan ambas operaciones. |
| **AuthzInputMapper** | Contrato del adapter: traduce el contexto de un framework a `CheckInput`. |
| **Adapter** | Capa delgada que conecta polycyes con un framework web específico mediante `AuthzInputMapper`. |
| **Engine** | Núcleo del sistema. Recibe un `CheckInput`, evalúa políticas, devuelve `CheckResult`. |
| **Wildcard** | `"*"` para cualquier resource/action, `"post:*"` para cualquier sub-recurso bajo `post`, `"*.read"` para lectura de cualquier recurso. |

---

## 15. Preguntas Abiertas (para resolver durante implementación)

1. **`getUserRoles` vs `input.user.roles`**: ✅ RESUELTO. El store es la única
   fuente de verdad. `input.user.roles` es informativo, nunca autoritativo.
   Si el caller tiene roles cacheados (JWT), debe usar `CachedPolicyStore`.

2. **Múltiples matches**: ✅ RESUELTO. Single pass sobre roles y permisos con
   tracking de `bestAllow` y `bestDeny` por separado (§6.1.1, §8 Paso 3).
   `matchedRole` es el **primer rol iterado** cuyo allow matchea — todas las
   condiciones de los permisos del rol se evalúan con `await Promise.all()`
   antes de decidir, por lo que ya no es válido cortar al primer allow
   (condiciones async requieren evaluación completa). Si un `deny` matchea
   en cualquier rol, tiene precedencia y se hace short-circuit **dentro del
   mismo rol** (los denies de otros roles se siguen evaluando para encontrar
   el `bestDeny` más específico). `CheckResult` incluye `matchedRole` y
   `matchedPermission` con el rol/permiso que decidió.

3. **Permisos denegados explícitamente**: ✅ RESUELTO. `effect: 'deny'` desde v0.1.
   Deny gana sobre allow (precedencia). Short-circuit en deny: si se encuentra un
   deny que matchea, se deja de iterar inmediatamente.

4. **Roles sin store**: ✅ RESUELTO. El store es obligatorio. Pero el engine recibe
   `PolicyReader`, que puede ser una implementación inline que devuelva roles
   hardcodeados. Para tests, `InMemoryPolicyStore`. Para prototipos, un mapper
   desde JSON.

### Preguntas abiertas nuevas (post-revisión)

5. **TOCTOU race conditions y fail-open del store**: ✅ RESUELTO. El engine
   es **fail-closed por contrato** (RF-35). Si el store lanza una excepción
   en `getUserRoles()`, el engine **re-lanza** como `StoreUnavailableError` —
   NO devuelve DENIED silencioso (lo que sería equivalente a fail-open en la
   práctica). Para casos avanzados (ej: health checks donde la disponibilidad
   importa más que la precisión de auth), se provee opt-in `failOpen: true`
   en `EngineOptions` (segundo parámetro del constructor del `Engine`, ver
   §7.1). **ADVERTENCIA**: `failOpen: true` es un riesgo de seguridad
   significativo — convierte errores de store en `allowed: true`. Solo usar
   en escenarios donde la disponibilidad es más importante que la precisión
   de la autorización. El `CheckResult.reason` siempre lleva la string
   `"failOpen=true (SECURITY WARNING: not fail-closed)"` para que sea
   visible en logs y auditorías. Ver §7.1, §8 Paso 1 y WARNING #9 en §16.8.

6. **Permisos temporales**: ¿Soportar expiración de permisos como first-class
   feature? (ej: `validFrom`, `validUntil` en `Permission`).
   - **Recomendación**: No para v0.1. Las condiciones ABAC pueden cubrir este
     caso (`condition: (ctx) => Date.now() < expiryTime`). Evaluar en v0.3 si
     merece un campo dedicado.

7. **Field-level permissions**: ¿Modelar acceso a campos individuales de un
   recurso? (ej: "ver employee.name pero no employee.salary").
   - **Recomendación**: Post-MVP (v0.4+). Requiere un modelo separado de
     field-level que no complique el core RBAC/ABAC. Investigar en v0.3 si se
     puede modelar con `action: "read:salary"` o `resource: "employee.salary"`.

---

## 16. Review Synthesis — Hallazgos de Revisión Arquitectónica

> **Proceso**: Tres revisores independientes evaluaron el PRD en paralelo,
> enfocados en (1) Modelo de Permisos y Granularidad, (2) Arquitectura y
> Portabilidad, y (3) Completeness y Edge Cases. Esta sección sintetiza los
> hallazgos convergentes y las decisiones tomadas.

### 16.1 Hallazgos Críticos Convergentes

Los tres revisores coincidieron en estos problemas estructurales:

| Problema | Impacto | Estado |
|----------|---------|--------|
| **Falta de deny rules** | No se puede expresar "todos pueden X, excepto Y" sin condiciones frágiles | ✅ Agregado (`effect: 'deny'`) |
| **Scopes hardcodeados insuficientes** | `"any"/"own"/"none"` no cubre team, tenant, org, ni scopes custom | ✅ Extensibles con `ScopeFunction` |
| **Wildcards binarios (`"*"`)** | No permite `"post:*"` ni `"*.read"` — obliga a enumerar recursos | ✅ Namespace wildcards |
| **Ambigüedad `user.roles` vs `store`** | Dos fuentes de verdad simultáneas, confusión en tests y producción | ✅ Resuelto: store es única fuente |
| **Falta de `checkMany()` en MVP** | Listados de 50 recursos = 50×N+1 queries al store | ✅ Movido a MVP (RF-15) |
| **Store sin batch loading** | Herencia de 5 roles = 5+ queries secuenciales (N+1) | ✅ `PolicyReader.getRolesByNames()` (RF-14) |

### 16.2 Hallazgos Arquitectónicos

| Problema | Impacto | Estado |
|----------|---------|--------|
| **Adapter contract acoplado a Express** | El `createAuthzMiddleware` original asumía `(req, res, next)` — no sirve para Next.js, Remix, Hono, SvelteKit | ✅ Reemplazado por `AuthzInputMapper<TContext>` genérico |
| **`PolicyStore` mezcla lectura/escritura** | El engine (que solo lee) recibe métodos de escritura que nunca usa | ✅ Separado en `PolicyReader` + `PolicyWriter` |
| **`EvalContext` y `CheckInput` casi idénticos** | Duplicación de tipos — si se agrega un campo, hay que tocar ambos | ⚠️ Documentado, refactorizar en implementación |
| **`"sideEffects": false` faltante** | Sin esto, bundlers no eliminan código no usado (tree-shaking roto) | ✅ Agregado al roadmap v0.1 |
| **Condiciones no serializables** | Funciones JS no se guardan en PostgreSQL/SQLite | ✅ Post-MVP: condiciones serializables (RF-23) |

### 16.3 Edge Cases y Robustez

| Problema | Impacto | Estado |
|----------|---------|--------|
| **TOCTOU race conditions** | Entre `getUserRoles()` y la evaluación, otro proceso puede cambiar roles (stores async) | ⚠️ Documentado en sección 14.5; responsabilidad del store |
| **Sin try/catch en condiciones** | Si `condition(ctx)` tira excepción, el engine crashea | ✅ `ConditionEvaluationError` tipado (RF-17) |
| **Sin límite de profundidad en herencia** | 1000 niveles de herencia = stack overflow | ✅ `HierarchyTooDeepError` (50 niveles máx) |
| **Errores del store sin tipar** | `InMemoryPolicyStore` tira `new Error()` genérico en vez de `DuplicateRoleError` | ✅ Errores tipados (RF-17) |
| **Sin administración delegada** | No se puede modelar "dueño del proyecto gestiona roles en su proyecto" | ✅ Post-MVP: `setUserRoles` con scope (RF-26) |
| **Sin role activation conditions** | Para SaaS multi-tenant, hay que repetir la condición de tenant en CADA permiso | ✅ Post-MVP (RF-25) |

### 16.4 Fortalezas Confirmadas

Los tres revisores validaron estos aciertos del diseño original:

- **Core engine framework-agnostic**: `Engine.check()` no tiene dependencia HTTP. El 90% de la batalla ganada.
- **`types.ts` como capa base sin dependencias**: Layout de dependencias correcto, fluye en una dirección.
- **Separación resource/action**: Decisión 12.1 sólida — más limpio que strings concatenados.
- **`reason` obligatorio en `CheckResult`**: Para debugging y auditoría, fundamental.
- **`PolicyStore` como interfaz async desacoplada**: Compatible con cualquier backend.
- **Filosofía coherente**: "CONCEPTOS > CÓDIGO", "TYPE SAFETY > CONFIG FILES", "RAZÓN > BOOLEANO" — no es marketing vacío, se refleja en las decisiones.
- **Detección de ciclos en herencia**: Bien implementada con `CircularRoleHierarchyError` que incluye la cadena completa.

### 16.5 Lo Que Quedó Para el Futuro (y Por Qué)

| Feature | Versión | Razón del deferral |
|---------|---------|---------------------|
| Condiciones serializables | v0.2 | Las funciones cubren el 80% de casos; serialización requiere diseño de DSL declarativo |
| Resource hierarchies (path-based) | v0.2 | Necesita madurar el wildcard namespace primero |
| Field-level permissions | v0.4 | Requiere modelo separado; no queremos complicar el core RBAC/ABAC prematuramente |
| Permisos temporales (first-class) | v0.3 | Las condiciones ABAC pueden cubrir este caso hoy |
| Delegated administration | v0.2 | Sin scopes custom sólidos, la delegación es frágil |
| Plugin/hook system | v0.4 | El `CheckResult` estructurado ya permite logging externo sin hooks |
| Benchmark suite exhaustiva + auto-tuning | v0.4 | Para datasets <1000 roles, O(n) es suficiente; permission index del v0.1 cubre el hot path |

### 16.6 Principio Rector del Diseño Revisado

```
DENY GANA SOBRE ALLOW
  Si un permiso dice 'deny', no importa cuántos digan 'allow'.

EXTENSIBLE, NO CONFIGURABLE
  Scopes, condiciones, y stores son interfaces que el usuario implementa.
  No somos un producto cerrado — somos un toolkit.

STORE COMO ÚNICA FUENTE DE VERDAD
  El input del caller es informativo, nunca autoritativo.

BATCH POR DEFECTO
  Toda operación que toque el store debe soportar carga batch.
  N+1 no es aceptable ni en MVP.

FAIL LOUD, FAIL EARLY
  Errores tipados, no strings. Condiciones envueltas en try/catch.
  Ciclos detectados en construcción, no en runtime.
```

### 16.7 Segunda Ronda de Revisión — Security, DX, y QA

> **Proceso**: Cuatro revisores independientes evaluaron el PRD actualizado en
> paralelo, enfocados en (1) Security & Threat Model, (2) Architecture & SOLID,
> (3) Developer Experience, y (4) QA & Edge Cases. Esta sección sintetiza los
> hallazgos convergentes y las decisiones tomadas.

#### Hallazgos Críticos de Seguridad

| Problema | Impacto | Estado |
|----------|---------|--------|
| **Role Injection via `input.user.roles`** | Caller forja roles, privilege escalation | ✅ Store es única fuente de verdad (documentado en §13.2) |
| **Async condition retorna Promise (truthy)** | `async () => false` concede acceso | ⚠️ **Re-descubierto en Round 3 — ver §16.8 CRITICAL #1** |
| **Condition exception crashes engine** | DoS, unhandled rejection | ✅ try/catch → `ConditionEvaluationError` → fail-closed |
| **Condition side effects mutan context** | Data tampering mid-evaluation | ⚠️ **Re-descubierto en Round 3 — ver §16.8 WARNING #7** (Object.freeze es shallow) |
| **Reason field leaks role structure** | Reconnaissance via 403 responses | ✅ Documentado en §13.4 — adapters deben sanitizar |
| **No input validation** | Prototype pollution, empty strings | ⚠️ **Re-descubierto en Round 3 — ver §16.8 WARNING #8** (engine no sanitiza, solo documenta) |

#### Hallazgos de Arquitectura (SOLID)

| Problema | Impacto | Estado |
|----------|---------|--------|
| **Scope system closed for extension (OCP)** | Agregar scope requiere tocar engine | ⚠️ Post-MVP: `ScopeEvaluator` registry |
| **Engine does too much (SRP)** | Resolver + matcher + scope + condition | ⚠️ Aceptable para v0.1, refactor en v0.3 |
| **PolicyStore mixes read/write (ISP)** | Engine recibe métodos que nunca usa | ✅ Separado en `PolicyReader` + `PolicyWriter` |
| **EvalContext built per permission** | 5000 perms = 5000 identical objects | ✅ Construir UNA vez al inicio de `check()` |
| **Missing DuplicateRoleError** | Raw `Error` thrown in `addRole()` | ✅ Errores tipados en roadmap v0.1 |

#### Hallazgos de Developer Experience

| Problema | Impacto | Estado |
|----------|---------|--------|
| **Role duplication in API** | `setUserRoles` + `check({ user.roles })` confuso | ⚠️ **Re-descubierto en Round 3 — ver §16.8 WARNING #24** (`user.roles` es footgun) |
| **No debug trace** | Developers can't see WHY denied | ✅ `Engine.debug()` agregado al API (§7.1) |
| **No collection filter** | Can't authorize lists (row-level security) | ✅ `Engine.filter()` agregado al API (§7.1) |
| **Deny reasons vague** | `"no matching permission"` no ayuda | ✅ `deniedBy` estructurado con `type` + `detail` |
| **Scope default unclear** | Developers guess if default is "any" or "none" | ✅ Documentado: default es `"any"` |

#### Hallazgos de QA & Edge Cases

| Problema | Impacto | Estado |
|----------|---------|--------|
| **Self-reference cycle (A inherits A)** | Not detected as cycle | ✅ Cycle check BEFORE visited check (§8, Paso 2) |
| **Diamond inheritance (A→B,C→D)** | D resolved twice? | ✅ `visited` set lo maneja correctamente |
| **Deep chain (10+ levels)** | O(n²) array spreads | ✅ Límite de 50 niveles + `HierarchyTooDeepError` |
| **Role deleted but still inherited** | Silent permission loss | ⚠️ Documentado: responsabilidad del store validar |
| **scope "own" + ownerId: ""** | Empty string matches empty userId | ✅ Input validation: non-empty strings required |
| **scope "own" + undefined resourceInstance** | Crash or silent deny? | ✅ Silent deny: `!resourceInstance?.ownerId` → false |

#### Nuevos Requisitos Funcionales (de esta revisión)

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-27 | `Engine.debug()`: retorna `DebugTrace` con cada paso | 🔴 Alta |
| RF-28 | `Engine.filter()`: filtra colección por permisos | 🔴 Alta |
| RF-29 | Input validation (non-empty strings, prototype pollution) | 🔴 Alta |
| RF-30 | `EvalContext` frozen antes de pasar a condiciones | 🔴 Alta |
| RF-31 | `EvalContext` construido UNA vez por `check()` | 🟡 Media |
| RF-32 | Tests de seguridad (async condition, exception, empty ownerId) | 🔴 Alta |
| RF-33 | Security Considerations section en PRD | ✅ Completado |

### 16.8 Tercera Ronda de Revisión (2026-06-18) — Async Bypass Discovery

> **Proceso**: Revisión adversarial focalizada en bypasses ABAC. Descubrió
> **CRITICAL #1** (async condition truthy bypass), **CRITICAL #2** (empty
> array open-access), y seis issues WARNING/medianos. Todos corregidos en
> esta misma revisión.

#### CRITICAL #1 — Async condition truthy bypass

`matchConditions` usaba `Array.prototype.every` / `some` directamente sobre
`c(ctx)`. Una `Promise` retornada por `async () => false` es truthy, por lo
que `Promise.resolve(false)` se trataba como `passing`. El engine nunca
`await`-eaba, nunca validaba tipo. **Una línea de ABAC bypass completa**.

**Fix**: `await Promise.all()` + `typeof result === 'boolean'` (§8 Step 3b)
más notas en §6.3 y §13.1.

#### CRITICAL #2 — `condition: []` con `conditionMode: 'all'` silent grant

`[].every(...)` retorna `true`. Array vacío = siempre conceder acceso.

**Fix**: `EmptyConditionArrayError` (§8 Step 3b) + RF-17 extendido.

#### Corrección de regresión — Round 2 (post-Round 1)

El fix original de CRITICAL #2 tenía una regresión CRÍTICA: el short-circuit
a `EmptyConditionArrayError` aplicaba también al caso `condition: undefined`
(el caso COMÚN de RBAC básico sin ABAC), haciendo que `perm("post", "read")`
arrojara error en vez de conceder acceso. Esto rompía el motor entero.

**Fix aplicado (Round 2)**:
- §8 Paso 3b: ahora primero chequea `permission.condition === undefined` y
  short-circuita a `true` ANTES de la coerción a array. Solo lanza
  `EmptyConditionArrayError` si el array es explícitamente vacío.
- §6.3: documentada explícitamente la diferencia semántica entre
  `condition: undefined` (happy path) y `condition: []` (misconfiguration).
- §13.1: tabla de threat model actualizada con dos filas separadas (Empty
  Condition Array y Missing Condition undefined) para evitar confusión.
- §16.8: este párrafo documenta la regresión y el fix.

#### WARNING #6/7/8/9/10/22/24

Resumen en tabla §13.1 — todos corregidos. `deepFreeze` (§6.3.1),
`sanitizeInput` (§9.1.1), `auditRole` (§9.3.1), fail-closed store (§8 Paso 1),
deny single-pass clarification (§6.1.1), `user.roles` deprecation (§6.5).
Nuevos RF-34/35/36/37.

#### Decisión: deferral a v0.1.1 / v0.2 (actualizado 2026-06-18)

Los siguientes items quedan para versiones posteriores. Items previamente
DEFERRED (como `checkMany` semantics y permission index) han sido resueltos
en el PRD y promovidos a v0.1 (ver §8.1, §8.2, §7.1.1, §13.6).

| Item | Versión propuesta | Razón |
|------|-------------------|-------|
| Field-level permissions | v0.4 | Requiere modelo separado |
| Role activation conditions | v0.3 | Requiere diseño de lifecycle |
| Tree-shaking / package layout | v0.1 | ✅ Resuelto: `"sideEffects": false` + subpath exports en roadmap |
| Branded types / generics | v0.1.1 | Mejora de tipos, no bloquea implementación |
| API ergonomics (sync `engine.can`, perm overloads) | v0.1.1 | Sugar syntax post-MVP |
| Adapter async support | v0.2 | Los adapters se construyen después del core engine |
| 50+ SUGGESTIONS de los revisores | v0.1.1+ | Triaged, ninguna bloquea v0.1 |
| DebugTrace type completo | v0.1.1 | Necesario para que `debug()` sea usable |
| Property-based test specs | v0.1 | ✅ Resuelto: §13.6 con invariantes y fast-check |
| Permission index auto-tuning | v0.4 | El index básico (§8.1) está en v0.1; auto-tuning según umbral es optimización posterior |

---

*Este documento es vivo. Se actualiza a medida que el proyecto evoluciona.*
