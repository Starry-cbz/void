const fs = require('fs');

function modifyChatTs() {
  let code = fs.readFileSync('src/main/proxy/routes/chat.ts', 'utf8');

  // Replace extractContentFromSSE definition
  code = code.replace(
    /function extractContentFromSSE\(sseData: string\): string \{[\s\S]*?return finalContent\n\}/,
    `function extractContentFromSSE(sseData: string): { content: string, tool_calls?: any[] } {
  if (!sseData) return { content: '' }
  let finalContent = ''
  let reasoningContent = ''
  let toolCallsMap: Record<number, any> = {}
  
  const lines = sseData.split('\\n')
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
    resultContent = \`<think>\\n\${reasoningContent}\\n</think>\\n\\n\${finalContent}\`
  }
  
  const tool_calls = Object.keys(toolCallsMap).length > 0 ? Object.values(toolCallsMap) : undefined
  return { content: resultContent, tool_calls }
}`
  );

  // Replace usage in chat.ts for stream (QwenAiAdapter)
  code = code.replace(
    /const parsedContent = extractContentFromSSE\(collectedContent\);\n\s*if \(parsedContent\) \{\n\s*QwenAiAdapter\.recordNextContextMap\(request\.messages, parsedContent, result\.chatId, parentId\);\n\s*\}/g,
    `const parsedMessage = extractContentFromSSE(collectedContent);
            if (parsedMessage.content || parsedMessage.tool_calls) {
              QwenAiAdapter.recordNextContextMap(request.messages, parsedMessage, result.chatId, parentId);
            }`
  );

  // Replace usage in chat.ts for stream (QwenAdapter)
  code = code.replace(
    /const parsedContent = extractContentFromSSE\(collectedContent\)\n\s*if \(parsedContent\) \{\n\s*QwenAdapter\.recordNextContextMap\(request\.messages, parsedContent, result\.sessionId, result\.reqId\)\n\s*\}/g,
    `const parsedMessage = extractContentFromSSE(collectedContent)
            if (parsedMessage.content || parsedMessage.tool_calls) {
              QwenAdapter.recordNextContextMap(request.messages, parsedMessage, result.sessionId, result.reqId)
            }`
  );

  // Replace usage for non-stream QwenAiAdapter
  code = code.replace(
    /const assistantReply = result\.body\.choices\?\.\[0\]\?\.message\?\.content \|\| '';\n\s*if \(assistantReply\) \{\n\s*QwenAiAdapter\.recordNextContextMap\(request\.messages, assistantReply, result\.chatId, parentId\);\n\s*\}/g,
    `const assistantMsg = result.body.choices?.[0]?.message || { content: '' };
          if (assistantMsg.content || assistantMsg.tool_calls) {
             QwenAiAdapter.recordNextContextMap(request.messages, assistantMsg, result.chatId, parentId);
          }`
  );

  // Replace usage for non-stream QwenAdapter
  code = code.replace(
    /const assistantReply = result\.body\.choices\?\.\[0\]\?\.message\?\.content \|\| ''\n\s*if \(assistantReply\) \{\n\s*QwenAdapter\.recordNextContextMap\(request\.messages, assistantReply, result\.sessionId, result\.reqId\)\n\s*\}/g,
    `const assistantMsg = result.body.choices?.[0]?.message || { content: '' }
          if (assistantMsg.content || assistantMsg.tool_calls) {
             QwenAdapter.recordNextContextMap(request.messages, assistantMsg, result.sessionId, result.reqId)
          }`
  );

  fs.writeFileSync('src/main/proxy/routes/chat.ts', code);
}

function modifyAdapters() {
  const adapters = ['src/main/proxy/adapters/qwen-ai.ts', 'src/main/proxy/adapters/qwen.ts'];
  
  for (const file of adapters) {
    let code = fs.readFileSync(file, 'utf8');
    
    // Modify recordNextContextMap signature and logic
    code = code.replace(
      /static recordNextContextMap\(messages: any\[\], assistantMessage: string, ([a-zA-Z]+): string, ([a-zA-Z]+): string\) \{/,
      `static recordNextContextMap(messages: any[], assistantMessage: any, $1: string, $2: string) {`
    );
    
    code = code.replace(
      /const newMessages = \[\.\.\.messages, \{ role: 'assistant', content: assistantMessage \}\]/g,
      `let msgToAppend: any = { role: 'assistant' }
    if (typeof assistantMessage === 'string') {
      msgToAppend.content = assistantMessage
    } else {
      msgToAppend.content = assistantMessage.content || ''
      if (assistantMessage.tool_calls) msgToAppend.tool_calls = assistantMessage.tool_calls
    }
    const newMessages = [...messages, msgToAppend]`
    );

    // Modify generateContextHash to include tool_calls and tool_call_id
    code = code.replace(
      /return \{[\s\n]*role: m\.role \? m\.role\.toLowerCase\(\) : '',[\s\n]*content: contentStr\.trim\(\)[\s\n]*\}/g,
      `const res: any = { 
        role: m.role ? m.role.toLowerCase() : '', 
        content: contentStr.trim() 
      }
      if (m.tool_calls) {
        res.tool_calls = m.tool_calls.map((tc: any) => ({
          type: tc.type || 'function',
          function: {
            name: tc.function?.name || '',
            arguments: tc.function?.arguments || ''
          }
        }))
      }
      if (m.tool_call_id) res.tool_call_id = m.tool_call_id
      if (m.name) res.name = m.name
      return res`
    );

    fs.writeFileSync(file, code);
  }
}

modifyChatTs();
modifyAdapters();
console.log('Modified files!');
