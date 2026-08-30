# [M0-1] [Architecture] 建立 DSL 单一真相源与 schemaVersion/pageVersion 边界 实施计划

> **所属 Issue**：[#16 [M0-1] [Architecture] 建立 DSL 单一真相源与 schemaVersion/pageVersion 边界](https://github.com/Chengbai2003/lowcode_platform/issues/16)  
> **架构基线**：[ADR-0001](../adr/0001-separate-schema-and-page-version.md) · [Schema Contract](../architecture/schema-contract.md)  
> **当前阶段**：`Milestone 0 (M0)` | **优先级**：`P0`

---

## 一、核心定位与设计原则

本实施计划旨在为低代码平台建立**单一、纯粹、环境无关的 DSL 协议真相源**，彻底解耦 **DSL 格式版本** 与 **页面内容修订/快照版本**。

### 核心设计约束：

1. **ActionList 纯数据类型迁入 Contract**：`packages/schema-contract/src/actions/` 作为 Schema 持久化 Action 数据的单一真相源，绝不包含 Renderer 运行态类与执行器；`customScript` 明确剔除；
2. **字面量受支持版本与递归只读 JSON**：`schemaVersion` 采用 `SupportedSchemaVersion (0)` 字面量类型，JSON 数据结构全部递归 `Readonly`；
3. **存储模型与运行时元数据解耦**：
   - 存储模型分层为 `StoredPageRecord`（指针）+ `PageSnapshotRecord`（快照）+ `PageDocument`（对外传输）；
   - `PageRuntimeMetadataProvider` 位于 Service 业务编排层，Repository 仅做原子存储，不感知组件库；
4. **精确的场景化版本命名映射**：严格区分只读上下文 `pageVersion`、CAS 保存基线 `basePageVersion` 与存储指针 `currentPageVersion`；
5. **Contract 纯校验器 + 后端薄适配器**：Contract 输出纯数据 `SchemaContractIssue[]`，后端在 PR 2 改造现有 `schema-validation.ts` 为薄适配器，直接抛出 `BadRequestException`，不长期复制两套规则；
6. **安全 Canonicalization**：`parsePageSchemaJson` 先行检查字节长度；安全读取属性描述符并阻断 getters/setters/函数/Symbol/类实例，全新重建后递归 `deepFreeze`；
7. **自动化架构门禁脚本**：在 PR 4 增加 `scripts/check-schema-contract-boundaries.mjs`（`pnpm check:architecture`），自动在 CI 中拦截非法别名、版本回写与反向依赖；
8. **4 笔可独立编译运行的垂直 PR 拆分**：保证每个 PR 独立合入后前后端行为完全一致、全仓测试保持全绿。

---

## 二、核心类型与契约定义

```
                       ┌─────────────────────────────────────────────────────────────┐
                       │               @lowcode-platform/schema-contract             │
                       │             (纯 TS、环境无关、零外部框架依赖)               │
                       │  - PageSchema / ComponentNode / ActionList                  │
                       │  - Parse / Validate / Canonicalize / DeepFreeze             │
                       └──────────────────────────────┬──────────────────────────────┘
                                                      │
         ┌────────────────────┬───────────────────────┼───────────────────────┬────────────────────┐
         ▼                    ▼                       ▼                       ▼                    ▼
┌──────────────────┐ ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ ┌──────────────────┐
│ packages/frontend│ │ packages/backend │  │ packages/backend │  │ packages/backend │ │ packages/backend │
│ (Editor/Store/UI)│ │ (PageSchema/Repo)│  │ (Compiler)       │  │ (Agent & Tools)  │ │ (SchemaContext)  │
└──────────────────┘ └──────────────────┘  └──────────────────┘  └──────────────────┘ └──────────────────┘
```

### 1. 递归只读 JSON 与版本字面量（`schema-contract`）

```ts
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type JsonObject = {
  readonly [key: string]: JsonValue;
};

/** 支持的 DSL 格式版本字面量 */
export const SUPPORTED_SCHEMA_VERSIONS = [0] as const;
export type SupportedSchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];
export const CURRENT_DRAFT_SCHEMA_VERSION: SupportedSchemaVersion = 0;
```

### 2. Action 数据结构单一真相源（`schema-contract/src/actions/`）

只迁移持久化进 Schema JSON 的纯数据描述类型（绝不包含 `DSLExecutor`、`ExecutionContext`、`ActionHandler` 等运行态类型）：

```ts
// packages/schema-contract/src/actions/action-union.ts
export type Action =
  | SetValueAction
  | IfAction
  | LoopAction
  | NavigateAction
  | DelayAction
  | FeedbackAction
  | DialogAction
  | LogAction;

export type ActionList = readonly Action[];
```

### 3. 组件节点与 PageSchema（`schema-contract`）

```ts
export interface ComponentNode {
  readonly id: string;
  readonly type: string;
  readonly props?: Readonly<JsonObject>;
  readonly childrenIds?: readonly string[];
  readonly events?: Readonly<Record<string, ActionList>>;
}

export interface PageSchema {
  readonly schemaVersion: SupportedSchemaVersion;
  readonly rootId: string;
  readonly components: Readonly<Record<string, ComponentNode>>;
}

export interface RuntimeCompatibility {
  readonly componentPresetId: string;
  readonly componentPresetVersion: string;
  readonly rendererVersion: string;
}
```

### 4. 存储与对外模型分层（`backend`）

```ts
/** 1. 数据库/文件页面指针记录 (不含 schema) */
export interface StoredPageRecord {
  readonly pageId: string;
  readonly systemId: string;
  readonly currentPageVersion: number;
  readonly latestSnapshotId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 2. 不可变快照记录 */
export interface PageSnapshotRecord {
  readonly snapshotId: string;
  readonly pageId: string;
  readonly pageVersion: number;
  readonly runtimeCompatibility: RuntimeCompatibility;
  readonly schema: PageSchema;
  readonly createdAt: string;
}

/** 3. 对外 API 传输模型 (PageDocument) */
export interface PageDocument {
  readonly pageId: string;
  readonly pageVersion: number;
  readonly snapshotId: string;
  readonly runtimeCompatibility: RuntimeCompatibility;
  readonly schema: PageSchema;
  readonly savedAt: string;
}
```

### 5. 校验与标准化 API 规范

```ts
export interface SchemaContractIssue {
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export type ParsePageSchemaResult =
  | { readonly ok: true; readonly value: PageSchema }
  | { readonly ok: false; readonly issues: readonly SchemaContractIssue[] };

// 核心入口：
export function parsePageSchemaJson(rawJson: string): ParsePageSchemaResult;
export function validatePageSchemaValue(input: unknown): ParsePageSchemaResult;
export function createCanonicalPageSchema(validated: PageSchema): PageSchema;
export function assertSupportedPageSchema(schema: unknown): asserts schema is PageSchema;
export function requireSupportedPageSchema(input: unknown): PageSchema;
```

---

## 三、版本字段语义与命名对照表

| 场景                        | 字段名               | 解释                                                                |
| :-------------------------- | :------------------- | :------------------------------------------------------------------ |
| **获取指定页面版本**        | `pageVersion`        | `GET /api/v1/pages/:pageId/schema?pageVersion=3`，可选查询          |
| **API 返回页面文档**        | `pageVersion`        | `PageDocument.pageVersion`，表示当前快照版本                        |
| **Agent 请求与上下文**      | `pageVersion`        | `AgentEditRequestDto.pageVersion`，表示对话所基于的页面版本         |
| **保存时的 CAS 基线**       | `basePageVersion`    | `SavePageSchemaDto.basePageVersion`，表示期望基于哪个版本覆盖写入   |
| **Patch Preview 来源**      | `basePageVersion`    | `PatchPreviewResponseDto.basePageVersion`，表示补丁基于哪个版本计算 |
| **Repository 指针当前版本** | `currentPageVersion` | `StoredPageRecord.currentPageVersion`，数据库指针的最新版本         |
| **快照版本**                | `pageVersion`        | `PageSnapshotRecord.pageVersion`，当前快照对应的单调递增修订号      |

---

## 四、4 笔垂直 PR 实施计划

```text
PR 1：Contract Package 骨架、Action 数据集与纯校验器 (零破坏，全仓 100% 绿灯)
  ↓
PR 2：Schema 结构、存储分层重命名与 Validator 薄适配器改造
  ↓
PR 3：API/DTO/Agent/前端服务版本命名垂直迁移 (version -> pageVersion / basePageVersion)
  ↓
PR 4：消费面导入清理、requireSupported 统一与 check:architecture 门禁
```

---

### 📦 PR 1：Contract Package 骨架、Action 数据集与纯校验器

**核心范围**：新建 `@lowcode-platform/schema-contract` 包，包含 Action 纯数据子模块与纯校验器，不改动现有 API 和存储行为。

1. **新建 `packages/schema-contract/package.json`**：
   - 包名：`@lowcode-platform/schema-contract`
   - 配置构建与类型导出。
2. **新建 `packages/schema-contract/src/actions/*`**：
   - `data.ts` (`SetValueAction`)
   - `flow.ts` (`IfAction`, `LoopAction`)
   - `navigation.ts` (`NavigateAction`)
   - `async.ts` (`DelayAction`)
   - `ui.ts` (`FeedbackAction`, `DialogAction`)
   - `debug.ts` (`LogAction`)
   - `action-union.ts` (`Action`, `ActionList`)
3. **新建 `packages/schema-contract/src/types/*`**：
   - `json.ts`（递归只读 `JsonValue`、`JsonObject`）
   - `versions.ts`（`SUPPORTED_SCHEMA_VERSIONS = [0]`）
   - `node.ts`（`ComponentNode`）
   - `schema.ts`（`PageSchema`）
   - `record.ts`（`RuntimeCompatibility`）
4. **新建 `packages/schema-contract/src/validation/*`**：
   - `parse.ts`：`parsePageSchemaJson`（校验字节大小、安全反序列化）与 `validatePageSchemaValue`；
   - `tree.ts`：纯组件拓扑图校验（成环、多父、重复 child、孤儿节点检测）；
   - `actions.ts`：纯 Action 数据类型校验（`customScript` 校验失败）；
5. **新建 `packages/schema-contract/src/canonicalize.ts`**：
   - `createCanonicalPageSchema`：安全属性描述符读取，丢弃原型链，全新普通对象重建并递归 `deepFreeze`；
   - `requireSupportedPageSchema`：用于 Compiler、Renderer、Repository 与持久化边界；消费面必须使用其返回的 canonical、深冻结对象；
   - `assertSupportedPageSchema`：仅用于无需 canonical 返回值的同步类型断言；
6. **单元测试 `packages/schema-contract/src/__tests__/*`**：
   - 覆盖 JSON 预算、结构校验、拓扑图错误检测、Action 校验、deepFreeze 深度防篡改。

---

### 📦 PR 2：Schema 结构、存储分层重命名与 Validator 薄适配器改造

**核心范围**：解决 Schema 污染，Repository 严格分层重命名，改造现有后端校验器为薄适配器，全仓 Schema 数据增加 `schemaVersion: 0`。

1. **Service 层引入 `PageRuntimeMetadataProvider`**：
   ```ts
   export interface PageRuntimeMetadata {
     systemId: string;
     runtimeCompatibility: RuntimeCompatibility;
   }
   export interface PageRuntimeMetadataProvider {
     resolve(pageId: string): PageRuntimeMetadata;
   }
   export class DraftPageRuntimeMetadataProvider implements PageRuntimeMetadataProvider {
     resolve(): PageRuntimeMetadata {
       return {
         systemId: 'default',
         runtimeCompatibility: {
           componentPresetId: 'builtin-antd',
           componentPresetVersion: '0.0.0-draft',
           rendererVersion: '0.0.0-draft',
         },
       };
     }
   }
   ```
2. **Repository 存储结构重命名与解耦**：
   - `PageRecord` $\rightarrow$ `StoredPageRecord` (`id` $\rightarrow$ `pageId`, `currentVersion` $\rightarrow$ `currentPageVersion`)；
   - `PageSchemaSnapshotRecord` $\rightarrow$ `PageSnapshotRecord` (`id` $\rightarrow$ `snapshotId`, `version` $\rightarrow$ `pageVersion`)；
   - 彻底删除 `const normalizedSchema = { ...params.schema, version: nextVersion }`，严禁版本回写 Schema；
   - 快照保存持久化 `snapshot: PageSnapshotRecord = { snapshotId, pageId, pageVersion: nextPageVersion, runtimeCompatibility, schema, createdAt: savedAt }`。
3. **改造后端 `schema-validation.ts` 为薄适配器**：

   ```ts
   // packages/backend/src/modules/page-schema/schema-validation.ts
   import { validatePageSchemaValue, PageSchema } from '@lowcode-platform/schema-contract';
   import { BadRequestException } from '@nestjs/common';

   export function assertValidPageSchema(input: unknown): asserts input is PageSchema {
     const result = validatePageSchemaValue(input);
     if (!result.ok) {
       throw new BadRequestException({
         message: 'Invalid page schema',
         issues: result.issues,
       });
     }
   }
   ```

4. **临时兼容 Alias 与 Fixtures 升级**：
   - `packages/frontend/src/types/schema.ts` 临时 re-export Contract 类型；
   - `packages/backend/src/modules/schema-context/__fixtures__/*` 与全仓 mock schemas 全部补充 `schemaVersion: 0`。

---

### 📦 PR 3：API/DTO/Agent/前端服务版本命名垂直迁移

**核心范围**：前后端协同更新所有接口参数和 DTO 命名，消除任何语义混淆，保证合入后全链路可运行。

1. **后端 API / DTO / Service 改造**：
   - `SavePageSchemaDto`：`baseVersion` / `version` $\rightarrow$ `basePageVersion?: number`；
   - `PageSchemaController`：`GET :pageId/schema` 接收 `?pageVersion=`，返回 `PageDocument`；
   - `AgentEditRequestDto`：`version` $\rightarrow$ `pageVersion?: number`；
   - `PatchPreviewResponseDto`：`version` $\rightarrow$ `basePageVersion: number`；
   - `AgentRunnerService` / `AgentTraceService`：统一使用 `pageVersion`；
2. **前端 Editor / Services / Hooks 改造**：
   - `packages/frontend/src/editor/services/pageSchemaApi.ts`：更新请求参数与返回类型（使用 `pageVersion` / `basePageVersion` 与 `PageDocument`）；
   - `LowcodeEditor.tsx`、`usePageLifecycle.ts`、`useAIPatch.ts`、`schemaSync.ts`、`editor-store.ts`：彻底删除 `schemaVersionRef` 回写逻辑，状态中明确分离 `schema` 与 `pageVersion`；
   - `AIAssistant` 发起请求传递 `pageVersion`；
3. **同步更新前后端所有相关单测与 E2E 测试**。

---

### 📦 PR 4：消费面导入清理、requireSupported 统一与 check:architecture 门禁

**核心范围**：彻底移除所有旧别名与重复 interface，全链路接入 `requireSupportedPageSchema` 并消费其 canonical 返回值，加入自动化架构门禁脚本。

1. **消费面全量直接导入 Contract**：
   - 前端 Editor、Renderer、Backend Compiler、Agent、SchemaContext 全部直接 `import { PageSchema, ComponentNode, ActionList } from '@lowcode-platform/schema-contract'`；
2. **删除冗余文件与临时 Alias**：
   - 删除 `packages/backend/src/modules/schema-context/types/schema.types.ts`；
   - 删除 `packages/backend/src/modules/compiler/schema.types.ts`；
   - 清理 `packages/frontend/src/types/schema.ts` 中的临时别名；
   - 检查并移除 `packages/backend/package.json` 对 `@lowcode-platform/frontend` 的无用依赖；
3. **全链路统一 Fail-Close 安全边界**：
   - Compiler、Renderer、Repository 统一使用 `const canonicalSchema = requireSupportedPageSchema(schema)`；
   - 校验通过后只消费 `canonicalSchema`，不得继续读取原始 `schema` 输入；
4. **新增自动化架构检查脚本 `scripts/check-schema-contract-boundaries.mjs`**：

   ```js
   // 检查 5 项架构不变式：
   // 1. schema.version 读写残留
   // 2. baseVersion 字段残留
   // 3. A2UISchema / A2UIComponent 旧别名残留
   // 4. backend 依赖 frontend 反向引用
   // 5. 重复定义的 PageSchema / ComponentNode
   ```

   - 在根目录 `package.json` 中配置 `"check:architecture": "node scripts/check-schema-contract-boundaries.mjs"`；
   - 在 `.github/workflows/ci.yml` 中新增 `pnpm check:architecture` 门禁。

---

## 五、验证计划 (Verification Plan)

### 1. 规范化测试套件运行

```bash
# 1. 自动化架构不变式检查
pnpm check:architecture

# 2. 全仓 TypeScript 类型检查
pnpm type-check

# 3. 代码规范审查
pnpm lint
pnpm format:check

# 4. 运行 Contract 包测试
pnpm --filter @lowcode-platform/schema-contract test

# 5. 运行全仓自动发现的前后端测试套件
pnpm test:frontend
pnpm test:backend

# 6. 运行编译器模板回归
pnpm --filter @lowcode-platform/backend compiler:regression
```

### 2. 关键架构不变式（Invariants）验收

- [ ] **全仓无残留**：`pnpm check:architecture` 执行通过，输出零警告零报错；
- [ ] **Schema JSON 纯净性**：持久化与导出的 `PageSchema` JSON 仅含 `schemaVersion`（固定为 `0`），绝无 `pageVersion`；
- [ ] **单向依赖建立**：`backend` 与 `frontend` 均单向依赖 `@lowcode-platform/schema-contract`，`backend` 零引用 `frontend`；
- [ ] **Fail-Close 统一生效**：向 Compiler、Renderer 或 Repository 传入 `{ schemaVersion: 999 }` 时，由 `requireSupportedPageSchema` 统一抛出 `UnsupportedSchemaVersionError` 并阻断流程；合法输入仅通过其 canonical 返回值进入后续处理。

---

## 六、实施文档索引

- 📄 架构基线：[ADR-0001](../adr/0001-separate-schema-and-page-version.md)
- 📄 契约原则：[Schema Contract](../architecture/schema-contract.md)
- 📄 演进路线：[A2UI Evolution Roadmap](../roadmap/a2ui-evolution-roadmap.md)
