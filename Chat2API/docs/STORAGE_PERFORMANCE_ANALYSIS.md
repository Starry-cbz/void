# 数据存储性能分析与优化方案

## 当前架构分析

### 存储方案
- **技术栈**: `electron-store` v10.0.0
- **底层实现**: 基于 `conf` 库，使用 JSON 文件存储
- **存储路径**: `~/.chat2api/data.json`
- **加密**: 使用 Electron `safeStorage` API 加密敏感数据

### 数据结构
```typescript
{
  providers: Provider[]           // 提供商列表
  accounts: Account[]             // 账号列表（含加密凭证）
  config: AppConfig               // 应用配置
  logs: LogEntry[]                // 系统日志
  requestLogs: RequestLogEntry[]  // 请求日志（主要性能瓶颈）
  systemPrompts: SystemPrompt[]   // 系统提示词
  sessions: SessionRecord[]       // 会话记录
  statistics: PersistentStatistics // 统计数据
  userModelOverrides: UserModelOverrides // 用户模型覆盖
}
```

---

## 性能瓶颈诊断

### 🔴 严重问题

#### 1. **全量读写 JSON 文件**
**问题描述**:
- 每次 `store.get()` 都会读取并解析整个 JSON 文件
- 每次 `store.set()` 都会序列化并写入整个 JSON 文件
- 当日志数据达到数千条时，单次读写可能耗时 **100-500ms**

**影响范围**:
```typescript
// 每次添加日志都会触发全量写入
addRequestLog(entry) {
  const requestLogs = this.store!.get('requestLogs') || []  // 读取全部
  requestLogs.push(newEntry)
  this.store!.set('requestLogs', requestLogs)               // 写入全部
}
```

**性能影响**:
- 1000 条日志: ~50ms/次
- 5000 条日志: ~200ms/次
- 10000 条日志: ~500ms/次
- **阻塞主进程，导致 UI 卡顿**

#### 2. **高频同步写入**
**问题描述**:
- 每个 API 请求都会写入请求日志
- 高并发时（如 10 req/s），每秒触发多次全量写入
- 写入操作在主线程同步执行，阻塞所有其他操作

**代码位置**:
```typescript
// src/main/proxy/routes/messages.ts
// 每个请求都会调用
storeManager.addRequestLog({...})  // 同步写入
```

#### 3. **日志数据膨胀**
**问题描述**:
- 请求日志包含完整的 request/response body
- 单条日志可能达到 10-100KB
- 10000 条日志 = 100MB-1GB JSON 文件
- JSON 解析时间随文件大小线性增长

---

### 🟡 中等问题

#### 4. **IPC 通信开销**
**问题描述**:
- 前端每次获取日志都需要通过 IPC 通信
- 大量数据序列化/反序列化开销
- 前端轮询（每 3 秒）增加负担

#### 5. **内存占用**
**问题描述**:
- 所有数据常驻内存
- 日志数据包含大量字符串（requestBody, responseBody）
- 可能导致内存压力

---

## 优化方案

### 方案 A: 增量写入 + 批量保存（推荐，低风险）

**核心思路**: 将日志写入改为内存缓存 + 定期批量持久化

**优点**:
- ✅ 改动最小，风险低
- ✅ 性能提升显著（10-50倍）
- ✅ 保持现有架构不变
- ✅ 向后兼容

**缺点**:
- ⚠️ 应用崩溃可能丢失最近 2 秒的日志
- ⚠️ 仍受限于 JSON 文件大小限制

**实现方案**:

```typescript
class StoreManager {
  private requestLogsCache: RequestLogEntry[] = []
  private requestLogsDirty = false
  private saveTimeout: NodeJS.Timeout | null = null
  
  // 添加日志到内存缓存
  addRequestLog(entry: Omit<RequestLogEntry, 'id'>): RequestLogEntry {
    const newEntry = { ...entry, id: this.generateId() }
    this.requestLogsCache.push(newEntry)
    this.requestLogsDirty = true
    
    // 延迟批量写入
    this.scheduleSave()
    
    // 实时通知前端
    this.mainWindow?.webContents.send(IpcChannels.REQUEST_LOGS_NEW, newEntry)
    
    return newEntry
  }
  
  // 批量保存（防抖 2 秒）
  private scheduleSave() {
    if (this.saveTimeout) return
    
    this.saveTimeout = setTimeout(() => {
      if (this.requestLogsDirty) {
        const allLogs = this.store!.get('requestLogs') || []
        allLogs.push(...this.requestLogsCache)
        
        // 清理过期日志
        const maxLogs = this.getConfig().logRetentionDays * 500
        if (allLogs.length > maxLogs) {
          allLogs.splice(0, allLogs.length - maxLogs)
        }
        
        this.store!.set('requestLogs', allLogs)
        this.requestLogsCache = []
        this.requestLogsDirty = false
      }
      this.saveTimeout = null
    }, 2000)
  }
  
  // 获取日志时合并缓存
  getRequestLogs(...) {
    const storedLogs = this.store!.get('requestLogs') || []
    const allLogs = [...storedLogs, ...this.requestLogsCache]
    // ... 过滤、排序、分页
  }
}
```

**预期性能**:
- 写入延迟: 500ms → <1ms（内存操作）
- 实际磁盘写入: 每 2 秒一次
- 吞吐量提升: 10-50 倍

---

### 方案 B: SQLite 数据库（长期方案）

**核心思路**: 使用 `better-sqlite3` 替代 JSON 存储

**优点**:
- ✅ 真正的增量读写
- ✅ 支持索引，查询性能优秀
- ✅ 支持并发读写
- ✅ 无文件大小限制
- ✅ 支持复杂查询（过滤、聚合、分页）

**缺点**:
- ❌ 需要引入新依赖（`better-sqlite3`）
- ❌ 需要数据迁移
- ❌ 增加打包体积（~2MB）
- ❌ 需要处理 native module 编译

**实现方案**:

```typescript
import Database from 'better-sqlite3'

class SQLiteStore {
  private db: Database.Database
  
  initialize() {
    this.db = new Database(path.join(this.storagePath, 'data.sqlite'))
    
    // 创建表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS request_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        status TEXT,
        status_code INTEGER,
        model TEXT,
        actual_model TEXT,
        provider_id TEXT,
        account_id TEXT,
        latency INTEGER,
        is_stream INTEGER,
        request_body TEXT,
        response_body TEXT,
        error_message TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_timestamp ON request_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_status ON request_logs(status);
      CREATE INDEX IF NOT EXISTS idx_provider ON request_logs(provider_id);
    `)
  }
  
  // 增量插入
  addRequestLog(entry) {
    const stmt = this.db.prepare(`
      INSERT INTO request_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      entry.id, entry.timestamp, entry.status, entry.statusCode,
      entry.model, entry.actualModel, entry.providerId, entry.accountId,
      entry.latency, entry.isStream ? 1 : 0,
      entry.requestBody, entry.responseBody, entry.errorMessage
    )
  }
  
  // 高效分页查询
  getRequestLogs(page: number, pageSize: number, filter?: any) {
    const offset = (page - 1) * pageSize
    const stmt = this.db.prepare(`
      SELECT * FROM request_logs
      WHERE status = ? OR ? IS NULL
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `)
    return stmt.all(filter?.status, filter?.status, pageSize, offset)
  }
  
  // 高效统计
  getLogStats() {
    return this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error
      FROM request_logs
    `).get()
  }
}
```

**预期性能**:
- 写入: <1ms（增量）
- 查询: <5ms（带索引）
- 分页: <2ms（OFFSET）
- 支持百万级日志

---

### 方案 C: 分离存储（混合方案）

**核心思路**: 配置用 JSON，日志用独立存储

```
~/.chat2api/
├── config.json          # 配置、提供商、账号（小文件，用 JSON）
├── logs/
│   ├── request-logs.db  # 请求日志（SQLite）
│   └── system-logs.db   # 系统日志（SQLite）
└── sessions/            # 会话数据
```

**优点**:
- ✅ 配置数据保持简单易用
- ✅ 日志数据获得数据库性能
- ✅ 互不影响

---

## 推荐实施路径

### 第一阶段（立即实施）: 方案 A - 批量写入优化
**工作量**: 2-3 小时
**风险**: 低
**收益**: 解决 90% 的卡顿问题

**步骤**:
1. 实现内存缓存 + 批量写入
2. 优化 `getRequestLogs` 合并缓存
3. 添加应用退出前强制保存
4. 测试验证

### 第二阶段（1-2 周后）: 方案 B - SQLite 迁移
**工作量**: 1-2 天
**风险**: 中
**收益**: 彻底解决存储性能问题

**步骤**:
1. 引入 `better-sqlite3`
2. 设计数据库 schema
3. 实现数据迁移脚本
4. 双写模式过渡
5. 完全切换到 SQLite

### 第三阶段（可选）: 日志归档
**工作量**: 半天
**收益**: 控制数据体积

**策略**:
- 30 天以上日志自动归档
- 归档文件压缩存储
- 支持按需加载历史日志

---

## 性能对比预估

| 场景 | 当前方案 | 方案 A (批量) | 方案 B (SQLite) |
|------|---------|--------------|----------------|
| 写入单条日志 | 50-500ms | <1ms | <1ms |
| 查询 50 条日志 | 50-200ms | 10-50ms | <5ms |
| 分页查询 | 100-500ms | 20-100ms | <5ms |
| 统计查询 | 100-300ms | 50-150ms | <2ms |
| 10000 条日志 | 严重卡顿 | 轻微延迟 | 无感知 |
| 100000 条日志 | 不可用 | 较慢 | 流畅 |

---

## 其他优化建议

### 1. 减少日志体积
```typescript
// 不存储完整的 request/response body
// 或只存储前 1KB 预览
addRequestLog({
  ...entry,
  requestBody: entry.requestBody?.substring(0, 1024),
  responseBody: entry.responseBody?.substring(0, 1024),
})
```

### 2. 前端优化
```typescript
// 使用 React Query 替代轮询
const { data } = useQuery({
  queryKey: ['requestLogs', page, filter],
  queryFn: () => fetchLogs(page, filter),
  refetchInterval: false, // 移除轮询
  staleTime: 5000,
})

// 使用 WebSocket 或 IPC 事件推送实时更新
```

### 3. 日志压缩
```typescript
// 使用 zstd 压缩大字段
import { compress, decompress } from 'zstd-codec'

const compressed = compress(JSON.stringify(requestBody))
const restored = JSON.parse(decompress(compressed))
```

---

## 结论

**立即实施方案 A**（批量写入优化），可以在最小改动下解决当前 90% 的卡顿问题。

**中长期迁移到方案 B**（SQLite），彻底解决存储性能瓶颈，支持更大规模的数据。

**优先级**:
1. 🔴 P0: 方案 A - 批量写入（本周完成）
2. 🟡 P1: 减少日志体积（本周完成）
3. 🟢 P2: SQLite 迁移（1-2 周后）
4. 🔵 P3: 日志归档（可选）
