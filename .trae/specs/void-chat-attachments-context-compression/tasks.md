# Tasks

- [x] Task 1: 定义并落地“终端 selection”数据模型与 prompt 注入
  - [x] SubTask 1.1: 扩展 `StagingSelectionItem` 支持 Terminal 类型（包含 terminalId/命令/输出/时间戳等最小字段）
  - [x] SubTask 1.2: 扩展 `messageOfSelection`/`chat_userMessageContent` 支持 Terminal selection 的序列化注入
  - [x] SubTask 1.3: 增加单测覆盖 Terminal selection 注入格式（静态/纯函数层）

- [x] Task 2: 聊天输入框支持拖拽文件/文件夹加入 selections
  - [x] SubTask 2.1: 在 Sidebar Chat 输入区域增加 dragover/drop 处理，解析 `text/uri-list` 与文件系统拖拽
  - [x] SubTask 2.2: 对 dropped URI 做 workspace 校验、去重与类型判断（File/Folder）
  - [x] SubTask 2.3: 通过 `IChatThreadService.addNewStagingSelection` 将 selection 写入当前线程
  - [x] SubTask 2.4: 增加 UI 状态：拖拽悬停高亮、drop 成功反馈（尽量复用现有样式体系）

- [x] Task 3: 支持将文件代码片段加入对话（编辑器选区）
  - [x] SubTask 3.1: 新增命令/动作：将当前编辑器选区作为 `CodeSelection` 加入 selections
  - [x] SubTask 3.2: 补充入口：编辑器右键菜单或命令面板（保持最小可用）
  - [x] SubTask 3.3: 增加基础测试或静态校验（命令注册存在、写入 selections）

- [x] Task 4: 支持将终端片段加入对话（手动入口）
  - [x] SubTask 4.1: 新增命令/动作：将“当前活动终端最近一次命令输出”加入 selections
  - [x] SubTask 4.2: 终端片段读取：优先使用 CommandDetection 的结构化输出；回退到 `readTerminal`
  - [x] SubTask 4.3: 增加 UI 展示：Terminal selection chip 的展示文本与可删除

- [x] Task 5: 终端失败快捷按钮（右上角）
  - [x] SubTask 5.1: 监听终端命令结束事件并维护“最近失败命令”上下文（exitCode != 0）
  - [x] SubTask 5.2: 在终端右上角 toolbar/标题区域注入按钮（受上下文控制，仅失败后显示）
  - [x] SubTask 5.3: 点击按钮将失败片段加入当前聊天线程 selections（并提供轻量 toast/提示）

- [x] Task 6: 上下文压缩（摘要注入）
  - [x] SubTask 6.1: 为 thread state 增加 `compressedContext`（summary 文本 + 生成时间 + 覆盖范围）
  - [x] SubTask 6.2: 新增“Compress Context”动作：调用当前 Chat 模型生成 summary（只总结历史，不含工具 XML）
  - [x] SubTask 6.3: 注入策略：在准备 LLM messages 时优先注入 summary（并可仅保留最近 N 条消息）
  - [x] SubTask 6.4: 增加最小测试：summary 存储与注入位置（静态/纯函数层优先）

- [x] Task 7: 验证与打磨
  - [x] SubTask 7.1: 覆盖手工验证脚本/步骤：拖拽、选区加入、终端失败按钮、summary 注入
  - [x] SubTask 7.2: 运行仓库既有类型检查与目标单测子集，确保 CI 通过

# Task Dependencies
- Task 2 depends on Task 1（需要稳定的 selection 注入模型）
- Task 4 depends on Task 1
- Task 5 depends on Task 4
- Task 6 depends on Task 1（summary 注入与 selections 注入并行但共享线程状态变更）
- Task 7 depends on Task 2, Task 3, Task 4, Task 5, Task 6
