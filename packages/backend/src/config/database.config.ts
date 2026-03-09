/**
 * 数据库配置（预留）
 * 为后续用户管理、权限系统、Schema存储等功能准备
 */

import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  // 数据库类型
  type: process.env.DB_TYPE || 'postgres',

  // 连接配置
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10) || 5432,
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'lowcode_platform',

  // 连接池配置
  pool: {
    min: parseInt(process.env.DB_POOL_MIN || '2', 10) || 2,
    max: parseInt(process.env.DB_POOL_MAX || '10', 10) || 10,
  },

  // ORM配置
  orm: {
    // 自动同步（仅开发环境）
    synchronize: process.env.NODE_ENV === 'development',
    // 日志
    logging: process.env.DB_LOGGING === 'true',
    // 实体路径
    entities: ['dist/**/*.entity.js'],
    migrations: ['dist/migrations/*.js'],
  },

  // Redis配置（可选，用于缓存和会话）
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '0', 10) || 0,
  },
}));
