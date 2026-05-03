import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RequestLogList } from '@/components/logs'
import { AppLogPanel } from '@/components/logs/AppLogPanel'

export default function LogsPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  
  const [activeTab, setActiveTab] = useState(tabFromUrl === 'app' ? 'app' : 'request')
  
  useEffect(() => {
    setActiveTab(tabFromUrl === 'app' ? 'app' : 'request')
  }, [tabFromUrl, setActiveTab])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('logs.title')}</h1>
          <p className="text-muted-foreground">{t('logs.description')}</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="request">{t('logs.requestLogs')}</TabsTrigger>
              <TabsTrigger value="app">{t('logs.appLogs')}</TabsTrigger>
            </TabsList>
            <TabsContent value="request">
              <RequestLogList />
            </TabsContent>
            <TabsContent value="app">
              <AppLogPanel />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
