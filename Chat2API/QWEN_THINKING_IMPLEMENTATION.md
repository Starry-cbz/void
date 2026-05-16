# Qwen AI Thinking Mode Implementation Summary

## Overview

This document describes the implementation of support for calling Qwen AI International (chat.qwen.ai) models with Thinking mode via the `{model}-thinking` suffix.

## Changes Made

### 1. Load Balancer (`src/main/proxy/loadbalancer.ts`)

#### Added Method: `stripModelSuffix()`
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

**Purpose**: Strips `-thinking` and `-fast` suffixes from model names to enable matching against base models.

#### Modified Method: `providerSupportsModel()`

Added logic to check both the original model name and the base model (without suffix):

1. First attempts to match the original model name (e.g., `qwen3-max-thinking`)
2. If no match, strips the suffix and tries matching the base model (e.g., `qwen3-max`)
3. Also checks global model mappings for both suffixed and base model names

**Key Addition**:
```typescript
// If not matched, try stripping -thinking/-fast suffix and match base model
const baseModel = this.stripModelSuffix(model)
if (baseModel !== model) {
  const normalizedBaseModel = baseModel.toLowerCase()
  const baseSupported = effectiveModels.some(m => {
    const normalizedSupported = m.displayName.toLowerCase()
    if (normalizedSupported.endsWith('*')) {
      return normalizedBaseModel.startsWith(normalizedSupported.slice(0, -1))
    }
    return normalizedSupported === normalizedBaseModel
  })
  
  if (baseSupported) {
    console.log(`[LoadBalancer] Model "${model}" matched base model "${baseModel}"`)
    return true
  }
}
```

### 2. Qwen AI Adapter (`src/main/proxy/adapters/qwen-ai.ts`)

The adapter already had comprehensive thinking mode support:

#### Existing Features:
- **`mapModel()` method**: Detects and removes `-thinking`/`-fast` suffixes, sets `_forceThinking` flag
- **`chatCompletion()` method**: 
  - Accepts `originalModel` parameter to preserve user's intent
  - Detects thinking mode from multiple sources (priority order):
    1. `originalModel` suffix (`-thinking` or `-fast`)
    2. Model name keywords (`think`, `r1`)
    3. `request.enable_thinking` parameter
    4. Instance variable `_forceThinking` from `mapModel()`
  - Configures `feature_config` with appropriate thinking settings

#### No Changes Required
The existing implementation was already complete and functional. The only missing piece was the load balancer support, which has now been added.

### 3. Forwarder (`src/main/proxy/forwarder.ts`)

Already passes `originalModel` to preserve the user's model name choice:

```typescript
await adapter.chatCompletion({
  model: actualModel,           // Mapped model ID (e.g., "qwen3-max")
  originalModel: request.model, // Original request (e.g., "qwen3-max-thinking")
  messages: transformedRequest.messages,
  enable_thinking: !!request.reasoning_effort,
  // ...
})
```

**No changes required** - this was already implemented correctly.

## How It Works

### Request Flow

1. **User Request**: Client sends request with model `qwen3-max-thinking`

2. **Load Balancer Selection**:
   - `providerSupportsModel()` checks if provider supports the model
   - Strips `-thinking` suffix → `qwen3-max`
   - Matches against supported models list
   - Returns `true` if base model is supported

3. **Model Mapping**:
   - `mapModel()` in load balancer maps display name to actual model ID
   - Returns mapped model (e.g., `qwen3-max-2026-01-23`)

4. **Forwarder Processing**:
   - Calls `adapter.chatCompletion()` with:
     - `model`: mapped model ID
     - `originalModel`: original request model (`qwen3-max-thinking`)

5. **Adapter Processing**:
   - `mapModel()` strips suffix and sets `_forceThinking = true`
   - `chatCompletion()` detects thinking mode from `originalModel`
   - Sets `feature_config.thinking_enabled = true`
   - Sends request to Qwen AI API

6. **Response Handling**:
   - Stream handler processes `think` and `thinking_summary` phases
   - Combines into `reasoning_content` field in response

## Usage Examples

### Example 1: Basic Thinking Mode
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-max-thinking",
    "messages": [{"role": "user", "content": "Solve: 25 * 48"}],
    "stream": true
  }'
```

### Example 2: Fast Mode (Disable Thinking)
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-max-fast",
    "messages": [{"role": "user", "content": "Quick answer: 2+2=?"}]
  }'
```

### Example 3: Using OpenAI SDK
```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:3000/v1", api_key="your-key")

response = client.chat.completions.create(
    model="qwen3-max-thinking",
    messages=[{"role": "user", "content": "Explain quantum computing"}],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.reasoning_content:
        print(f"[Thinking]: {chunk.choices[0].delta.reasoning_content}")
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

## Supported Models

All Qwen AI International models support the `-thinking` suffix:

- `qwen3-max-thinking` / `Qwen3-Max-thinking`
- `qwen3.5-plus-thinking` / `Qwen3.5-Plus-thinking`
- `qwen3-coder-plus-thinking` / `Qwen3-Coder-thinking`
- `qwen3-vl-plus-thinking` / `Qwen3-VL-Plus-thinking`
- `qwen3-omni-flash-thinking` / `Qwen3-Omni-Flash-thinking`
- And all other Qwen AI models...

## Testing

### Manual Testing Steps

1. **Start Chat2API**:
   ```bash
   npm run dev
   ```

2. **Configure Qwen AI Provider**:
   - Add a Qwen AI (International) provider
   - Configure with valid JWT token

3. **Test Thinking Mode**:
   ```bash
   curl http://localhost:3000/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
       "model": "qwen3-max-thinking",
       "messages": [{"role": "user", "content": "Think step by step: What is 17 * 23?"}],
       "stream": true
     }'
   ```

4. **Verify Response**:
   - Check for `reasoning_content` field in streaming chunks
   - Verify thinking process is shown before final answer

### Expected Logs

When using `-thinking` suffix, you should see:

```
[LoadBalancer] Model "qwen3-max-thinking" matched base model "qwen3-max"
[QwenAI] Thinking mode enabled (from model name suffix)
[QwenAI] Sending request to /api/v2/chat/completions...
[QwenAI] feature_config: {"thinking_enabled":true,"auto_thinking":true,...}
```

## Benefits

1. **Simple API**: Users just append `-thinking` to any model name
2. **Backward Compatible**: Existing requests without suffix work as before
3. **Flexible**: Multiple ways to enable thinking (suffix, parameter, header)
4. **Transparent**: Automatic model matching and configuration
5. **Complete**: Supports all Qwen AI models

## Related Documentation

- [Thinking Mode User Guide](docs/THINKING_MODE.md)
- [Code Wiki](CODE_WIKI.md)

## Files Modified

1. `src/main/proxy/loadbalancer.ts` - Added suffix handling in model matching
2. `docs/THINKING_MODE.md` - User documentation (new file)
3. `QWEN_THINKING_IMPLEMENTATION.md` - This implementation summary (new file)

## Files Already Supporting Thinking Mode

1. `src/main/proxy/adapters/qwen-ai.ts` - Complete thinking mode implementation
2. `src/main/proxy/forwarder.ts` - Passes `originalModel` parameter
3. `src/main/providers/builtin/qwen-ai.ts` - Provider configuration

## Version

Implemented in v1.3.0 (2026-05-16)
