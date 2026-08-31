---
name: quick-invoke-test
description: 用于验证 DSH 快捷调用、Skill 加载和任务继续执行的最小测试技能。
whenToUse: 当需要确认 /skill 命令能够发现并加载一个用户可调用 Skill 时使用。
user-invocable: true
disable-model-invocation: false
---

# Quick Invoke Test

这是一个最小测试技能，不绑定任何特定业务领域。

执行时请完成以下工作：

1. 确认当前调用的 Skill 名称是 `quick-invoke-test`；
2. 复述用户在命令后提供的任务目标；
3. 给出一项简短的验证结果；
4. 如果用户没有提供任务，说明 Skill 已成功加载，并建议用户补充测试任务。

## Web 端键盘测试

在输入框键入 `/skill` 后按回车打开候选框：

1. 使用 `↓` 移到 `quick-invoke-test`；
2. 使用 `↑` 返回上一项（候选多于一项时验证循环移动）；
3. 按回车选择；
4. 确认输入框回填为 `/skill quick-invoke-test `，继续输入任务后再手动发送。

选择候选本身不应立即执行远程命令。

该 Skill 只用于验证发现、加载、注入和继续执行链路，不要求调用任何工具，也不修改文件。
