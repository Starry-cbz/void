# Tasks

- [x] Task 1: 定义增强上下文字段与截断策略
  - [x] SubTask 1.1: 定义 `<enhanced_context>` 分区与输出模板（Diagnostics/SCM/Editor/Terminal）
  - [x] SubTask 1.2: 定义每个分区的长度/条数上限（chars/lines/items），并明确默认值
  - [x] SubTask 1.3: 明确“缺失即省略”的规则，避免占位噪声

- [x] Task 2: 增加细粒度设置项与 UI
  - [x] SubTask 2.1: 为 GlobalSettings 增加 `enhancedContextIncludeCodeSnippet` / `enhancedContextIncludeTerminalSummary` / `enhancedContextIncludeScmChangedFiles`
  - [x] SubTask 2.2: 为老存储做迁移补默认值
  - [x] SubTask 2.3: 在 Settings UI 增加三个开关（并与总开关 `enableEnhancedContext` 协同展示）

- [x] Task 3: Editor 光标附近片段注入
  - [x] SubTask 3.1: 通过 code editor service 获取活动编辑器 selection/position
  - [x] SubTask 3.2: 从 model 中截取光标附近窗口并注入（严格截断）
  - [x] SubTask 3.3: 确保非文本编辑器/无 model 时安全降级

- [x] Task 4: SCM 变更文件列表注入
  - [x] SubTask 4.1: 从 SCM git provider 汇总变更文件 URI 列表（Top N）
  - [x] SubTask 4.2: 注入数量与路径列表，并保持稳定排序策略（可解释、可复现）

- [x] Task 5: 终端命令摘要注入
  - [x] SubTask 5.1: 从活动终端 CommandDetection capability 提取最近 N 条命令（command/exitCode）
  - [x] SubTask 5.2: 与现有失败片段结合：优先展示最近失败输出（严格截断）

- [x] Task 6: 测试与回归
  - [x] SubTask 6.1: 新增静态测试：Cursor 风格 system message 包含新增分区（在开关打开时）
  - [x] SubTask 6.2: 新增静态测试：关闭任一开关会移除对应分区
  - [x] SubTask 6.3: 运行类型检查与关键测试子集

# Task Dependencies
- Task 3/4/5 depends on Task 1, Task 2
- Task 6 depends on Task 3, Task 4, Task 5
