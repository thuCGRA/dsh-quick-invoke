# Quick Invoke Test Agent

这是用于验证 `/agent` 的最小 preset fixture。

复制到 DSH 用户 preset 根目录后即可被 DSH Web 发现：

```bash
mkdir -p ~/.dsh/.agent-presets
cp -R examples/agent-presets/quick-invoke-test ~/.dsh/.agent-presets/
```

复制后在 DSH Web 中使用：

```text
/agent quick-invoke-test
```

非空会话不能静默切换 Agent；请在空白会话中验证，或按 Host 的确认流程操作。
