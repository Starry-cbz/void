/**
 * Qwen AI International Adapter
 * Implements chat.qwen.ai API protocol
 * Based on qwen3-reverse project
 */

import axios, { AxiosResponse } from 'axios'
import { PassThrough } from 'stream'
import { createParser } from 'eventsource-parser'
import { Account, Provider } from '../../store/types'
import { ToolCall } from '../promptToolUse'
import { parseToolCalls } from '../utils/toolParser/index'
import { 
  createStreamState, 
  processStreamContent, 
  flushToolCallBuffer,
  createBaseChunk,
  StreamState 
} from '../utils/streamToolHandler'

import crypto from 'crypto'

const QWEN_AI_BASE = 'https://chat.qwen.ai'

const DEFAULT_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'Content-Type': 'application/json',
  source: 'web',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'bx-v': '2.5.36',
  'bx-umidtoken': 'T2gAr9z8byN8sNOmfQ3X9j61MNTNmSqDO5L1rs2jMcQCVhOKgZICcBN-UdTuJGig-NM=',
  'bx-ua': '231!lWD36kmUe5E+joKDK5gBZ48FEl2ZWfPwIPF92lBLek2KxVW/XJ2EwruCiDOX5Px4EXNhmh6EfS9eDwQGRwijIK64A4nPqeLysJcDjUACje/H3J4ZgGZpicG6K8AkiGGaEKC830+QSiSUsLRlL/EyhXTmLcJc/5iDkMuOpUhNz0e0Q/nTqjVJ3ko00Q/oyE+jauHhUHfb1GxGHkE+++3+qCS4+ItkaA6tiItCo+romzElfLFD6RIj7oHt9vffs98nLwpHnaqKjufnLFMejSlAUGiQvTofIiGhIvftAMcoFV4mrUHsqyQ/ncQihmJHkbxXjvM57FCb6b9dEIRZl7jgj0+QLNLRs0NZ4azdZ6rzbGTSO8KA5I3Aq/3gBr87X16Mj0oJtaPKmFGaP2zghfOVhxQht8YjRd50lJa+Ue4PAuPSdu2O69DKLH8VOhrsB+psaBIRxnRi5POUQ6w8s8qlb9vxvExjHNOAKWXV1by1Nz+6FPWdyTeAgcmonjCcV0dCtPj/KyeVDkeSrDkKZjnDzHEqeCdfmJ65kve+Vy3YS0vagzyHfVEnzN0ULUZtkGfJXFNm6+bIa55wmGBhUeXbHL0EdlQXMu1YXxmcwBgTaq7tlQcfv7AefanbfjGE8R1IFnNyg2/jXLbnLg5Z6l1oKqgnxZQg0DE9BJuw6s0XjGwTdSxybWxp+WFD/RsXt76uwvCBk7z+YmSFLtFj2UlTsoq+vl0DTmsVItDKf9SZ94NcuJ7mxJYI02S/2kQBfbbHG0d4hXevDrEC0cb86EvzN2ud+v6bAunNRGNFz/RH0KLusoBVeo+puCFKeeIJWEo0t1UicX5YxJwMAoV7+g0gK93y4W9sMQtso8/wY5wsBzis9dwfLvIwXpaAM1g0MZp/YIRq8T/Qc+U/8x99tam4er0IWizvrkjqhIzCWBKpJ4Y4gj3bOmiS3VCMEaoVfKCwUWENwYKuP3H5VI0n+O2vVVRrekUrwvkm6URRhVhN4eEFTCjB9nSQu++qKyDH8HPpkS3YfwF8/OQtrZo7hQXxvNmP2HcH/K7zcweD00BaoOLiYUtXRItGYbl06sVSbm04soRf1Jqpyo3XiRqBWD9rmJfr4w8NOEGVGUCKXLDLsXy+8JC4Iqf0FsIjWxjMVdraTUtCbwXRbYUownQVm6bt7LYD1SNPoWNPqUJgsLMwP33ugrb1UbHCs24roOch6Go5QHIPA8E15SZE9pkr1SkmqrNs/+KRomFJ9HyFnWUYhZIV9MRLqlOAt6XBBTash3WJnCjhx/PZGhXVvdn2jX4+0Pm55LsiNugA8vaAUJQBxD/8a1u/RvTgbj35+b7I7m8tG0hMhClNZF+tpsOmZZhUGuXH9uVbkJMlMuAmMVCHwn3O31GlLeXXzzep2WS3xN2U+p5J0I7GySnuZUkuGs1ZTVqGUvR2g4q+7ljU55Ak78yPZiQXeUeqS74azszvZvCqWxXn2eePj+gcpliOjrYKpglUP19rQrMt8PqLt8L0ghIqVCmMwl3Hgr/VUcqDpXdpPTR=',
  Timezone: 'Mon Feb 23 2026 22:06:02 GMT+0800',
  Version: '0.2.7',
  Origin: 'https://chat.qwen.ai',
}

const MODEL_ALIASES: Record<string, string> = {
  qwen: 'qwen3-max',
  qwen3: 'qwen3-max',
  'qwen3.5': 'qwen3.5-plus',
  'qwen3-coder': 'qwen3-coder-plus',
  'qwen3-vl': 'qwen3-vl-235b-a22b',
  'qwen3-omni': 'qwen3-omni-flash',
  'qwen2.5': 'qwen2.5-max',
}

interface QwenAiMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | any[]
  tool_calls?: any[]
  name?: string
}

interface ChatCompletionRequest {
  model: string
  /** Original model name before mapping (used for feature detection like thinking mode) */
  originalModel?: string
  messages: QwenAiMessage[]
  stream?: boolean
  temperature?: number
  enable_thinking?: boolean
  thinking_budget?: number
  chatId?: string
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function timestamp(): number {
  return Date.now()
}

export class QwenAiAdapter {
  private provider: Provider
  private account: Account
  private axiosInstance = axios.create({
    timeout: 120000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  })

  // Global Context Hash Mapping: Hash -> { chatId, parentId }
  private static contextMap: Map<string, { chatId: string; parentId: string }> = new Map()

  // Calculate SHA-256 hash for historical messages
  static generateContextHash(messages: any[]): string {
    const extractText = (content: any): string => {
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        return content
          .filter((item: any) => item.type === 'text' || item.type === 'image_url')
          .map((item: any) => { if (item.type === 'text') return item.text || ''; if (item.type === 'image_url') return `![image](${item.image_url?.url || ''})`; return '' })
          .join('\n')
      }
      return ''
    }
    
    // Filter out system prompt (which often contains dynamic IDE context like current time/file)
    // and filter out user prompt blocks wrapped in <system-reminder> tags.
    const filteredMessages = messages.filter(m => m.role !== 'system')
    
    const historyString = JSON.stringify(filteredMessages.map(m => {
      let contentStr = extractText(m.content)
      // Remove <system-reminder>...</system-reminder> blocks globally
      contentStr = contentStr.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
      
      // If the content is wrapped in <user_input>, extract just the inner content
      const userMatch = contentStr.match(/<user_input>([\s\S]*?)<\/user_input>/)
      if (userMatch) {
        contentStr = userMatch[1]
      }
      
      // Remove prompt injection tool instructions if present
      contentStr = contentStr.replace(/IMPORTANT: If you need to use a tool, you MUST wrap the tool call inside a \[function_calls\] block[\s\S]*?(?=(?:<user_input>|<system-reminder>|$))/g, '')
      
      const res: any = { 
        role: m.role ? m.role.toLowerCase() : '', 
        content: contentStr.trim() 
      }
      if (m.tool_calls) {
        res.tool_calls = m.tool_calls.map((tc: any) => ({
          type: tc.type || 'function',
          function: {
            name: tc.function?.name || '',
            arguments: (() => {
              let args = tc.function?.arguments || '';
              try {
                const parsed = typeof args === 'string' ? JSON.parse(args) : args;
                return JSON.stringify(parsed);
              } catch (e) {
                return args;
              }
            })()
          }
        }))
      }
      if (m.tool_call_id) res.tool_call_id = m.tool_call_id
      if (m.name) res.name = m.name
      return res
    }))
    return crypto.createHash('sha256').update(historyString).digest('hex')
  }

  // Calculate SHA-256 hash for historical messages (instance method alias)
  private calculateContextHash(messages: any[]): string {
    return QwenAiAdapter.generateContextHash(messages)
  }

  constructor(provider: Provider, account: Account) {
    this.provider = provider
    this.account = account
  }

  private getToken(): string {
    const credentials = this.account.credentials
    return credentials.token || credentials.accessToken || credentials.apiKey || ''
  }

  private getCookies(): string {
    const credentials = this.account.credentials
    return credentials.cookies || credentials.cookie || ''
  }

  private getHeaders(chatId?: string): Record<string, string> {
    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      Authorization: `Bearer ${this.getToken()}`,
      'X-Request-Id': uuid(),
    }

    if (chatId) {
      headers['Referer'] = `https://chat.qwen.ai/c/${chatId}`
    }

    const cookies = this.getCookies()
    if (cookies) {
      headers['Cookie'] = cookies
    } else {
      console.warn('[QwenAI] Warning: No cookies provided. This may cause Bad_Request error.')
      console.warn('[QwenAI] Required cookies: cnaui, aui, sca, xlly_s, cna, token, _bl_uid, x-ap')
    }

    return headers
  }

  mapModel(openaiModel: string): string {
    let model = openaiModel
    let forceThinking: boolean | undefined
    
    if (model.endsWith('-thinking')) {
      forceThinking = true
      model = model.slice(0, -9)
    } else if (model.endsWith('-fast')) {
      forceThinking = false
      model = model.slice(0, -5)
    }
    
    ;(this as any)._forceThinking = forceThinking
    
    const lowerModel = model.toLowerCase()
    
    if (MODEL_ALIASES[lowerModel]) {
      return MODEL_ALIASES[lowerModel]
    }
    
    if (this.provider.modelMappings) {
      for (const [key, value] of Object.entries(this.provider.modelMappings)) {
        if (key.toLowerCase() === lowerModel) {
          return value
        }
      }
    }
    
    return model
  }

  async createChat(modelId: string, title: string = 'New Chat'): Promise<string> {
    const url = `${QWEN_AI_BASE}/api/v2/chats/new`
    const payload = {
      title,
      models: [modelId],
      chat_mode: 'normal',
      chat_type: 't2t',
      timestamp: Date.now(),
      project_id: '',
    }

    try {
      const response = await this.axiosInstance.post(url, payload, {
        headers: this.getHeaders(),
      })

      console.log('[QwenAI] Create chat response:', JSON.stringify(response.data, null, 2))

      if (response.data?.data?.id) {
        console.log('[QwenAI] Created chat:', response.data.data.id)
        return response.data.data.id
      }

      throw new Error('Failed to create chat: no chat ID returned')
    } catch (error) {
      console.error('[QwenAI] Failed to create chat:', error)
      throw error
    }
  }

  async deleteChat(chatId: string): Promise<boolean> {
    const url = `${QWEN_AI_BASE}/api/v2/chats/${chatId}`

    try {
      const response = await this.axiosInstance.delete(url, {
        headers: this.getHeaders(),
      })

      if (response.data?.success) {
        console.log('[QwenAI] Deleted chat:', chatId)
        return true
      }

      console.warn('[QwenAI] Failed to delete chat:', response.data)
      return false
    } catch (error) {
      console.error('[QwenAI] Failed to delete chat:', error)
      return false
    }
  }

  /**
   * Delete all chats for the current account
   * @returns Promise<boolean> - true if deletion was successful
   */
  async deleteAllChats(): Promise<boolean> {
    const url = `${QWEN_AI_BASE}/api/v2/chats/`

    try {
      console.log('[QwenAI] Deleting all chats for account')
      
      const response = await this.axiosInstance.delete(url, {
        headers: this.getHeaders(),
      })

      if (response.data?.success) {
        console.log('[QwenAI] All chats deleted successfully')
        return true
      }

      console.warn('[QwenAI] Failed to delete all chats:', response.data)
      return false
    } catch (error) {
      console.error('[QwenAI] Failed to delete all chats:', error)
      return false
    }
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<{
    response: AxiosResponse
    chatId: string
    parentId: string | null
    contextHash?: string
  }> {
    const token = this.getToken()
    if (!token) {
      throw new Error('Qwen AI token not configured, please add token in account settings')
    }

    const modelId = this.mapModel(request.model)
    
    // Get forced thinking mode setting from originalModel (preserves user's intent before mapping)
    // If originalModel exists, use it for thinking detection; otherwise fall back to request.model
    const modelForThinking = request.originalModel || request.model
    const modelLower = modelForThinking.toLowerCase()
    let forceThinking: boolean | undefined
    if (modelForThinking.endsWith('-thinking')) {
      forceThinking = true
    } else if (modelForThinking.endsWith('-fast')) {
      forceThinking = false
    } else if (modelLower.includes('think') || modelLower.includes('r1')) {
      // Auto-enable thinking based on model name keywords (e.g. "Qwen3.5-Plus-AI-Think-Search")
      forceThinking = true
      console.log('[QwenAI] Thinking mode enabled (from model name keyword)')
    } else {
      // Use the forceThinking from mapModel if no originalModel-specific detection
      forceThinking = (this as any)._forceThinking
    }

    const messages = request.messages

    const forcedChatId = typeof request.chatId === 'string' ? request.chatId.trim() : ''

    let chatId = ''
    let parentId: string | null = null
    let isContinuation = false
    let contextHash = ''

    // Stateful Context Mapping: Find if there's an existing session based on history prefix
    if (messages && messages.length > 1) {
      let lastAssistantIndex = -1
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          lastAssistantIndex = i
          break
        }
      }

      const historyPrefix = lastAssistantIndex !== -1 
        ? messages.slice(0, lastAssistantIndex + 1)
        : messages.slice(0, messages.length - 1)
      contextHash = this.calculateContextHash(historyPrefix)
      const mappedContext = QwenAiAdapter.contextMap.get(contextHash)

      if (mappedContext) {
        chatId = mappedContext.chatId
        parentId = mappedContext.parentId
        isContinuation = true
        console.log(`[QwenAI] Context matched! Continuing chat ${chatId} from parent ${parentId}`)
      } else {
        console.log(`[QwenAI] Context hash not found, starting a new session. Hash: ${contextHash}`)
      }
    } else {
      console.log(`[QwenAI] First turn dialogue.`)
    }

    if (forcedChatId) {
      chatId = forcedChatId
    }

    if (!isContinuation) {
      // Always create a new chat if not continuing
      if (!chatId) {
        chatId = await this.createChat(modelId, 'OpenAI_API_Chat')
        console.log('[QwenAI] Created new chat:', chatId)
      }
    }

    // Extract system message and user message
    let systemContent = ''
    let userContent = ''
    
    // Helper to extract text from content array
    const extractTextContent = (content: any): string => {
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        return content
          .filter((item: any) => item.type === 'text' || item.type === 'image_url')
          .map((item: any) => { if (item.type === 'text') return item.text || ''; if (item.type === 'image_url') return `![image](${item.image_url?.url || ''})`; return '' })
          .join('\n')
      }
      return ''
    }
    
    if (isContinuation) {
      let lastAssistantIndex = -1
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          lastAssistantIndex = i
          break
        }
      }
      
      const newMessages = lastAssistantIndex !== -1
        ? messages.slice(lastAssistantIndex + 1)
        : [messages[messages.length - 1]]

      for (const msg of newMessages) {
        if (msg.role === 'user') {
          userContent += (userContent ? '\n\n' : '') + `User: ${extractTextContent(msg.content)}`
        } else if (msg.role === 'tool') {
          const text = extractTextContent(msg.content)
          if (text) {
            const toolName = (msg as any).name ? ` for ${(msg as any).name}` : ''
            userContent += (userContent ? '\n\n' : '') + `[TOOL_RESULT${toolName}]: ${text}`
          }
        }
      }
    } else {
      // Single-turn mode: extract all messages
      for (const msg of messages) {
        if (msg.role === 'system') {
          systemContent += (systemContent ? '\n\n' : '') + extractTextContent(msg.content)
        } else if (msg.role === 'user') {
          userContent += (userContent ? '\n\n' : '') + `User: ${extractTextContent(msg.content)}`
        } else if (msg.role === 'assistant') {
          let text = extractTextContent(msg.content)

          // Check for tool_calls and format them properly so the model remembers its actions
          if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
            const toolCallsText = msg.tool_calls.map((tc: any) =>
              `[call:${tc.function?.name || tc.name || ''}]${tc.function?.arguments || tc.arguments || ''}[/call]`
            ).join('\n')
            text += (text ? '\n\n' : '') + `[function_calls]\n${toolCallsText}\n[/function_calls]`
          }

          if (text) {
            userContent += (userContent ? '\n\n' : '') + `Assistant: ${text}`
          }
        } else if (msg.role === 'tool') {
          const text = extractTextContent(msg.content)
          if (text) {
            const toolName = msg.name ? ` for ${msg.name}` : ''
            userContent += (userContent ? '\n\n' : '') + `[TOOL_RESULT${toolName}]: ${text}`
          }
        }
      }

      // If system prompt exists, prepend it to user content
      if (systemContent) {
        userContent = `${systemContent}\n\n${userContent}`
      }
    }

    // Fix for QwenAI requiring non-empty user content
    // If the content is completely empty (e.g. system prompt only or empty message), supply a default space
    if (!userContent || userContent.trim() === '') {
      userContent = ' '
    }

    const fid = uuid()
    const childId = uuid()
    const ts = Math.floor(Date.now() / 1000)

    // Default to disable thinking mode to avoid automatic reasoning trigger
    // Users can control thinking via:
    // 1. Model name suffix: -thinking (force thinking), -fast (force fast mode)
    // 2. enable_thinking parameter for explicit control
    // 3. If neither is specified, thinking mode is disabled by default (fast mode)
    const shouldEnableThinking = forceThinking !== undefined 
      ? forceThinking 
      : request.enable_thinking === true
    
    const featureConfig: Record<string, any> = {
      thinking_enabled: shouldEnableThinking,
      output_schema: 'phase',
      research_mode: 'normal',
      auto_thinking: shouldEnableThinking,
      thinking_format: 'summary',
      auto_search: false, // Default to disable auto search
    }

    if (request.thinking_budget) {
      featureConfig.thinking_budget = request.thinking_budget
    }

    const payload = {
      stream: true,
      version: '2.1',
      incremental_output: true,
      chat_id: chatId,
      chat_mode: 'normal',
      model: modelId,
      parent_id: parentId,
      messages: [
        {
          fid,
          parentId: parentId,
          childrenIds: [childId],
          role: 'user',
          content: userContent,
          user_action: 'chat',
          files: [],
          timestamp: ts,
          models: [modelId],
          chat_type: 't2t',
          feature_config: featureConfig,
          extra: { meta: { subChatType: 't2t' } },
          sub_chat_type: 't2t',
          parent_id: parentId,
        },
      ],
      timestamp: ts + 1,
    }

    const url = `${QWEN_AI_BASE}/api/v2/chat/completions?chat_id=${chatId}`

    console.log('[QwenAI] Sending request to /api/v2/chat/completions...')
    console.log('[QwenAI] Request URL:', url)
    console.log('[QwenAI] Request payload:', JSON.stringify(payload, null, 2))
    console.log('[QwenAI] Request headers:', JSON.stringify(this.getHeaders(chatId), null, 2))

    const response = await this.axiosInstance.post(url, payload, {
      headers: {
        ...this.getHeaders(chatId),
        'x-accel-buffering': 'no',
      },
      responseType: 'stream',
      timeout: 120000,
    })

    console.log('[QwenAI] Response status:', response.status)
    console.log('[QwenAI] Response headers:', JSON.stringify(response.headers, null, 2))

    return {
      response,
      chatId,
      parentId,
      contextHash,
    }
  }

  static isQwenAiProvider(provider: Provider): boolean {
    return provider.id === 'qwen-ai' || provider.apiEndpoint.includes('chat.qwen.ai')
  }

  static recordNextContextMap(messages: any[], assistantMessage: any, chatId: string, parentId: string) {
    if (!chatId || !parentId) return
    
    const extractText = (content: any): string => {
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        return content
          .filter((item: any) => item.type === 'text' || item.type === 'image_url')
          .map((item: any) => { if (item.type === 'text') return item.text || ''; if (item.type === 'image_url') return `![image](${item.image_url?.url || ''})`; return '' })
          .join('\n')
      }
      return ''
    }

    let msgToAppend: any = { role: 'assistant' }
    if (typeof assistantMessage === 'string') {
      msgToAppend.content = assistantMessage
    } else {
      msgToAppend.content = assistantMessage.content || ''
      if (assistantMessage.tool_calls) msgToAppend.tool_calls = assistantMessage.tool_calls
    }
    const newMessages = [...messages, msgToAppend]
    
    // Fix: Use the unified generateContextHash function to ensure symmetry with calculateContextHash
    const nextContextHash = QwenAiAdapter.generateContextHash(newMessages)
    
    QwenAiAdapter.contextMap.set(nextContextHash, { chatId, parentId })
    console.log(`[QwenAI] Registered next context hash: ${nextContextHash} -> chat: ${chatId}, parentId: ${parentId}`)
    
    // Prevent map from growing infinitely
    if (QwenAiAdapter.contextMap.size > 1000) {
      const firstKey = QwenAiAdapter.contextMap.keys().next().value
      if (firstKey) QwenAiAdapter.contextMap.delete(firstKey)
    }
  }
}

export class QwenAiStreamHandler {
  private chatId: string = ''
  private model: string
  private created: number
  private onEnd?: (chatId: string) => void
  private responseId: string = ''
  private content: string = ''
  private toolCallState: StreamState
  private sentRole: boolean = false
  private stopSent: boolean = false
  private shouldParseToolCalls: boolean

  constructor(model: string, onEnd?: (chatId: string) => void, shouldParseToolCalls: boolean = true) {
    this.model = model
    this.created = Math.floor(Date.now() / 1000)
    this.onEnd = onEnd
    this.shouldParseToolCalls = shouldParseToolCalls
    this.toolCallState = createStreamState()
  }

  setChatId(chatId: string) {
    this.chatId = chatId
  }

  getChatId(): string {
    return this.chatId
  }

  getResponseId(): string {
    return this.responseId
  }

  async handleStream(stream: any): Promise<PassThrough> {
    const transStream = new PassThrough()

    console.log('[QwenAI] Starting stream handler...')

    let reasoningText = ''
    let hasSentReasoning = false
    let summaryText = ''

    const parser = createParser({
      onEvent: (event: any) => {
        try {
          if (event.data === '[DONE]') {
            console.log('[QwenAI] Received [DONE] signal')
            if (!this.stopSent) {
              this.stopSent = true
              
              const baseChunk = createBaseChunk(this.responseId || this.chatId, this.model, this.created)
              
              if (this.shouldParseToolCalls) {
                const flushChunks = flushToolCallBuffer(this.toolCallState, baseChunk, 'qwen')
                for (const outChunk of flushChunks) {
                  transStream.write(`data: ${JSON.stringify(outChunk)}\n\n`)
                }
              }

              const finishReason = (this.shouldParseToolCalls && this.toolCallState.hasEmittedToolCall) ? 'tool_calls' : 'stop'
              
              const finalChunk = {
                id: this.responseId || this.chatId,
                model: this.model,
                object: 'chat.completion.chunk',
                choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
                created: this.created,
              }
              transStream.write(`data: ${JSON.stringify(finalChunk)}\n\n`)
              transStream.end('data: [DONE]\n\n')

              if (this.onEnd && this.chatId) {
                this.onEnd(this.chatId)
              }
            }
            return
          }

          const data = JSON.parse(event.data)

          if (data['response.created']?.response_id) {
            this.responseId = data['response.created'].response_id
          }

          if (data.choices && data.choices.length > 0) {
            const choice = data.choices[0]
            const delta = choice.delta || {}
            const phase = delta.phase
            const status = delta.status
            const content = delta.content || ''

            if (phase === 'think') {
              if (status !== 'finished') {
                reasoningText += content
                if (!hasSentReasoning) {
                  transStream.write(
                    `data: ${JSON.stringify({
                      id: this.responseId || this.chatId,
                      model: this.model,
                      object: 'chat.completion.chunk',
                      choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: '' }, finish_reason: null }],
                      created: this.created,
                    })}\n\n`
                  )
                  hasSentReasoning = true
                }
                if (content) {
                  transStream.write(
                    `data: ${JSON.stringify({
                      id: this.responseId || this.chatId,
                      model: this.model,
                      object: 'chat.completion.chunk',
                      choices: [{ index: 0, delta: { reasoning_content: content }, finish_reason: null }],
                      created: this.created,
                    })}\n\n`
                  )
                }
              }
            } else if (phase === 'thinking_summary') {
              const extra = delta.extra || {}
              if (extra.summary_thought?.content) {
                const newSummary = extra.summary_thought.content.join('\n')
                if (newSummary && newSummary.length > summaryText.length) {
                  const diff = newSummary.substring(summaryText.length)
                  if (diff) {
                    if (!hasSentReasoning) {
                      transStream.write(
                        `data: ${JSON.stringify({
                          id: this.responseId || this.chatId,
                          model: this.model,
                          object: 'chat.completion.chunk',
                          choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: '' }, finish_reason: null }],
                          created: this.created,
                        })}\n\n`
                      )
                      hasSentReasoning = true
                    }
                    transStream.write(
                      `data: ${JSON.stringify({
                        id: this.responseId || this.chatId,
                        model: this.model,
                        object: 'chat.completion.chunk',
                        choices: [{ index: 0, delta: { reasoning_content: diff }, finish_reason: null }],
                        created: this.created,
                      })}\n\n`
                    )
                  }
                  summaryText = newSummary
                }
              }
            } else if (phase === 'plugin' || phase === 'action' || phase === 'tool') {
              console.log(`[QwenAI] Detected native tool call phase: ${phase}`, content)
              // Native tool call from Qwen Web API
              // Just buffer it as content so the fallback parser can see it, or log it
              if (content) {
                this.content += content
                const baseChunk = createBaseChunk(this.responseId || this.chatId, this.model, this.created)
                const { chunks: outputChunks } = processStreamContent(
                  content,
                  this.toolCallState,
                  baseChunk,
                  !this.sentRole,
                  'qwen'
                )
                for (const outChunk of outputChunks) {
                  transStream.write(`data: ${JSON.stringify(outChunk)}\n\n`)
                }
                if (outputChunks.length > 0) this.sentRole = true
              }
            } else if (phase !== 'think' && phase !== 'thinking_summary') {
              if (phase !== 'answer' && phase !== null) {
                console.log(`[QwenAI] Unhandled phase detected: ${phase}, status: ${status}, content: ${content}`)
              }
              if (content) {
                this.content += content
              }
              
              if (!this.shouldParseToolCalls) {
                // If tool call parsing is disabled, just pass the content through as plain text
                if (content) {
                  const baseChunk = createBaseChunk(this.responseId || this.chatId, this.model, this.created)
                  transStream.write(`data: ${JSON.stringify({
                    ...baseChunk,
                    choices: [{ index: 0, delta: { role: !this.sentRole ? 'assistant' : undefined, content }, finish_reason: null }]
                  })}\n\n`)
                  this.sentRole = true
                }
              } else {
                // Even if content is empty, we still want to process stream to let
                // the parser maintain state (in case it's doing something special with empty chunks)
                const baseChunk = createBaseChunk(this.responseId || this.chatId, this.model, this.created)
                const { chunks: outputChunks } = processStreamContent(
                  content || '',
                  this.toolCallState,
                  baseChunk,
                  !this.sentRole,
                  'qwen'
                )

                for (const outChunk of outputChunks) {
                  transStream.write(`data: ${JSON.stringify(outChunk)}\n\n`)
                }

                if (outputChunks.length > 0) this.sentRole = true
              }
            }

            if (status === 'finished' && phase !== 'think' && phase !== 'thinking_summary') {
              if (!this.stopSent) {
                this.stopSent = true
                
                const baseChunk = createBaseChunk(this.responseId || this.chatId, this.model, this.created)
                
                if (this.shouldParseToolCalls) {
                  const flushChunks = flushToolCallBuffer(this.toolCallState, baseChunk, 'qwen')
                  
                  for (const outChunk of flushChunks) {
                    transStream.write(`data: ${JSON.stringify(outChunk)}\n\n`)
                  }
                }

                // If flushToolCallBuffer emitted tool calls, we must send a tool_calls finish_reason
                // We use toolCallState.hasEmittedToolCall which is set by processStreamContent/flushToolCallBuffer
                const finishReason = (this.shouldParseToolCalls && this.toolCallState.hasEmittedToolCall) ? 'tool_calls' : (delta.finish_reason || 'stop')
                
                const finalChunk = {
                  id: this.responseId || this.chatId,
                  model: this.model,
                  object: 'chat.completion.chunk',
                  choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
                  created: this.created,
                }
                transStream.write(`data: ${JSON.stringify(finalChunk)}\n\n`)
                transStream.end('data: [DONE]\n\n')

                if (this.onEnd && this.chatId) {
                  this.onEnd(this.chatId)
                }
              }
            }
          } else {
            console.log('[QwenAI] Stream received non-choice data:', event.data)
            // if it's an error, we should probably output it to client
            if (data.error || data.msg || data.code) {
              const errMsg = data.error || data.msg || JSON.stringify(data)
              transStream.write(`data: ${JSON.stringify({
                id: this.responseId || this.chatId,
                model: this.model,
                object: 'chat.completion.chunk',
                choices: [{ index: 0, delta: { content: `\n\n[Qwen API Error: ${errMsg}]` }, finish_reason: 'stop' }],
                created: this.created,
              })}\n\n`)
              transStream.end('data: [DONE]\n\n')
            }
          }
        } catch (err) {
          console.error('[QwenAI] Stream parse error:', err)
        }
      },
    })

    stream.on('data', (buffer: Buffer) => {
      parser.feed(buffer.toString())
    })
    stream.once('error', (err: Error) => {
      console.error('[QwenAI] Stream error:', err)
      transStream.end('data: [DONE]\n\n')
    })
    stream.once('close', () => {
      transStream.end('data: [DONE]\n\n')
    })

    return transStream
  }

  async handleNonStream(stream: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const data = {
        id: '',
        model: this.model,
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '', reasoning_content: '' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        created: this.created,
      }

      let reasoningText = ''
      let summaryText = ''
      let resolved = false

      const resolveOnce = (value: any) => {
        if (!resolved) {
          resolved = true
          resolve(value)
        }
      }

      const rejectOnce = (reason: any) => {
        if (!resolved) {
          resolved = true
          reject(reason)
        }
      }

      const parser = createParser({
        onEvent: (event: any) => {
          try {
            if (event.data === '[DONE]') return

            const parsed = JSON.parse(event.data)

            if (parsed['response.created']?.response_id) {
              this.responseId = parsed['response.created'].response_id
              data.id = this.responseId
            }

            if (parsed.choices && parsed.choices.length > 0) {
              const delta = parsed.choices[0].delta || {}
              const phase = delta.phase
              const status = delta.status
              const content = delta.content || ''

              if (phase === 'think' && status !== 'finished') {
                reasoningText += content
              } else if (phase === 'thinking_summary') {
                const extra = delta.extra || {}
                if (extra.summary_thought?.content) {
                  const newSummary = extra.summary_thought.content.join('\n')
                  if (newSummary && newSummary.length > summaryText.length) {
                    summaryText = newSummary
                  }
                }
              } else if (phase !== 'think' && phase !== 'thinking_summary') {
                if (phase !== 'answer' && phase !== null) {
                  console.log(`[QwenAI] Unhandled phase in non-stream: ${phase}, status: ${status}, content: ${content}`)
                }
                if (content) {
                  this.content += content
                }
                if (status === 'finished') {
                  const finalReasoning = reasoningText || summaryText
                  if (finalReasoning) {
                    data.choices[0].message.reasoning_content = finalReasoning
                  }

                  if (this.onEnd && this.chatId) {
                    this.onEnd(this.chatId)
                  }

                  if (this.shouldParseToolCalls) {
                    const { content: cleanContent, toolCalls } = parseToolCalls(this.content)
                    
                    if (toolCalls.length > 0) {
                      data.choices[0].message.content = null
                      ;(data.choices[0].message as any).tool_calls = toolCalls
                      data.choices[0].finish_reason = 'tool_calls'
                    } else {
                      data.choices[0].message.content = cleanContent.trim()
                    }
                  } else {
                    data.choices[0].message.content = this.content.trim()
                  }

                  resolveOnce(data)
                }
              }
            }
          } catch (err) {
            console.error('[QwenAI] Non-stream parse error:', err)
            rejectOnce(err)
          }
        },
      })

      stream.on('data', (buffer: Buffer) => parser.feed(buffer.toString()))
      stream.once('error', (err: Error) => {
        console.error('[QwenAI] Non-stream error:', err)
        rejectOnce(err)
      })
      stream.once('close', () => {
        const finalReasoning = reasoningText || summaryText
        if (finalReasoning) {
          data.choices[0].message.reasoning_content = finalReasoning
        }
        
        if (this.shouldParseToolCalls) {
          const { content: cleanContent, toolCalls } = parseToolCalls(this.content)
          
          if (toolCalls.length > 0) {
            data.choices[0].message.content = null
            ;(data.choices[0].message as any).tool_calls = toolCalls
            data.choices[0].finish_reason = 'tool_calls'
          } else {
            data.choices[0].message.content = cleanContent.trim()
          }
        } else {
          data.choices[0].message.content = this.content.trim()
        }
        
        resolveOnce(data)
      })
    })
  }
}

export const qwenAiAdapter = {
  QwenAiAdapter,
  QwenAiStreamHandler,
}
