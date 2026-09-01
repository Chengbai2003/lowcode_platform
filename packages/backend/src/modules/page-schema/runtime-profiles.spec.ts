import { PageRuntimeMetadataProvider } from './page-runtime-metadata.provider';
import {
  BUILTIN_ANTD_RUNTIME_PROFILE,
  BUILTIN_ANTD_SYSTEM_RUNTIME_PROFILE,
} from './runtime-profiles';
import { toRuntimeCompatibility } from './system-runtime-profile';

describe('builtin system runtime profile', () => {
  it('uses the active deployment profile when creating page metadata', () => {
    const metadata = new PageRuntimeMetadataProvider().getDraftPageRuntimeMetadata();

    expect(BUILTIN_ANTD_SYSTEM_RUNTIME_PROFILE).toMatchObject({
      systemId: 'default',
      status: 'active',
      compilerBindingId: 'builtin-antd-compiler-bindings-0.1.0',
      componentPresetId: 'builtin-antd',
      componentPresetVersion: '0.1.0',
      rendererVersion: '1.0.0',
    });
    expect(metadata).toEqual({
      systemId: BUILTIN_ANTD_SYSTEM_RUNTIME_PROFILE.systemId,
      runtimeCompatibility: BUILTIN_ANTD_RUNTIME_PROFILE,
    });
  });

  it('projects only the frozen compatibility tuple into page snapshots', () => {
    const compatibility = toRuntimeCompatibility(BUILTIN_ANTD_SYSTEM_RUNTIME_PROFILE);

    expect(compatibility).toEqual({
      componentPresetId: 'builtin-antd',
      componentPresetVersion: '0.1.0',
      rendererVersion: '1.0.0',
    });
    expect(Object.keys(compatibility).sort()).toEqual([
      'componentPresetId',
      'componentPresetVersion',
      'rendererVersion',
    ]);
    expect(Object.isFrozen(compatibility)).toBe(true);
  });
});
