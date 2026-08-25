import { ComponentMetaRegistry } from './component-metadata/component-meta.registry';
import { CollectionTargetResolverService } from './collection-target-resolver.service';

describe('CollectionTargetResolverService', () => {
  it('returns deterministically when descendants contain a cycle', () => {
    const service = new CollectionTargetResolverService(new ComponentMetaRegistry());
    const result = service.resolve({
      rootId: 'root',
      schema: {
        rootId: 'root',
        components: {
          root: { id: 'root', type: 'Div', childrenIds: ['child'] },
          child: { id: 'child', type: 'Div', childrenIds: ['root'] },
        },
      },
      targetType: 'Div',
    });

    expect(result.status).toBe('no_match');
  });
});
