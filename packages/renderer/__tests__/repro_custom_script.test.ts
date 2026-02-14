
import { describe, it, expect } from 'vitest';
import { DSLExecutor } from '../src/executor/Engine';

describe('Custom Script Reproduction', () => {
  it('should fail to execute customScript even if enabled', async () => {
    const executor = new DSLExecutor({
      enableCustomScript: true,
    });

    const action = {
      type: 'customScript',
      code: 'return 1 + 1;',
    };

    const context = DSLExecutor.createContext({});

    // Expect this to fail because customScript handler is not registered
    await expect(executor.executeSingle(action, context)).rejects.toThrow('Unknown action type: customScript');
  });
});
