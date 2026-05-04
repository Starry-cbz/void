# Tasks

- [x] Task 1: 扩展增强上下文模型（Diff + RecentFiles）
  - [x] SubTask 1.1: 在 `enhancedContext.ts` 增加 `Diff` 与 `RecentFiles` 分区的输出模板（缺失即省略）
  - [x] SubTask 1.2: 为两分区定义默认上限（maxFiles/maxDiffLength/maxRecentFiles）

- [x] Task 2: 增加设置项与 UI
  - [x] SubTask 2.1: 为 GlobalSettings 增加 `enhancedContextIncludeDiffSummary` 与 `enhancedContextIncludeRecentFiles`（默认 true）
  - [x] SubTask 2.2: 为老存储补默认值（向后兼容）
  - [x] SubTask 2.3: Settings 的 Prompts 区块增加两个开关，并与总开关协同展示

- [x] Task 3: Diff/变更摘要采集与缓存
  - [x] SubTask 3.1: 复用现有 git diff sampling 能力（stat + sampled diffs），生成稳定字符串输出
  - [x] SubTask 3.2: 增加节流与缓存（例如 5–10s 内复用）
  - [x] SubTask 3.3: 错误容错与二进制 diff 跳过策略保持与现有实现一致

- [x] Task 4: 最近编辑文件列表采集
  - [x] SubTask 4.1: 监听 model content change / selection change，维护最近编辑文件 LRU（含时间、位置）
  - [x] SubTask 4.2: 仅追踪 `file` scheme，且有上限（默认 15）
  - [x] SubTask 4.3: 将 RecentFiles 输出接入 `buildEnhancedContext`

- [x] Task 5: 测试与回归
  - [x] SubTask 5.1: 静态测试：开关开启时 `Diff/RecentFiles` 分区存在；关闭时分区移除
  - [x] SubTask 5.2: 类型检查与关键测试子集通过

# Task Dependencies
- Task 3/4 depends on Task 1, Task 2
- Task 5 depends on Task 3, Task 4
