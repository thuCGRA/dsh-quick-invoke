# DSH Quick Invoke 修订开发方案

## 1. 目标与范围

`dsh-quick-invoke` 是独立 Cordis 插件，为 DSH Web 提供 `/` 快捷命令、候选补全和 Host 权威执行。不修改 DSH 核心，不提供 `/tool`，不把 Plugin 当作 Tool 直调入口。

第一版只承诺：

```text
/skill <skill-name> [task]
/agent <preset-name> [prompt]
/plugin list
/plugin inspect <plugin-name>
```

以下能力延期：

```text
/plugin open <plugin-name>
/plugin enable <plugin-name>
/plugin disable <plugin-name>
非空会话中的 Agent 运行时重组
```

## 2. Host 与 Client 边界

Host 与 Client 使用不同的 Cordis context，不能互相直接读取服务。

| 能力 | 所属端 | 接口/来源 | 约束 |
|---|---|---|---|
| 命令注册和执行 | Host | `ctx.commands.register/find/execute` | 自动记录 `command/run`、`command/done` |
| Skill | Host | `ctx.skills.list/snapshot/get` | 调用方必须检查 `invocation.userInvocable` |
| Agent preset | Host | `ctx.agentPresets.list/resolve` 与正式 selection/mount 生命周期 | `recompose` 仅用于允许重组的空白 Agent |
| Plugin inventory | Host 投影 / Client Remote | 公开 inventory list contract | 只读，字段有限 |
| 候选补全 | Client | `ctx.commandUi.decorate()` 或唯一 `InputTriggerSource` | 只展示、选择和回填 |
| Tool | Agent pipeline | Agent 自然语言选择 | 本插件不透传执行 |

Host 入口导出 `name`、必要的 `inject` 和 `apply(ctx)`；Client 入口导出自己的 `inject` 和 `apply(ctx)`。通过 `ctx.effect` 清理注册 disposer。依赖声明使用真实服务键，不能把包名当作 inject 项。

## 3. 命令语义

### 3.1 `/skill`

```text
/skill <skill-name> [task]
```

Host 处理：

1. 解析名称和任务原文；
2. 在当前 Agent 的 cwd 和 scope 下查询 Skill；
3. 检查 `invocation.userInvocable === true`；
4. 构造标准 Skill invocation；
5. 有 task 时通过受支持的 Agent follow-up/steer 或注入入口继续任务；
6. 无 task 时只报告验证/加载结果，不启动伪造的空回合；
7. 取消、失效或注入失败时返回明确错误。

仅调用 `ctx.skills.get()` 不会自动启动 Agent。现有 `/技能名` 手势由目标 DSH 的 Skill UI 能力负责；本插件不重复注册同名 `/` source，兼容性必须回归验证。

### 3.2 `/agent`

```text
/agent <preset-name>
```

第一版只支持空白、idle 且允许重组的 Agent，同时兼容命令后的 prompt。无 prompt 时只应用 preset；有 prompt 时先完成 preset 切换，成功后再自动提交一次 prompt。已有会话仍然拒绝切换。

Host 处理：

1. 用 `ctx.agentPresets.resolve()` 验证 preset 存在、可读且非 broken；
2. 检查当前 Agent 没有任何产出且不在运行；
3. 检查目标组合不突破 session/user/environment 权限上限；
4. 通过正式 preset selection/mount/recompose 生命周期应用；
5. 记录 `agent-preset/selected`，保证恢复时可以重建组合；
6. 失败时保持原 Agent 不变。

非空会话不得静默切换。确认 UI、隔离新会话和上下文继承属于后续版本。

### 3.3 `/plugin`

第一版只做只读发现：

```text
/plugin list
/plugin inspect <plugin-name>
```

`pluginInventory` 是只读投影，inspect 只能展示目标 DSH 版本公开的 Loader entry/module/enabled/phase 等字段，不能承诺自动获得完整 Tool、Command、Web UI 或权限清单。

`open` 只有存在正式 Web route/navigation contract 时才可实现；没有 contract 时应不注册或返回 `unsupported`。`enable/disable` 需要 Loader mutation、授权、并发锁、回滚和生命周期 API，当前不实现。

## 4. Parser 设计

Parser 是纯函数，不做 IO、不访问 Cordis、不执行命令。

```ts
type ParseResult =
  | { ok: true; command: SlashInvoke }
  | { ok: false; code: 'not-command' }
  | { ok: false; code: ParseErrorCode; position: number; message: string }
```

```ts
type SlashInvoke =
  | { kind: 'skill'; name: string; prompt?: string; rawInput: string }
  | { kind: 'agent'; name: string; rawInput: string }
  | { kind: 'plugin'; subcommand: 'list' | 'inspect'; name?: string; rawInput: string }
```

规则：

- 只识别输入第一个非空位置的 `/`；
- 命令名后必须是空白或输入结束；
- 命令和目标名称遵守 DSH 小写 kebab-case 约束；
- URL、代码块、转义斜杠和普通句子中的 `/` 不触发；
- 名称、任务和总输入有明确长度上限；
- 控制字符和非法名称显式报错；
- 普通文本、语法错误、未知命令、未知目标、权限拒绝分别表示；
- 解析失败不得降级执行近似能力。

Host 执行时必须重新解析、查找和授权，不能信任 Client 候选对象。

## 5. Client 补全

优先复用 DSH 内置 command UI 和已有 Skill source：

```text
/              → /skill、/agent、/plugin
/sk             → /skill
/skill          → Skill 候选
/agent          → preset 候选
/plugin         → list、inspect
/plugin inspect → Plugin 候选
```

候选选择只回填文本，例如：

```text
/skill quick-invoke-test
```

用户再次手动发送后才执行。候选阶段不能调用 Host 命令、加载 Skill、切换 Agent 或执行 Plugin 操作。

如果必须注册 `InputTriggerSource`，必须使用唯一 source 名称，不能与现有 `dsh-client-ui-skill` 的 `name: 'skill'` 冲突。候选应处理加载中、无结果、错误、热更新、IME、Esc、方向键和回填焦点。

## 6. 安全与会话

有效权限不能超过安全上限：

```text
effectivePolicy = session/user upper bound ∩ preset policy ∩ environment policy
```

Skill、preset 和 Plugin 元数据均视为不可信内容：不能伪造 system/developer 消息，不能改变权限，不能隐式触发 Tool。

命令必须处理取消、Agent busy、候选过期、目标删除、能力变化、重复提交、并发提交、热更新、卸载和错误脱敏。

复用 DSH 的 `command/run` 与 `command/done`，不重复伪造命令生命周期。preset 选择额外记录 `agent-preset/selected`。恢复只恢复记录和 UI 状态；副作用默认不自动重放，执行性重放必须重新授权和确认。

## 7. 里程碑

| 阶段 | 内容 | 完成条件 |
|---|---|---|
| M0 | 真实接口清单、Host/Client 依赖、Parser 和错误码 | API、AST、错误矩阵确定 |
| M1 | Host 命令骨架和命令生命周期 | 注册/卸载正确，生命周期事件成对 |
| M2 | Client 命令 UI 和动态候选 | 候选只回填，UI 与直接提交一致 |
| M3 | `/skill` | user-invocable、follow-up、取消和错误测试通过 |
| M4 | `/plugin list/inspect` | 仅使用公开只读 inventory 字段 |
| M5 | 空白 Agent preset | 正式 selection/mount、选择事件、权限检查通过 |
| M6 | 回归和真实 Web 验收 | 安全、恢复、卸载、热更新和 Web 流程通过 |
| 后续 | 非空会话隔离、`open`、`enable/disable` | 找到正式 DSH contract 后另立设计 |

每一阶段必须执行：读取真实类型 → 先写失败测试 → 最小实现 → 阶段测试 → 完整回归 → 卸载清理检查 → 更新文档。未通过不得进入下一阶段。

## 8. 验收标准

### Parser

- 三种第一版命令解析正确；
- URL、代码块、转义斜杠不误触发；
- 错误有稳定 code 和 position；
- 解析失败绝不执行；
- 超长、控制字符、Unicode 和连续空白行为确定。

### Skill

- 只允许 user-invocable Skill；
- `/skill name task` 确实提交受支持的 Skill invocation/follow-up；
- 无 task 不启动伪造模型回合；
- 取消、失效和重复提交结果确定；
- Skill 内容不能改变权限。

### Agent

- 第一版仅空白 idle Agent；
- 非空会话不静默重组；
- preset 选择事件可恢复；
- 权限不能扩大；
- 命令后的 prompt 仅在 preset 切换成功后提交一次；切换失败不得提交。

### Plugin

- `list/inspect` 只读；
- 只展示公开字段；
- 不执行任意内部函数；
- `open/enable/disable` 在无正式 contract 时明确 unsupported 或不注册。

### Client 与会话

- `/`、`/sk`、`/skill`、`/agent`、`/plugin` 候选正常；
- `↑`、`↓`、Enter、Esc、IME 和焦点行为正常；
- 选择不执行，手动发送才执行；
- 直接提交和 UI 提交结果一致；
- 命令有成对生命周期事件；
- 插件卸载无残留；
- 原有命令、Skill gesture、文件引用和普通文本无回归。

## 9. 第一版最终状态

```json
{
  "shortcutSyntax": ["/"],
  "uiCompletion": true,
  "skillShortcut": true,
  "agentShortcut": "empty-idle-agent-only",
  "pluginShortcut": "read-only",
  "pluginList": true,
  "pluginInspect": true,
  "pluginOpen": false,
  "pluginEnableDisable": false,
  "toolShortcut": false,
  "hostClientSeparated": true,
  "coreChangesRequired": false,
  "agentNonEmptySession": "reject-until-isolation-flow-exists"
}
```

最终原则：先交付小而深的 Parser、Host command、内置 Client command UI、Skill invocation、只读 Plugin inventory 和空白 Agent preset；非空 Agent 重组、插件启停、Web 导航和任意 Tool 透传另行设计。
