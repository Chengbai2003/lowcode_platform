/**
 * 应用配置
 */

import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
  // 基础配置
  name: process.env.APP_NAME || "Lowcode Platform Server",
  version: process.env.APP_VERSION || "1.0.0",
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3001", 10) || 3000,
  host: process.env.HOST || "0.0.0.0",

  // CORS配置
  cors: process.env.CORS_ENABLED !== "false", // 默认启用
  corsOrigin:
    process.env.CORS_ORIGIN ||
    (process.env.NODE_ENV === "production"
      ? undefined // 生产环境必须显式配置，未配置则禁止跨域
      : "http://localhost:5173"), // 开发环境默认允许 Vite dev server

  // 日志配置
  logLevel: process.env.LOG_LEVEL || "info",
  logFormat: process.env.LOG_FORMAT || "combined",

  // 安全配置
  rateLimitWindow:
    parseInt(process.env.RATE_LIMIT_WINDOW || "60000", 10) || 60000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || "100", 10) || 100,

  // JWT配置（预留）
  jwtSecret:
    process.env.JWT_SECRET ||
    (() => {
      if (process.env.NODE_ENV === "production") {
        throw new Error("JWT_SECRET must be set in production!");
      }
      return "dev-only-secret-key";
    })(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",

  // 数据库配置（预留）
  database: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10) || 5432,
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "password",
    database: process.env.DB_NAME || "lowcode_platform",
  },
}));
