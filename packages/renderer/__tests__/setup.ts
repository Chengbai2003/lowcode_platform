/**
 * Vitest测试环境设置
 */

import { vi } from 'vitest';

// Mock console方法，方便测试日志
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
};

// Mock process.env
process.env.NODE_ENV = 'test';
