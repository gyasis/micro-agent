# LiteLLM Integration - Technical Design Document

**Version:** 1.0
**Date:** February 12, 2026
**Status:** Design
**Related:** Ralph Loop 2026 Modernization PRD

---

## Overview

Replace the current provider-specific LLM implementations (OpenAI SDK, Anthropic SDK, Ollama) with **LiteLLM** - a unified interface that supports 100+ LLM providers through a single API.

### Current Problems
```typescript
// Current implementation (src/helpers/llm.ts)
if (useAnthropic(model)) {
  const anthropic = await getAnthropic();
  // Anthropic-specific code...
} else if (useOllama(model)) {
  const response = await ollama.chat({...});
  // Ollama-specific code...
} else {
  const openai = await getOpenAi();
  // OpenAI-specific code...
}
```

**Issues:**
- 🔴 Manual provider detection logic
- 🔴 Separate code paths for each provider
- 🔴 Hard to add new providers (Gemini, Azure, etc.)
- 🔴 Inconsistent error handling across providers
- 🔴 No unified cost tracking
- 🔴 Complex streaming logic per provider

### LiteLLM Solution
```typescript
// New implementation with LiteLLM
import litellm from 'litellm';

const response = await litellm.completion({
  model: "claude-sonnet-4.5",  // or gpt-4.1, gemini-2.0-pro, etc.
  messages: [...],
  stream: true
});

// Automatically routes to correct provider!
```

**Benefits:**
- ✅ Single unified API for all providers
- ✅ Automatic model routing
- ✅ Built-in cost tracking
- ✅ Fallback/retry logic
- ✅ Consistent error handling
- ✅ Support for 100+ models out of the box

---

## Architecture

### 1. LiteLLM Provider Abstraction

```typescript
// src/helpers/litellm-client.ts

import { completion, cost_per_token } from 'litellm';
import { getConfig } from './config';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionOptions {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
}

export interface LLMCompletionResult {
  content: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost: number;
  provider: string;
}

export class LiteLLMClient {
  private apiKeys: Map<string, string> = new Map();

  async initialize() {
    const config = await getConfig();

    // Load API keys from config
    if (config.OPENAI_KEY) {
      this.apiKeys.set('openai', config.OPENAI_KEY);
    }
    if (config.ANTHROPIC_KEY) {
      this.apiKeys.set('anthropic', config.ANTHROPIC_KEY);
    }
    if (config.GOOGLE_API_KEY) {
      this.apiKeys.set('gemini', config.GOOGLE_API_KEY);
    }
    if (config.AZURE_API_KEY) {
      this.apiKeys.set('azure', config.AZURE_API_KEY);
    }
  }

  async completion(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const {
      model,
      messages,
      temperature = 0.7,
      max_tokens = 4096,
      stream = false,
      onChunk
    } = options;

    // Set API keys dynamically based on model
    this.setProviderApiKey(model);

    if (stream && onChunk) {
      return this.streamingCompletion(options);
    }

    const response = await completion({
      model: this.normalizeModelName(model),
      messages: messages as any,
      temperature,
      max_tokens,
      stream: false,
    });

    return {
      content: response.choices[0].message.content,
      model: response.model,
      usage: {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
      },
      cost: this.calculateCost(response),
      provider: this.getProvider(model),
    };
  }

  private async streamingCompletion(
    options: LLMCompletionOptions
  ): Promise<LLMCompletionResult> {
    const { model, messages, temperature, max_tokens, onChunk } = options;

    this.setProviderApiKey(model);

    const response = await completion({
      model: this.normalizeModelName(model),
      messages: messages as any,
      temperature,
      max_tokens,
      stream: true,
    });

    let fullContent = '';
    let totalTokens = 0;

    for await (const chunk of response) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        if (onChunk) {
          onChunk(content);
        }
      }
    }

    // Get final usage stats
    const usage = await this.estimateTokens(messages, fullContent);

    return {
      content: fullContent,
      model,
      usage,
      cost: this.calculateCostFromUsage(model, usage),
      provider: this.getProvider(model),
    };
  }

  private normalizeModelName(model: string): string {
    // LiteLLM model name mapping
    const modelMap: Record<string, string> = {
      'claude': 'claude-3-5-sonnet-20241022',
      'sonnet': 'claude-3-5-sonnet-20241022',
      'opus': 'claude-3-opus-20240229',
      'gpt-4': 'gpt-4o',
      'gpt': 'gpt-4o',
      'gemini': 'gemini/gemini-2.0-flash-exp',
      'gemini-pro': 'gemini/gemini-2.0-flash-exp',
    };

    return modelMap[model] || model;
  }

  private getProvider(model: string): string {
    if (model.includes('claude')) return 'anthropic';
    if (model.includes('gpt')) return 'openai';
    if (model.includes('gemini')) return 'google';
    if (model.includes('llama')) return 'ollama';
    return 'unknown';
  }

  private setProviderApiKey(model: string) {
    const provider = this.getProvider(model);
    const apiKey = this.apiKeys.get(provider);

    if (!apiKey && provider !== 'ollama') {
      throw new Error(`Missing API key for provider: ${provider}`);
    }

    // LiteLLM uses environment variables
    if (apiKey) {
      process.env[`${provider.toUpperCase()}_API_KEY`] = apiKey;
    }
  }

  private calculateCost(response: any): number {
    try {
      return cost_per_token(
        response.model,
        response.usage.prompt_tokens,
        response.usage.completion_tokens
      );
    } catch {
      return 0;
    }
  }

  private calculateCostFromUsage(model: string, usage: any): number {
    try {
      return cost_per_token(
        model,
        usage.prompt_tokens,
        usage.completion_tokens
      );
    } catch {
      return 0;
    }
  }

  private async estimateTokens(
    messages: LLMMessage[],
    completion: string
  ): Promise<any> {
    // Rough estimation using tiktoken or similar
    const promptText = messages.map(m => m.content).join(' ');
    const promptTokens = Math.ceil(promptText.length / 4);
    const completionTokens = Math.ceil(completion.length / 4);

    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    };
  }
}

// Singleton instance
export const liteLLM = new LiteLLMClient();
```

### 2. Multi-Agent Orchestration with LiteLLM

```typescript
// src/agents/agent-orchestrator.ts

import { liteLLM, LLMMessage } from '../helpers/litellm-client';

export enum AgentRole {
  LIBRARIAN = 'librarian',
  ARTISAN = 'artisan',
  CRITIC = 'critic',
  CHAOS = 'chaos',
}

export interface AgentConfig {
  role: AgentRole;
  model: string;
  temperature: number;
  systemPrompt: string;
}

export class AgentOrchestrator {
  private agents: Map<AgentRole, AgentConfig> = new Map();
  private costTracker: Map<AgentRole, number> = new Map();

  constructor(config: Record<AgentRole, Partial<AgentConfig>>) {
    // Default configurations
    const defaults: Record<AgentRole, AgentConfig> = {
      [AgentRole.LIBRARIAN]: {
        role: AgentRole.LIBRARIAN,
        model: 'gemini/gemini-2.0-flash-exp',
        temperature: 0.3,
        systemPrompt: 'You are a librarian agent with vast context. Analyze codebases and provide historical context.',
      },
      [AgentRole.ARTISAN]: {
        role: AgentRole.ARTISAN,
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        systemPrompt: 'You are an artisan code generator. Write idiomatic, production-quality code.',
      },
      [AgentRole.CRITIC]: {
        role: AgentRole.CRITIC,
        model: 'gpt-4.1-mini',
        temperature: 0.5,
        systemPrompt: 'You are a critic. Review code for logical flaws and edge cases.',
      },
      [AgentRole.CHAOS]: {
        role: AgentRole.CHAOS,
        model: 'gpt-4o',
        temperature: 0.9,
        systemPrompt: 'You are a chaos agent. Generate adversarial tests to break code.',
      },
    };

    // Merge user config with defaults
    for (const role of Object.values(AgentRole)) {
      this.agents.set(role, {
        ...defaults[role],
        ...config[role],
      });
      this.costTracker.set(role, 0);
    }
  }

  async callAgent(
    role: AgentRole,
    messages: LLMMessage[],
    options?: { stream?: boolean; onChunk?: (chunk: string) => void }
  ): Promise<{ content: string; cost: number }> {
    const agent = this.agents.get(role)!;

    const systemMessage: LLMMessage = {
      role: 'system',
      content: agent.systemPrompt,
    };

    const result = await liteLLM.completion({
      model: agent.model,
      messages: [systemMessage, ...messages],
      temperature: agent.temperature,
      stream: options?.stream,
      onChunk: options?.onChunk,
    });

    // Track cost per agent
    const currentCost = this.costTracker.get(role) || 0;
    this.costTracker.set(role, currentCost + result.cost);

    return {
      content: result.content,
      cost: result.cost,
    };
  }

  getCostBreakdown(): Record<AgentRole, number> {
    const breakdown: any = {};
    for (const [role, cost] of this.costTracker.entries()) {
      breakdown[role] = cost;
    }
    return breakdown;
  }

  getTotalCost(): number {
    return Array.from(this.costTracker.values()).reduce((a, b) => a + b, 0);
  }
}
```

### 3. Ralph Loop Integration

```typescript
// src/helpers/ralph-loop.ts

import { AgentOrchestrator, AgentRole } from '../agents/agent-orchestrator';
import { RalphConfig } from './config';

export interface RalphLoopOptions {
  prompt: string;
  testCommand: string;
  maxIterations: number;
  budget: number;
  config: RalphConfig;
}

export class RalphLoop {
  private orchestrator: AgentOrchestrator;
  private iteration = 0;

  constructor(private options: RalphLoopOptions) {
    this.orchestrator = new AgentOrchestrator({
      librarian: { model: options.config.models.librarian },
      artisan: { model: options.config.models.artisan },
      critic: { model: options.config.models.critic },
      chaos: { model: options.config.models.chaos },
    });
  }

  async run(): Promise<void> {
    // Phase 1: Librarian analyzes codebase
    console.log('🔍 Librarian: Analyzing codebase...');
    const context = await this.orchestrator.callAgent(
      AgentRole.LIBRARIAN,
      [
        {
          role: 'user',
          content: `Analyze this codebase and provide context for: ${this.options.prompt}`,
        },
      ]
    );

    // Phase 2: Artisan generates code
    console.log('✍️  Artisan: Generating code...');
    const code = await this.orchestrator.callAgent(
      AgentRole.ARTISAN,
      [
        {
          role: 'user',
          content: `Context:\n${context.content}\n\nTask:\n${this.options.prompt}`,
        },
      ],
      {
        stream: true,
        onChunk: (chunk) => process.stderr.write(chunk),
      }
    );

    // Phase 3: Critic reviews code
    console.log('\n🔎 Critic: Reviewing code...');
    const review = await this.orchestrator.callAgent(
      AgentRole.CRITIC,
      [
        {
          role: 'user',
          content: `Review this code:\n\n${code.content}\n\nFind logical flaws and edge cases.`,
        },
      ]
    );

    // Phase 4: Run tests
    // ... (test execution logic)

    // Phase 5: Chaos agent (adversarial testing)
    if (this.options.config.testing.adversarial_tests) {
      console.log('😈 Chaos Agent: Generating adversarial tests...');
      const evilTests = await this.orchestrator.callAgent(
        AgentRole.CHAOS,
        [
          {
            role: 'user',
            content: `Generate property-based tests and fuzzing inputs for:\n\n${code.content}`,
          },
        ]
      );
    }

    // Cost check
    const totalCost = this.orchestrator.getTotalCost();
    if (totalCost > this.options.budget) {
      console.log(`⚠️  Budget exceeded: $${totalCost.toFixed(2)} / $${this.options.budget}`);
      this.showCostBreakdown();
      return;
    }
  }

  private showCostBreakdown() {
    const breakdown = this.orchestrator.getCostBreakdown();
    console.log('\n💰 Cost Breakdown:');
    for (const [role, cost] of Object.entries(breakdown)) {
      console.log(`   ${role}: $${cost.toFixed(4)}`);
    }
    console.log(`   Total: $${this.orchestrator.getTotalCost().toFixed(2)}`);
  }
}
```

### 4. Fallback & Retry Strategy

```typescript
// src/helpers/litellm-fallback.ts

export interface FallbackConfig {
  primary: string;
  fallbacks: string[];
  maxRetries: number;
  retryDelay: number;
}

export class LiteLLMWithFallback {
  constructor(private config: FallbackConfig) {}

  async completion(options: any): Promise<any> {
    const models = [this.config.primary, ...this.config.fallbacks];

    for (const model of models) {
      for (let retry = 0; retry < this.config.maxRetries; retry++) {
        try {
          console.log(`🔄 Trying model: ${model} (attempt ${retry + 1})`);

          const result = await liteLLM.completion({
            ...options,
            model,
          });

          console.log(`✅ Success with ${model}`);
          return result;

        } catch (error: any) {
          console.warn(`❌ ${model} failed:`, error.message);

          // Rate limit error - wait and retry
          if (error.message.includes('rate_limit')) {
            await this.sleep(this.config.retryDelay * (retry + 1));
            continue;
          }

          // Authentication error - skip to next model
          if (error.message.includes('authentication')) {
            break;
          }

          // Network error - retry
          if (error.message.includes('network')) {
            await this.sleep(this.config.retryDelay);
            continue;
          }

          // Unknown error - try next model
          break;
        }
      }
    }

    throw new Error('All models failed. Check API keys and quotas.');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage
const fallbackClient = new LiteLLMWithFallback({
  primary: 'claude-3-5-sonnet-20241022',
  fallbacks: ['gpt-4o', 'gemini/gemini-2.0-flash-exp'],
  maxRetries: 3,
  retryDelay: 2000,
});
```

---

## Configuration Schema

### Updated ralph.config.yaml
```yaml
# LiteLLM Model Configuration
models:
  librarian:
    provider: gemini
    model: gemini/gemini-2.0-flash-exp
    temperature: 0.3
    max_tokens: 100000
    fallback:
      - claude-3-5-sonnet-20241022
      - gpt-4o

  artisan:
    provider: anthropic
    model: claude-3-5-sonnet-20241022
    temperature: 0.7
    max_tokens: 8192
    fallback:
      - gpt-4o
      - gemini/gemini-2.0-flash-exp

  critic:
    provider: openai
    model: gpt-4.1-mini
    temperature: 0.5
    max_tokens: 4096
    fallback:
      - claude-3-5-sonnet-20241022

  chaos:
    provider: openai
    model: gpt-4o
    temperature: 0.9
    max_tokens: 4096
    fallback:
      - claude-3-5-sonnet-20241022

# LiteLLM Settings
litellm:
  enable_fallback: true
  retry_attempts: 3
  retry_delay_ms: 2000
  enable_caching: true
  cache_ttl_seconds: 3600
  enable_cost_tracking: true
  log_requests: true
  log_file: .ralph/litellm.log

# API Keys (or use environment variables)
api_keys:
  openai: ${OPENAI_KEY}
  anthropic: ${ANTHROPIC_KEY}
  google: ${GOOGLE_API_KEY}
  azure: ${AZURE_API_KEY}
```

---

## Migration Plan

### Step 1: Install LiteLLM
```bash
npm install litellm
```

### Step 2: Create LiteLLM Wrapper
- Create `src/helpers/litellm-client.ts`
- Implement unified completion interface
- Add streaming support
- Add cost tracking

### Step 3: Refactor Existing Code
```typescript
// Before (src/helpers/llm.ts)
if (useAnthropic(model)) {
  const anthropic = await getAnthropic();
  const result = anthropic.messages.stream({...});
}

// After (src/helpers/llm.ts)
import { liteLLM } from './litellm-client';

const result = await liteLLM.completion({
  model: 'claude-3-5-sonnet-20241022',
  messages: [...],
  stream: true,
  onChunk: (chunk) => process.stderr.write(chunk)
});
```

### Step 4: Update Config System
- Add LiteLLM config to `ralph.config.yaml`
- Support environment variable expansion
- Add validation for API keys

### Step 5: Testing
- [ ] Test Claude models
- [ ] Test GPT models
- [ ] Test Gemini models
- [ ] Test Ollama (local)
- [ ] Test Azure OpenAI
- [ ] Test fallback logic
- [ ] Test cost tracking
- [ ] Test streaming

### Step 6: Documentation
- Update README with LiteLLM usage
- Document model configuration
- Add troubleshooting guide

---

## Benefits Summary

### 1. Provider Agnostic
```typescript
// Switch providers by changing config, not code
config.models.artisan.model = 'gpt-4o';  // OpenAI
config.models.artisan.model = 'claude-3-5-sonnet-20241022';  // Anthropic
config.models.artisan.model = 'gemini/gemini-2.0-flash-exp';  // Google
```

### 2. Automatic Cost Tracking
```typescript
const result = await liteLLM.completion({...});
console.log(`Cost: $${result.cost.toFixed(4)}`);
```

### 3. Built-in Fallbacks
```yaml
models:
  artisan:
    model: claude-3-5-sonnet-20241022
    fallback:
      - gpt-4o
      - gemini/gemini-2.0-flash-exp
```

### 4. Support for 100+ Models
- OpenAI: GPT-4, GPT-4 Turbo, GPT-3.5
- Anthropic: Claude 3 Opus, Sonnet, Haiku
- Google: Gemini 1.5/2.0 Pro, Flash
- Azure: Azure OpenAI
- Ollama: Llama 3, Mistral, Phi
- AWS Bedrock: All Bedrock models
- Hugging Face: Any HF model
- Replicate: Any Replicate model

### 5. Unified Error Handling
```typescript
try {
  const result = await liteLLM.completion({...});
} catch (error) {
  // LiteLLM normalizes errors across providers
  if (error.code === 'rate_limit_exceeded') {
    // Handle rate limit
  } else if (error.code === 'authentication_failed') {
    // Handle auth error
  }
}
```

---

## Performance Considerations

### Caching
```typescript
// LiteLLM supports automatic caching
const result = await liteLLM.completion({
  model: 'gpt-4o',
  messages: [...],
  cache: true,  // Enable caching
  cache_ttl: 3600,  // 1 hour
});
```

### Request Batching
```typescript
// Batch multiple requests
const results = await Promise.all([
  liteLLM.completion({ model: 'claude-3-5-sonnet-20241022', messages: [...] }),
  liteLLM.completion({ model: 'gpt-4o', messages: [...] }),
  liteLLM.completion({ model: 'gemini/gemini-2.0-flash-exp', messages: [...] }),
]);
```

### Streaming
```typescript
// All providers support streaming via LiteLLM
const result = await liteLLM.completion({
  model: 'any-model',
  messages: [...],
  stream: true,
  onChunk: (chunk) => console.log(chunk),
});
```

---

## Testing Strategy

### Unit Tests
```typescript
describe('LiteLLMClient', () => {
  it('should route to correct provider', async () => {
    const client = new LiteLLMClient();
    expect(client.getProvider('claude-3-5-sonnet-20241022')).toBe('anthropic');
    expect(client.getProvider('gpt-4o')).toBe('openai');
    expect(client.getProvider('gemini/gemini-2.0-flash-exp')).toBe('google');
  });

  it('should calculate cost correctly', async () => {
    const result = await liteLLM.completion({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(result.cost).toBeGreaterThan(0);
  });
});
```

### Integration Tests
```typescript
describe('Multi-Agent Orchestration', () => {
  it('should use different models for different agents', async () => {
    const orchestrator = new AgentOrchestrator({
      librarian: { model: 'gemini/gemini-2.0-flash-exp' },
      artisan: { model: 'claude-3-5-sonnet-20241022' },
      critic: { model: 'gpt-4.1-mini' },
    });

    const result = await orchestrator.callAgent(AgentRole.ARTISAN, [
      { role: 'user', content: 'Generate a function' },
    ]);

    expect(result.content).toBeTruthy();
  });
});
```

---

## Security Considerations

### API Key Management
```typescript
// Never hardcode API keys
// Use environment variables or secure config
process.env.OPENAI_API_KEY = config.api_keys.openai;
process.env.ANTHROPIC_API_KEY = config.api_keys.anthropic;

// LiteLLM automatically reads from env vars
```

### Request Logging
```yaml
litellm:
  log_requests: true
  log_file: .ralph/litellm.log
  redact_api_keys: true  # Redact API keys from logs
```

---

## Conclusion

LiteLLM provides a clean, unified interface for all LLM providers, enabling the Ralph Loop 2026 architecture with:
- Multi-agent orchestration (Librarian, Artisan, Critic, Chaos)
- Provider-agnostic code
- Automatic fallbacks and retries
- Built-in cost tracking
- Support for 100+ models

**Next Steps:**
1. Install litellm package
2. Implement LiteLLMClient wrapper
3. Refactor existing llm.ts
4. Add multi-agent orchestrator
5. Update configuration schema
6. Test with all providers
7. Update documentation

---

**End of Design Document**
