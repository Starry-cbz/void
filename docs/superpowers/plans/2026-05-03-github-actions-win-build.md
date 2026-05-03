# GitHub Actions Windows x64 构建工作流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一个可手动触发的 GitHub Actions 工作流，在 Windows Runner 上构建 `main` 最新的 Void 与 Chat2API 的 Win x64 安装程序与免安装版，并上传为 Actions artifacts。

**Architecture:** 单个 workflow，两个并行 job：`build_void_win_x64` 与 `build_chat2api_win_x64`。每个 job 独立 checkout `main`，构建后将产物复制/重命名到统一目录并上传 artifacts。

**Tech Stack:** GitHub Actions（windows-latest）、Node（来自 `.nvmrc`）、npm、gulp（Void）、Inno Setup（Void）、electron-builder（Chat2API）、7-Zip。

---

## Files

- Create: `.github/workflows/build-win-x64.yml`

---

### Task 1: 新增 workflow（workflow_dispatch + 双 job）

**Files:**
- Create: `.github/workflows/build-win-x64.yml`

- [ ] **Step 1: 创建 workflow 基础结构**

在 `.github/workflows/build-win-x64.yml` 写入：
- `on: workflow_dispatch`
- 两个 job：`build_void_win_x64`、`build_chat2api_win_x64`
- `actions/checkout@v4` 固定 `ref: main`

- [ ] **Step 2: build_void_win_x64：依赖安装与构建**

使用命令：
- `npm ci`
- `npm run buildreact`
- `npm run gulp "vscode-win32-x64-min-ci"`
- `npm run gulp "vscode-win32-x64-user-setup"`
- `npm run gulp "vscode-win32-x64-system-setup"`

- [ ] **Step 3: build_void_win_x64：产物整理与上传**

PowerShell：
- 将 `.build/win32-x64/user-setup/VSCodeSetup.exe` 复制为 `.build/artifacts/Void-win32-x64-user-setup.exe`
- 将 `.build/win32-x64/system-setup/VSCodeSetup.exe` 复制为 `.build/artifacts/Void-win32-x64-system-setup.exe`
- `7z a -tzip .build\\artifacts\\Void-win32-x64.zip ..\\VSCode-win32-x64\\*`
- `actions/upload-artifact@v4` 上传 `.build/artifacts/*`

- [ ] **Step 4: build_chat2api_win_x64：依赖安装与构建**

在 `Chat2API` 目录执行：
- `npm ci`
- `npm run build:win`

- [ ] **Step 5: build_chat2api_win_x64：产物整理与上传**

PowerShell：
- 创建 `.build/artifacts-chat2api`
- 复制并重命名 `Chat2API/dist/*setup*.exe` → `Chat2API-win-x64-setup.exe`
- 复制并重命名 `Chat2API/dist/*portable*.exe` → `Chat2API-win-x64-portable.exe`
- 上传 `.build/artifacts-chat2api/*`

- [ ] **Step 6: 本地静态校验**

Run: `yq`/`yamllint` 若仓库没有则跳过；至少执行：

```bash
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/build-win-x64.yml','r',encoding='utf-8')); print('ok')"
```

Expected: `ok`

