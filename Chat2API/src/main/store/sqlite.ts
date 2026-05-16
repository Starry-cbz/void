/**
 * SQLite Database Manager
 * High-performance storage for request logs using better-sqlite3
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import type { RequestLogEntry } from './types'

export class SQLiteStore {
  private db: Database.Database | null = null
  private storagePath: string

  constructor() {
    this.storagePath = join(homedir(), '.chat2api')
  }

  /**
   * Initialize database and create tables
   */
  initialize(): void {
    if (this.db) return

    const dbPath = join(this.storagePath, 'data.sqlite')
    this.db = new Database(dbPath)

    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('cache_size = -64000') // 64MB cache

    this.createTables()
  }

  /**
   * Create database tables and indexes
   */
  private createTables(): void {
    if (!this.db) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS request_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        status TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        model TEXT NOT NULL,
        actual_model TEXT,
        provider_id TEXT,
        provider_name TEXT,
        account_id TEXT,
        account_name TEXT,
        request_body TEXT,
        user_input TEXT,
        web_search INTEGER DEFAULT 0,
        reasoning_effort TEXT,
        response_status INTEGER NOT NULL,
        response_preview TEXT,
        response_body TEXT,
        latency INTEGER NOT NULL,
        is_stream INTEGER DEFAULT 0,
        error_message TEXT,
        error_stack TEXT
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_timestamp ON request_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_status ON request_logs(status);
      CREATE INDEX IF NOT EXISTS idx_provider ON request_logs(provider_id);
      CREATE INDEX IF NOT EXISTS idx_status_timestamp ON request_logs(status, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_provider_timestamp ON request_logs(provider_id, timestamp DESC);
    `)
  }

  /**
   * Insert a request log entry
   */
  insertRequestLog(entry: RequestLogEntry): void {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO request_logs (
        id, timestamp, status, status_code, method, url, model, actual_model,
        provider_id, provider_name, account_id, account_name, request_body,
        user_input, web_search, reasoning_effort, response_status, response_preview,
        response_body, latency, is_stream, error_message, error_stack
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      entry.id,
      entry.timestamp,
      entry.status,
      entry.statusCode,
      entry.method,
      entry.url,
      entry.model,
      entry.actualModel || null,
      entry.providerId || null,
      entry.providerName || null,
      entry.accountId || null,
      entry.accountName || null,
      entry.requestBody || null,
      entry.userInput || null,
      entry.webSearch ? 1 : 0,
      entry.reasoningEffort || null,
      entry.responseStatus,
      entry.responsePreview || null,
      entry.responseBody || null,
      entry.latency,
      entry.isStream ? 1 : 0,
      entry.errorMessage || null,
      entry.errorStack || null
    )
  }

  /**
   * Batch insert request log entries
   */
  batchInsertRequestLogs(entries: RequestLogEntry[]): void {
    if (!this.db) throw new Error('Database not initialized')
    if (entries.length === 0) return

    const insertMany = this.db.transaction((logs: RequestLogEntry[]) => {
      for (const entry of logs) {
        this.insertRequestLog(entry)
      }
    })

    insertMany(entries)
  }

  /**
   * Update a request log entry
   */
  updateRequestLog(id: string, updates: Partial<RequestLogEntry>): boolean {
    if (!this.db) throw new Error('Database not initialized')

    const fields: string[] = []
    const values: any[] = []

    if (updates.responseBody !== undefined) {
      fields.push('response_body = ?')
      values.push(updates.responseBody || null)
    }
    if (updates.responsePreview !== undefined) {
      fields.push('response_preview = ?')
      values.push(updates.responsePreview || null)
    }
    if (updates.errorMessage !== undefined) {
      fields.push('error_message = ?')
      values.push(updates.errorMessage || null)
    }
    if (updates.errorStack !== undefined) {
      fields.push('error_stack = ?')
      values.push(updates.errorStack || null)
    }

    if (fields.length === 0) return false

    values.push(id)
    const sql = `UPDATE request_logs SET ${fields.join(', ')} WHERE id = ?`
    const result = this.db.prepare(sql).run(...values)

    return result.changes > 0
  }

  /**
   * Get request logs with pagination and filtering
   */
  getRequestLogs(options: {
    page?: number
    pageSize?: number
    limit?: number
    status?: 'success' | 'error'
    providerId?: string
  }): { logs: RequestLogEntry[]; total: number } {
    if (!this.db) throw new Error('Database not initialized')

    const { page = 1, pageSize = 50, limit, status, providerId } = options

    // Build WHERE clause
    const conditions: string[] = []
    const params: any[] = []

    if (status) {
      conditions.push('status = ?')
      params.push(status)
    }

    if (providerId) {
      conditions.push('provider_id = ?')
      params.push(providerId)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM request_logs ${whereClause}`
    const countResult = this.db.prepare(countSql).get(...params) as { total: number }
    const total = countResult.total

    // Get paginated results
    const actualPageSize = limit || pageSize
    const offset = (page - 1) * actualPageSize

    const querySql = `
      SELECT * FROM request_logs
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `

    const rows = this.db.prepare(querySql).all(...params, actualPageSize, offset) as any[]

    const logs = rows.map(row => this.rowToLogEntry(row))

    return { logs, total }
  }

  /**
   * Get a single request log by ID
   */
  getRequestLogById(id: string): RequestLogEntry | undefined {
    if (!this.db) throw new Error('Database not initialized')

    const row = this.db.prepare('SELECT * FROM request_logs WHERE id = ?').get(id) as any
    if (!row) return undefined

    return this.rowToLogEntry(row)
  }

  /**
   * Get request log statistics
   */
  getRequestLogStats(): {
    total: number
    success: number
    error: number
    todayTotal: number
    todaySuccess: number
    todayError: number
  } {
    if (!this.db) throw new Error('Database not initialized')

    const today = new Date().toISOString().split('T')[0]
    const todayStart = new Date(today).getTime()
    const todayEnd = todayStart + 24 * 60 * 60 * 1000

    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
        SUM(CASE WHEN timestamp >= ? AND timestamp < ? THEN 1 ELSE 0 END) as todayTotal,
        SUM(CASE WHEN timestamp >= ? AND timestamp < ? AND status = 'success' THEN 1 ELSE 0 END) as todaySuccess,
        SUM(CASE WHEN timestamp >= ? AND timestamp < ? AND status = 'error' THEN 1 ELSE 0 END) as todayError
      FROM request_logs
    `).get(todayStart, todayEnd, todayStart, todayEnd, todayStart, todayEnd) as any

    return {
      total: stats.total || 0,
      success: stats.success || 0,
      error: stats.error || 0,
      todayTotal: stats.todayTotal || 0,
      todaySuccess: stats.todaySuccess || 0,
      todayError: stats.todayError || 0,
    }
  }

  /**
   * Get request log trend for the last N days
   */
  getRequestLogTrend(days: number = 7): {
    date: string
    total: number
    success: number
    error: number
    avgLatency: number
  }[] {
    if (!this.db) throw new Error('Database not initialized')

    const trends: { date: string; total: number; success: number; error: number; avgLatency: number }[] = []
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const today = new Date().toISOString().split('T')[0]
    const todayStart = new Date(today).getTime()

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = todayStart - i * dayMs
      const dayEnd = dayStart + dayMs
      const date = new Date(dayStart).toISOString().split('T')[0]

      const dayStats = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
          AVG(CASE WHEN status = 'success' THEN latency ELSE NULL END) as avgLatency
        FROM request_logs
        WHERE timestamp >= ? AND timestamp < ?
      `).get(dayStart, dayEnd) as any

      trends.push({
        date,
        total: dayStats.total || 0,
        success: dayStats.success || 0,
        error: dayStats.error || 0,
        avgLatency: Math.round(dayStats.avgLatency || 0),
      })
    }

    return trends
  }

  /**
   * Clear all request logs
   */
  clearRequestLogs(): void {
    if (!this.db) throw new Error('Database not initialized')
    this.db.exec('DELETE FROM request_logs')
  }

  /**
   * Delete old request logs (older than retention days)
   */
  cleanExpiredLogs(retentionDays: number): number {
    if (!this.db) throw new Error('Database not initialized')

    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    const result = this.db.prepare('DELETE FROM request_logs WHERE timestamp < ?').run(cutoff)

    return result.changes
  }

  /**
   * Export all request logs as JSON
   */
  exportRequestLogs(format: 'json' | 'txt' = 'json'): string {
    if (!this.db) throw new Error('Database not initialized')

    const rows = this.db.prepare('SELECT * FROM request_logs ORDER BY timestamp DESC').all() as any[]
    const logs = rows.map(row => this.rowToLogEntry(row))

    if (format === 'json') {
      return JSON.stringify(logs, null, 2)
    }

    // TXT format
    return logs
      .map((log) => {
        const time = new Date(log.timestamp).toISOString()
        const status = log.status.toUpperCase().padEnd(7)
        let line = `[${time}] [${status}] ${log.method} ${log.url} ${log.statusCode}`

        line += ` | Model: ${log.model}`
        if (log.actualModel) {
          line += ` -> ${log.actualModel}`
        }
        if (log.providerId) {
          line += ` | Provider: ${log.providerId}`
        }
        if (log.accountId) {
          line += ` | Account: ${log.accountId}`
        }
        line += ` | Latency: ${log.latency}ms`
        if (log.errorMessage) {
          line += ` | Error: ${log.errorMessage}`
        }
        if (log.userInput) {
          const input = log.userInput.length > 100 ? log.userInput.substring(0, 100) + '...' : log.userInput
          line += ` | Input: ${input}`
        }

        return line
      })
      .join('\n')
  }

  /**
   * Get total count of request logs
   */
  getRequestLogCount(): number {
    if (!this.db) throw new Error('Database not initialized')
    const result = this.db.prepare('SELECT COUNT(*) as count FROM request_logs').get() as { count: number }
    return result.count
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /**
   * Convert database row to RequestLogEntry
   */
  private rowToLogEntry(row: any): RequestLogEntry {
    return {
      id: row.id,
      timestamp: row.timestamp,
      status: row.status,
      statusCode: row.status_code,
      method: row.method,
      url: row.url,
      model: row.model,
      actualModel: row.actual_model || undefined,
      providerId: row.provider_id || undefined,
      providerName: row.provider_name || undefined,
      accountId: row.account_id || undefined,
      accountName: row.account_name || undefined,
      requestBody: row.request_body || undefined,
      userInput: row.user_input || undefined,
      webSearch: row.web_search === 1,
      reasoningEffort: row.reasoning_effort || undefined,
      responseStatus: row.response_status,
      responsePreview: row.response_preview || undefined,
      responseBody: row.response_body || undefined,
      latency: row.latency,
      isStream: row.is_stream === 1,
      errorMessage: row.error_message || undefined,
      errorStack: row.error_stack || undefined,
    }
  }

  /**
   * Get database instance (for debugging)
   */
  getDb(): Database.Database | null {
    return this.db
  }
}

// Export singleton instance
export const sqliteStore = new SQLiteStore()
