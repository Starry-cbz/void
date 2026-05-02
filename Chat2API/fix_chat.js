const fs = require('fs');
let code = fs.readFileSync('src/main/proxy/routes/chat.ts', 'utf8');

code = code.replace(
  /const handler = \(result\.stream as any\)\.qwenAiHandler \|\| \(result as any\)\.qwenAiHandler;\n\s*const parentId = handler \? handler\.getResponseId\(\) : result\.parentId;\n\s*if \(QwenAiAdapter\.isQwenAiProvider\(provider\) && result\.chatId && parentId\) \{\n\s*const parsedContent = extractContentFromSSE\(collectedContent\)\n\s*if \(parsedContent\) \{\n\s*QwenAiAdapter\.recordNextContextMap\(request\.messages, parsedContent, result\.chatId, result\.parentId\)\n\s*\}\n\s*\}/g,
  `const handler = result.stream ? (result.stream as any).qwenAiHandler : null;
          const parentId = (handler ? handler.getResponseId() : null) || result.parentId;
          if (QwenAiAdapter.isQwenAiProvider(provider) && result.chatId && parentId) {
            const parsedContent = extractContentFromSSE(collectedContent);
            if (parsedContent) {
              QwenAiAdapter.recordNextContextMap(request.messages, parsedContent, result.chatId, parentId);
            }
          }`
);

code = code.replace(
  /const handler = \(result\.stream as any\)\.qwenAiHandler \|\| \(result as any\)\.qwenAiHandler;\n\s*const parentId = handler \? handler\.getResponseId\(\) : result\.parentId;\n\s*if \(QwenAiAdapter\.isQwenAiProvider\(provider\) && result\.chatId && parentId\) \{\n\s*const assistantReply = result\.body\.choices\?\.\[0\]\?\.message\?\.content \|\| ''\n\s*if \(assistantReply\) \{\n\s*QwenAiAdapter\.recordNextContextMap\(request\.messages, assistantReply, result\.chatId, result\.parentId\)\n\s*\}\n\s*\}/g,
  `const handler = result.stream ? (result.stream as any).qwenAiHandler : null;
        const parentId = (handler ? handler.getResponseId() : null) || result.parentId;
        if (QwenAiAdapter.isQwenAiProvider(provider) && result.chatId && parentId) {
          const assistantReply = result.body.choices?.[0]?.message?.content || '';
          if (assistantReply) {
             QwenAiAdapter.recordNextContextMap(request.messages, assistantReply, result.chatId, parentId);
          }
        }`
);

fs.writeFileSync('src/main/proxy/routes/chat.ts', code);
