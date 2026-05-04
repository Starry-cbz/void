# Tasks

- [x] Task 1: 加固 VoidSCMMainService 的 git 执行与采样 diff 注入
  - [x] SubTask 1.1: 将 git 命令执行改为非 shell 方式（参数数组），确保文件名不会触发 shell 展开
  - [x] SubTask 1.2: 调整 stderr 处理逻辑：仅在非零退出码时报错；warning 不中断
  - [x] SubTask 1.3: 修复空变更时的解析与返回值（不产生 `undefined` 文件 pathspec）
  - [x] SubTask 1.4: 改进文件列表获取以支持 rename/binary 的降级策略（可跳过但不失败）

- [x] Task 2: 提升 SCM 提示词注入稳定性（避免 `.voidrules` 干扰）
  - [x] SubTask 2.1: 为 SCM feature 增加“格式约束优先级”机制（冲突时以 SCM systemMessage 为准）
  - [x] SubTask 2.2: 校验最终 system message 中明确包含 `<output>` 格式约束与“忽略冲突规则”指令

- [x] Task 3: 提升提交信息解析兜底与用户可观测错误
  - [x] SubTask 3.1: 若 `<output>` 缺失，提供兜底提取策略（例如：取全文首行/去除标签后的第一句）
  - [x] SubTask 3.2: 在兜底仍为空时，向用户显示失败通知且不覆盖现有输入框内容

- [x] Task 4: 增加/完善单元测试
  - [x] SubTask 4.1: 为 git 采样 diff 逻辑增加覆盖（含 empty/rename/binary/特殊文件名）
  - [x] SubTask 4.2: 为 SCM 解析兜底与“不写入空字符串”增加覆盖
  - [x] SubTask 4.3: 为 SCM system message 优先级规则增加覆盖（`.voidrules` 冲突场景）

- [x] Task 5: 本地静态校验
  - [x] SubTask 5.1: 运行 TypeScript 类型检查或既有测试命令，确保新增测试可运行

# Task Dependencies
- Task 2 depends on Task 1（提示词注入可能需要依赖更稳定的 diff 输入便于验证）
- Task 3 depends on Task 2（解析兜底与提示词格式约束需协同）
- Task 4 depends on Task 1, Task 2, Task 3
- Task 5 depends on Task 4
