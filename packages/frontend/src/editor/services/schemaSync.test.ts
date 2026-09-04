import { describe, expect, it } from 'vitest';
import type { PageSchema } from '../../types';
import { applyComponentSnapshot, serializePageSchema } from './schemaSync';

const statefulSchema: PageSchema = {
  schemaVersion: 0,
  rootId: 'root',
  logic: {
    states: { count: 1 },
    computed: { next: 'state.count + 1' },
  },
  components: {
    root: { id: 'root', type: 'Page', childrenIds: ['child'] },
    child: { id: 'child', type: 'Text', props: { children: 'before' } },
  },
};

describe('schemaSync Page Logic preservation', () => {
  it('includes Page Logic in the JSON editor representation', () => {
    expect(JSON.parse(serializePageSchema(statefulSchema))).toEqual(statefulSchema);
  });

  it('keeps base Page Logic when applying a component snapshot', () => {
    const snapshot: PageSchema = {
      schemaVersion: 0,
      rootId: 'child',
      components: {
        child: { id: 'child', type: 'Text', props: { children: 'after' } },
      },
    };

    const updated = applyComponentSnapshot(statefulSchema, snapshot, 'child');

    expect(updated?.logic).toEqual(statefulSchema.logic);
    expect(updated?.components.child.props?.children).toBe('after');
  });
});
