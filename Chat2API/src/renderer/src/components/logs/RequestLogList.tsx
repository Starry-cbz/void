import { useState, useEffect, useCallback, useMemo, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { RequestLogDetail } from './RequestLogDetail'
import { RequestLogStats } from './RequestLogStats'
import { RefreshCw, Trash2, Download } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface RequestLogEntry {
  id: string
  timestamp: number
  status: 'success' | 'error'
  statusCode: number
  method: string
  url: string
  model: string
  actualModel?: string
  providerId?: string
  providerName?: string
  accountId?: string
  accountName?: string
  requestBody?: string
  userInput?: string
  responseStatus: number
  responsePreview?: string
  latency: number
  isStream: boolean
  errorMessage?: string
  errorStack?: string
}

interface RequestLogStatsData {
  total: number
  success: number
  error: number
  todayTotal: number
  todaySuccess: number
  todayError: number
}

interface PaginatedResponse {
  logs: RequestLogEntry[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 50

function getStatusColor(status: 'success' | 'error', statusCode: number) {
  if (status === 'success') return 'bg-green-500/10 text-green-500 border-green-500/20'
  if (statusCode >= 500) return 'bg-red-500/10 text-red-500 border-red-500/20'
  if (statusCode >= 400) return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
  return 'bg-red-500/10 text-red-500 border-red-500/20'
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatLatency(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function RequestLogList() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [logs, setLogs] = useState<RequestLogEntry[]>([])
  const [stats, setStats] = useState<RequestLogStatsData | null>(null)
  const [selectedLog, setSelectedLog] = useState<RequestLogEntry | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalLogs, setTotalLogs] = useState(0)

  const totalPages = Math.ceil(totalLogs / PAGE_SIZE)

  const fetchLogs = useCallback(async (page: number = currentPage) => {
    try {
      const filter = statusFilter === 'all' ? {} : { status: statusFilter }
      const result = await window.electronAPI?.requestLogs?.get({ 
        ...filter, 
        page, 
        pageSize: PAGE_SIZE 
      })
      if (result) {
        // Check if it's a paginated response
        if (result && typeof result === 'object' && 'logs' in result) {
          const paginatedResult = result as PaginatedResponse
          setLogs(paginatedResult.logs)
          setTotalLogs(paginatedResult.total)
        } else {
          // Legacy response (array)
          setLogs(result as RequestLogEntry[])
          setTotalLogs((result as RequestLogEntry[]).length)
        }
      }
    } catch (error) {
      console.error('Failed to fetch request logs:', error)
    }
  }, [currentPage, statusFilter])

  const fetchStats = useCallback(async () => {
    try {
      const result = await window.electronAPI?.requestLogs?.getStats()
      if (result) {
        setStats(result)
      }
    } catch (error) {
      console.error('Failed to fetch request log stats:', error)
    }
  }, [])

  useEffect(() => {
    setIsLoading(true)
    Promise.all([fetchLogs(1), fetchStats()]).finally(() => {
      setIsLoading(false)
      setCurrentPage(1)
    })
  }, [statusFilter, fetchStats])

  useEffect(() => {
    if (currentPage !== 1 || statusFilter !== 'all') {
      setIsLoading(true)
      fetchLogs(currentPage).finally(() => setIsLoading(false))
    }
  }, [currentPage])

  // Real-time update: only update if we're on page 1
  useEffect(() => {
    if (!window.electronAPI?.requestLogs?.onNewLog) return

    const unsubscribe = window.electronAPI.requestLogs.onNewLog((newLog: RequestLogEntry) => {
      // Only update in real-time if we're on page 1 and filter matches
      if (currentPage === 1 && (statusFilter === 'all' || newLog.status === statusFilter)) {
        setLogs(prev => {
          const updated = [newLog, ...prev.slice(0, PAGE_SIZE - 1)]
          return updated
        })
        setTotalLogs(prev => prev + 1)
      }
      fetchStats()
    })

    return unsubscribe
  }, [currentPage, statusFilter, fetchStats])

  const handleClearLogs = async () => {
    await window.electronAPI?.requestLogs?.clear()
    setLogs([])
    setTotalLogs(0)
    setCurrentPage(1)
    fetchStats()
    setShowClearDialog(false)
  }

  const handleExportLogs = async () => {
    if (!window.electronAPI?.requestLogs?.export) {
      toast({
        title: t('logs.cannotExportLogs'),
        description: t('logs.browserModeNotSupported'),
        variant: 'destructive',
      })
      return
    }

    try {
      setIsExporting(true)
      const content = await window.electronAPI.requestLogs.export('json')
      
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `chat2api-request-logs-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: t('logs.exportSuccess'),
        description: t('logs.logsExportedAs', { format: 'JSON' }),
      })
    } catch (error) {
      console.error('Failed to export logs:', error)
      toast({
        title: t('logs.exportFailed'),
        description: error instanceof Error ? error.message : t('common.error'),
        variant: 'destructive',
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleSelectLog = useCallback((log: RequestLogEntry) => {
    setSelectedLog(log)
  }, [])

  const handlePageChange = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }, [totalPages])

  const renderPaginationItems = useMemo(() => {
    if (totalPages <= 1) return []
    
    const items: (number | 'ellipsis')[] = []
    const maxVisible = 5
    
    if (totalPages <= maxVisible + 2) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        items.push(i)
      }
    } else {
      // Show first page
      items.push(1)
      
      if (currentPage > 3) {
        items.push('ellipsis')
      }
      
      // Show pages around current page
      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)
      
      for (let i = start; i <= end; i++) {
        items.push(i)
      }
      
      if (currentPage < totalPages - 2) {
        items.push('ellipsis')
      }
      
      // Show last page
      items.push(totalPages)
    }
    
    return items
  }, [currentPage, totalPages])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">{t('logs.requestLogs')}</h2>
          <Select value={statusFilter} onValueChange={(v) => {
            setStatusFilter(v as 'all' | 'success' | 'error')
            setCurrentPage(1)
          }}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder={t('logs.filter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('logs.all')}</SelectItem>
              <SelectItem value="success">{t('common.success')}</SelectItem>
              <SelectItem value="error">{t('common.error')}</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {totalLogs > 0 && `${totalLogs} ${t('logs.total') || 'total'}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLogs(currentPage)}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            {t('dashboard.refresh')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportLogs}
            disabled={totalLogs === 0 || isExporting}
          >
            <Download className={cn("h-4 w-4 mr-2", isExporting && "animate-spin")} />
            {t('logs.exportLogs')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setShowClearDialog(true)}>
            {t('logs.clearLogs')}
          </Button>
        </div>
      </div>

      {stats && <RequestLogStats stats={stats} />}

      <div className="flex-1 mt-4 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            {t('common.loading')}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            {t('logs.noRequestLogs')}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors h-[68px]"
                  onClick={() => handleSelectLog(log)}
                >
                  <Badge variant="outline" className={getStatusColor(log.status, log.statusCode)}>
                    {log.statusCode}
                  </Badge>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{log.model}</span>
                      {log.actualModel && log.actualModel !== log.model && (
                        <span className="text-xs text-muted-foreground">→ {log.actualModel}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>{log.providerName || log.providerId}</span>
                      {log.accountName && (
                        <>
                          <span>·</span>
                          <span>{log.accountName}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
                    <span className="tabular-nums">{formatLatency(log.latency)}</span>
                    <span>{formatTime(log.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center pt-4 pb-2">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => handlePageChange(currentPage - 1)}
                        className={cn(currentPage === 1 && "pointer-events-none opacity-50")}
                      />
                    </PaginationItem>
                    
                    {renderPaginationItems.map((item, index) => {
                      if (item === 'ellipsis') {
                        return (
                          <PaginationItem key={`ellipsis-${index}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        )
                      }
                      
                      return (
                        <PaginationItem key={item}>
                          <PaginationLink
                            onClick={() => handlePageChange(item as number)}
                            isActive={currentPage === item}
                          >
                            {item}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    })}
                    
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => handlePageChange(currentPage + 1)}
                        className={cn(currentPage === totalPages && "pointer-events-none opacity-50")}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>

      {selectedLog && (
        <RequestLogDetail log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}

      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="h-4 w-4 text-destructive" />
              </div>
              {t('logs.clearConfirm')}
            </DialogTitle>
            <DialogDescription>
              {t('logs.clearConfirmDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleClearLogs}>
              {t('logs.clearLogs')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
