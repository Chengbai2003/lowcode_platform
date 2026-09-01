import { compileToCode, formatCode } from '../generator';
import { snapshotSchemas } from './compilerTestSchemas';

describe('compiler generator snapshots', () => {
  const cases = [
    ['simple-button', snapshotSchemas.simpleButton, undefined],
    ['nested-tree', snapshotSchemas.nestedTree, undefined],
    ['field-binding', snapshotSchemas.fieldBinding, undefined],
    ['style-class-merge', snapshotSchemas.styleClassMerge, undefined],
    [
      'component-sources',
      snapshotSchemas.componentSources,
      {
        componentSources: {
          Button: '@custom/ui',
        },
        defaultLibrary: 'antd',
      },
    ],
    ['basic-action-list', snapshotSchemas.basicActionList, undefined],
  ] as const;

  it.each(cases)('matches snapshot: %s', async (_name, schema, options) => {
    const formatted = await formatCode(compileToCode(schema, options));
    expect(formatted).toMatchSnapshot();
  });

  it('imports a bound export under the schema component type', () => {
    const schema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['custom-card'] },
        'custom-card': { id: 'custom-card', type: 'Card', childrenIds: [] },
      },
    } as const;

    const code = compileToCode(schema, {
      defaultLibrary: 'antd',
      componentBindings: {
        Page: { module: '@lowcode-platform/preset-antd/runtime' },
        Card: { module: '@acme/cards', exportName: 'AcmeCard' },
      },
    });

    expect(code).toContain('import { AcmeCard as Card } from "@acme/cards";');
    expect(code).toContain('<Card />');
  });

  it('rejects unbound component types for fail-close trusted presets', () => {
    const schema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'UnknownWidget', childrenIds: [] },
      },
    } as const;

    expect(() =>
      compileToCode(schema, {
        defaultLibrary: 'antd',
        componentBindings: {},
        allowDefaultComponentFallback: false,
      }),
    ).toThrow(/Unsupported component type/);
  });
});
