import type { PolicyReader } from './store.js';
import type { Role } from './types.js';
import { CircularRoleHierarchyError, HierarchyTooDeepError } from './errors.js';

const MAX_INHERITANCE_DEPTH = 50;

export class RoleResolver {
  private readonly store: PolicyReader;

  constructor(store: PolicyReader) {
    this.store = store;
  }

  async resolve(roleNames: string[]): Promise<Role[]> {
    const roleMap = new Map<string, Role>();
    let frontier = [...new Set(roleNames)];

    while (frontier.length > 0) {
      const roles = await this.store.getRolesByNames(frontier);
      for (const role of roles) {
        if (!roleMap.has(role.name)) {
          roleMap.set(role.name, role);
        }
      }

      const nextFrontier = new Set<string>();
      for (const role of roles) {
        if (!role.inherits) continue;
        for (const parent of role.inherits) {
          if (!roleMap.has(parent)) {
            nextFrontier.add(parent);
          }
        }
      }

      frontier = [...nextFrontier];
    }

    const visited = new Set<string>();
    const resolved: Role[] = [];

    const resolveOne = (name: string, chain: string[]): void => {
      if (visited.has(name)) return;

      const role = roleMap.get(name);
      if (!role) return;

      visited.add(name);

      if (role.inherits) {
        for (const parent of role.inherits) {
          if (chain.includes(parent)) {
            throw new CircularRoleHierarchyError([...chain, parent]);
          }
          if (chain.length >= MAX_INHERITANCE_DEPTH) {
            throw new HierarchyTooDeepError([...chain, parent]);
          }
          resolveOne(parent, [...chain, parent]);
        }
      }

      if (!resolved.some((r) => r.name === role.name)) {
        resolved.push(role);
      }
    };

    for (const name of roleNames) {
      resolveOne(name, [name]);
    }

    return resolved;
  }
}
