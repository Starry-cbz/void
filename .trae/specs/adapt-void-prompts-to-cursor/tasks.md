# Tasks

- [x] Task 1: 梳理 Cursor prompt 基准与裁剪清单
  - [x] SubTask 1.1: 固化基准来源（Chat Prompt + Agent Prompt v1.2 的 URL/版本信息）
  - [x] SubTask 1.2: 逐段标注“保留/改写/移除”清单（明确移除提示词保密段落）
  - [x] SubTask 1.3: 输出 Void overlay 规则：冲突优先级、工具调用约束、输出格式约束

- [x] Task 2: 设计 Void Prompt 分层架构（基准 + overlay + feature patch）
  - [x] SubTask 2.1: 定义可复用的“Cursor 风格骨架段落”结构（communication/tool_calling/status_update 等）
  - [x] SubTask 2.2: 定义 feature patch：Chat / Ctrl+K / Autocomplete / SCM 的差异点与注入位置
  - [x] SubTask 2.3: 定义最小可控开关（例如 `void.promptStyle = legacy | cursor`，以及是否启用增强上下文）

- [x] Task 3: Chat system message（normal/gather/agent）Cursor 化落地
  - [x] SubTask 3.1: 将现有 `chat_systemMessage` 重组为 Cursor 风格段落（保留 `<system_info>`/`<files_overview>`/工具定义）
  - [x] SubTask 3.2: 将 tool calling 规则替换为 Void 实际约束（provider specialToolFormat、一次/多次工具调用策略等）
  - [x] SubTask 3.3: 新增静态/单测：验证 system message 包含关键段落且不包含已移除段落

- [x] Task 4: Ctrl+K / Quick Edit 提示词 Cursor 化
  - [x] SubTask 4.1: 对齐 Agent Prompt v1.2 的“先检索再改/验证/最小编辑表达”到 Quick Edit 相关 system message
  - [x] SubTask 4.2: 明确 search/replace、rewrite、FIM 三类提示词的统一骨架与差异补丁
  - [x] SubTask 4.3: 新增静态/单测：关键约束存在性（例如编辑格式、不要瞎猜、验证策略）

- [x] Task 5: Autocomplete 提示词 Cursor 化
  - [x] SubTask 5.1: 对齐 Cursor 风格的“只输出补全、不解释/不改写其它”规则到 Autocomplete prompt
  - [x] SubTask 5.2: 新增静态/单测：输出约束与 stop token 策略一致

- [x] Task 6: SCM 提示词与 Cursor 体系共存
  - [x] SubTask 6.1: 明确 SCM prompt 的隔离策略（避免 Cursor/Chat overlay 污染 `<output>` 格式）
  - [x] SubTask 6.2: 增加静态校验：SCM system message 仍包含“冲突规则必须忽略”

- [x] Task 7: 增强上下文（Phase 2）能力缺口评估与最小补齐
  - [x] SubTask 7.1: 列出 Cursor prompt 暗含依赖的上下文字段与 Void 当前映射（open files/active file/diagnostics/git/terminal）
  - [x] SubTask 7.2: 选择最小补齐集（建议：诊断摘要 + git 状态摘要 + 最近终端失败片段）
  - [x] SubTask 7.3: 落地并加测试，且可通过开关关闭

- [x] Task 8: 验证与回归
  - [x] SubTask 8.1: 运行类型检查与关键测试子集
  - [x] SubTask 8.2: 手工验证：Chat、Ctrl+K、Autocomplete、SCM 四入口的系统提示词与行为符合预期

# Task Dependencies
- Task 3/4/5/6 depends on Task 2
- Task 7 depends on Task 2
- Task 8 depends on Task 3, Task 4, Task 5, Task 6, Task 7
