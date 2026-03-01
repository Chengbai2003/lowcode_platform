# 前后端统一 Bearer Token 认证 - 详细实施计划

## 一、背景与目标

### 1.1 背景
- 当前前后端 Token 不一致，导致认证失败
- 前端 `manager.ts` 中部分 API 调用未使用统一的 `fetchApp`
- 后端 Guard 硬编码默认 token，但实际 Token 配置混乱

### 1.2 目标
- 统一前后端 Bearer Token 认证机制
- 使用固定的默认 token（适合开源项目）
- 提供环境变量覆盖能力（生产环境）
- 简化代码，移除重复认证逻辑

### 1.3 设计原则
- **KISS（Keep It Simple）**：单一 API_SECRET 配置
- **信任宿主环境**：不提供登录页，token 由宿主应用注入
- **用户自负责**：公网部署由用户自行修改 token
- **开放扩展**：复杂认证需求用户自行 Fork

---

## 二、技术方案

### 2.1 Token 配置层级

```
优先级（从高到低）：

1. 运行时注入（前端）
   fetchApp.setApiSecret('custom-token')

2. 环境变量（后端）
   API_SECRET=custom-token

3. 固定默认值
   dev-secret-token-change-in-production
```

### 2.2 认证流程

```
前端请求                          后端处理
───────────                        ───────────
fetchApp.get('/api/v1/ai/models')
    │
    ├─> httpClient.request()
    │       │
    │       ├─> headers.Authorization = Bearer {token}
    │       │
    │       └─> fetch(url, options)
    │
    └─> ────────────────────────> Guard
                                    │
                                    ├─> 提取 Bearer token
                                    │
                                    ├─> 对比 API_SECRET
                                    │
                                    └─> 200 OK / 401 Unauthorized
```

### 2.3 安全边界

| 场景 | 默认 Token 是否安全 | 建议 |
|------|-------------------|------|
| 本地开发 | ✅ 安全 | 使用默认值 |
| 内网部署 | ✅ 安全 | 使用默认值 |
| 公网部署 | ❌ 不安全 | 必须修改 |

---

## 三、实施步骤

### 阶段一：后端改造

#### 3.1 后端 Guard 简化

**文件**: `packages/server/src/common/guards/auth.guard.ts`

**当前问题**：
- 硬编码默认 token 值
- Token 对比逻辑不够清晰

**改造方案**：
```typescript
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly apiSecret: string;

  constructor(private configService: ConfigService) {
    // 从环境变量读取，提供默认值
    this.apiSecret = this.configService.get<string>('API_SECRET') || 'dev-secret-token-change-in-production';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    // 检查 Authorization header 是否存在且格式正确
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header. Format: Bearer <token>');
    }

    const token = authHeader.substring(7); // 移除 'Bearer ' 前缀

    // 验证 token
    if (token !== this.apiSecret) {
      throw new UnauthorizedException('Invalid API Secret');
    }

    return true;
  }
}
```

**测试**：
- [ ] 正确 token → 通过
- [ ] 错误 token → 401
- [ ] 缺失 header → 401
- [ ] 格式错误（无 Bearer 前缀）→ 401

---

#### 3.2 AI 模块 Guard 清理

**文件**: `packages/server/src/modules/ai/ai.module.ts`

**当前问题**：
- 可能存在重复的 Guard 实现
- 硬编码 token 验证逻辑分散

**改造方案**：

1. 检查是否有 `ai-chats.guard.ts` 或类似文件：
```bash
find packages/server/src/modules/ai -name "*guard*"
```

2. 如果存在，移除或重构：
```typescript
// 删除或注释掉重复的 Guard
// import { AiChatsGuard } from './guards/ai-chats.guard';

// 统一使用 AuthGuard
{
  path: 'chat',
  method: RequestMethod.POST,
  guard: AuthGuard,
}
```

3. 保留功能性验证（非认证相关）：
```typescript
// 如检查模型是否存在的验证，可以保留
// 职责分离：AuthGuard 做认证，其他 Guard 做业务校验
```

---

#### 3.3 后端环境变量配置

**文件**: `packages/server/.env.example`

**添加**：
```bash
# ──────────────────────────────────────────────────────────────
# 认证配置
# ──────────────────────────────────────────────────────────────

# API Secret 用于前端与后端之间的身份验证
# 前端需要在请求头中携带: Authorization: Bearer <API_SECRET>
#
# 默认值: dev-secret-token-change-in-production
#
# 使用场景:
#   - 本地开发: 使用默认值即可
#   - 内网部署: 使用默认值（网络隔离）
#   - 公网部署: ⚠️ 必须修改为强随机字符串
API_SECRET=dev-secret-token-change-in-production
```

---

### 阶段二：前端改造

#### 3.4 前端 HttpClient 验证

**文件**: `packages/editor/src/lib/httpClient.ts`

**当前状态**（已正确）：
```typescript
export const fetchApp = new HttpClient();
```

**无需修改**，设计正确：
- 单例模式
- `setApiSecret()` 方法允许运行时注入
- `request()` 方法自动添加 Bearer header

---

#### 3.5 AI Manager 修复

**文件**: `packages/editor/src/components/AI/manager.ts`

**当前问题**（部分已修复）：
- [x] 已修复：`addModel` - 改用 `fetchApp.post()`
- [x] 已修复：`updateModelConfig` - 改用 `fetchApp.post()`
- [x] 已修复：`deleteModel` - 改用 `fetchApp.post()`
- [x] 已修复：`loadConfigs` - 改用 `fetchApp.get()`

**验证步骤**：
```bash
# 检查是否还有原生 fetch 调用
grep -n "fetch(" packages/editor/src/components/AI/manager.ts
```

**预期结果**：只应找到 `fetchApp` 相关调用，无原生 `fetch`

---

#### 3.6 前端环境变量配置

**文件**: `packages/editor/.env.example`

**添加**：
```bash
# ──────────────────────────────────────────────────────────────
# 认证配置
# ──────────────────────────────────────────────────────────────

# API Secret 必须与后端 API_SECRET 保持一致
#
# 前端通过以下方式使用:
#   fetchApp.setApiSecret(VITE_API_SECRET)
#
# 默认值: dev-secret-token-change-in-production
#
# 安全提示:
#   前端代码是公开的，VITE_API_SECRET 会被打包到 bundle.js
#   仅在可信的宿主环境中使用，或由宿主应用运行时注入
VITE_API_SECRET=dev-secret-token-change-in-production
```

---

#### 3.7 前端 Token 注入点

**文件**: 需要确定（可能是 `packages/editor/src/main.tsx` 或入口组件）

**当前状态**：需要添加 Token 设置逻辑

**实现方案**：

**方案 A：入口文件设置（推荐）**
```typescript
// packages/editor/src/main.tsx
import { fetchApp } from './lib/httpClient';

// 初始化 API Secret
// 优先使用环境变量，否则使用默认值
const apiSecret = import.meta.env.VITE_API_SECRET || 'dev-secret-token-change-in-production';
fetchApp.setApiSecret(apiSecret);
```

**方案 B：应用组件中设置**
```typescript
// packages/editor/src/App.tsx 或类似
import { useEffect } from 'react';
import { fetchApp } from '../lib/httpClient';

export function App() {
  useEffect(() => {
    const apiSecret = import.meta.env.VITE_API_SECRET || 'dev-secret-token-change-in-production';
    fetchApp.setApiSecret(apiSecret);
  }, []);

  // ...
}
```

**方案 C：暴露给宿主应用（最灵活）**
```typescript
// packages/editor/src/index.tsx
import { fetchApp } from './lib/httpClient';

// 导出设置方法，供宿主应用调用
export function setApiSecret(token: string) {
  fetchApp.setApiSecret(token);
}

// 默认使用环境变量
const defaultSecret = import.meta.env.VITE_API_SECRET || 'dev-secret-token-change-in-production';
fetchApp.setApiSecret(defaultSecret);

// 导出其他内容...
```

**建议**：同时提供方案 A + 方案 C，既有默认行为，又开放给宿主自定义。

---

### 阶段三：验证与测试

#### 3.8 单元测试

**后端 Guard 测试**：
```typescript
// packages/server/src/common/guards/auth.guard.spec.ts

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let configService: ConfigService;

  beforeEach(() => {
    configService = createMockConfigService({
      API_SECRET: 'test-secret'
    });
    guard = new AuthGuard(configService);
  });

  it('should allow request with valid token', () => {
    const context = createMockExecutionContext({
      headers: { authorization: 'Bearer test-secret' }
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject request with invalid token', () => {
    const context = createMockExecutionContext({
      headers: { authorization: 'Bearer wrong-token' }
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should reject request without header', () => {
    const context = createMockExecutionContext({
      headers: {}
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should reject request with malformed header', () => {
    const context = createMockExecutionContext({
      headers: { authorization: 'InvalidFormat' }
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
```

**前端 HttpClient 测试**：
```typescript
// packages/editor/src/lib/httpClient.spec.ts

describe('HttpClient', () => {
  let client: HttpClient;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    client = new HttpClient();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should add Bearer token to request headers', async () => {
    client.setApiSecret('test-token');

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });
    global.fetch = mockFetch;

    await client.post('/test', {});

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token'
        })
      })
    );
  });
});
```

---

#### 3.9 集成测试

**前后端联调测试**：
```typescript
// packages/server/test/auth.integration.spec.ts

describe('Auth Integration', () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = module.createNestApplication();
    await app.init();

    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should reject request without token', async () => {
    const response = await axios.get(`${server}/api/v1/ai/models`, {
      validateStatus: () => true
    });

    expect(response.status).toBe(401);
  });

  it('should reject request with invalid token', async () => {
    const response = await axios.get(`${server}/api/v1/ari/models`, {
      headers: { authorization: 'Bearer invalid-token' },
      validateStatus: () => true
    });

    expect(response.status).toBe(401);
  });

  it('should allow request with valid token', async () => {
    const response = await axios.get(`${server}/api/v1/ai/models`, {
      headers: { authorization: 'Bearer dev-secret-token-change-in-production' }
    });

    expect(response.status).toBe(200);
  });
});
```

---

#### 3.10 手动验证清单

**开发环境验证**：
- [ ] 启动后端，使用默认 API_SECRET
- [ ] 启动前端，使用默认 VITE_API_SECRET
- [ ] 访问 AI 聊天功能，确认正常工作
- [ ] 打开浏览器 Network，检查请求头是否包含 `Authorization: Bearer ...`

**错误场景验证**：
- [ ] 前端不设置 token → 后端返回 401
- [ ] 前端设置错误 token → 后端返回 401
- [ ] 后端修改 API_SECRET，前端未同步 → 返回 401

**生产环境配置验证**：
- [ ] 修改后端 API_SECRET 为随机字符串
- [ ] 修改前端 VITE_API_SECRET 为相同值
- [ ] 重启服务，验证认证通过

---

### 阶段四：文档更新

#### 3.11 README 更新

**添加章节**：
```markdown
## 🔐 认证配置

本项目使用简单的 **Bearer Token** 认证机制，用于前端与后端之间的身份验证。

### 快速开始

**默认配置**（开箱即用）：
```
后端 API_SECRET: dev-secret-token-change-in-production
前端 VITE_API_SECRET: dev-secret-token-change-in-production
```

无需任何配置即可开始使用。

---

### 配置说明

#### 后端配置

在 `packages/server/.env` 文件中设置：

```bash
API_SECRET=your-secret-here
```

#### 前端配置

**方式一：环境变量**

在 `packages/editor/.env.local` 文件中设置：

```bash
VITE_API_SECRET=your-secret-here
```

**方式二：宿主应用注入**

```typescript
import { fetchApp } from '@lowcode-platform/editor/lib/httpClient';

fetchApp.setApiSecret('your-secret-here');
```

---

### 安全建议

| 部署环境 | 默认 Token 安全性 | 建议 |
|---------|------------------|------|
| 本地开发 | ✅ 安全 | 使用默认值 |
| 内网部署 | ✅ 安全 | 使用默认值（网络隔离） |
| 公网部署 | ❌ 不安全 | **必须修改**为强随机字符串 |

**生成强随机 Token**：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 高级认证

本项目提供简单的基础认证，适合自部署场景。

如需以下功能，请 Fork 项目后自行实现：
- 🚀 JWT / Session 认证
- 🚀 用户登录系统
- 🚀 OAuth / SSO 集成
- 🚀 多租户隔离
- 🚀 动态 Token 管理

---

### API 调用示例

使用 `fetchApp` 调用 API，自动携带 Token：

```typescript
import { fetchApp } from './lib/httpClient';

const data = await fetchApp.get('/api/v1/ai/models');
await fetchApp.post('/api/v1/ai/models', config);
await fetchApp.delete('/api/v1/ari/models/delete', { id });
```

请求自动添加 `Authorization: Bearer <token>` header。
```

---

#### 3.12 API 文档更新

**标注受保护的端点**：

```markdown
## AI 端点

### POST /api/v1/ai/chat

💡 **需要认证**：请求头需携带 `Authorization: Bearer <API_SECRET>`

发送聊天消息给 AI 模型。

**请求示例**：
```bash
curl -X POST http://localhost:3000/api/v1/ai/chat \
  -H "Authorization: Bearer dev-secret-token-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "modelId": "gpt-4"
  }'
```

---

### GET /api/v1/ai/models

💡 **需要认证**：请求头需携带 `Authorization: Bearer <API_SECRET>`

获取所有配置的 AI 模型。

**请求示例**：
```bash
curl http://localhost:3000/api/v1/ai/models \
  -H "Authorization: Bearer dev-secret-token-change-in-production"
```
```

---

#### 3.13 CHANGELOG 更新

```markdown
## [Unreleased]

### Fixed
- 修复前后端 Token 认证不一致问题
- 统一使用 Bearer Token 认证机制
- 移除重复的 Guard 实现，简化认证逻辑

### Changed
- 重构 `AuthGuard` 使用环境变量配置 API_SECRET
- 前端 `AIModelManager` 统一使用 `fetchApp` 调用 API

### Security
- 添加认证配置文档和安全建议
- 明确生产环境需修改默认 Token
```

---

## 四、文件修改清单

### 后端修改

| 文件 | 类型 | 状态 |
|------|------|------|
| `packages/server/src/common/guards/auth.guard.ts` | 重构 | ⬜ 待修改 |
| `packages/server/src/modules/ai/ai.module.ts` | 清理 | ⬜ 待检查 |
| `packages/server/.env.example` | 添加配置 | ⬜ 待添加 |
| `packages/server/src/common/guards/auth.guard.spec.ts` | 添加测试 | ⬜ 可选 |

### 前端修改

| 文件 | 类型 | 状态 |
|------|------|------|
| `packages/editor/src/lib/httpClient.ts` | 验证 | ✅ 已正确 |
| `packages/editor/src/components/AI/manager.ts` | 修复 | ✅ 已修复 |
| `packages/editor/.env.example` | 添加配置 | ⬜ 待添加 |
| `packages/editor/src/main.tsx` 或入口 | 添加初始化 | ⬜ 待确定位置 |
| `packages/editor/src/lib/httpClient.spec.ts` | 添加测试 | ⬜ 可选 |

### 文档修改

| 文件 | 类型 | 状态 |
|------|------|------|
| `README.md` | 添加认证章节 | ⬜ 待添加 |
| `docs/API.md` 或类似 | 标注受保护端点 | ⬜ 待添加 |
| `CHANGELOG.md` | 记录变更 | ⬜ 待添加 |

---

## 五、风险与注意事项

### 5.1 安全风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 默认 Token 被公开 | 公网部署不安全 | 文档明确提示，生产环境必须修改 |
| 前端代码暴露 Token | 打包后可被查看 | 信任宿主环境，文档说明适用场景 |
| 无登录机制 | 需要宿主注入 Token | 开放 `setApiSecret()` 方法 |

### 5.2 兼容性风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 破坏现有 Token 配置 | 用户需同步修改 | 默认值保持不变，平滑过渡 |
| Guard 签名变化 | 影响其他模块 | 只改内部实现，接口不变 |

### 5.3 实施顺序

**必须按顺序完成**：
1. 后端 Guard 重构（先改验证逻辑）
2. 前端 Token 初始化（确保发送正确 Token）
3. 测试验证（确保功能正常）
4. 文档更新（帮助用户配置）

---

## 六、验收标准

### 6.1 功能验收

- [ ] 后端 Guard 正确验证 Bearer Token
- [ ] 前端所有 API 调用携带正确 Token
- [ ] 错误 Token 返回 401 Unauthorized
- [ ] 缺失 Token 返回 401 Unauthorized
- [ ] 正确 Token 请求成功

### 6.2 代码质量验收

- [ ] 无硬编码 token（除默认值）
- [ ] 无重复的验证逻辑
- [ ] 单元测试覆盖率 > 80%
- [ ] 代码通过 lint 检查
- [ ] TypeScript 类型检查通过

### 6.3 文档验收

- [ ] README 有认证配置章节
- [ ] API 文档标注受保护端点
- [ ] 有安全提示和配置建议
- [ ] .env.example 包含配置说明

### 6.4 用户体验验收最终用户（开发者）能够：
- [ ] 开箱即用（无需配置）
- [ ] 查看文档了解如何修改 Token
- [ ] 理解安全边界和适用场景

---

## 七、后续优化方向

### 7.1 可选增强

- [ ] 添加 Token 有效期机制
- [ ] 支持多个 Token（团队协作）
- [ ] 添加 Token 轮换功能
- [ ] 提供 CLI 工具生成强 Token

### 7.2 扩展文档

- [ ] 添加安全最佳实践指南
- [ ] 添加常见问题 FAQ
- [ ] 提供 Nginx 反向代理配置示例
- [ ] 添加 Docker 部署安全配置

---

## 八、Agent 与 Skill 建议

根据此实施计划，可以使用以下 Agent 辅助开发：

### 推荐使用的 Agent

| Agent | 用途 | 时机 |
|-------|------|------|
| **security-reviewer** | 审查认证相关安全性 | 代码修改完成后 |
| **code-reviewer** | 代码质量审查 | 每个 PR 提交前 |
| **tdd-guide** | 引导测试驱动开发 | 编写 Guard 测试时 |

### 使用建议

```bash
# 1. 使用 security-reviewer 检查认证逻辑
# 在修改 auth.guard.ts 后调用

# 2. 使用 code-reviewer 审查所有修改
# 在提交 PR 前调用

# 3. 使用 tdd-guide 确保测试覆盖
# 在编写 Guard 单元测试时调用
```

---

## 九、实施时间估算

| 阶段 | 任务 | 预估时间 |
|------|------|----------|
| 阶段一 | 后端 Guard 重构 | 30 分钟 |
| 阶段二 | 前端改造 | 20 分钟 |
| 阶段三 | 验证与测试 | 40 分钟 |
| 阶段四 | 文档更新 | 30 分钟 |
| **总计** | **** | **约 2 小时** |

---

## 十、联系方式

如有问题或需要帮助：
- 查看文档：`README.md` → 认证配置章节
- 提交 Issue：GitHub Issues
- Fork 并自定义：适合企业级定制需求

---

**文档版本**: v1.0
**最后更新**: 2026-03-01
**维护者**: @lowcode-platform
