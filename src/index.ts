// ============================================================================
// polycyes — Public API
// ============================================================================

export { Engine } from './engine.js';
export { InMemoryPolicyStore } from './memory-store.js';

export type { PolicyReader, PolicyWriter, PolicyStore } from './store.js';

export type {
  User,
  Role,
  Permission,
  PermissionScope,
  PermissionEffect,
  ScopeFunction,
  Condition,
  ConditionMode,
  EvalContext,
  ResourceInstance,
  CheckInput,
  CheckResult,
  DeniedBy,
  EngineOptions,
  FilterInput,
  FilterResult,
  DebugStep,
  DebugTrace,
  Brand,
  UserId,
  RoleName,
  ResourceName,
  ActionName,
} from './types.js';

export { perm, role, user, resourceInstance, scopeTeam, scopeTenant, scopeOrg } from './helpers.js';

export {
  RoleNotFoundError,
  CircularRoleHierarchyError,
  StoreNotConfiguredError,
  ConditionEvaluationError,
  DuplicateRoleError,
  HierarchyTooDeepError,
  EmptyConditionArrayError,
  ConditionTimeoutError,
  StoreUnavailableError,
  UnsafeRoleError,
  InvalidEngineOptionError,
  InvalidInputError,
} from './errors.js';
