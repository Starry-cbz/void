# Void：对话框拖拽/引用（文件、代码片段、终端片段）与上下文压缩 Spec

## Why
当前 Void 聊天输入主要依赖手动输入与少量“选中文件（SELECTIONS）”能力，用户将工作区文件、代码片段与终端输出引入对话需要多步操作；同时对长对话缺少可控的“上下文压缩/摘要”能力，影响稳定性与可用性。

## What Changes
- 在聊天输入框支持拖拽工作区文件/文件夹，自动加入对话 SELECTIONS（可多选）
- 增加“将文件代码片段加入对话”的入口（编辑器选区/资源管理器等）
- 增加“将终端片段加入对话”的入口（终端输出/最近命令输出）
- 当终端命令失败（exitCode != 0）时，在终端右上角提供快捷按钮，将失败片段一键加入对话
- 提供上下文压缩（摘要）能力，将长历史对话压缩为可注入的 summary，降低上下文占用并保持关键事实
- **非 BREAKING**：保持现有聊天发送与 SELECTIONS 格式；新增能力以可选方式增强

## Impact
- Affected specs: 聊天输入体验、对话上下文构建、终端与编辑器协作、长对话稳定性
- Affected code:
  - Chat UI：`src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`
  - 选中项模型：`src/vs/workbench/contrib/void/common/chatThreadServiceTypes.ts`
  - Prompt 组装：`src/vs/workbench/contrib/void/common/prompt/prompts.ts`（`messageOfSelection`/`chat_userMessageContent`）
  - Chat 线程服务：`src/vs/workbench/contrib/void/browser/chatThreadService.ts`
  - Terminal：`src/vs/workbench/contrib/void/browser/terminalToolService.ts` + `src/vs/workbench/contrib/terminal/**`（新增 UI 入口/动作）

## ADDED Requirements

### Requirement: 拖拽文件/文件夹加入对话
系统 SHALL 支持将工作区内的文件或文件夹拖拽到聊天输入框区域，并将其加入当前线程的 stagingSelections，用于本次发送时注入到 `SELECTIONS`。

#### Scenario: 拖拽单个文件（Success）
- **WHEN** 用户将资源管理器中的单个文件拖入聊天输入框
- **THEN** 输入框上方出现对应文件的 selection chip
- **AND** 用户发送消息后，该文件内容（按既有策略截断）被注入到 `SELECTIONS`

#### Scenario: 拖拽文件夹（Success）
- **WHEN** 用户将工作区文件夹拖入聊天输入框
- **THEN** 出现 Folder selection chip
- **AND** 发送消息时注入 folder structure + 文件内容（按既有 folderOpts 限制）

#### Scenario: 多文件拖拽（Success）
- **WHEN** 用户一次拖拽多个文件/文件夹
- **THEN** 系统 MUST 全部加入 selections（去重），并保持可删除

### Requirement: 加入代码片段（编辑器选区）
系统 SHALL 支持将编辑器当前选区对应的“代码片段”加入对话 selections，并在发送时以 `CodeSelection` 形式注入 `SELECTIONS`。

#### Scenario: 从编辑器加入选区（Success）
- **WHEN** 用户在编辑器中选择一段代码并执行“加入对话”动作
- **THEN** 出现 CodeSelection chip（包含文件名与行号范围）
- **AND** 发送消息时注入该选区代码（按既有 `messageOfSelection(CodeSelection)` 规则）

### Requirement: 加入终端片段（手动）
系统 SHALL 支持将终端输出片段加入对话 selections，供本次发送注入。

#### Scenario: 从终端加入最近输出（Success）
- **WHEN** 用户在终端执行“加入对话（终端输出）”动作
- **THEN** 出现 Terminal selection chip（包含终端名/命令摘要）
- **AND** 发送消息时注入该终端片段（去除 ANSI 并按长度限制截断）

### Requirement: 终端失败快捷按钮
系统 SHALL 在终端命令失败（exitCode != 0）后，在终端右上角提供快捷按钮，一键将“失败命令 + 输出”加入对话 selections。

#### Scenario: 失败后快速加入（Success）
- **WHEN** 用户在终端执行命令且 exitCode != 0
- **THEN** 终端右上角出现“Add to Chat”按钮（或等价图标）
- **AND** 点击后将该失败片段加入当前聊天线程的 selections

### Requirement: 上下文压缩（摘要注入）
系统 SHALL 支持将当前对话历史压缩为 summary，并在后续请求中以稳定的方式注入到模型上下文中，以减少 token 占用并保留关键事实、决策与未完成事项。

#### Scenario: 手动压缩（Success）
- **WHEN** 用户点击“Compress Context”动作
- **THEN** 系统生成 summary 并持久化到该线程状态
- **AND** 后续发送消息时，summary MUST 被注入到上下文（优先级高于普通历史消息）

#### Scenario: 压缩不破坏可视历史（Success）
- **WHEN** summary 已生成
- **THEN** UI 仍保留完整历史显示（不强制删除历史消息）
- **AND** 注入时可选择“仅注入 summary + 最近 N 条消息”（实现细节由任务定义）

## MODIFIED Requirements

### Requirement: SELECTIONS 注入（扩展）
现有 `SELECTIONS` 拼接机制 SHALL 扩展支持 `Terminal` selection 类型，且保持现有格式兼容性（新类型追加在 `SELECTIONS` 内，不改变原有 File/Folder/CodeSelection 的序列化）。

## REMOVED Requirements
无。

