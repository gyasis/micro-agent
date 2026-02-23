/**
 * LiteLLM Provider Router
 *
 * Unified interface to 100+ LLM providers using direct SDKs.
 * Routes requests to Claude (Anthropic), Gemini (Google), GPT (OpenAI),
 * Ollama (local), Azure OpenAI, and Hugging Face.
 *
 * @module llm/provider-router
 */

import { EventEmitter } from 'events';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI, { AzureOpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { HfInference } from '@huggingface/inference';
import ollama from 'ollama';
import { calculateCost } from './cost-calculator';

export interface ProviderConfig {
  provider:
    | 'anthropic'
    | 'google'
    | 'openai'
    | 'ollama'
    | 'azure'
    | 'huggingface';
  model: string;
  apiKey?: string;
  baseUrl?: string; // For Ollama or custom endpoints
  endpoint?: string; // For Azure OpenAI
  deployment?: string; // For Azure OpenAI
  apiVersion?: string; // For Azure OpenAI
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface CompletionRequest {
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionResponse {
  id: string;
  model: string;
  provider: string;
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost?: number; // USD
  finishReason: string;
}

export interface ProviderStats {
  provider: string;
  model: string;
  requestCount: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  errorCount: number;
}

export class ProviderRouter extends EventEmitter {
  private configs: Map<string, ProviderConfig> = new Map();
  private stats: Map<string, ProviderStats> = new Map();
  private requestLatencies: Map<string, number[]> = new Map();

  constructor() {
    super();
  }

  /**
   * Register a provider configuration
   */
  public registerProvider(name: string, config: ProviderConfig): void {
    this.configs.set(name, config);
    this.stats.set(name, {
      provider: config.provider,
      model: config.model,
      requestCount: 0,
      totalTokens: 0,
      totalCost: 0,
      averageLatency: 0,
      errorCount: 0,
    });
    this.requestLatencies.set(name, []);
  }

  /**
   * Send completion request (simplified API - no pre-registration required)
   */
  public async complete(params: {
    provider:
      | 'anthropic'
      | 'google'
      | 'openai'
      | 'ollama'
      | 'azure'
      | 'huggingface';
    model: string;
    messages: Message[];
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    apiKey?: string;
    baseUrl?: string;
    endpoint?: string;
    deployment?: string;
    apiVersion?: string;
  }): Promise<CompletionResponse> {
    // Build config from params
    const config: ProviderConfig = {
      provider: params.provider,
      model: params.model,
      apiKey: params.apiKey || this.getApiKeyFromEnv(params.provider),
      baseUrl: params.baseUrl,
      endpoint: params.endpoint,
      deployment: params.deployment,
      apiVersion: params.apiVersion,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      topP: params.topP,
    };

    const request: CompletionRequest = {
      messages: params.messages,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      topP: params.topP,
    };

    const providerName = `${params.provider}:${params.model}`;

    const startTime = Date.now();
    this.emit('request-start', { provider: providerName, request });

    try {
      // Route to appropriate provider
      const response = await this.routeRequest(config, request);

      // Update stats
      const latency = Date.now() - startTime;
      this.updateStats(providerName, response, latency);

      this.emit('request-success', {
        provider: providerName,
        response,
        latency,
      });

      return response;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.incrementErrorCount(providerName);

      this.emit('request-error', {
        provider: providerName,
        error: String(error),
        latency,
      });

      throw error;
    }
  }

  /**
   * Get API key from environment variables
   */
  private getApiKeyFromEnv(provider: string): string | undefined {
    switch (provider) {
      case 'anthropic':
        return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY;
      case 'google':
        return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      case 'openai':
        return process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
      case 'azure':
        return process.env.AZURE_OPENAI_KEY || process.env.AZURE_OPENAI_API_KEY;
      case 'huggingface':
        return process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;
      case 'ollama':
        return undefined; // Ollama doesn't need an API key
      default:
        return undefined;
    }
  }

  /**
   * Route request to appropriate provider using direct SDKs
   */
  private async routeRequest(
    config: ProviderConfig,
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    switch (config.provider) {
      case 'anthropic':
        return this.callAnthropic(config, request);
      case 'google':
        return this.callGemini(config, request);
      case 'openai':
        return this.callOpenAI(config, request);
      case 'azure':
        return this.callAzureOpenAI(config, request);
      case 'ollama':
        return this.callOllama(config, request);
      case 'huggingface':
        return this.callHuggingFace(config, request);
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  /**
   * Call Anthropic Claude API
   */
  private async callAnthropic(
    config: ProviderConfig,
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    if (!config.apiKey) {
      throw new Error(
        'Anthropic API key required\n→ Fix: Set ANTHROPIC_API_KEY=sk-... in your .env file (copy from https://console.anthropic.com)',
      );
    }

    const client = new Anthropic({ apiKey: config.apiKey });

    // Extract system message if present
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const userMessages = request.messages.filter((m) => m.role !== 'system');

    const response = await client.messages.create({
      model: config.model,
      max_tokens: request.maxTokens ?? config.maxTokens ?? 4096,
      temperature: request.temperature ?? config.temperature ?? 0.7,
      system: systemMessage?.content,
      messages: userMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const content = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as any).text)
      .join('');

    const promptTokens = response.usage.input_tokens;
    const completionTokens = response.usage.output_tokens;
    const totalTokens = promptTokens + completionTokens;

    return {
      id: response.id,
      model: config.model,
      provider: 'anthropic',
      content,
      usage: { promptTokens, completionTokens, totalTokens },
      cost: calculateCost(config.model, promptTokens, completionTokens),
      finishReason: response.stop_reason || 'stop',
    };
  }

  /**
   * Call Google Gemini API
   */
  private async callGemini(
    config: ProviderConfig,
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    if (!config.apiKey) {
      throw new Error(
        'Google API key required\n→ Fix: Set GOOGLE_API_KEY=... or GEMINI_API_KEY=... in your .env file (copy from https://aistudio.google.com/app/apikey)',
      );
    }

    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({ model: config.model });

    // Build conversation history for Gemini
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const conversationMessages = request.messages.filter(
      (m) => m.role !== 'system',
    );

    // Gemini uses 'user' and 'model' roles
    const geminiMessages = conversationMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // If there's a system message, prepend it to the first user message
    if (systemMessage && geminiMessages.length > 0) {
      const firstUserMsg = geminiMessages[0];
      firstUserMsg.parts[0].text = `${systemMessage.content}\n\n${firstUserMsg.parts[0].text}`;
    }

    const chat = model.startChat({
      history: geminiMessages.slice(0, -1), // All but last message
      generationConfig: {
        temperature: request.temperature ?? config.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? config.maxTokens ?? 4096,
        topP: request.topP ?? config.topP,
      },
    });

    // Send the last message
    const lastMessage = geminiMessages[geminiMessages.length - 1];
    const result = await chat.sendMessage(lastMessage.parts[0].text);
    const response = result.response;
    const content = response.text();

    // Gemini usage metadata
    const usageMetadata = response.usageMetadata || {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
    };

    const promptTokens = usageMetadata.promptTokenCount || 0;
    const completionTokens = usageMetadata.candidatesTokenCount || 0;
    const totalTokens =
      usageMetadata.totalTokenCount || promptTokens + completionTokens;

    return {
      id: `gemini-${Date.now()}`,
      model: config.model,
      provider: 'google',
      content,
      usage: { promptTokens, completionTokens, totalTokens },
      cost: calculateCost(config.model, promptTokens, completionTokens),
      finishReason: 'stop',
    };
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(
    config: ProviderConfig,
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    if (!config.apiKey) {
      throw new Error(
        'OpenAI API key required\n→ Fix: Set OPENAI_API_KEY=sk-... in your .env file (copy from https://platform.openai.com/api-keys)',
      );
    }

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });

    const response = await client.chat.completions.create({
      model: config.model,
      messages: request.messages as any,
      temperature: request.temperature ?? config.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? config.maxTokens,
      top_p: request.topP ?? config.topP,
    });

    const choice = response.choices[0];
    const content = choice.message.content || '';

    const promptTokens = response.usage?.prompt_tokens || 0;
    const completionTokens = response.usage?.completion_tokens || 0;
    const totalTokens =
      response.usage?.total_tokens || promptTokens + completionTokens;

    return {
      id: response.id,
      model: config.model,
      provider: 'openai',
      content,
      usage: { promptTokens, completionTokens, totalTokens },
      cost: calculateCost(config.model, promptTokens, completionTokens),
      finishReason: choice.finish_reason || 'stop',
    };
  }

  /**
   * Call Azure OpenAI API
   */
  private async callAzureOpenAI(
    config: ProviderConfig,
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    if (!config.apiKey || !config.endpoint) {
      throw new Error('Azure OpenAI API key and endpoint required');
    }

    const client = new AzureOpenAI({
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      deployment: config.deployment || config.model,
      apiVersion: config.apiVersion || '2024-02-15-preview',
    });

    const response = await client.chat.completions.create({
      model: config.deployment || config.model,
      messages: request.messages as any,
      temperature: request.temperature ?? config.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? config.maxTokens,
      top_p: request.topP ?? config.topP,
    });

    const choice = response.choices[0];
    const content = choice.message.content || '';

    const promptTokens = response.usage?.prompt_tokens || 0;
    const completionTokens = response.usage?.completion_tokens || 0;
    const totalTokens =
      response.usage?.total_tokens || promptTokens + completionTokens;

    return {
      id: response.id,
      model: config.model,
      provider: 'azure',
      content,
      usage: { promptTokens, completionTokens, totalTokens },
      cost: calculateCost(
        `azure/${config.model}`,
        promptTokens,
        completionTokens,
      ),
      finishReason: choice.finish_reason || 'stop',
    };
  }

  /**
   * Call Ollama local API
   */
  private async callOllama(
    config: ProviderConfig,
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    const response = await ollama.chat({
      model: config.model,
      messages: request.messages as any,
      options: {
        temperature: request.temperature ?? config.temperature ?? 0.7,
        num_predict: request.maxTokens ?? config.maxTokens,
        top_p: request.topP ?? config.topP,
      },
    });

    const content = response.message.content;

    // Ollama doesn't provide token counts - estimate based on content length
    const estimatedPromptTokens = Math.ceil(
      request.messages.reduce((sum, m) => sum + m.content.length, 0) / 4,
    );
    const estimatedCompletionTokens = Math.ceil(content.length / 4);
    const totalTokens = estimatedPromptTokens + estimatedCompletionTokens;

    return {
      id: `ollama-${Date.now()}`,
      model: config.model,
      provider: 'ollama',
      content,
      usage: {
        promptTokens: estimatedPromptTokens,
        completionTokens: estimatedCompletionTokens,
        totalTokens,
      },
      cost: 0, // Ollama is free (local)
      finishReason: 'stop',
    };
  }

  /**
   * Call Hugging Face Inference API
   */
  private async callHuggingFace(
    config: ProviderConfig,
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    if (!config.apiKey) {
      throw new Error('Hugging Face API key required');
    }

    const hf = new HfInference(config.apiKey);

    // Combine all messages into a single prompt
    const prompt = request.messages
      .map(
        (m) =>
          `${m.role === 'system' ? 'System' : m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`,
      )
      .join('\n\n');

    const response = await hf.textGeneration({
      model: config.model,
      inputs: prompt,
      parameters: {
        max_new_tokens: request.maxTokens ?? config.maxTokens ?? 512,
        temperature: request.temperature ?? config.temperature ?? 0.7,
        top_p: request.topP ?? config.topP,
        return_full_text: false,
      },
    });

    const content = response.generated_text;

    // Hugging Face doesn't provide token counts - estimate
    const estimatedPromptTokens = Math.ceil(prompt.length / 4);
    const estimatedCompletionTokens = Math.ceil(content.length / 4);
    const totalTokens = estimatedPromptTokens + estimatedCompletionTokens;

    return {
      id: `hf-${Date.now()}`,
      model: config.model,
      provider: 'huggingface',
      content,
      usage: {
        promptTokens: estimatedPromptTokens,
        completionTokens: estimatedCompletionTokens,
        totalTokens,
      },
      cost: 0, // Most HF models are free or have minimal costs
      finishReason: 'stop',
    };
  }

  /**
   * Update provider stats
   */
  private updateStats(
    providerName: string,
    response: CompletionResponse,
    latency: number,
  ): void {
    const stats = this.stats.get(providerName);
    if (!stats) return;

    stats.requestCount++;
    stats.totalTokens += response.usage.totalTokens;
    stats.totalCost += response.cost || 0;

    const latencies = this.requestLatencies.get(providerName) || [];
    latencies.push(latency);
    stats.averageLatency =
      latencies.reduce((sum, l) => sum + l, 0) / latencies.length;

    this.requestLatencies.set(providerName, latencies);
  }

  /**
   * Increment error count
   */
  private incrementErrorCount(providerName: string): void {
    const stats = this.stats.get(providerName);
    if (stats) {
      stats.errorCount++;
    }
  }

  /**
   * Get stats for a provider
   */
  public getStats(providerName: string): ProviderStats | null {
    return this.stats.get(providerName) || null;
  }

  /**
   * Get all provider stats
   */
  public getAllStats(): ProviderStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * Reset stats for a provider
   */
  public resetStats(providerName: string): void {
    const config = this.configs.get(providerName);
    if (!config) return;

    this.stats.set(providerName, {
      provider: config.provider,
      model: config.model,
      requestCount: 0,
      totalTokens: 0,
      totalCost: 0,
      averageLatency: 0,
      errorCount: 0,
    });
    this.requestLatencies.set(providerName, []);
  }
}

/**
 * Factory function to create provider router
 */
export function createProviderRouter(): ProviderRouter {
  return new ProviderRouter();
}
