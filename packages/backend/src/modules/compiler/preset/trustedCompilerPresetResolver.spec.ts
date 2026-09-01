import { BadRequestException } from '@nestjs/common';
import { antdCompilerBindings } from '@lowcode-platform/preset-antd';
import { resolveTrustedCompilerBindings } from './trustedCompilerPresetResolver';

const currentRuntimeCompatibility = {
  componentPresetId: 'builtin-antd',
  componentPresetVersion: '0.1.0',
  rendererVersion: '1.0.0',
};

describe('resolveTrustedCompilerBindings', () => {
  it('resolves the exact builtin antd runtime profile', () => {
    expect(resolveTrustedCompilerBindings(currentRuntimeCompatibility as never)).toBe(
      antdCompilerBindings,
    );
  });

  it.each([
    ['preset version', { ...currentRuntimeCompatibility, componentPresetVersion: '0.0.0-draft' }],
    ['renderer version', { ...currentRuntimeCompatibility, rendererVersion: '0.0.0-draft' }],
    [
      'legacy draft profile',
      {
        componentPresetId: 'builtin-antd',
        componentPresetVersion: '0.0.0-draft',
        rendererVersion: '0.0.0-draft',
      },
    ],
  ])('rejects an unsupported %s', (_reason, runtimeCompatibility) => {
    expect(() => resolveTrustedCompilerBindings(runtimeCompatibility as never)).toThrow(
      BadRequestException,
    );
  });
});
