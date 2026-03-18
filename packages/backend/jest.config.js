/**
 * Jest 测试配置
 */

module.exports = {
  // 测试环境
  testEnvironment: 'node',

  // 根目录
  rootDir: '.',

  // 测试文件匹配模式
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/test/**/*.e2e-spec.ts',
  ],

  // 忽略的文件
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],

  // TypeScript 转换器
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },

  // 模块文件扩展名
  moduleFileExtensions: ['ts', 'js', 'json'],

  // 模块别名
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // 覆盖率配置
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.d.ts',
    '!src/main.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // 超时设置
  testTimeout: 30000,

  // 预置条件
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
