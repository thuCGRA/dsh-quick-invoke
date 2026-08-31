# dsh-quick-invoke

面向 DSH Web 的 Cordis 插件，为 Skill、Agent preset 和 Plugin 提供统一的斜杠入口、候选选择和命令执行。

## 支持范围

| 入口 | 作用 | 执行时机 |
| --- | --- | --- |
| `/skill <name> [task]` | 调用用户可调用的 Skill | 用户发送后由 Host Command 处理 |
| `/agent <name> [task]` | 选择 Agent preset | 用户发送后由 Host 重组 Agent |
| `/plugin list` | 查看已安装插件 | 读取 `pluginInventory.list()` |
| `/plugin inspect <name>` | 查看插件状态 | 只读检查 |
| `/plugin open <name>` | 打开插件公开 Web UI | 用户发送后处理 |

本插件不注册 Tool 快捷命令，也不提供 `/plugin enable` 或 `/plugin disable`。插件启停属于 DSH 配置和 CLI 管理范围。

## DSH 插件组成

- `src/index.js`：Host 入口，通过 `ctx.commands.register()` 注册命令。
- `src/command-runtime.js`：解析参数并返回 DSH `CommandResult`。
- `src/dsh-adapter.js`：隔离 DSH 服务 API，读取 Skill、Agent 和 Plugin 数据。
- `client/client.js`：Web `ModuleLoader` 入口。
- `client/index.js`：可测试的客户端实现镜像。
- `ctx.commandUi.decorate()`：装饰 Host 命令并打开 `popupSelect` 候选框。
- `.dsh/skills/`：项目级测试 Skill，不是全局 Skill。
- `examples/agent-presets/`：Agent preset 测试 fixture。
- `cordis.patch.yml`：将 Host 入口加入 DSH profile 加载树。

候选选择只回填输入框，不立即执行：

```text
/skill quick-invoke-test 
```

用户可继续输入任务，然后再次手动发送。

## 运行前提与安装

- Node.js
- DSH `0.1.1-rc.2` 兼容运行时
- Web profile 已启用 commands、skills、agent presets、plugin inventory 和 Web command UI

三条 Host 命令都声明了 `input.hint`。这是必要契约：带参数的 `/plugin list`、`/skill name` 和 `/agent name` 才会进入 Host Command，否则可能被当作普通模型文本。

```bash
dsh plugin --profile web add /home/gujy/agent/deepseek_harness/harness_plugin/dsh-quick-invoke
dsh web --no-open
```

已有 Web 实例时先关闭旧实例，避免端口或 task-board ledger 锁冲突。默认地址通常是 `http://127.0.0.1:3080`。更新后用 `Ctrl+Shift+R` 强制刷新浏览器。

安装测试 Agent preset：

```bash
mkdir -p ~/.dsh/.agent-presets
cp -R examples/agent-presets/quick-invoke-test ~/.dsh/.agent-presets/
```

## Web 验收

1. 输入 `/`，应出现 `skill`、`agent`、`plugin`。
2. 输入 `/skill` 并回车，出现 Skill 候选。
3. 使用 `↑`、`↓` 移动候选，回车确认。
4. 输入框回填完整命令；继续输入任务并手动发送。
5. 使用 `/agent` 验证 preset 候选和回填。
6. 使用 `/plugin list` 验证真实插件清单。
7. Session log 必须出现成对的 `command/run` 和 `command/done`。

正常输出类似：

```text
Installed plugins:
- dsh-quick-invoke [enabled, active]
```

若看到“尚未实现 Host Command”但没有 `command/run`，需重新安装、重启 Web 并强制刷新。`/status` 不是本插件接口，返回 404 不代表插件失败。

方向键和弹窗焦点属于 DSH 公共 `popupSelect` 外壳；若 `↑` 触发消息浏览或选择后输入框失焦，应在 DSH 公共 `PopupSelectView` 和 composer focus binding 中修复。

## 测试

```bash
npm test
npm run test:parser
git diff --check
```

测试覆盖命令解析、Host 注册和 `CommandResult`、插件清单、Skill/Agent/Plugin 候选、输入框回填、选择阶段不执行远程命令，以及项目级 Skill/Agent fixture。

项目级测试 Skill：`quick-invoke-test`、`quick-invoke-skill-load`、`quick-invoke-skill-context`、`quick-invoke-skill-error`。

## 目录

```text
├── .dsh/skills/             # 项目级测试 Skill
├── client/                  # DSH Web 客户端
├── docs/                    # 调用说明和开发计划
├── examples/agent-presets/  # Agent preset fixture
├── src/                     # Host 命令与适配器
├── test/                    # Node/Web 合同测试
├── cordis.patch.yml
├── package.json
└── README.md
```

## 远程仓库准备

当前仓库未配置 Git remote；本次只整理可提交状态，不自动推送。

```bash
git status --short
npm test
git diff --check
git ls-files --others --exclude-standard
git remote -v
```

确认无日志、缓存、`node_modules`、用户配置、凭据和运行产物后：

```bash
git add README.md .gitignore package.json cordis.patch.yml src client docs examples test
git commit -m "feat: add dsh quick invoke plugin"
git remote add origin <repository-url>
git push -u origin <branch>
```

不要提交 `~/.dsh` 下的用户数据、ledger、锁文件或 profile 安装目录。
