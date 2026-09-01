# DSH Quick Invoke 入口设计

## 1. 方案结论

`dsh-quick-invoke` 是独立 Cordis 插件，只增加 `/` 快捷入口，不修改 DSH 核心。

支持：

```text
/skill <skill-name> [任务]
/agent <agent-name> [任务]
/plugin list
/plugin inspect <plugin-name>
/plugin open <plugin-name>
```

不支持：

```text
@skill、@agent、@plugin
$NAME、${NAME}
/tool <tool-name>
/plugin enable <plugin-name>
/plugin disable <plugin-name>
```

快捷入口只面向 Skill、Agent 和 Plugin。Tool 仍由 Agent 根据自然语言自动选择，并通过 DSH 现有 tools/approval/guard pipeline 执行；本插件不依赖或绕过未确认的内部 ToolRuntime API。

## 2. 概念边界

```text
Skill
  = 告诉 Agent 如何完成任务的知识、规范和流程

Tool
  = Agent 实际执行的具体动作

Plugin
  = 承载 Tools、Commands、Skills、Web UI、API 和 Services 的扩展容器

Agent / preset
  = 角色、提示词、工具和权限配置的组合
```

## 3. 命令职责

### Skill

处理流程：

1. 解析 Skill 名称和剩余任务；
2. 使用 `ctx.skills.list()` / `ctx.skills.get()` 查找 Skill；
3. 检查 `SkillSummary.invocation.userInvocable`；
4. 加载并渲染 `SKILL.md`；
5. 复用 `dsh-tool-skill` 的 `agent/pre-step` 注入路径；
6. 让剩余任务继续进入当前 Agent 回合。

命令不能只返回“加载成功”。现有 `/技能名` 手势由已安装的 DSH Skill UI 能力负责；本插件不重复注册同名 `/` source，宿主命令优先。兼容性需随目标 DSH 版本回归验证。

测试示例：

```text
/skill quick-invoke-test 验证快捷调用链路
```

可用于 Web 端验证的三个测试 Skill：

```text
/skill quick-invoke-skill-load
/skill quick-invoke-skill-context 请复述这段任务
/skill quick-invoke-skill-error
```

三者分别覆盖候选加载、任务上下文保留和错误边界。

### Agent

处理流程：

1. 使用 `ctx.agentPresets.list()` / `resolve()` 查询 preset；
2. 检查 preset 是否损坏、锁定或不可用；
3. 空白会话允许切换；
4. 非空会话必须确认，第一版不自动创建隔离会话；
5. 切换时保留 sandbox、approval、permission 和 tools 配置；
6. 必须把命令 invocation 中的 `agent.ctx` 作为 `agentCtx` 传给 `recompose(agentCtx, id)`；不能把 Agent 对象或根 Context 直接传入，否则 DSH 会报 `refusing to recompose an unscoped context`。

测试示例：

```text
/agent quick-invoke-test
```

Agent 的 Web 测试流程与 Skill 一致：输入 `/agent` 后按回车打开候选框，用 `↑`、`↓` 移动并按回车，输入框应回填 `/agent quick-invoke-test `。继续输入任务并手动发送；选择候选阶段不执行 preset 切换。最终发送后，Host 端才通过 `agentPresets.recompose()` 切换当前 Agent。

### Plugin

支持：

```text
/plugin list
/plugin inspect <plugin-name>
/plugin open <plugin-name>
```

`list` 和 `inspect` 使用 `pluginInventory.list()` 的只读信息；`open` 只能打开插件公开声明的 Web UI。插件启停不属于本插件范围，继续由 DSH 配置或 CLI 管理。

三条 Host 命令都声明了参数输入描述（`input.hint`）。这是必要的运行时契约：DSH 对带参数的斜杠输入只有在命令声明 `input` 时才会进入 Host Command；否则会返回未处理结果并继续交给模型。因此 `/plugin list` 的正确验收标准是产生 `command/run`、`command/done` 日志，并返回 `pluginInventory.list()` 的实际清单，而不是让模型解释设计文档。

不允许把 Plugin 容器当作默认 Tool，也不允许通过命令执行插件内部任意函数。

## 4. 技术架构

```text
用户输入
  ↓
Client InputTriggerController
  ↓
dsh-quick-invoke
  ├── SlashParser
  ├── CompletionProvider
  ├── SkillInvoker
  ├── AgentInvoker
  ├── PluginExplorer
  ├── PermissionGuard
  └── AuditRecorder
  ↓
DshAdapter
  ↓
DSH Command / Skill / Agent / Plugin / ToolRuntime API
```

模块职责：

| 模块 | 职责 |
|---|---|
| `SlashParser` | 将原始文本解析为结构化命令 |
| `CompletionProvider` | 提供动态候选和文本插入 |
| `SkillInvoker` | 查找、校验、注入 Skill |
| `AgentInvoker` | 查询 preset 并执行切换 |
| `PluginExplorer` | 查询、检查和打开插件 |
| `PermissionGuard` | 处理能力、作用域、权限和确认 |
| `AuditRecorder` | 记录命令输入、状态和结果 |
| `DshAdapter` | 隔离 DSH 版本差异 |

插件不得绕过适配层直接依赖 DSH 内部实现。

## 5. 数据结构

```ts
type SlashInvoke =
  | { kind: "skill"; name: string; prompt?: string; rawInput: string }
  | { kind: "agent"; name: string; prompt?: string; rawInput: string }
  | {
      kind: "plugin";
      subcommand: "list" | "inspect" | "open";
      name?: string;
      rawInput: string;
    };
```

适配层最小接口：

```ts
interface DshAdapter {
  listInvocableSkills(): Promise<SkillInfo[]>;
  invokeSkill(name: string, prompt?: string): Promise<InvokeResult>;

  listAgentPresets(): Promise<AgentPresetInfo[]>;
  getSessionState(): Promise<SessionState>;
  switchAgent(name: string): Promise<InvokeResult>;

  listPlugins(): Promise<PluginInfo[]>;
  inspectPlugin(name: string): Promise<PluginDetails>;
  openPlugin(name: string): Promise<InvokeResult>;
}
```

真实 DSH API 对应关系：

```text
Host 命令：ctx.commands.register / list / find / execute
斜杠输入：由 DSH 内置 command source 处理
命令 UI：ctx.commandUi.decorate
Skill：ctx.skills.list / snapshot / get
Agent：ctx.agentPresets.list / resolve / recompose
工具安全：ctx.tools.execute 及 tools/* 生命周期
插件查询：Host 侧由适配器读取公开 inventory；Client 侧通过 `ctx.remote.pluginInventory.list()` 获取只读投影
```

## 6. 解析与冲突规则

1. 只识别输入开头第一个非空位置的 `/`；
2. 命令名后必须是空格、换行或输入结束；
3. URL、代码块和反斜杠转义的 `/` 不触发；
4. 命令名、目标名和任务正文限制长度；
5. 未知命令、名称和语法错误必须明确失败；
6. 解析失败不得降级为其他快捷能力。

优先级：

```text
宿主已注册命令 > 快捷命令 > 旧 /技能名手势 > 普通文本
```

示例：

```text
https://example.com/a/b       → 普通文本
请执行 /skill quick-invoke-test → 普通文本
`/skill quick-invoke-test`    → 普通文本
\/skill quick-invoke-test     → 普通文本
```

## 7. UI 补全

补全通过 `ctx.commandUi.decorate()` 挂载到 DSH 内置命令菜单，不重复注册 `/` source：

```text
/                    → 一级命令
/sk                  → /skill
/skill + 回车        → 弹出可调用 Skill 选择框
/agent + 回车        → 弹出 Agent/preset 选择框
/plugin + 回车       → 弹出 list、inspect、open 选择框
/plugin inspect      → 选择插件名后回填完整命令
/plugin open         → 选择插件名后回填完整命令
```

`@deepseek-ai/dsh-client-ui-commands` 已负责 Host 命令目录、空格/回车处理、模糊匹配和弹窗 UI。插件不再另注册 `/` source，避免被内置 `matchSpace` 抢先提交裸命令。

候选选择流程：

1. 使用 `↑`、`↓` 移动高亮；
2. 按回车确认候选；
3. 候选只回填到聊天输入框，例如 `/skill quick-invoke-test `；
4. 用户继续输入任务，并再次手动发送；
5. 选择阶段不调用 `remote.commands.execute`。

如果 `/plugin list` 仍出现“尚未实现 Host Command”之类的模型回答，应检查当前会话的 Session log：成功时必须出现 `command/run(name=plugin)` 与 `command/done(kind=success)`。没有这对事件说明当前 Web 会话没有加载本次插件版本或仍在使用旧命令目录缓存，应停止 Web、重新安装插件、重新启动并强制刷新页面。`/status` 不是本插件提供的 HTTP 健康检查接口，返回 404 不能据此判断插件失败。

键盘行为由 DSH 公共 `popupSelect` 外壳负责：弹窗打开后焦点应在筛选框，`↑`/`↓` 只移动候选高亮，回车只确认候选，确认后焦点回到当前会话输入框。若 `↓` 正常而 `↑` 触发消息浏览，或第二次回车必须鼠标点击后才生效，这是 DSH 公共弹窗的事件传播/焦点绑定问题，应在 `PopupSelectView` 的 keydown 处理和 `bindComposerFocus` 挂载处修复并在公共组件测试中回归。

## 8. 三类命令的调用方式和作用

| 命令 | 选择对象 | 主要作用 | 最终处理方 |
|---|---|---|---|
| `/skill` | 用户可调用 Skill | 为当前任务提供流程、规范和知识 | 当前 Agent 的 Skill 注入/执行链路 |
| `/agent` | Agent preset | 在受支持的空白 Agent 生命周期内选择角色、提示词、模型、工具和权限组合 | Host 的正式 preset selection/mount API；`recompose()` 仅在满足空白 Agent 约束时使用 |
| `/plugin` | 插件及只读操作 | 查看插件、检查信息或打开公开 Web UI | Host 的 `pluginInventory` / Web UI |

它们的共同点是：都可以通过候选框选择，选择后先回填输入框，最终由用户发送。区别在于：Skill 改变当前任务的指导内容，Agent 改变当前会话使用的 Agent 配置，Plugin 负责插件管理和查看，不是普通任务执行器。

典型示例：

```text
/skill quick-invoke-skill-context 请复述任务
/agent quick-invoke-test 分析这个问题
/plugin list
/plugin inspect dsh-quick-invoke
/plugin open dsh-quick-invoke
```

## 9. 安全、审计与错误

- Skill 必须检查 `userInvocable`；
- Agent 切换不能提升权限；
- Skill 注入不得伪造 system/developer 消息；
- ToolRuntime 的 approval、guard、permission 高于用户文本和 Skill 内容；
- Plugin 只访问公开的只读清单和 Web UI；
- 所有快捷调用记录 `command/run`、`command/done` 生命周期；
- 第一版不实现命令恢复和重放。

错误至少区分：语法错误、未知能力、不可调用、权限拒绝、需要确认、Web UI 不存在、运行失败和 Host 不支持。

## 9. 已确认的 DSH 运行环境

```text
CLI:     /home/gujy/.nvm/versions/node/v24.19.0/bin/dsh
版本:    @deepseek-ai/dsh 0.1.1-rc.2
运行包:  /home/gujy/.dsh/profiles/node_modules/@deepseek-ai
Web 配置: /home/gujy/.dsh/profiles/web
```

已确认存在命令、输入触发、命令 UI、Skill、Agent preset、ToolRuntime 和只读 Plugin Inventory 相关包。当前工作区的测试 Skill 位于 `.dsh/skills/quick-invoke-test/`；测试 Agent preset fixture 位于 `examples/agent-presets/quick-invoke-test/`。
