import { getSubtreeIds, extractSubtree, computeMaxDepth } from './tree-walker';
import { LOGIN_FORM_FIXTURE } from '../__fixtures__/login-form.fixture';

describe('tree-walker', () => {
  const { components } = LOGIN_FORM_FIXTURE;

  describe('getSubtreeIds', () => {
    it('returns BFS order', () => {
      const ids = getSubtreeIds('page_root', components, 100, 100);
      expect(ids[0]).toBe('page_root');
      expect(ids[1]).toBe('container_main');
      // Level 2 children come next
      expect(ids.indexOf('form_main')).toBeGreaterThan(ids.indexOf('container_main'));
    });

    it('respects maxDepth', () => {
      const ids = getSubtreeIds('page_root', components, 1, 100);
      expect(ids).toContain('page_root');
      expect(ids).toContain('container_main');
      expect(ids).not.toContain('form_main');
    });

    it('respects maxNodes', () => {
      const ids = getSubtreeIds('page_root', components, 100, 3);
      expect(ids).toHaveLength(3);
    });
  });

  describe('extractSubtree', () => {
    it('returns component map for subtree', () => {
      const subtree = extractSubtree('form_main', components, 1, 100);
      expect(subtree['form_main']).toBeDefined();
      expect(subtree['form_item_username']).toBeDefined();
      expect(subtree['form_item_password']).toBeDefined();
      expect(subtree['form_item_submit']).toBeDefined();
      // depth=1 should not include grandchildren
      expect(subtree['input_username']).toBeUndefined();
    });
  });

  describe('computeMaxDepth', () => {
    it('computes correct max depth', () => {
      const depth = computeMaxDepth('page_root', components);
      expect(depth).toBe(4);
    });

    it('does not loop forever on cyclic graphs', () => {
      const cyclicComponents = {
        a: { id: 'a', type: 'Page', childrenIds: ['b'] },
        b: { id: 'b', type: 'Container', childrenIds: ['a'] },
      };

      expect(computeMaxDepth('a', cyclicComponents)).toBe(1);
      expect(getSubtreeIds('a', cyclicComponents, 10, 10)).toEqual(['a', 'b']);
    });
  });
});
