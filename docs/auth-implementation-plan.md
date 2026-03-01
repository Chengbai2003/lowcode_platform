# 前后端统一 Bearer Token 认证实现计划

## 目标
统一前后端 Token 认证，只使用一个 API_SECRET 环境变量，保持简单易用。

## 设计原则
- **KISS**：Keep It Simple, Stupid
- 只提供一个 API_SECRET 配置项
- 复杂认证需求由用户自行 Fork 改造

## 实现步骤

### 1. 后端改造

#### 1.1 环境变量配置
```bash
# .env
API_SECRET=dev-secret-token-change-in-production
```

#### 1.2 Guard 简化
**文件**: `packages/server/src/common/guards/auth.guard.ts`

**当前问题**:
- 硬编码默认 token `'dev-secret-token'`
- 逻辑可读性不高

**改造方案**:
```typescript
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly apiSecretari: string;

  constructor(private configService: ConfigService) {
    this.apiSecret = this.configService.get<string>('API_SECRET') || 'dev-secret-token-change-in-production';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    if (token !== this.apiSecret) {
      throw new UnauthorizedException('Invalid API Secret');
    }

    return true;
  }
}
```

#### 1.3 AI 模块 Guard 路由限制
**文件**: `packages/server/src/modules/ai/ai.module.ts`

**当前问题**:
- `ai-chats.guard.ts` 使用硬编码 token 验证
- 重复实现认证逻辑

**改造方案**:
- 删除 `ai-chats.guard.ts`
- AI 相关路由统一使用 `AuthGuard`
- 只保留 AI 功能性校验（如模型存在性检查）

#### 1.4 鉴权中间件（Express 中间件兼容）
**文件**: `packages/server/src/common/guards/auth.middleware.ts`

如果项目有 Express 中间件，创建统一的中间件：
```typescript
export function authMiddleware(configService: ConfigService) {
  const apiSecret = configService.get<string>('API_SECRET') || 'dev-secret-token-change-in-production';

  return (req: Request, expressRes: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      return expressRes.status(401).json({ message: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.substring(7);

    if (token !== apiSecret) {
      return expressRes.status(401).json({ message: 'Invalid API Secret' });
    }

    next();
  };
}
```

### 2. 前端改造

#### 2.1 HttpClient 初始化
**文件**: `packages/editor/src/lib/httpClient.ts`

**当前代码**（已经正确）:
```typescript
export const fetchApp = new HttpClient();
```

**调用处设置 Token**:
```typescript
// 初始化时设置（由宿主环境调用）
fetchApp.setApiSecret(import.meta.env.VITE_API_SECRET || 'dev-secret-token-change-in-production');
```

#### 2.2 环境变量配置
```bash
# .env.local
VITE_API_SECRET=dev-secret-token-change-in-production
```

#### 2.3 验证所有 API 调用都使用 fetchApp
检查所有原生 `fetch` 调用，确保使用 `fetchApp`：

**已确认无需修改的文件**:
- `httpClient.ts:56` - HttpClient 内部实现
- `services.ts:29, 238, 359` - 外部 AI 服务调用（使用它们自己的 API key）

**已修复的文件**:
- `packages/editor/src/components/AI/manager.ts` - 所有后端 API 调用已改为 fetchApp

#### 2.4 调用入口注入 Token
在应用入口或初始化代码中统一设置：
```typescript
// src/main.tsx 或类似入口
import { fetchApp } from './lib/httpClient';

fetchApp.setApiSecret(
  import.meta.env.VITE_API_SECRET || 'dev-secret-token-change-in-production'
);
```

### 3. 配置文件

#### 3.1 后端 .env.example
```bash
# API Secret 用于前端与后端之间的身份验证
# 前端需要在请求头中携带: Authorization: Bearer <API_SECRET>
API_SECRET=dev-secret-token-change-in-production
```

#### 3.2 前端 .env.example
```bash
# API Secret 必须与后端 API_SECRET 保持一致
VITE_API_SECRET=dev-secret-token-change-in-production
```

### 4. 测试验证

#### 4.1 单元测试
- `AuthGuard` 测试：验证正确 token 通过、错误 token 拒绝、缺失 header 拒绝
- `HttpClient` 测试：验证 `Authorization` header 正确添加

#### 4.2 集成测试
- 前端发起带有 Bearer Token 的请求
- 后端正确接收并验证
- 错误 Token 返回 401

#### 4.3 E2E 测试
- 完整用户流程：启动应用 → 登录（携带 token）→ 访问受保护路由

### 5. 文档更新

#### 5.1 README
添加认证配置说明：
```markdown
## 认证配置

本项目使用简单的 Bearer Token 认证机制。

### 后端配置

在 `.env` 文件中设置 API_SECRET：
```bash
API_SECRET=your-secret-here
```

### 前端配置

在 `.env.local` 文件中设置 VITE_API_SECRET（必须与后端一致）：
```bash
VITE_API_SECRET=your-secret-here
```

### 高级认证

如果需要更复杂的认证机制（如 JWT、OAuth），请 Fork 项目后自行实现鉴权逻辑。
```

#### 5.2 API 文档
标注所有需要认证的 API 端点：
```markdown
### POST /api/v1/ai/chat

**Headers**:
- `Authorization: Bearer <API_SECRET>` (必需)
```

## 文件清单

### 后端修改
- [ ] `packages/server/src/common/guards/auth.guard.ts` - 简化验证逻辑
- [ ] `packages/server/src/modules/ai/ai.module.ts` - 使用统一 Guard
- [ ] `packages/server/.env.example` - 添加 API_SECRET 说明
- [ ] `packages/server/src/common/guards/auth.middleware.ts` - 可选：创建 Express 中间件

### 前端修改
- [ ] `packages/editor/src/lib/httpClient.ts` - 已正确，无需修改
- [ ] `packages/editor/src/components/AI/manager.ts` - ✅ 已修复
- [ ] `packages/editor/.env.example` - 添加 VITE_API_SECRET 说明
- [ ] `packages/editor/src/main.tsx` - 或其他入口文件，设置 API Secret

### 文档修改
- [ ] `README.md` - 添加认证配置章节
- [ ] `docsAPI.md` - 标注需要认证的端点

## 注意事项

1. **Token 一致性**: 前后端的 API_SECRET 必须完全一致
2. **默认 Token**: 默认使用 `dev-secret-token-change-in-production`，生产环境必须修改
3. **扩展性**: 如果需要更复杂认证，用户需 Fork 项目自行实现
4. **安全性**: 确保 `.env` 文件不被提交到版本控制（已在 .gitignore 中）
