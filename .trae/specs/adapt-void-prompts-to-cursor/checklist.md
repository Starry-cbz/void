- [ ] 已记录 Cursor Chat Prompt + Agent Prompt v1.2 的来源与版本信息，并形成“保留/改写/移除”清单
- [ ] Void prompt 分层（基准 + overlay + feature patch）方案明确，且具备最小开关（legacy/cursor）
- [ ] Chat system message 完成 Cursor 化（结构段落、工具调用约束、检索优先、少猜测），且不包含已移除段落
- [ ] Ctrl+K / Quick Edit 提示词完成 Cursor 化（编辑格式、验证策略、最小编辑表达）
- [ ] Autocomplete 提示词完成 Cursor 化（输出约束与停止策略稳定）
- [ ] SCM 提示词继续隔离且严格 `<output>`，不受 Cursor overlay 污染
- [ ] Phase 2 增强上下文最小补齐完成且可通过开关关闭
- [ ] 类型检查与关键测试子集通过，且有手工验证步骤覆盖四入口

