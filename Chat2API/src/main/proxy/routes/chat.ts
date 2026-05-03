/**
 * Proxy Service Module - Chat Completions Route
 * Implements /v1/chat/completions route
 */

import Router from '@koa/router'
import type { Context } from 'koa'
import { PassThrough } from 'stream'
import { ChatCompletionRequest, ChatCompletionResponse, ProxyContext } from '../types'
import { loadBalancer } from '../loadbalancer'
import { requestForwarder } from '../forwarder'
import { streamHandler } from '../stream'
import { proxyStatusManager } from '../status'
import { modelMapper } from '../modelMapper'
import { storeManager } from '../../store/store'
import { 
  isAnthropicToolFormat,
  transformResponseToAnthropic,
  transformChunkToAnthropic
} from '../utils/toolFormatConverter'
import { QwenAdapter } from '../adapters/qwen'
import { QwenAiAdapter } from '../adapters/qwen-ai'
import { qwenAiSessionService } from '../services/qwenAiSessionService'

const router = new Router({ prefix: '/v1/chat' })

/**
 * Generate Request ID
 */
function generateRequestId(): string {
  return `chatcmpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
 * Extract concatenated text from raw SSE events string
 * Handles both standard content and reasoning_content (for thinking models)
 */
function extractContentFromSSE(sseData: string): { content: string, tool_calls?: any[] } {
  if (!sseData) return { content: '' }
  let finalContent = ''
  let reasoningContent = ''
  let toolCallsMap: Record<number, any> = {}
  
  const lines = sseData.split('\n')
  for (const line of lines) {
    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
      try {
        const payload = JSON.parse(line.slice(6))
        const delta = payload.choices?.[0]?.delta || {}
        
        if (delta.reasoning_content) {
          reasoningContent += delta.reasoning_content
        }
        
        if (delta.content) {
          finalContent += delta.content
        }
        
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index || 0
            if (!toolCallsMap[idx]) {
              toolCallsMap[idx] = { id: tc.id || '', type: tc.type || 'function', function: { name: '', arguments: '' } }
            }
            if (tc.id) toolCallsMap[idx].id = tc.id
            if (tc.type) toolCallsMap[idx].type = tc.type
            if (tc.function?.name) toolCallsMap[idx].function.name += tc.function.name
            if (tc.function?.arguments) toolCallsMap[idx].function.arguments += tc.function.arguments
          }
        }
      } catch (e) {
        // ignore
      }
    }
  }
  
  let resultContent = finalContent
  if (reasoningContent) {
    resultContent = `<think>\n${reasoningContent}\n</think>\n\n${finalContent}`
  }
  
  const tool_calls = Object.keys(toolCallsMap).length > 0 ? Object.values(toolCallsMap) : undefined
  return { content: resultContent, tool_calls }
}

/**
 * Handle Chat Completions Request
 */
router.post('/completions', async (ctx: Context) => {
  const startTime = Date.now()
  const requestId = generateRequestId()
  const clientIP = getClientIP(ctx)

  let request: ChatCompletionRequest
  try {
    request = ctx.request.body as ChatCompletionRequest
  } catch (error) {
    ctx.status = 400
    ctx.body = {
      error: {
        message: 'Invalid request body',
        type: 'invalid_request_error',
        param: null,
        code: null,
      },
    }
    return
  }

  if (!request.model) {
    ctx.status = 400
    ctx.body = {
      error: {
        message: 'Missing required field: model',
        type: 'invalid_request_error',
        param: 'model',
        code: null,
      },
    }
    return
  }

  if (!request.messages || !Array.isArray(request.messages) || request.messages.length === 0) {
    ctx.status = 400
    ctx.body = {
      error: {
        message: 'Missing required field: messages',
        type: 'invalid_request_error',
        param: 'messages',
        code: null,
      },
    }
    return
  }

  // Read feature parameters from Headers (lower priority than request body)
  const webSearchFromHeader = ctx.headers['x-web-search'] === 'true'
  const reasoningEffortFromHeader = ctx.headers['x-reasoning-effort'] as 'low' | 'medium' | 'high' | undefined
  const deepResearchFromHeader = ctx.headers['x-deep-research'] === 'true'

  // Handle reasoningEffort (camelCase) from AI SDK - convert to reasoning_effort (snake_case)
  const requestAny = request as any
  if (requestAny.reasoningEffort && !request.reasoning_effort) {
    request.reasoning_effort = requestAny.reasoningEffort
    console.log('[Chat] Reasoning effort set via reasoningEffort (camelCase):', requestAny.reasoningEffort)
    delete requestAny.reasoningEffort
  }

  // Merge into request (request body parameters take priority)
  if (webSearchFromHeader && request.web_search === undefined) {
    request.web_search = true
    console.log('[Chat] Web search enabled via X-Web-Search header')
  }
  if (reasoningEffortFromHeader && request.reasoning_effort === undefined) {
    request.reasoning_effort = reasoningEffortFromHeader
    console.log('[Chat] Reasoning effort set via X-Reasoning-Effort header:', reasoningEffortFromHeader)
  }
  if (deepResearchFromHeader && request.deep_research === undefined) {
    request.deep_research = true
    console.log('[Chat] Deep research enabled via X-Deep-Research header')
  }

  const rawSessionKey = typeof ctx.headers['x-chat2api-session'] === 'string' ? ctx.headers['x-chat2api-session'].trim() : ''
  const rawCheckpointId = typeof ctx.headers['x-chat2api-checkpoint'] === 'string' ? ctx.headers['x-chat2api-checkpoint'].trim() : ''
  const sessionKey = rawSessionKey || undefined
  const checkpointId = rawCheckpointId || undefined

  const handleRequest = async () => {
    const config = storeManager.getConfig()
    let preferredProviderId = modelMapper.getPreferredProvider(request.model)
    let preferredAccountId = modelMapper.getPreferredAccount(request.model)

    if (sessionKey) {
      preferredProviderId = preferredProviderId ?? 'qwen-ai'
      const existing = qwenAiSessionService.getSession(sessionKey)
      if (existing?.accountId) {
        preferredAccountId = existing.accountId
      }
    }

    const selection = loadBalancer.selectAccount(
      request.model,
      config.loadBalanceStrategy,
      preferredProviderId,
      preferredAccountId
    )

    if (!selection) {
      ctx.status = 503
      ctx.body = {
        error: {
          message: `No available account for model: ${request.model}`,
          type: 'service_unavailable_error',
          param: null,
          code: 'no_available_account',
        },
      }
      return
    }

    const { account, provider, actualModel } = selection

    let forwardRequest: ChatCompletionRequest = request
    let sessionCheckpointId: string | undefined

    if (sessionKey && QwenAiAdapter.isQwenAiProvider(provider)) {
      const existing = qwenAiSessionService.getSession(sessionKey)
      if (!existing) {
        qwenAiSessionService.ensureSession(sessionKey, { accountId: account.id, chatId: '', currentParentId: null })
      } else if (existing.accountId !== account.id) {
        qwenAiSessionService.resetSession(sessionKey, { accountId: account.id, chatId: '', currentParentId: null })
      }

      const session = qwenAiSessionService.getSession(sessionKey)!
      const resolvedFromCheckpoint = checkpointId ? qwenAiSessionService.resolveCheckpoint(sessionKey, checkpointId) : undefined
      const parentIdToUse = resolvedFromCheckpoint ?? session.currentParentId
      const chatIdToUse = session.chatId ? session.chatId : undefined

      forwardRequest = {
        ...request,
        chatId: chatIdToUse,
        parentId: parentIdToUse ?? null,
      }
    }

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
        forwardRequest,
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
        ctx.body = {
          error: {
            message: result.error || 'Request failed',
            type: 'api_error',
            param: null,
            code: null,
          },
        }

        storeManager.addLog('error', `Request failed: ${result.error}`, {
          requestId,
          providerId: provider.id,
          accountId: account.id,
          model: request.model,
          latency,
        })

        const userInput = extractUserInput(request.messages)
        const errorResponseBody = JSON.stringify({
          error: {
            message: result.error || 'Request failed',
            type: 'api_error',
            param: null,
            code: null,
          },
        })
        storeManager.addRequestLog({
          timestamp: startTime,
          status: 'error',
          statusCode: result.status || 500,
          method: 'POST',
          url: '/v1/chat/completions',
          model: request.model,
          actualModel,
          providerId: provider.id,
          providerName: provider.name,
          accountId: account.id,
          accountName: account.name,
          requestBody: JSON.stringify(request),
          userInput,
          webSearch: request.web_search,
          reasoningEffort: request.reasoning_effort,
          responseStatus: result.status || 500,
          responseBody: errorResponseBody,
          latency,
          isStream: request.stream || false,
          errorMessage: result.error,
        })

        storeManager.recordRequestInStats(false, latency, request.model, provider.id, account.id)

        return
      }

      if (sessionKey && QwenAiAdapter.isQwenAiProvider(provider)) {
        const session = qwenAiSessionService.getSession(sessionKey)
        if (session) {
          sessionCheckpointId = qwenAiSessionService.createPendingCheckpoint(sessionKey)
          ctx.set('X-Chat2API-Checkpoint', sessionCheckpointId)

          if (result.chatId) {
            qwenAiSessionService.setChatId(sessionKey, result.chatId)
            qwenAiSessionService.setAccountId(sessionKey, account.id)
          }
        }
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
        ? JSON.stringify(result.body)
        : undefined

      let logEntryId: string | undefined

      if (!request.stream) {
        const logEntry = storeManager.addRequestLog({
          timestamp: startTime,
          status: 'success',
          statusCode: 200,
          method: 'POST',
          url: '/v1/chat/completions',
          model: request.model,
          actualModel,
          providerId: provider.id,
          providerName: provider.name,
          accountId: account.id,
          accountName: account.name,
          requestBody: JSON.stringify(request),
          userInput,
          webSearch: request.web_search,
          reasoningEffort: request.reasoning_effort,
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
          url: '/v1/chat/completions',
          model: request.model,
          actualModel,
          providerId: provider.id,
          providerName: provider.name,
          accountId: account.id,
          accountName: account.name,
          requestBody: JSON.stringify(request),
          userInput,
          webSearch: request.web_search,
          reasoningEffort: request.reasoning_effort,
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

        const wrapperStream = new PassThrough()
        let collectedContent = ''

        result.stream.once('error', (err: Error) => {
          console.error('[Chat] Stream error:', err.message)

          const errorEvent = {
            id: requestId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: actualModel,
            choices: [{
              index: 0,
              delta: {
                content: `\n\n[Error: ${err.message}]`,
              },
              finish_reason: 'stop',
            }],
          }

          wrapperStream.write(`data: ${JSON.stringify(errorEvent)}\n\n`)
          wrapperStream.write('data: [DONE]\n\n')
          wrapperStream.end()

          storeManager.addLog('error', `Stream error: ${err.message}`, {
            requestId,
            providerId: provider.id,
            accountId: account.id,
            model: request.model,
          })
        })

        const finalizeQwenAiSession = () => {
          if (!sessionKey || !sessionCheckpointId) return
          if (!QwenAiAdapter.isQwenAiProvider(provider) || !result.chatId) return
          const handler = result.stream ? (result.stream as any).qwenAiHandler : null
          const parentId = (handler ? handler.getResponseId() : null) || result.parentId
          if (!parentId) return
          qwenAiSessionService.setChatId(sessionKey, result.chatId)
          qwenAiSessionService.finalizeCheckpoint(sessionKey, sessionCheckpointId, parentId)
        }

        if (result.skipTransform) {
          result.stream.on('data', (chunk: Buffer) => {
            collectedContent += chunk.toString()
          })

          result.stream.pipe(wrapperStream, { end: false })

          result.stream.once('end', () => {
            const contextMessages = result.contextMessages || request.messages
            if (QwenAdapter.isQwenProvider(provider) && result.sessionId && result.reqId) {
              const parsedMessage = extractContentFromSSE(collectedContent)
              if (parsedMessage.content || parsedMessage.tool_calls) {
                QwenAdapter.recordNextContextMap(contextMessages, parsedMessage, result.sessionId, result.reqId)
              }
            }
            
            const handler = result.stream ? (result.stream as any).qwenAiHandler : null
            const parentId = (handler ? handler.getResponseId() : null) || result.parentId
            if (QwenAiAdapter.isQwenAiProvider(provider) && result.chatId && parentId) {
              const parsedMessage = extractContentFromSSE(collectedContent)
              if (parsedMessage.content || parsedMessage.tool_calls) {
                QwenAiAdapter.recordNextContextMap(contextMessages, parsedMessage, result.chatId, parentId)
              }
            }

            finalizeQwenAiSession()

            if (logEntryId) {
              storeManager.updateRequestLog(logEntryId, {
                responseBody: collectedContent || undefined,
              })
            }
            wrapperStream.end()
          })
        } else {
          const transformStream = streamHandler.createTransformStream(
            actualModel,
            requestId,
            () => {
              storeManager.addLog('debug', `Stream response completed`, { requestId })
            }
          )

          transformStream.on('data', (chunk: Buffer) => {
            collectedContent += chunk.toString()
          })

          result.stream.pipe(transformStream)
          transformStream.pipe(wrapperStream, { end: false })

          transformStream.once('end', () => {
            const contextMessages = result.contextMessages || request.messages
            if (QwenAdapter.isQwenProvider(provider) && result.sessionId && result.reqId) {
              const parsedMessage = extractContentFromSSE(collectedContent)
              if (parsedMessage.content || parsedMessage.tool_calls) {
                QwenAdapter.recordNextContextMap(contextMessages, parsedMessage, result.sessionId, result.reqId)
              }
            }

            const handler = result.stream ? (result.stream as any).qwenAiHandler : null
            const parentId = (handler ? handler.getResponseId() : null) || result.parentId
            if (QwenAiAdapter.isQwenAiProvider(provider) && result.chatId && parentId) {
              const parsedMessage = extractContentFromSSE(collectedContent)
              if (parsedMessage.content || parsedMessage.tool_calls) {
                QwenAiAdapter.recordNextContextMap(contextMessages, parsedMessage, result.chatId, parentId)
              }
            }

            finalizeQwenAiSession()

            if (logEntryId) {
              storeManager.updateRequestLog(logEntryId, {
                responseBody: collectedContent || undefined,
              })
            }
            wrapperStream.end()
          })
        }

        ctx.body = wrapperStream
      } else {
        ctx.set('Content-Type', 'application/json')

        if (result.body) {
          const contextMessages = result.contextMessages || request.messages
          if (QwenAdapter.isQwenProvider(provider) && result.sessionId && result.reqId) {
            const assistantMsg = result.body.choices?.[0]?.message || { content: '' }
            if (assistantMsg.content || assistantMsg.tool_calls) {
               QwenAdapter.recordNextContextMap(contextMessages, assistantMsg, result.sessionId, result.reqId)
            }
          }
          
          const handler = result.stream ? (result.stream as any).qwenAiHandler : null
          const parentId = (handler ? handler.getResponseId() : null) || result.parentId
          if (QwenAiAdapter.isQwenAiProvider(provider) && result.chatId && parentId) {
            const assistantMsg = result.body.choices?.[0]?.message || { content: '' }
            if (assistantMsg.content || assistantMsg.tool_calls) {
               QwenAiAdapter.recordNextContextMap(contextMessages, assistantMsg, result.chatId, parentId)
            }
          }

          if (sessionKey && sessionCheckpointId && QwenAiAdapter.isQwenAiProvider(provider) && result.chatId && result.parentId) {
            qwenAiSessionService.setChatId(sessionKey, result.chatId)
            qwenAiSessionService.finalizeCheckpoint(sessionKey, sessionCheckpointId, result.parentId)
          }

          if (isAnthropicToolFormat(request.tool_format)) {
            ctx.body = transformResponseToAnthropic(result.body)
            console.log('[Chat] Transformed response to Anthropic tool format')
          } else {
            ctx.body = result.body
          }
        } else {
          ctx.body = {
            id: requestId,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: actualModel,
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: '',
              },
              finish_reason: 'stop',
            }],
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
            },
          }
        }
      }
    } catch (error) {
      const latency = Date.now() - startTime
      proxyStatusManager.recordRequestFailure(latency)

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorStack = error instanceof Error ? error.stack : undefined

      ctx.status = 500
      ctx.body = {
        error: {
          message: errorMessage,
          type: 'internal_error',
          param: null,
          code: null,
        },
      }

      storeManager.addLog('error', `Request exception: ${errorMessage}`, {
        requestId,
        providerId: provider.id,
        accountId: account.id,
        model: request.model,
        latency,
        error: errorMessage,
      })

      const userInput = extractUserInput(request.messages)
      const exceptionResponseBody = JSON.stringify({
        error: {
          message: errorMessage,
          type: 'internal_error',
          param: null,
          code: null,
        },
      })
      storeManager.addRequestLog({
        timestamp: startTime,
        status: 'error',
        statusCode: 500,
        method: 'POST',
        url: '/v1/chat/completions',
        model: request.model,
        actualModel,
        providerId: provider.id,
        providerName: provider.name,
        accountId: account.id,
        accountName: account.name,
        requestBody: JSON.stringify(request),
        userInput,
        webSearch: request.web_search,
        reasoningEffort: request.reasoning_effort,
        responseStatus: 500,
        responseBody: exceptionResponseBody,
        latency,
        isStream: request.stream || false,
        errorMessage,
        errorStack,
      })

      storeManager.recordRequestInStats(false, latency, request.model, provider.id, account.id)
    }
  }

  if (sessionKey) {
    await qwenAiSessionService.runExclusive(sessionKey, handleRequest)
    return
  }

  await handleRequest()
})

export default router
