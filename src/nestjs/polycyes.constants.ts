import type { User, ResourceInstance } from '../types.js';

export const POLYCYES_ENGINE = 'POLYCYES_ENGINE';
export const POLYCYES_OPTIONS = 'POLYCYES_OPTIONS';
export const POLYCYES_PERMISSIONS = 'POLYCYES_PERMISSIONS';

export interface PolycyesModuleOptions {
  getUser?: (req: unknown) => User;
  getResourceInstance?: (req: unknown) => ResourceInstance | undefined;
  getMetadata?: (req: unknown) => Record<string, unknown> | undefined;
}

export interface PermissionMetadata {
  resource: string;
  action: string;
}

export interface NestjsRequest {
  user?: User;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  [key: string]: unknown;
}
