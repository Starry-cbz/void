# Void：更像 Cursor 的“自动附加上下文”增强 Spec

## Why
当前 Void 的增强上下文（diagnostics/git/终端失败片段）已经覆盖了一部分 Cursor 的“attached context”体验，但仍缺少对“用户正在编辑的具体位置/片段”、更细粒度的变更列表、以及更贴近 Cursor 的终端上下文摘要。我们希望在保持可控（可开关、可截断、低噪声）的前提下，让 Chat/Agent 的上下文更“像 Cursor”。

## What Changes
- 扩展 Chat/Agent 的 `<enhanced_context>`，新增：
  - 活动编辑器的“光标附近代码片段”自动注入（严格截断）
  - 更详细的 SCM 变更摘要（文件列表 + 分组/数量）
  - 更详细的终端上下文摘要（最近 N 条命令摘要 + 最近失败输出片段）
- 新增更细粒度的开关项（在现有 `promptStyle`/`enableEnhancedContext` 基础上细分），以控制“包含原文内容”的上下文注入策略
- 保持 SCM（commit message）链路不受影响（继续严格 `<output>`，不注入增强上下文）

## Impact
- Affected specs: 上下文管理、隐私/成本控制、Chat/Agent 稳定性
- Affected code:
  - System message 构建：`src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts`
  - Prompt 结构：`src/vs/workbench/contrib/void/common/prompt/prompts.ts`
  - 设置与 UI：`src/vs/workbench/contrib/void/common/voidSettingsTypes.ts`、`src/vs/workbench/contrib/void/common/voidSettingsService.ts`、`src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/Settings.tsx`
  - 终端能力：`src/vs/workbench/contrib/terminal/...`、`src/vs/workbench/contrib/void/browser/terminalSnippetService.ts`

## ADDED Requirements

### Requirement: 光标附近代码片段自动注入
系统 SHALL 在 `promptStyle='cursor'` 且增强上下文开启时，将活动编辑器光标附近的一段代码注入到 `<enhanced_context>` 中。

约束：
- 仅注入活动文件（active editor）的片段
- 默认窗口大小（可配置）：光标前后各 80 行（或总行数上限 200 行）
- 严格截断总字符数（例如 10k chars），避免挤占上下文窗口
- 仅在可获取到 code editor selection/position 时注入；否则跳过

#### Scenario: 用户正在编辑某文件（Success）
- **WHEN** 用户在编辑器中打开并聚焦一个文件
- **THEN** 系统在 Chat/Agent system message 的 `<enhanced_context>` 中包含该文件光标附近片段

### Requirement: SCM 变更摘要更详细
系统 SHALL 在增强上下文中注入更详细的变更摘要，至少包含：
- git 仓库 root（如可得）
- 变更文件数量
- Top N 变更文件路径列表（N 默认 20，可配置）

#### Scenario: 仓库存在未提交变更（Success）
- **WHEN** SCM 提供 git 仓库的变更资源
- **THEN** `<enhanced_context>` 中包含变更文件列表与数量

### Requirement: 终端上下文摘要增强
系统 SHALL 在增强上下文中注入更贴近 Cursor 的终端摘要，至少包含：
- 最近 N 条命令摘要（command + exitCode + 近似时间/顺序）
- 最近一次失败命令的输出片段（严格截断；与现有失败片段能力兼容）

#### Scenario: 终端刚执行过命令（Success）
- **WHEN** 活动终端具备 CommandDetection 能力并记录了命令历史
- **THEN** `<enhanced_context>` 中包含最近命令摘要与最近失败输出（若有）

### Requirement: 更细粒度的上下文开关
系统 SHALL 提供更细粒度的开关来控制“包含原文内容”的上下文注入策略，默认开启但可关闭，至少包括：
- `enableEnhancedContext`（总开关，已有）
- `enhancedContextIncludeCodeSnippet`（默认 true）
- `enhancedContextIncludeTerminalSummary`（默认 true）
- `enhancedContextIncludeScmChangedFiles`（默认 true）

#### Scenario: 用户关闭原文注入（Success）
- **WHEN** 用户关闭 `enhancedContextIncludeCodeSnippet` 或 `enhancedContextIncludeTerminalSummary`
- **THEN** system message 不再包含对应的原文片段，但仍可保留统计信息/列表（若对应开关仍开）

## MODIFIED Requirements

### Requirement: `<enhanced_context>` 结构与稳定性
系统 SHALL 保持 `<enhanced_context>` 的结构稳定且低噪声：
- 分区清晰（Diagnostics / SCM / Editor / Terminal）
- 每个分区均有上限（条数与字符数）
- 缺失信息时省略分区，不输出占位噪声

## REMOVED Requirements
无

