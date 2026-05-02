/**
 * Stream Tool Handler Module - Handle tool calls in streaming responses
 * Used by all provider-specific StreamHandlers
 *
 * Strategy: Buffer content when [function_calls] marker is detected,
 * parse tool calls and emit them as tool_calls delta instead of text content
 *
 * @deprecated This module is being phased out. Use the new unified toolParser module instead.
 * Import from './toolParser/index.ts' for the latest unified parsing functionality.
 */

import { parseToolCallsFromText } from './toolParser'

// Import types and functions from the new unified module
import {
  StreamState,
  createStreamState,
  parseToolCallsStream as unifiedParseToolCallsStream,
  flushToolCallBuffer as unifiedFlushToolCallBuffer,
  shouldBlockOutput as unifiedShouldBlockOutput
} from './toolParser/index'

// Re-export StreamState type for backward compatibility
export type { StreamState } from './toolParser/index'
export { createStreamState } from './toolParser/index'

/**
 * Tool call state for backward compatibility
 * @deprecated Use StreamState from './toolParser/index.ts' instead
 */
export interface ToolCallState {
  contentBuffer: string
  isBufferingToolCall: boolean
  toolCallIndex: number
  hasEmittedToolCall: boolean
}

/**
 * Create tool call state
 * @deprecated Use createStreamState from './toolParser/index.ts' instead
 */
export function createToolCallState(): ToolCallState {
  return createStreamState()
}

/**
 * Process streaming content and detect/parse tool calls
 * Returns the chunks that should be sent to the client
 * @deprecated Use parseToolCallsStream from './toolParser/index.ts' instead
 */
export function processStreamContent(
  content: string,
  state: StreamState,
  baseChunk: any,
  isFirstChunk: boolean,
  modelType: string = 'default'
): { chunks: any[], shouldFlush: boolean } {
  const { chunks, shouldFlush } = unifiedParseToolCallsStream(content, state)

  const mappedChunks = chunks.map((choice: any) => {
    const newChoice = { ...choice, index: 0 }
    if (isFirstChunk) {
      if (newChoice.delta.content !== undefined || newChoice.delta.tool_calls !== undefined) {
        newChoice.delta.role = 'assistant'
      }
    }
    return {
      ...baseChunk,
      choices: [newChoice]
    }
  })

  return { chunks: mappedChunks, shouldFlush }
}

/**
 * Flush any remaining content in the buffer at the end of stream
 * @deprecated Use flushToolCallBuffer from './toolParser/index.ts' instead
 */
export function flushToolCallBuffer(
  state: StreamState,
  baseChunk: any,
  modelType: string = 'default'
): any[] {
  const choices = unifiedFlushToolCallBuffer(state)
  return choices.map((choice: any) => ({
    ...baseChunk,
    choices: [{
      ...choice,
      index: 0
    }]
  }))
}

/**
 * Check if we should block normal content output
 * Returns true if we are currently buffering a potential tool call
 */
export function shouldBlockOutput(state: ToolCallState): boolean {
  return state.isBufferingToolCall && !state.hasEmittedToolCall
}

/**
 * Create a base chunk structure for OpenAI-compatible responses
 */
export function createBaseChunk(id: string, model: string, created: number) {
  return {
    id,
    model,
    object: 'chat.completion.chunk',
    created
  }
}
