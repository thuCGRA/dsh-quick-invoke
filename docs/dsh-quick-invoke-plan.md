# DSH Quick Invoke 开发计划

## 1. 开发目标

实现独立 Cordis 插件 `dsh-quick-invoke`，为 DSH Web 提供以下快捷调用：

```text
/skill <skill-name> [任务]
/agent <agent-name> [任务]
/plugin list
/plugin inspect <plugin-name>
/plugin open <plugin-name>
```

使用 DSH `0.1.1-rc.2` 同版本包，不修改 DSH 核心，不实现 Tool 快捷命令或插件启停命令。

## 2. 目录结构

```text
dsh-quick-invoke/
├── docs/
│   ├── dsh-quick-invoke-invoke.md
│   └── dsh-quick-invoke-plan.md
├── .dsh/skills/quick-invoke-test/SKILL.md
├── examples/agent-presets/quick-invoke-test/
│   ├── agent.cordis.yml
│   └── preset.yml
├── src/
│   ├── index.js
│   ├── parser.js
│   ├── dsh-adapter.js
│   └── command-runtime.js
├── client/
│   ├── index.js
│   └── slash-source.js
└── test/
```

## 3. 开发阶段

| 阶段 | 工作内容 | 交付物 | 通过条件 |
|---|---|---|---|
| M0 | 锁定 DSH 版本，确认包导出和 Cordis 加载方式 | API 清单 | 依赖均可解析 |
| M1 | 建立 package、TypeScript、Cordis 插件入口 | 可加载骨架 | 可导入、卸载 |
| M2 | 实现命令模型、名称校验和纯解析器 | Parser | 正例、拒绝例通过 |
| M3 | 注册 `skill`、`agent`、`plugin` Host 命令 | 命令运行时 | 仅注册支持的命令 |
| M4 | 接入 `/` 输入源和补全 | Client source | UI/直接提交一致 |
| M5 | 接入 Skill、Agent、Plugin 只读流程 | MVP | 三类命令可运行 |
| M6 | 完成权限、审计、卸载和回归测试 | 测试报告 | 安全和兼容性通过 |
| M7 | 安装到 DSH Web 并验证真实会话 | 发布包 | Web 中可用，Session log 可见 Host 命令生命周期 |

M0–M5 构成 MVP。`/plugin enable` 和 `/plugin disable` 不在任何阶段实现。

## 4. 详细任务

### Task 1：建立插件包

创建 `package.json`、`src/index.js`、`src/dsh-adapter.js` 和 Node 原生测试。

使用同版本 DSH 包，并配置：

```json
{
  "scripts": {
    "test": "node --test --test-isolation=none test/**/*.test.js"
  }
}
```

验证：

```bash
npm test
npm run typecheck
```

### Task 2：实现纯解析器

创建 `src/model.ts`、`src/parser.ts` 和 `test/parser.test.ts`。

必须测试：

```text
/skill quick-invoke-test 验证命令
/agent quick-invoke-test
/plugin list
/plugin inspect sample
/plugin open sample
```

必须拒绝：

```text
/tool sample
@skill:sample
$NAME
/plugin enable sample
/plugin disable sample
```

同时覆盖 URL、代码块、转义 `/`、未知命令、空参数、多余空格和旧 `/技能名` 手势。

### Task 3：接入 Host 命令

创建 `src/command-runtime.ts` 和 `test/commands.test.ts`。

- 使用 `ctx.commands.register()` 注册 `skill`、`agent`、`plugin`；
- 三条命令必须声明 `input.hint`，否则带参数输入不会进入 Host Command；
- 使用 `ctx.commands.execute()` 完成权威执行和生命周期记录；
- Skill 使用 `ctx.skills.list/get` 和 `userInvocable` 校验；
- Agent 使用 `ctx.agentPresets.list/resolve/recompose`；
- Plugin 使用 `pluginInventory.list()`，只允许 `list/inspect/open`；
- 不注册 `tool`、`enable` 或 `disable`。

### Task 4：接入 UI 补全

创建 `client/client.js`、`client/index.js` 和 `test/web-e2e.test.js`。

使用：

```ts
ctx.commandUi.decorate(decoration);
```

覆盖 `/`、`/sk`、`/skill `、`/agent `、`/plugin `、`/plugin inspect ` 和 `/plugin open `。Host 提交时必须重新解析和校验，不能信任 UI 候选结果。

### Task 5：安全与回归

创建 `src/security.ts`、`test/security.test.ts` 和 `test/regression.test.ts`。

验证：

- 不可调用 Skill 被拒绝；
- 非空会话切换 Agent 需要确认；
- Agent preset 的权限配置不被改变；
- Plugin 不执行任意内部函数；
- Tool 仍由 `ctx.tools.execute()` 处理；
- `command/run` 与 `command/done` 成对；
- 插件卸载后命令、输入源和监听器全部清理；
- 旧命令、旧 Skill 手势、普通文本和文件引用不回归。

### Task 6：测试 Skill 和 Agent

Skill 已提供于：

```text
.dsh/skills/quick-invoke-test/SKILL.md
```

验证：

```text
/skill quick-invoke-test 验证快捷调用链路
```

Agent fixture 已提供于：

```text
examples/agent-presets/quick-invoke-test/
```

安装到 DSH 用户 preset 根目录：

```bash
mkdir -p ~/.dsh/.agent-presets
cp -R examples/agent-presets/quick-invoke-test ~/.dsh/.agent-presets/
```

验证：

```text
/agent quick-invoke-test
```

补充的 Skill 测试组：

| Skill | 验证重点 |
|---|---|
| `quick-invoke-skill-load` | 候选发现、选择和加载确认 |
| `quick-invoke-skill-context` | Skill 名称后的任务上下文传递 |
| `quick-invoke-skill-error` | 空名称、未知名称和分阶段发送边界 |
| `quick-invoke-test` | 基础 Skill 加载与任务继续 |

Agent 验证分为两段：Web 端验证候选和回填，Host 端验证 `agentPresets.recompose()` 收到当前 Agent 与 preset 名称。这样可以区分“选择成功”和“最终切换成功”。

### Task 6.1：Web 端完整测试流程

启动 Web：

```bash
dsh web --no-open
```

浏览器打开 `http://127.0.0.1:3080`。首次更新插件后执行一次强制刷新。

按以下顺序验证：

1. 输入 `/`，应看到 `skill`、`agent`、`plugin` 三个入口。
2. 输入 `/agent` 后按回车，弹出 Agent preset 选择框；选择 `quick-invoke-test` 并等待会话切换完成。
3. 输入 `/skill` 后按回车，弹出 Skill 选择框；选择 `quick-invoke-test`，再输入任务并提交。
4. 输入 `/plugin `，应看到 `list`、`inspect`、`open`。
5. 选择 `/plugin list`，应返回插件清单。
6. 输入 `/plugin enable` 或 `/plugin disable`，不得出现候选，也不得执行。

每次真实 Web 验收还必须查看 Session log：`/plugin list` 必须出现成对的 `command/run` 和 `command/done`，且结果来自 `pluginInventory.list()`。只有模型文本而没有这对事件时，验收失败。

注意：`quick-invoke-test` 是随测试 Agent preset 挂载的 Skill。若当前会话使用其他 preset，`/skill` 列表中可能不会出现它，应先完成第 2 步。

自动化 Web 测试：

```bash
npm test
```

其中 `test/web-e2e.test.js` 使用 `ModuleLoader`、`ClientContext`、Skill/Agent API 和 Remote Command API 的测试替身，覆盖三类命令的候选与提交，不依赖真实浏览器窗口。

`↑`/`↓`、候选回车和回填后的再次回车属于 DSH 公共 popupSelect 外壳行为，插件测试只能验证插件没有绕过外壳执行远程命令。若出现方向键串到消息导航或回填后输入框失焦，应在 DSH 的 `PopupSelectView`/overlay 焦点绑定处修复，不能通过插件重复注册输入源来规避。

### Task 7：安装到 DSH Web

构建并安装：

```bash
dsh plugin --profile web add /home/gujy/agent/deepseek_harness/harness_plugin/dsh-quick-invoke
dsh web
```

验证：

- `/`、`/skill`、`/agent`、`/plugin` 出现在命令 UI；
- Skill 列表能够发现 `quick-invoke-test`；
- Agent 列表能够发现复制后的 `quick-invoke-test`；
- Plugin 只显示 `list/inspect/open`；
- `/plugin enable` 和 `/plugin disable` 不出现在候选或命令目录；
- 命令生命周期和结果能够持久化。

## 5. 固定开发流程

每个 Task 都执行：

```text
读取真实 DSH 类型定义
  → 编写失败测试
  → 确认失败原因
  → 实现最小功能
  → 运行阶段测试
  → 运行完整回归
  → 检查卸载清理
  → 更新文档
```

任何阶段未通过，不进入下一阶段。

## 6. 发布验收清单

- [ ] 文档目录只有 `docs/`；
- [ ] 入口设计与开发计划分为两个独立 Markdown 文件；
- [ ] 没有特定业务领域依赖；
- [ ] Skill frontmatter 合法且 `user-invocable: true`；
- [ ] Agent preset YAML 可解析；
- [ ] 只注册五种支持的用户入口行为；
- [ ] `/tool`、`@...`、`$...` 和插件启停命令被拒绝；
- [ ] Host 权威解析和权限检查有效；
- [ ] UI 补全和直接提交结果一致；
- [ ] ToolRuntime 安全链路不被绕过；
- [ ] 插件卸载无残留注册；
- [ ] DSH Web 端到端验证通过。
