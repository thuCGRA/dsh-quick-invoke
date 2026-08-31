---
name: quick-invoke-skill-error
description: 用于验证快捷调用流程中的输入校验和错误边界。
whenToUse: 当需要验证空任务、未知 Skill 或非法命令不会被静默执行时使用。
user-invocable: true
disable-model-invocation: false
---

# Quick Invoke Skill Error

确认当前 Skill 名称为 `quick-invoke-skill-error`，并检查以下边界：

1. 没有 Skill 名称时应提示补充名称；
2. 不存在的 Skill 不应被当作已加载；
3. 候选选择与最终发送是两个独立阶段。

只报告检查结果，不调用工具，不修改文件。
