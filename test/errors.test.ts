import { describe, it, expect } from 'vitest';
import {
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
} from '../src/errors.js';

describe('Error classes', () => {
  describe('ConditionEvaluationError', () => {
    it('MUST construct with permission and cause', () => {
      const cause = new Error('condition threw');
      const perm = { resource: 'post', action: 'edit' };
      const err = new ConditionEvaluationError(perm, cause);
      expect(err.name).toBe('ConditionEvaluationError');
      expect(err.message).toContain('post');
      expect(err.message).toContain('edit');
      expect(err.cause).toBe(cause);
    });
  });

  describe('DuplicateRoleError', () => {
    it('MUST construct with role name', () => {
      const err = new DuplicateRoleError('admin');
      expect(err.name).toBe('DuplicateRoleError');
      expect(err.message).toContain('admin');
    });
  });

  describe('HierarchyTooDeepError', () => {
    it('MUST construct with chain', () => {
      const chain = ['a', 'b', 'c'];
      const err = new HierarchyTooDeepError(chain);
      expect(err.name).toBe('HierarchyTooDeepError');
      expect(err.message).toContain('50');
    });
  });

  describe('EmptyConditionArrayError', () => {
    it('MUST construct with permission', () => {
      const perm = { resource: 'post', action: 'read' };
      const err = new EmptyConditionArrayError(perm);
      expect(err.name).toBe('EmptyConditionArrayError');
      expect(err.message).toContain('empty');
    });
  });

  describe('ConditionTimeoutError', () => {
    it('MUST construct with permission and timeout', () => {
      const perm = { resource: 'post', action: 'edit' };
      const err = new ConditionTimeoutError(perm, 1000);
      expect(err.name).toBe('ConditionTimeoutError');
      expect(err.message).toContain('1000');
    });
  });

  describe('StoreUnavailableError', () => {
    it('MUST construct with cause', () => {
      const cause = new Error('connection refused');
      const err = new StoreUnavailableError(cause);
      expect(err.name).toBe('StoreUnavailableError');
      expect(err.cause).toBe(cause);
    });

    it('MUST default message when no cause', () => {
      const err = new StoreUnavailableError();
      expect(err.name).toBe('StoreUnavailableError');
      expect(err.message).toContain('unavailable');
    });
  });

  describe('UnsafeRoleError', () => {
    it('MUST construct with reason', () => {
      const err = new UnsafeRoleError('perm(*,*) without condition');
      expect(err.name).toBe('UnsafeRoleError');
      expect(err.message).toContain('perm(*,*)');
    });
  });

  describe('InvalidEngineOptionError', () => {
    it('MUST construct with message', () => {
      const err = new InvalidEngineOptionError('timeoutMs must be positive');
      expect(err.name).toBe('InvalidEngineOptionError');
      expect(err.message).toContain('timeoutMs');
    });
  });

  describe('InvalidInputError', () => {
    it('MUST construct with message', () => {
      const err = new InvalidInputError('resource is required');
      expect(err.name).toBe('InvalidInputError');
      expect(err.message).toContain('resource');
    });
  });

  describe('existing errors still work', () => {
    it('RoleNotFoundError', () => {
      const err = new RoleNotFoundError('guest');
      expect(err.name).toBe('RoleNotFoundError');
      expect(err.message).toContain('guest');
    });

    it('CircularRoleHierarchyError', () => {
      const err = new CircularRoleHierarchyError(['a', 'b', 'a']);
      expect(err.name).toBe('CircularRoleHierarchyError');
      expect(err.message).toContain('a → b → a');
    });

    it('StoreNotConfiguredError', () => {
      const err = new StoreNotConfiguredError();
      expect(err.name).toBe('StoreNotConfiguredError');
    });
  });
});
