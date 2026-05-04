# Void：SCM AI 提交信息生成加固 Spec

## Why
当前 Void 的“AI 生成提交信息”功能在提示词可解析性与 diff 注入可靠性上存在脆弱点，可能导致生成结果为空、误导性较强，甚至在极端文件名场景下存在命令执行风险。

## What Changes
- 提升 git 变更采集的安全性与鲁棒性：避免 shell 拼接执行、容忍非致命 stderr、正确处理空变更/rename/binary 等情况
- 提升提示词的稳定可解析性：确保 `<output>...</output>` 格式约束优先级最高，减少用户 `.voidrules` / 全局指令对 SCM 生成的干扰
- 提升回填体验：当模型未按格式返回时提供兜底与明确错误提示，避免静默回填空字符串
- 补充单元测试覆盖：覆盖 prompt 组装、diff 采样与解析兜底的关键路径
- **非 BREAKING**：仅影响“Void: Generate Commit Message”行为；不改变普通聊天/其它 AI 功能

## Impact
- Affected specs: SCM 提交信息生成、AI 提示词组装、git diff 注入、安全性与稳定性
- Affected code:
  - Void：`src/vs/workbench/contrib/void/browser/voidSCMService.ts`
  - Void：`src/vs/workbench/contrib/void/common/prompt/prompts.ts`
  - Void：`src/vs/workbench/contrib/void/electron-main/voidSCMMainService.ts`
  - Void：`src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts`
  - Tests：`src/vs/workbench/contrib/void/test/**`（新增/扩展）

## ADDED Requirements

### Requirement: 安全执行 git 命令
系统 SHALL 以“参数数组/非 shell”方式执行 git 命令，避免因特殊文件名触发 shell 展开（例如 `$()`, 反引号等）导致命令失败或潜在注入风险。

#### Scenario: 含特殊字符文件名（Success）
- **WHEN** repo 中存在文件名包含 `$()`、反引号、引号或其他 shell 元字符，且该文件参与 diff
- **THEN** `gitSampledDiffs` MUST 能正常生成该文件的 diff 片段或在不可生成时安全跳过
- **AND** MUST 不出现 shell 展开导致的异常行为

### Requirement: 容忍非致命 stderr
系统 SHALL 仅在 git 命令执行失败（非零退出码）时判定失败；若命令成功但 stderr 非空（warning），系统 SHOULD 不中断提交信息生成流程。

#### Scenario: git warning（Success）
- **WHEN** git 命令成功返回 stdout 且 stderr 含 warning
- **THEN** 生成流程 MUST 继续并使用 stdout 作为输入

### Requirement: 可靠采集变更文件列表
系统 SHALL 能在 staged 优先的策略下稳定获得“真实路径”的变更文件列表，并据此生成抽样 diff；对 rename 产生的路径标记与 binary 文件（`--numstat` 的 `-`）MUST 有明确处理策略（可采集、可跳过但不可破坏流程）。

#### Scenario: rename/binary（Success）
- **WHEN** 本次变更包含 rename 或 binary 文件
- **THEN** 抽样 diff 生成 MUST 不报错
- **AND** 对 rename 文件 MUST 尽可能注入可读 diff（或退化为仅 stat 信息但不失败）

### Requirement: SCM 提示词格式约束优先级
系统 SHALL 保证 SCM 提交信息生成时 `<output>...</output>` 的输出格式约束优先级最高，不因 `.voidrules` 或全局 AI 指令冲突而失效。

#### Scenario: `.voidrules` 冲突（Success）
- **WHEN** 用户在 `.voidrules` 中设置与 XML 标签输出冲突的规则
- **THEN** SCM 提交信息生成仍 MUST 输出 `<output>` 包裹的 commit message

### Requirement: 解析兜底与可观测错误
系统 SHALL 在解析 `<output>` 失败时提供兜底策略，并向用户给出明确的失败提示；不得静默写入空提交信息。

#### Scenario: 模型未输出 `<output>`（Success）
- **WHEN** 模型返回文本中缺失 `<output>...</output>`
- **THEN** 系统 MUST 不写入空字符串到 SCM 输入框
- **AND** 系统 MUST 给出错误提示或使用安全兜底（如使用整段文本的首行作为候选 message）

## MODIFIED Requirements

### Requirement: SCM diff 注入策略（增强）
现有“Top N 文件 + 每文件截断”的策略 SHALL 保留为默认行为，但必须在以下方面增强：
- 空变更时返回空 diff 段而非 `undefined` 路径
- 文件列表来源必须是“可用于 pathspec 的真实路径”
- 在采集失败时采用安全降级（例如仅使用 `--stat`）而不是整体失败

## REMOVED Requirements
无。

