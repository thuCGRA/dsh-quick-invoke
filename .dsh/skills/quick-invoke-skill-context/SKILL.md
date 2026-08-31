---
name: quick-invoke-skill-context
description: 用于验证 Skill 选择后能够保留并复述用户继续输入的任务上下文。
whenToUse: 当需要验证 Skill 前缀与后续任务文本能连续传递时使用。
user-invocable: true
disable-model-invocation: false
---

# Quick Invoke Skill Context

确认当前 Skill 名称为 `quick-invoke-skill-context`，然后复述用户在 Skill 名称后提供的完整任务。

最后说明任务正文来自用户输入，而不是 Skill 自己生成的内容。不要调用工具，也不要修改文件。
