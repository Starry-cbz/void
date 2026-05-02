import { QwenAiAdapter } from './src/main/proxy/adapters/qwen-ai';

const provider = {
  id: 'qwen-ai',
  name: 'Qwen AI',
  apiEndpoint: 'https://chat.qwen.ai',
  website: 'https://chat.qwen.ai'
};

const account = {
  id: 'test-account',
  name: 'Test',
  providerId: 'qwen-ai',
  credentials: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVhOTUzYWRiLTIxMDItNDdjYy04OGIxLTc3ZWZhN2JkZDVkZiIsImxhc3RfcGFzc3dvcmRfY2hhbmdlIjoxNzc3MDk5OTM4LCJleHAiOjE3Nzk2OTg4NDN9.VfspBxqWrTkMHwi5uke_XijpY3RQgtMalyy81s8XjD8'
  }
};

async function run() {
  const adapter = new QwenAiAdapter(provider as any, account as any);
  
  const messages1 = [
    { role: 'user', content: '你好，我是你的新朋友' }
  ];
  
  console.log('Sending round 1...');
  const res1 = await adapter.chatCompletion({
    model: 'qwen3.6-plus',
    messages: messages1 as any,
    stream: true
  });
  
  console.log('Round 1 response:', res1.chatId, res1.parentId);
  
  // Simulate stream end
  const assistantReply = "你好！很高兴认识你。";
  QwenAiAdapter.recordNextContextMap(messages1, assistantReply, res1.chatId, res1.parentId || 'some-id');
  
  const messages2 = [
    { role: 'user', content: '你好，我是你的新朋友' },
    { role: 'assistant', content: assistantReply },
    { role: 'user', content: '我刚才说了什么' }
  ];
  
  console.log('Sending round 2...');
  const res2 = await adapter.chatCompletion({
    model: 'qwen3.6-plus',
    messages: messages2 as any,
    stream: true
  });
  
  console.log('Round 2 response:', res2.chatId, res2.parentId);
  console.log('Did it match round 1?', res1.chatId === res2.chatId);
}

run().catch(console.error);
