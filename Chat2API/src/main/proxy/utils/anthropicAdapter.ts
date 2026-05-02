import { Transform } from 'stream'
import { ChatCompletionRequest, ChatMessage, ChatCompletionTool } from '../types'

/**
 * Convert Anthropic request to OpenAI request
 */
export function anthropicRequestToOpenAI(anthropicReq: any): ChatCompletionRequest {
  const messages: ChatMessage[] = []

  if (anthropicReq.system) {
    if (typeof anthropicReq.system === 'string') {
      messages.push({ role: 'system', content: anthropicReq.system })
    } else if (Array.isArray(anthropicReq.system)) {
      messages.push({ role: 'system', content: anthropicReq.system.map((sys: any) => sys.text).join('\n') })
    }
  }

  if (anthropicReq.messages && Array.isArray(anthropicReq.messages)) {
    for (const msg of anthropicReq.messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        if (Array.isArray(msg.content)) {
          // Extract text, tool uses, and tool results
          const textParts = msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text)
          const toolUses = msg.content.filter((c: any) => c.type === 'tool_use')
          const toolResults = msg.content.filter((c: any) => c.type === 'tool_result')
          
          if (msg.role === 'assistant' && toolUses.length > 0) {
            const tool_calls = toolUses.map((tu: any) => ({
              id: tu.id,
              type: 'function',
              function: {
                name: tu.name,
                arguments: typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input)
              }
            }))
            messages.push({
              role: 'assistant',
              content: textParts.length > 0 ? textParts.join('\n') : null,
              tool_calls
            })
          } else if (msg.role === 'user' && toolResults.length > 0) {
            // Push text content if any, as a normal user message
            if (textParts.length > 0) {
              messages.push({ role: 'user', content: textParts.join('\n') })
            }
            // Each tool_result becomes a separate tool message in OpenAI
            for (const tr of toolResults) {
              let trContent = ''
              if (typeof tr.content === 'string') {
                trContent = tr.content
              } else if (Array.isArray(tr.content)) {
                trContent = tr.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
              }
              messages.push({
                role: 'tool',
                tool_call_id: tr.tool_use_id,
                content: trContent
              })
            }
          } else {
            messages.push({ role: msg.role, content: textParts.join('\n') })
          }
        } else {
          messages.push({ role: msg.role, content: msg.content })
        }
      }
    }
  }

  let tools: ChatCompletionTool[] | undefined = undefined
  if (anthropicReq.tools && Array.isArray(anthropicReq.tools)) {
    tools = anthropicReq.tools.map((t: any) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema
      }
    }))
  }

  return {
    model: anthropicReq.model,
    messages,
    max_tokens: anthropicReq.max_tokens,
    temperature: anthropicReq.temperature,
    top_p: anthropicReq.top_p,
    stream: anthropicReq.stream,
    tools,
    tool_choice: anthropicReq.tool_choice ? 
      (anthropicReq.tool_choice.type === 'any' ? 'required' : 
      (anthropicReq.tool_choice.type === 'auto' ? 'auto' : 
      { type: 'function', function: { name: anthropicReq.tool_choice.name } })) : undefined
  }
}

/**
 * Convert OpenAI response to Anthropic response
 */
export function openAIResponseToAnthropic(openAIRes: any, reqId?: string): any {
  const choice = openAIRes.choices && openAIRes.choices[0]
  if (!choice) return openAIRes

  const content: any[] = []
  if (choice.message?.content) {
    content.push({ type: 'text', text: choice.message.content })
  }

  if (choice.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || '{}')
      })
    }
  }

  let stop_reason = 'end_turn'
  if (choice.finish_reason === 'tool_calls') {
    stop_reason = 'tool_use'
  } else if (choice.finish_reason === 'length') {
    stop_reason = 'max_tokens'
  }

  return {
    id: openAIRes.id || reqId,
    type: 'message',
    role: 'assistant',
    model: openAIRes.model,
    content,
    stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens: openAIRes.usage?.prompt_tokens || 0,
      output_tokens: openAIRes.usage?.completion_tokens || 0
    }
  }
}

/**
 * Transform OpenAI SSE stream to Anthropic SSE stream
 */
export class OpenAIToAnthropicStream extends Transform {
  private hasSentStart = false
  private activeIndex: number = -1
  private id: string

  constructor(id: string) {
    super()
    this.id = id
  }

  _transform(chunk: any, encoding: string, callback: (error?: Error | null, data?: any) => void): void {
    const text = chunk.toString()
    const lines = text.split('\n')
    
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const data = JSON.parse(line.slice(6))
          const choice = data.choices && data.choices[0]
          
          if (!this.hasSentStart) {
            this.push(`event: message_start\ndata: ${JSON.stringify({
              type: 'message_start',
              message: {
                id: this.id,
                type: 'message',
                role: 'assistant',
                content: [],
                model: data.model,
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 0, output_tokens: 0 }
              }
            })}\n\n`)
            this.hasSentStart = true
          }

          if (choice?.delta?.content !== undefined && choice?.delta?.content !== null) {
            if (this.activeIndex !== 0) {
              if (this.activeIndex !== -1) {
                this.push(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: this.activeIndex })}\n\n`)
              }
              this.activeIndex = 0
              this.push(`event: content_block_start\ndata: ${JSON.stringify({
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' }
              })}\n\n`)
            }
            this.push(`event: content_block_delta\ndata: ${JSON.stringify({
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: choice.delta.content }
            })}\n\n`)
          }

          if (choice?.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index || 0
              const antIdx = idx + 1 // +1 because text is 0
              
              if (tc.id) {
                if (this.activeIndex !== -1 && this.activeIndex !== antIdx) {
                  this.push(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: this.activeIndex })}\n\n`)
                }
                this.activeIndex = antIdx
                // start of a tool call
                this.push(`event: content_block_start\ndata: ${JSON.stringify({
                  type: 'content_block_start',
                  index: antIdx,
                  content_block: { type: 'tool_use', id: tc.id, name: tc.function?.name || 'unknown', input: {} }
                })}\n\n`)
              }
              if (tc.function?.arguments) {
                this.push(`event: content_block_delta\ndata: ${JSON.stringify({
                  type: 'content_block_delta',
                  index: antIdx,
                  delta: { type: 'input_json_delta', partial_json: tc.function.arguments }
                })}\n\n`)
              }
            }
          }
          
          if (choice?.finish_reason) {
            if (this.activeIndex === -1) {
              this.push(`event: content_block_start\ndata: ${JSON.stringify({
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' }
              })}\n\n`)
              this.activeIndex = 0
            }
            
            if (this.activeIndex !== -1) {
              this.push(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: this.activeIndex })}\n\n`)
              this.activeIndex = -1
            }
            
            let stop_reason = 'end_turn'
            if (choice.finish_reason === 'tool_calls') stop_reason = 'tool_use'
            else if (choice.finish_reason === 'length') stop_reason = 'max_tokens'

            this.push(`event: message_delta\ndata: ${JSON.stringify({
              type: 'message_delta',
              delta: { stop_reason, stop_sequence: null },
              usage: { output_tokens: 0 }
            })}\n\n`)
          }
        } catch (e) {
          // ignore parse errors for incomplete chunks
        }
      }
    }
    callback()
  }

  _flush(callback: (error?: Error | null, data?: any) => void): void {
    this.push(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`)
    callback()
  }
}
