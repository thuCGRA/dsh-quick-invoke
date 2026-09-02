# dsh-quick-invoke
`dsh-quick-invoke` 是一个面向 DSH Web 的独立 Cordis 插件，为 Skill、Agent preset 和 Plugin 提供统一的 `/` 快捷入口、候选选择和 Host 命令执行能力。

本插件不修改 DSH 核心，不提供任意 Tool 直调语法。Tool 仍由 Agent 根据自然语言选择，并继续经过 DSH 的 tools、approval、guard 和 permission 流程。

## 功能概览

| 命令 | 作用 | 当前状态 |
| --- | --- | --- |
| `/skill <name> [task]` | 选择并调用用户可调用的 Skill | 支持 Host 命令和 Web 候选 |
| `/agent <name> [task]` | 选择 Agent preset | 支持候选；切换受 Agent 生命周期约束 |
| `/plugin list` | 列出已加载插件 | 只读支持 |
| `/plugin inspect <name>` | 查看插件 inventory 信息 | 只读支持，字段取决于 DSH 版本 |
| `/plugin open <name>` | 尝试打开插件 Web UI | 当前无通用 opener 时明确失败 |

插件启停不属于本插件范围：

```text
/plugin enable <name>   不支持
/plugin disable <name>  不支持
```

插件启停应使用 DSH profile 的 CLI/config 管理方式完成，而不是通过聊天命令绕过 Loader。

## 命令示例

```text
/skill quick-invoke-test 验证快捷调用链路
/skill quick-invoke-skill-context 请复述任务上下文
/agent quick-invoke-test 分析这个问题
/plugin list
/plugin inspect dsh-quick-invoke
```

候选框选择只会把规范化命令回填到输入框，不会在选择瞬间执行远程操作。例如：

```text
/skill quick-invoke-test 
```

用户可以继续输入任务，然后手动发送。候选选择阶段不会调用 Host 命令，也不会执行 Skill、Agent 或 Plugin 操作。

候选确认后插件会在草稿回填完成后自动把焦点交还当前会话输入框，用户无需再次点击即可继续输入。该行为只恢复输入焦点，不会自动发送消息。

## 工作原理

插件由 Host 和 Client 两部分组成，两部分使用不同的 Cordis context，不能混用：

```text
Host
  ctx.commands        注册和执行 /skill、/agent、/plugin
  ctx.skills          查询并校验 Skill
  ctx.agentPresets    查询 Agent preset
  plugin inventory    读取只读插件投影

Client
  ctx.commandUi       将候选装饰到 DSH 命令菜单
  ctx.connection      通过 Remote/API 获取动态候选
  ctx.sessions        定位当前会话并回填输入框
```

执行流程：

```text
用户输入 /
  ↓
DSH Web command UI 展示候选
  ↓
选择候选，仅回填输入框
  ↓
用户手动发送完整命令
  ↓
Host ctx.commands.execute()
  ↓
解析、查找、权限/状态校验
  ↓
执行命令并记录 command/run、command/done
```

### Skill

`/skill` 会查询当前工作区和 Agent scope 下的 Skill，并要求：

- Skill 存在；
- Skill 的 `invocation.userInvocable` 为 `true`；
- 当前 Agent 可用；
- 命令取消或失败时明确返回错误。

仅调用 `ctx.skills.get()` 不会自动启动模型回合。需要让任务继续执行时，必须使用 DSH 支持的 Skill invocation/follow-up 链路；本插件不会伪造 system/developer 消息。

### Agent

Agent preset 可能影响模型、提示词、工具、sandbox、approval 和 permission。当前实现不能把 preset 当成任意运行时权限切换：

- 空白 Agent 才允许按 DSH 支持的 preset 生命周期进行重组；
- 非空会话不得静默改变 Agent 组合；
- preset 选择应由正式的 Agent preset API 处理；
- Agent 权限不能因快捷命令而提升。

Host 调用必须把命令 invocation 中的 `agent.ctx` 传给 `agentPresets.recompose(agentCtx, id)`。不能传入 Agent 对象或根 Context，否则 DSH 会报 `refusing to recompose an unscoped context`。

### Plugin

`/plugin` 只面向插件发现和只读检查，不把插件容器当作 Tool，也不执行插件内部任意函数。

当前 DSH 的 plugin inventory 是只读投影，通常只能保证返回 Loader entry、module、enabled、phase 等字段。因此 `inspect` 不承诺所有插件都能展示版本、公开 Tool、Web UI 或权限详情。

## 安装前提

- Node.js；
- 已安装 DSH `0.1.1-rc.2` 或兼容版本；
- 已存在 DSH Web profile；
- Web profile 已组合 commands、skills、agent presets、plugin inventory 和 command UI 相关插件；
- 当前用户对 DSH profile 目录有写权限。

检查 DSH CLI：

```bash
dsh --version
dsh plugin --help
```

检查当前 profile（可选）：

```bash
dsh plugin --profile web list
```

不同 DSH 版本的 CLI 输出可能略有差异；以 `dsh plugin --help` 显示的命令为准。

## 从本地目录安装

这是当前仓库最直接的安装方式。先进入本插件目录，确认路径：

```bash
cd $localPath/dsh-quick-invoke
pwd
```

使用 DSH profile 插件管理命令安装到 Web profile：

```bash
dsh plugin --profile web add "$PWD"
```

也可以从任意目录使用绝对路径：

```bash
dsh plugin --profile web add $localPath/dsh-quick-invoke
```

`package.json` 中的 `dsh.bundle.patch` 会让 DSH profile 识别 `cordis.patch.yml`；Web client 元数据会让 Web profile 构建并加载 `client/client.js`。

安装后启动 Web：

```bash
dsh web --no-open
```

然后访问终端输出的地址，通常是：

```text
http://127.0.0.1:3080
```

不要在同一个 profile 上重复启动多个 Web 实例。已有实例时，应先停止旧实例，避免端口、session 或 task-board ledger 锁冲突。

## 从 Git 仓库安装

远程仓库创建后，可以直接把 Git URL 交给 DSH profile 插件管理器：

```bash
dsh plugin --profile web add <repository-url>
```

例如：

```bash
dsh plugin --profile web add https://github.com/<org>/dsh-quick-invoke.git
```

如果仓库需要固定分支、tag 或 commit，应使用 pnpm 支持的 Git 规格，并在安装前确认目标 revision：

```bash
dsh plugin --profile web add 'git+https://github.com/<org>/dsh-quick-invoke.git#main'
```

建议生产环境固定到经过验证的 tag 或 commit，而不是直接跟随 `main`。

安装命令会在 profile 目录中解析依赖，并在安装后根据包的 `dsh.bundle` 声明更新 profile 的 bundle 列表。普通依赖不会因为被安装就自动成为 DSH bundle。

## 更新、移除和查看安装状态

常用操作：

```bash
# 查看 profile 中的依赖和已安装插件
dsh plugin --profile web list

# 更新插件及其依赖（以当前 DSH CLI 帮助为准）
dsh plugin --profile web update dsh-quick-invoke

# 移除插件
dsh plugin --profile web remove dsh-quick-invoke
```

如果当前 DSH 版本的 `list`、`update` 或 `remove` 参数形式不同，请先运行：

```bash
dsh plugin --help
dsh plugin --profile web --help
```

移除后应重启 Web profile，确保 Host 注册和 Client bundle 都被卸载：

```bash
dsh web --no-open
```

## 安装测试 preset 和测试 Skill

仓库中的 `.dsh/skills/` 是项目级测试 Skill，不是用户全局 Skill。直接在本仓库中运行测试时可使用这些 fixture。

如果要在 DSH Web 中测试 Agent preset，可复制示例 preset 到用户 preset 根目录：

```bash
mkdir -p ~/.dsh/.agent-presets
cp -R examples/agent-presets/quick-invoke-test ~/.dsh/.agent-presets/
```

测试 Skill 包括：

```text
quick-invoke-test
quick-invoke-skill-load
quick-invoke-skill-context
quick-invoke-skill-error
```

其中：

- `quick-invoke-test`：验证快捷调用、Skill 加载和任务继续执行；
- `quick-invoke-skill-load`：验证 Skill 发现和加载；
- `quick-invoke-skill-context`：验证保留并复述用户任务上下文；
- `quick-invoke-skill-error`：验证输入校验和错误边界。

## Web 使用和验收

### 一级命令

在 DSH Web 输入框中：

```text
/
```

应能够看到可用的命令候选，例如：

```text
/skill
/agent
/plugin
```

输入：

```text
/sk
```

应过滤到 `/skill`。

### Skill 候选

1. 输入 `/skill`；
2. 打开候选框；
3. 选择 Skill；
4. 确认输入框回填，例如 `/skill quick-invoke-test `；
5. 继续输入任务；
6. 手动发送完整命令。

### Agent 候选

1. 输入 `/agent`；
2. 选择可用 preset；
3. 确认输入框回填，例如 `/agent quick-invoke-test `；
4. 继续输入任务并手动发送；
5. 在空白 Agent 上验证 preset 生命周期行为。

### Plugin 候选

```text
/plugin list
/plugin inspect dsh-quick-invoke
```

`/plugin open` 只有在目标插件提供正式 Web UI opener 时才会成功；当前没有通用 opener 时，应返回明确错误，而不是假装导航成功。

### 命令事件

成功执行命令后，会话日志应能看到成对的：

```text
command/run
command/done
```

命令结果默认直接返回命令 UI，不自动变成模型历史消息。若命令需要继续 Agent 工作，命令 handler 必须显式提交受支持的 Agent 输入/Skill invocation。

## 开发和测试

安装依赖后运行测试：

```bash
npm test
npm run test:parser
git diff --check
```

当前测试覆盖：

- Slash parser 和错误边界；
- Host 命令注册；
- `CommandResult`；
- Skill、Agent 和 Plugin 候选；
- 输入框回填；
- 候选确认后自动恢复输入框焦点；
- 候选选择阶段不执行远程命令；
- 项目级 Skill 和 Agent preset fixture。

仓库当前是 JavaScript ESM 插件，没有要求提交 `node_modules`、构建缓存或用户运行数据。

## 故障排查

### `/plugin list` 被模型当作普通问题回答

检查：

1. 插件是否安装到正在运行的 `web` profile，而不是其他 profile；
2. `dsh plugin --profile web list` 是否能看到插件；
3. Web 是否在安装后重启；
4. 浏览器是否强制刷新；
5. 会话日志是否有 `command/run(name=plugin)` 和 `command/done`；
6. 是否误把 `/status` 当成本插件接口。

如果没有 `command/run`，通常说明当前 Web 进程没有加载插件或客户端仍使用旧命令目录。停止旧 Web 实例，重新执行安装和启动，再使用 `Ctrl+Shift+R` 刷新浏览器。

### 候选框没有出现

检查：

- Web profile 是否组合 command UI；
- Client bundle 是否在插件安装后重新生成；
- `package.json` 中的 `dsh.client` 元数据是否被 profile 读取；
- 浏览器控制台是否出现 `[dsh-quick-invoke]` 日志；
- 是否注册了重复的 input source。

本插件使用 `ctx.commandUi.decorate()`，不会重复注册 `/` 输入 source。候选确认后的输入框焦点由插件在草稿回填后兼容恢复；若当前 DSH 版本仍出现失焦，应先确认加载的是最新 client bundle。`↑`/`↓` 的事件传播和弹窗内键盘行为仍属于 DSH 公共 `popupSelect` 外壳。

### `/skill` 找不到 Skill

Skill 必须：

- 位于当前 DSH 可发现的 Skill 根目录；
- 名称符合 DSH Skill 命名规则；
- 对用户调用开放，即 `invocation.userInvocable === true`；
- 对当前 workspace/cwd 和 Agent scope 可见。

项目级 Skill 不等于全局 Skill。请确认当前 Web 会话工作目录和 Skill 文件位置。

### Agent preset 无法切换

这是有意的安全约束，不代表候选功能失败。preset 会影响 Agent 组合和权限；非空 Agent 不应被快捷命令静默重组。请先在空白会话测试，并确认 preset 已复制到 DSH 可发现的 preset 根目录。

### 依赖或 profile 锁冲突

不要提交或复制以下运行数据到仓库：

```text
~/.dsh/ledger
~/.dsh/*.lock
~/.dsh/profiles/web
~/.dsh/sessions
~/.dsh/cache
node_modules
```

关闭旧的 DSH Web 进程后再执行 profile 安装或更新。

## 项目结构

```text
.
├── .dsh/skills/             # 项目级测试 Skill
├── client/
│   ├── client.js             # Web ModuleLoader 入口
│   ├── index.js              # 可测试 Client 实现
│   └── slash-source.js       # 独立候选 source 测试实现
├── docs/                     # 设计和调用说明
├── examples/agent-presets/   # Agent preset fixture
├── src/
│   ├── index.js              # Host 插件入口
│   ├── command-runtime.js    # 命令注册和结果处理
│   ├── dsh-adapter.js        # DSH 服务适配层
│   └── parser.js             # 纯函数 Slash parser
├── test/                     # Node 合同测试和 Web 测试
├── cordis.patch.yml          # DSH profile bundle patch
├── package.json              # 插件和 DSH bundle metadata
└── README.md
```

## 安全和设计边界

- UI 候选不是授权边界，Host 必须重新解析和校验；
- Skill 必须检查 `userInvocable`；
- Agent preset 不得通过快捷调用提升权限；
- Plugin 命令不能执行任意插件内部函数；
- 不提供 `/tool`，也不直接绕过 DSH Tool pipeline；
- Skill 内容不能伪造 system/developer 消息；
- 命令副作用必须由 Host 和 DSH 生命周期控制；
- `/plugin enable`、`/plugin disable` 不属于本插件；
- 候选选择与命令执行分离；
- 现有 `/技能名` 手势由目标 DSH 版本的 Skill UI 能力负责，本插件不重复注册同名 `/` source。
