import { buildParentMap, buildAncestorChain } from './parent-map.builder';
import { LOGIN_FORM_FIXTURE } from '../__fixtures__/login-form.fixture';

describe('parent-map.builder', () => {
  const { components } = LOGIN_FORM_FIXTURE;
  const parentMap = buildParentMap(components);

  describe('buildParentMap', () => {
    it('root node has no parent', () => {
      expect(parentMap.has('page_root')).toBe(false);
    });

    it('leaf node has correct parent', () => {
      expect(parentMap.get('btn_submit')).toBe('form_item_submit');
    });

    it('intermediate node has correct parent', () => {
      expect(parentMap.get('form_main')).toBe('container_main');
    });
  });

  describe('buildAncestorChain', () => {
    it('ancestor chain from leaf to root', () => {
      const chain = buildAncestorChain('btn_submit', parentMap, components);
      expect(chain).toEqual([
        { id: 'page_root', type: 'Page', depth: 0 },
        { id: 'container_main', type: 'Container', depth: 1 },
        { id: 'form_main', type: 'Form', depth: 2 },
        { id: 'form_item_submit', type: 'FormItem', depth: 3 },
      ]);
    });

    it('ancestor chain for root is empty', () => {
      const chain = buildAncestorChain('page_root', parentMap, components);
      expect(chain).toEqual([]);
    });

    it('ancestor chain for direct child of root', () => {
      const chain = buildAncestorChain('container_main', parentMap, components);
      expect(chain).toEqual([{ id: 'page_root', type: 'Page', depth: 0 }]);
    });

    it('breaks out when parent map contains a cycle', () => {
      const cyclicParentMap = new Map<string, string>([
        ['a', 'b'],
        ['b', 'a'],
      ]);
      const cyclicComponents = {
        a: { id: 'a', type: 'Page' },
        b: { id: 'b', type: 'Container' },
      };

      expect(buildAncestorChain('a', cyclicParentMap, cyclicComponents)).toEqual([
        { id: 'a', type: 'Page', depth: 0 },
        { id: 'b', type: 'Container', depth: 1 },
      ]);
    });
  });
});
