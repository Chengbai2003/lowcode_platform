# DSL（领域特定语言）使用指南

## 概述

本项目的事件处理系统已完全重构为基于DSL（领域特定语言）的Action执行模型。相比之前的直接执行JavaScript代码，新方案具有以下优势：

- ✅ **安全性**：所有Action都是预定义的，不执行任意代码
- ✅ **可视化**：每个Action都可以在可视化编辑器中配置
- ✅ **可序列化**：所有逻辑都是JSON格式，易于存储和传输
- ✅ **可扩展**：通过`customScript`和`customAction`支持复杂场景

---

## 基本语法

### 事件定义格式

```json
{
  "id": "button1",
  "type": "Button",
  "props": {
    "children": "提交"
  },
  "events": {
    "onClick": [
      { "type": "message", "content": "Hello, World!" }
    ]
  }
}
```

### 表达式语法

使用 `{{ ... }}` 包裹表达式，支持变量引用和运算：

```json
{
  "events": {
    "onClick": [
      {
        "type": "setField",
        "field": "status",
        "value": "{{ formData.status === 'pending' ? 'approved' : 'rejected' }}"
      }
    ]
  }
}
```

---

## 可用Actions

### 1. 数据操作 Actions

#### setField - 设置字段值
```json
{
  "type": "setField",
  "field": "formData.name",
  "value": "{{ inputName }}"
}
```

#### mergeField - 合并对象字段
```json
{
  "type": "mergeField",
  "field": "user",
  "value": {
    "lastLogin": "{{ new Date() }}",
    "ip": "{{ clientIp }}"
  }
}
```

#### clearField - 清除字段
```json
{
  "type": "clearField",
  "field": "tempData"
}
```

---

### 2. UI交互 Actions

#### message - 显示消息提示
```json
{
  "type": "message",
  "content": "操作成功！",
  "messageType": "success",
  "duration": 3
}
```

#### modal - 显示模态框
```json
{
  "type": "modal",
  "title": "确认删除",
  "content": "确定要删除这条记录吗？",
  "showCancel": true,
  "onOk": [
    { "type": "apiCall", "url": "/api/delete", "method": "POST" },
    { "type": "message", "content": "删除成功", "messageType": "success" }
  ]
}
```

#### notification - 显示通知
```json
{
  "type": "notification",
  "title": "新消息",
  "description": "您有一条新的系统通知",
  "messageType": "info",
  "placement": "topRight"
}
```

---

### 3. 导航 Actions

#### navigate - 页面跳转
```json
{
  "type": "navigate",
  "to": "/user/detail",
  "params": {
    "id": "{{ formData.userId }}",
    "from": "list"
  },
  "replace": false
}
```

#### openTab - 打开新标签
```json
{
  "type": "openTab",
  "id": "user-{{ formData.userId }}",
  "title": "用户详情 - {{ formData.userName }}",
  "path": "/user/detail?id={{ formData.userId }}"
}
```

---

### 4. 状态管理 Actions

#### dispatch - Redux Dispatch
```json
{
  "type": "dispatch",
  "action": {
    "type": "UPDATE_USER",
    "payload": "{{ formData }}"
  }
}
```

#### setState - 设置组件状态
```json
{
  "type": "setState",
  "state": {
    "loading": true,
    "error": null
  }
}
```

---

### 5. 异步操作 Actions

#### apiCall - API调用
```json
{
  "type": "apiCall",
  "url": "/api/submit",
  "method": "POST",
  "body": "{{ formData }}",
  "resultTo": "apiResult",
  "onSuccess": [
    { "type": "message", "content": "提交成功", "messageType": "success" }
  ],
  "onError": [
    { "type": "message", "content": "{{ error }}", "messageType": "error" }
  ],
  "showError": true
}
```

#### delay - 延迟执行
```json
{
  "type": "delay",
  "ms": 1000
}
```

#### waitCondition - 等待条件
```json
{
  "type": "waitCondition",
  "condition": "{{ data.status === 'completed' }}",
  "interval": 500,
  "timeout": 30000,
  "onTimeout": [
    { "type": "message", "content": "操作超时", "messageType": "error" }
}
```

---

### 6. 流程控制 Actions

#### if - 条件分支
```json
{
  "type": "if",
  "condition": "{{ formData.amount > 1000 }}",
  "then": [
    { "type": "message", "content": "大额交易，需要审批" }
  ],
  "else": [
    { "type": "apiCall", "url": "/api/approve", "method": "POST" }
  ]
}
```

#### loop - 循环执行
```json
{
  "type": "loop",
  "over": "{{ formData.items }}",
  "itemVar": "item",
  "indexVar": "index",
  "actions": [
    {
      "type": "apiCall",
      "url": "/api/process/{{ item.id }}",
      "method": "POST"
    }
  ]
}
```

#### parallel - 并行执行
```json
{
  "type": "parallel",
  "actions": [
    { "type": "apiCall", "url": "/api/user" },
    { "type": "apiCall", "url": "/api/orders" },
    { "type": "apiCall", "url": "/api/settings" }
  ],
  "waitAll": true
}
```

#### tryCatch - 异常处理
```json
{
  "type": "tryCatch",
  "try": [
    { "type": "apiCall", "url": "/api/submit", "method": "POST" }
  ],
  "catch": [
    { "type": "message", "content": "{{ error }}", "messageType": "error" }
  ],
  "finally": [
    { "type": "setState", "state": { "loading": false } }
  ]
}
```

---

### 7. 扩展点 Actions

#### customScript - 执行自定义JS代码（需要AST验证）
```json
{
  "type": "customScript",
  "code": "const result = await context.api.get('/api/data'); return result.filter(item => item.active);",
  "timeout": 5000
}
```

**注意**：此功能默认关闭，需要显式启用`enableCustomScript`选项。

---

## 完整示例

### 表单提交示例

```json
{
  "rootId": "root",
  "components": {
    "root": {
      "id": "root",
      "type": "Container",
      "childrenIds": ["submitButton"]
    },
    "submitButton": {
      "id": "submitButton",
      "type": "Button",
      "props": {
        "type": "primary",
        "children": "提交表单"
      },
      "events": {
        "onClick": [
          {
            "type": "setState",
            "state": { "loading": true }
          },
          {
            "type": "apiCall",
            "url": "/api/submit",
            "method": "POST",
            "body": "{{ formData }}",
            "resultTo": "submitResult",
            "onSuccess": [
              {
                "type": "message",
                "content": "提交成功！",
                "messageType": "success"
              },
              {
                "type": "if",
                "condition": "{{ formData.needRedirect }}",
                "then": [
                  {
                    "type": "navigate",
                    "to": "/success"
                  }
                ]
              }
            ],
            "onError": [
              {
                "type": "message",
                "content": "提交失败：{{ error }}",
                "messageType": "error"
              }
            ]
          },
          {
            "type": "setState",
            "state": { "loading": false }
          }
        ]
      }
    }
  }
}
```

---

## 迁移指南

### 从旧格式迁移到新格式

**旧格式（已废弃）：**
```json
{
  "events": {
    "onClick": "context.dispatch({ type: 'SUBMIT', payload: formData })"
  }
}
```

**新格式（DSL）：**
```json
{
  "events": {
    "onClick": [
      {
        "type": "dispatch",
        "action": {
          "type": "SUBMIT",
          "payload": "{{ formData }}"
        }
      }
    ]
  }
}
```

---

## 注意事项

1. **表达式安全**：表达式中的变量必须来自执行上下文，不要直接访问全局对象
2. **异步处理**：所有Actions都是异步的，注意使用`await`和错误处理
3. **性能考虑**：避免在循环中执行大量Action，考虑使用批量API
4. **调试**：在开发环境下启用`debug`模式查看详细日志

---

## 未来扩展

计划实现的功能：

- [ ] 可视化Action编辑器
- [ ] Action模板和复用
- [ ] 自定义Action插件系统
- [ ] Web Worker沙箱执行
- [ ] 执行历史和回放
