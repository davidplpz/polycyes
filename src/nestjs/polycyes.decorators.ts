import 'reflect-metadata';
import { POLYCYES_PERMISSIONS } from './polycyes.constants.js';

export function Permissions(resource: string, action: string): MethodDecorator {
  return (target, key, descriptor) => {
    Reflect.defineMetadata(POLYCYES_PERMISSIONS, { resource, action }, descriptor.value as object);
  };
}
