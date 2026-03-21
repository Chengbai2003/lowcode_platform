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
});

