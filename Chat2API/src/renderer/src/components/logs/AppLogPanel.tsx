import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useLogsStore } from '@/stores/logsStore'
import { LogFilter } from './LogFilter'
import { LogStats } from './LogStats'
import { LogList } from './LogList'
import { LogDetail } from './LogDetail'

export function AppLogPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { logs, refresh, addLog, clearLogs, setSelectedLog } = useLogsStore()
  const [isExporting, setIsExporting] = useState(false)
  const [showClearDialog, setShowClearDialog] = useState(false)

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!window.electronAPI?.logs?.onNewLog) return
    const unsubscribe = window.electronAPI.logs.onNewLog((log) => addLog(log))
    return unsubscribe
  }, [addLog])

  const handleExportLogs = useCallback(async () => {
    if (!window.electronAPI?.logs?.export) {
      toast({
        title: t('logs.cannotExportLogs'),
        description: t('logs.browserModeNotSupported'),
        variant: 'destructive',
      })
      return
    }

    try {
      setIsExporting(true)
      const content = await window.electronAPI.logs.export('json')
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `chat2api-app-logs-${new Date().toISOString().split('T')[0]}.json`
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
  }, [t, toast])

  const handleClearLogs = useCallback(async () => {
    if (!window.electronAPI?.logs?.clear) return
    await window.electronAPI.logs.clear()
    clearLogs()
    setShowClearDialog(false)
  }, [clearLogs])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{t('logs.description')}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('dashboard.refresh')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportLogs}
            disabled={logs.length === 0 || isExporting}
          >
            <Download className={cn("h-4 w-4 mr-2", isExporting && "animate-spin")} />
            {t('logs.exportLogs')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setShowClearDialog(true)}>
            {t('logs.clearLogs')}
          </Button>
        </div>
      </div>

      <LogFilter />
      <LogStats />
      <LogList height={500} onLogClick={setSelectedLog} />
      <LogDetail />

      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="h-4 w-4 text-destructive" />
              </div>
              {t('logs.clearConfirm')}
            </DialogTitle>
            <DialogDescription>{t('logs.clearConfirmDesc')}</DialogDescription>
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

