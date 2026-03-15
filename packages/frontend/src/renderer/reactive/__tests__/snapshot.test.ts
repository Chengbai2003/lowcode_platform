/**
 * SnapshotManager 单元测试
 * @module renderer/reactive/snapshot
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SnapshotManager } from '../snapshot';
import type { RuntimeSnapshot } from '../types';

describe('SnapshotManager', () => {
  let manager: SnapshotManager;

  beforeEach(() => {
    manager = new SnapshotManager();
  });

  describe('createSnapshot()', () => {
    it('应创建不可变快照', () => {
      const data = { input1: 'value1' };
      const state = { loading: false };
      const formData = { user: 'John' };
      const components = { button: { type: 'Button' } };

      const snapshot = manager.createSnapshot(data, state, formData, components, 1);

      expect(snapshot.data).toEqual(data);
      expect(snapshot.state).toEqual(state);
      expect(snapshot.formData).toEqual(formData);
      expect(snapshot.components).toEqual(components);
      expect(snapshot.version).toBe(1);
    });

    it('应深度冻结快照', () => {
      const data = { user: { name: 'John', details: { age: 30 } } };
      const snapshot = manager.createSnapshot(data, {}, {}, {}, 1);

      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(Object.isFrozen(snapshot.data)).toBe(true);
      expect(Object.isFrozen((snapshot.data as Record<string, unknown>).user)).toBe(true);
      expect(
        Object.isFrozen(
          ((snapshot.data as Record<string, unknown>).user as Record<string, unknown>).details,
        ),
      ).toBe(true);
    });

    it('不应修改原始数据', () => {
      const data = { input1: 'value' };
      const originalData = JSON.parse(JSON.stringify(data));

      manager.createSnapshot(data, {}, {}, {}, 1);

      // 原始数据不应被冻结
      expect(Object.isFrozen(data)).toBe(false);
      expect(data).toEqual(originalData);
    });

    it('相同版本应缓存快照', () => {
      const data = { input1: 'value' };

      const snapshot1 = manager.createSnapshot(data, {}, {}, {}, 1);
      const snapshot2 = manager.createSnapshot(data, {}, {}, {}, 1);

      expect(snapshot1).toBe(snapshot2);
    });

    it('版本变更时应创建新快照', () => {
      const data = { input1: 'value' };

      const snapshot1 = manager.createSnapshot(data, {}, {}, {}, 1);
      const snapshot2 = manager.createSnapshot(data, {}, {}, {}, 2);

      expect(snapshot1).not.toBe(snapshot2);
      expect(snapshot1.version).toBe(1);
      expect(snapshot2.version).toBe(2);
    });

    it('应处理空数据', () => {
      const snapshot = manager.createSnapshot({}, {}, {}, {}, 0);

      expect(snapshot.data).toEqual({});
      expect(snapshot.state).toEqual({});
      expect(snapshot.version).toBe(0);
    });

    it('应冻结数据中的数组', () => {
      const data = { items: [1, 2, 3] };
      const snapshot = manager.createSnapshot(data, {}, {}, {}, 1);

      expect(Object.isFrozen((snapshot.data as Record<string, unknown>).items)).toBe(true);
    });

    it('应处理 null 值', () => {
      const data = { input1: null };
      const snapshot = manager.createSnapshot(data, {}, {}, {}, 1);

      expect((snapshot.data as Record<string, unknown>).input1).toBeNull();
    });

    it('应处理 undefined 值', () => {
      const data = { input1: undefined };
      const snapshot = manager.createSnapshot(data, {}, {}, {}, 1);

      expect((snapshot.data as Record<string, unknown>).input1).toBeUndefined();
    });

    it('应冻结嵌套数组', () => {
      const data = {
        matrix: [
          [1, 2],
          [3, 4],
        ],
      };
      const snapshot = manager.createSnapshot(data, {}, {}, {}, 1);

      const matrix = (snapshot.data as Record<string, unknown>).matrix as unknown[][];
      expect(Object.isFrozen(matrix)).toBe(true);
      expect(Object.isFrozen(matrix[0])).toBe(true);
      expect(Object.isFrozen(matrix[1])).toBe(true);
    });
  });

  describe('getCachedSnapshot()', () => {
    it('初始应返回 null', () => {
      expect(manager.getCachedSnapshot()).toBeNull();
    });

    it('创建后应返回缓存的快照', () => {
      const snapshot = manager.createSnapshot({}, {}, {}, {}, 1);

      expect(manager.getCachedSnapshot()).toBe(snapshot);
    });
  });

  describe('getCachedVersion()', () => {
    it('初始应返回 -1', () => {
      expect(manager.getCachedVersion()).toBe(-1);
    });

    it('创建后应返回缓存的版本', () => {
      manager.createSnapshot({}, {}, {}, {}, 5);

      expect(manager.getCachedVersion()).toBe(5);
    });
  });

  describe('invalidate()', () => {
    it('应清除缓存的快照', () => {
      manager.createSnapshot({}, {}, {}, {}, 1);
      manager.invalidate();

      expect(manager.getCachedSnapshot()).toBeNull();
      expect(manager.getCachedVersion()).toBe(-1);
    });

    it('下次调用时应强制创建新快照', () => {
      const data = { input1: 'value' };

      const snapshot1 = manager.createSnapshot(data, {}, {}, {}, 1);
      manager.invalidate();
      const snapshot2 = manager.createSnapshot(data, {}, {}, {}, 1);

      expect(snapshot1).not.toBe(snapshot2);
    });
  });

  describe('isAffected()', () => {
    it('全量失效时应返回 true', () => {
      const deps = new Set(['data.input1']);

      expect(manager.isAffected('all', deps)).toBe(true);
    });

    it('精确匹配时应返回 true', () => {
      const dirtyPaths = new Set(['data.input1']);
      const deps = new Set(['data.input1']);

      expect(manager.isAffected(dirtyPaths, deps)).toBe(true);
    });

    it('无匹配时应返回 false', () => {
      const dirtyPaths = new Set(['data.input1']);
      const deps = new Set(['data.input2']);

      expect(manager.isAffected(dirtyPaths, deps)).toBe(false);
    });

    it('脏路径是依赖前缀时应返回 true', () => {
      // 脏路径 "state" 影响 "state.loading"
      const dirtyPaths = new Set(['state']);
      const deps = new Set(['state.loading']);

      expect(manager.isAffected(dirtyPaths, deps)).toBe(true);
    });

    it('依赖是脏路径前缀时应返回 true', () => {
      // 依赖 "data.user" 受 "data.user.name" 影响
      const dirtyPaths = new Set(['data.user.name']);
      const deps = new Set(['data.user']);

      expect(manager.isAffected(dirtyPaths, deps)).toBe(true);
    });

    it('应处理多个脏路径', () => {
      const dirtyPaths = new Set(['data.input1', 'data.input2']);
      const deps = new Set(['data.input2']);

      expect(manager.isAffected(dirtyPaths, deps)).toBe(true);
    });

    it('应处理多个依赖', () => {
      const dirtyPaths = new Set(['data.input1']);
      const deps = new Set(['data.input1', 'data.input2']);

      expect(manager.isAffected(dirtyPaths, deps)).toBe(true);
    });

    it('无关路径应返回 false', () => {
      const dirtyPaths = new Set(['data.user.name']);
      const deps = new Set(['data.other.name']);

      expect(manager.isAffected(dirtyPaths, deps)).toBe(false);
    });

    it('应处理空依赖', () => {
      const dirtyPaths = new Set(['data.input1']);
      const deps = new Set<string>();

      expect(manager.isAffected(dirtyPaths, deps)).toBe(false);
    });

    it('应处理空脏路径', () => {
      const dirtyPaths = new Set<string>();
      const deps = new Set(['data.input1']);

      expect(manager.isAffected(dirtyPaths, deps)).toBe(false);
    });
  });

  describe('深度冻结验证', () => {
    it('应阻止修改快照数据', () => {
      const snapshot = manager.createSnapshot({ input1: 'value' }, {}, {}, {}, 1);

      expect(() => {
        (snapshot.data as Record<string, unknown>).input1 = 'modified';
      }).toThrow();
    });

    it('应阻止向快照添加新属性', () => {
      const snapshot = manager.createSnapshot({}, {}, {}, {}, 1);

      expect(() => {
        (snapshot as Record<string, unknown>).newProp = 'value';
      }).toThrow();
    });

    it('应阻止修改嵌套对象', () => {
      const snapshot = manager.createSnapshot({ user: { name: 'John' } }, {}, {}, {}, 1);

      expect(() => {
        ((snapshot.data as Record<string, unknown>).user as Record<string, unknown>).name = 'Jane';
      }).toThrow();
    });

    it('应阻止修改数组', () => {
      const snapshot = manager.createSnapshot({ items: [1, 2, 3] }, {}, {}, {}, 1);

      expect(() => {
        ((snapshot.data as Record<string, unknown>).items as unknown[]).push(4);
      }).toThrow();
    });
  });

  describe('components 处理', () => {
    it('应浅冻结 components 容器', () => {
      const components = { button: { type: 'Button' } };
      const snapshot = manager.createSnapshot({}, {}, {}, components, 1);

      expect(Object.isFrozen(snapshot.components)).toBe(true);
    });

    it('不应深度冻结 components（共享引用）', () => {
      const components = { button: { type: 'Button' } };
      const snapshot = manager.createSnapshot({}, {}, {}, components, 1);

      // components 容器已冻结，但内部对象可能未冻结
      // 这是有意为之 - components 与 schema 共享
      expect(Object.isFrozen(snapshot.components)).toBe(true);
    });
  });
});
