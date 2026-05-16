# Qwen AI Thinking Mode Support

## Overview

Chat2API now supports calling Qwen AI International (chat.qwen.ai) models with Thinking mode enabled via the `{model}-thinking` suffix.

## Usage

### Method 1: Model Name Suffix (Recommended)

Append `-thinking` to any Qwen AI model name to enable thinking mode:

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "model": "qwen3-max-thinking",
    "messages": [
      {"role": "user", "content": "Solve this step by step: 25 * 48"}
    ],
    "stream": true
  }'
```

The response will include `reasoning_content` field with the model's thought process:

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion.chunk",
  "choices": [{
    "index": 0,
    "delta": {
      "role": "assistant",
      "reasoning_content": "Let me break down this calculation..."
    },
    "finish_reason": null
  }]
}
```

### Method 2: Fast Mode Suffix

Append `-fast` to explicitly disable thinking mode (default behavior):

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-max-fast",
    "messages": [{"role": "user", "content": "Quick answer: 2+2=?"}]
  }'
```

### Method 3: Request Parameter

Use the `reasoning_effort` parameter (compatible with OpenAI API):

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-max",
    "messages": [{"role": "user", "content": "Explain quantum computing"}],
    "reasoning_effort": "high"
  }'
```

### Method 4: HTTP Header

Use the `X-Reasoning-Effort` header:

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Reasoning-Effort: high" \
  -d '{
    "model": "qwen3-max",
    "messages": [{"role": "user", "content": "Analyze this problem"}]
  }'
```

## Supported Models

All Qwen AI International models support thinking mode:

- `qwen3-max-thinking` / `Qwen3-Max-thinking`
- `qwen3.5-plus-thinking` / `Qwen3.5-Plus-thinking`
- `qwen3-coder-plus-thinking` / `Qwen3-Coder-thinking`
- `qwen3-vl-plus-thinking` / `Qwen3-VL-Plus-thinking`
- And all other Qwen AI models...

## How It Works

1. **Model Matching**: When you use `{model}-thinking`, Chat2API automatically:
   - Strips the `-thinking` suffix for model matching
   - Finds the corresponding base model in Qwen AI
   - Enables thinking mode in the API request

2. **API Configuration**: The adapter sets:
   ```javascript
   feature_config: {
     thinking_enabled: true,
     auto_thinking: true,
     thinking_format: 'summary',
     output_schema: 'phase'
   }
   ```

3. **Response Handling**: The stream handler processes two phases:
   - `think` phase: Raw reasoning content
   - `thinking_summary` phase: Summarized thoughts
   - Both are combined into `reasoning_content` field

## Implementation Details

### Load Balancer (`src/main/proxy/loadbalancer.ts`)

Added `stripModelSuffix()` method to handle `-thinking` and `-fast` suffixes during model matching:

```typescript
private stripModelSuffix(model: string): string {
  if (model.endsWith('-thinking')) {
    return model.slice(0, -9)
  }
  if (model.endsWith('-fast')) {
    return model.slice(0, -5)
  }
  return model
}
```

The `providerSupportsModel()` method now checks both the original model name and the base model (without suffix).

### Qwen AI Adapter (`src/main/proxy/adapters/qwen-ai.ts`)

The adapter detects thinking mode from multiple sources (priority order):

1. `originalModel` parameter (preserves user's intent before mapping)
2. Model name keywords (`think`, `r1`)
3. `request.enable_thinking` parameter
4. Instance variable `_forceThinking` from `mapModel()`

### Forwarder (`src/main/proxy/forwarder.ts`)

Passes `originalModel` to preserve the user's model name choice:

```typescript
await adapter.chatCompletion({
  model: actualModel,           // Mapped model ID (e.g., "qwen3-max")
  originalModel: request.model, // Original request (e.g., "qwen3-max-thinking")
  messages: transformedRequest.messages,
  enable_thinking: !!request.reasoning_effort,
  // ...
})
```

## Examples

### Example 1: Math Problem with Thinking

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-max-thinking",
    "messages": [
      {"role": "user", "content": "A train travels at 60 km/h. How far does it travel in 2.5 hours?"}
    ],
    "stream": true
  }'
```

Response includes reasoning:
```
reasoning_content: "To solve this problem, I need to use the formula: distance = speed × time..."
content: "The train travels 150 kilometers."
```

### Example 2: Code Generation with Thinking

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-coder-plus-thinking",
    "messages": [
      {"role": "user", "content": "Write a Python function to calculate Fibonacci numbers"}
    ]
  }'
```

### Example 3: Using with OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="your-api-key"
)

response = client.chat.completions.create(
    model="qwen3-max-thinking",
    messages=[
        {"role": "user", "content": "Explain the theory of relativity"}
    ],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.reasoning_content:
        print(f"[Thinking]: {chunk.choices[0].delta.reasoning_content}")
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

## Troubleshooting

### Issue: Model not found

**Solution**: Make sure the base model (without `-thinking` suffix) is configured in your Qwen AI provider settings.

### Issue: No reasoning_content in response

**Possible causes**:
1. The model doesn't support thinking mode
2. Thinking mode was not properly enabled
3. Check logs for `[QwenAI] Thinking mode enabled` message

**Debug steps**:
```bash
# Enable verbose logging
# Check console output for:
# [LoadBalancer] Model "qwen3-max-thinking" matched base model "qwen3-max"
# [QwenAI] Thinking mode enabled (from model name suffix)
```

### Issue: Slow response time

**Explanation**: Thinking mode requires additional computation time. This is expected behavior.

**Solution**: Use `-fast` suffix or remove `-thinking` for faster responses when deep reasoning is not needed.

## Related Files

- `src/main/proxy/loadbalancer.ts` - Model matching with suffix handling
- `src/main/proxy/adapters/qwen-ai.ts` - Qwen AI adapter with thinking support
- `src/main/proxy/forwarder.ts` - Request forwarding logic
- `src/main/providers/builtin/qwen-ai.ts` - Provider configuration

## Changelog

### v1.3.0 (2026-05-16)
- ✅ Added support for `{model}-thinking` suffix
- ✅ Added support for `{model}-fast` suffix
- ✅ Improved model matching to handle suffixed model names
- ✅ Enhanced thinking mode detection from multiple sources
- ✅ Added comprehensive documentation
