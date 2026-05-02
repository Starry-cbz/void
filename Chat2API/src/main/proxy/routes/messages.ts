/**
 * Proxy Service Module - Anthropic Messages Route
 * Implements /v1/messages route for Anthropic API compatibility
 */

import Router from '@koa/router'
import type { Context } from 'koa'
import { PassThrough } from 'stream'
import { ChatCompletionRequest, ProxyContext } from '../types'
import { loadBalancer } from '../loadbalancer'
import { requestForwarder } from '../forwarder'
import { streamHandler } from '../stream'
import { proxyStatusManager } from '../status'
import { modelMapper } from '../modelMapper'
import { storeManager } from '../../store/store'
import { anthropicRequestToOpenAI, openAIResponseToAnthropic, OpenAIToAnthropicStream } from '../utils/anthropicAdapter'

const router = new Router({ prefix: '/v1/messages' })

/**
 * Generate Request ID
 */
function generateRequestId(): string {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Get Client IP
 */
function getClientIP(ctx: Context): string {
  return ctx.headers['x-real-ip'] as string ||
    ctx.headers['x-forwarded-for'] as string ||
    ctx.ip ||
    'unknown'
}

/**
 * Extract user input from messages (last user message, full content)
 */
function extractUserInput(messages: Array<{ role: string; content?: string | any[] | null }>): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'user' && msg.content) {
      let content = ''
      if (typeof msg.content === 'string') {
        content = msg.content
      } else if (Array.isArray(msg.content)) {
        const textParts = msg.content.filter((p: any) => p.type === 'text')
        if (textParts.length > 0) {
          content = textParts.map((p: any) => p.text || '').join(' ')
        }
      }
      if (content) {
        return content
      }
    }
  }
  return undefined
}

/**
 * Handle Messages Request
 */
router.post('/', async (ctx: Context) => {
  const startTime = Date.now()
  const requestId = generateRequestId()
  const clientIP = getClientIP(ctx)

  let anthropicReq: any
  try {
    anthropicReq = ctx.request.body
  } catch (error) {
    ctx.status = 400
    ctx.body = { error: { type: 'invalid_request_error', message: 'Invalid request body' } }
    return
  }

  if (!anthropicReq.model) {
    ctx.status = 400
    ctx.body = { error: { type: 'invalid_request_error', message: 'Missing required field: model' } }
    return
  }

  // Convert Anthropic request to OpenAI request
  const request: ChatCompletionRequest = anthropicRequestToOpenAI(anthropicReq)

  const config = storeManager.getConfig()
  const preferredProviderId = modelMapper.getPreferredProvider(request.model)
  const preferredAccountId = modelMapper.getPreferredAccount(request.model)

  const selection = loadBalancer.selectAccount(
    request.model,
    config.loadBalanceStrategy,
    preferredProviderId,
    preferredAccountId
  )

  if (!selection) {
    ctx.status = 503
    ctx.body = {
      error: { type: 'api_error', message: `No available account for model: ${request.model}` }
    }
    return
  }

  const { account, provider, actualModel } = selection

  const context: ProxyContext = {
    requestId,
    providerId: provider.id,
    accountId: account.id,
    model: request.model,
    actualModel,
    startTime,
    isStream: request.stream || false,
    clientIP,
  }

  proxyStatusManager.recordRequestStart(request.model, provider.id, account.id)

  try {
    const result = await requestForwarder.forwardChatCompletion(
      request,
      account,
      provider,
      actualModel,
      context
    )

    const latency = Date.now() - startTime

    if (!result.success) {
      proxyStatusManager.recordRequestFailure(latency)
      if (result.status && result.status >= 400 && result.status !== 429) {
        loadBalancer.markAccountFailed(account.id)
      }

      ctx.status = result.status || 500
      ctx.body = { error: { type: 'api_error', message: result.error || 'Request failed' } }
      
      storeManager.addLog('error', `Request failed: ${result.error}`, {
        requestId,
        providerId: provider.id,
        accountId: account.id,
        model: request.model,
        latency,
      })

      const userInput = extractUserInput(request.messages)
      const errorResponseBody = JSON.stringify(ctx.body)
      storeManager.addRequestLog({
        timestamp: startTime,
        status: 'error',
        statusCode: result.status || 500,
        method: 'POST',
        url: '/v1/messages',
        model: request.model,
        actualModel,
        providerId: provider.id,
        providerName: provider.name,
        accountId: account.id,
        accountName: account.name,
        requestBody: JSON.stringify(anthropicReq),
        userInput,
        responseStatus: result.status || 500,
        responseBody: errorResponseBody,
        latency,
        isStream: request.stream || false,
        errorMessage: result.error,
      })

      storeManager.recordRequestInStats(false, latency, request.model, provider.id, account.id)
      return
    }

    loadBalancer.clearAccountFailure(account.id)
    proxyStatusManager.recordRequestSuccess(latency)

    storeManager.updateAccount(account.id, {
      lastUsed: Date.now(),
      requestCount: (account.requestCount || 0) + 1,
      todayUsed: (account.todayUsed || 0) + 1,
    })

    storeManager.addLog('info', `Request succeeded`, {
      requestId,
      providerId: provider.id,
      accountId: account.id,
      model: request.model,
      actualModel,
      latency,
      isStream: request.stream,
    })

    const userInput = extractUserInput(request.messages)
    const responseBodyForLog = !request.stream && result.body
      ? JSON.stringify(openAIResponseToAnthropic(result.body, requestId))
      : undefined

    let logEntryId: string | undefined

    if (!request.stream) {
      const logEntry = storeManager.addRequestLog({
        timestamp: startTime,
        status: 'success',
        statusCode: 200,
        method: 'POST',
        url: '/v1/messages',
        model: request.model,
        actualModel,
        providerId: provider.id,
        providerName: provider.name,
        accountId: account.id,
        accountName: account.name,
        requestBody: JSON.stringify(anthropicReq),
        userInput,
        responseStatus: 200,
        responseBody: responseBodyForLog,
        latency,
        isStream: false,
      })
      logEntryId = logEntry.id
    } else {
      const logEntry = storeManager.addRequestLog({
        timestamp: startTime,
        status: 'success',
        statusCode: 200,
        method: 'POST',
        url: '/v1/messages',
        model: request.model,
        actualModel,
        providerId: provider.id,
        providerName: provider.name,
        accountId: account.id,
        accountName: account.name,
        requestBody: JSON.stringify(anthropicReq),
        userInput,
        responseStatus: 200,
        latency,
        isStream: true,
      })
      logEntryId = logEntry.id
    }

    storeManager.recordRequestInStats(true, latency, request.model, provider.id, account.id)

    if (request.stream === true && result.stream) {
      ctx.set('Content-Type', 'text/event-stream')
      ctx.set('Cache-Control', 'no-cache')
      ctx.set('Connection', 'keep-alive')
      ctx.set('X-Accel-Buffering', 'no')

      // Use transform stream
      const transformStream = new OpenAIToAnthropicStream(requestId)
      
      // Error handling
      result.stream.once('error', (err: Error) => {
        transformStream.end(`event: error\ndata: ${JSON.stringify({ error: { message: err.message } })}\n\n`)
      })

      let collectedContent = ''
      transformStream.on('data', (chunk: Buffer | string) => {
        collectedContent += chunk.toString()
      })

      transformStream.once('end', () => {
        if (logEntryId) {
          storeManager.updateRequestLog(logEntryId, {
            responseBody: collectedContent || undefined,
          })
        }
      })

      if (result.skipTransform) {
        result.stream.pipe(transformStream)
      } else {
        const openaiTransformStream = streamHandler.createTransformStream(actualModel, requestId, () => {})
        result.stream.pipe(openaiTransformStream).pipe(transformStream)
      }

      ctx.body = transformStream
    } else {
      ctx.set('Content-Type', 'application/json')
      
      if (result.body) {
        // Convert response
        ctx.body = openAIResponseToAnthropic(result.body, requestId)
      } else {
        ctx.body = openAIResponseToAnthropic({
          id: requestId,
          model: actualModel,
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '' } }],
          usage: { prompt_tokens: 0, completion_tokens: 0 }
        }, requestId)
      }
    }
  } catch (error) {
    const latency = Date.now() - startTime
    proxyStatusManager.recordRequestFailure(latency)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined

    ctx.status = 500
    ctx.body = { error: { type: 'api_error', message: errorMessage } }

    storeManager.addLog('error', `Request exception: ${errorMessage}`, {
      requestId,
      providerId: provider.id,
      accountId: account.id,
      model: request.model,
      latency,
      error: errorMessage,
    })

    const userInput = extractUserInput(request.messages)
    const exceptionResponseBody = JSON.stringify(ctx.body)
    
    storeManager.addRequestLog({
      timestamp: startTime,
      status: 'error',
      statusCode: 500,
      method: 'POST',
      url: '/v1/messages',
      model: request.model,
      actualModel,
      providerId: provider.id,
      providerName: provider.name,
      accountId: account.id,
      accountName: account.name,
      requestBody: JSON.stringify(anthropicReq),
      userInput,
      responseStatus: 500,
      responseBody: exceptionResponseBody,
      latency,
      isStream: request.stream || false,
      errorMessage,
      errorStack,
    })

    storeManager.recordRequestInStats(false, latency, request.model, provider.id, account.id)
  }
})

export default router
