import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject } from '@nestjs/common';
import type { Engine } from '../engine.js';
import { POLYCYES_ENGINE, POLYCYES_OPTIONS, POLYCYES_PERMISSIONS } from './polycyes.constants.js';
import type { PolycyesModuleOptions, PermissionMetadata, NestjsRequest } from './polycyes.constants.js';

const defaultGetUser = (req: NestjsRequest) => {
  if (!req.user) throw new ForbiddenException('User not found in request');
  return req.user;
};

@Injectable()
export class PolycyesGuard implements CanActivate {
  constructor(
    @Inject(POLYCYES_ENGINE) private readonly engine: Engine,
    @Inject(POLYCYES_OPTIONS) private readonly options: PolycyesModuleOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const permission = Reflect.getMetadata(
      POLYCYES_PERMISSIONS,
      context.getHandler(),
    ) as PermissionMetadata | undefined;

    if (!permission) return true;

    const req = context.switchToHttp().getRequest<NestjsRequest>();
    const getUser = this.options.getUser ?? defaultGetUser;
    const getResourceInstance = this.options.getResourceInstance;
    const getMetadata = this.options.getMetadata;

    const user = getUser(req);
    const resource = permission.resource;
    const action = permission.action;
    const resourceInstance = getResourceInstance ? getResourceInstance(req) : undefined;
    const metadata = getMetadata ? getMetadata(req) : undefined;

    const result = await this.engine.check({ user, resource, action, resourceInstance, metadata });

    if (!result.allowed) {
      throw new ForbiddenException(result.reason);
    }

    return true;
  }
}
