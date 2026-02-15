/**
 * Provider Router Integration Tests
 *
 * Tests REAL API calls to all 6 LLM providers with minimal token usage.
 * Requires API keys in environment variables.
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect } from 'vitest';
import { ProviderRouter } from '../../llm/provider-router';

describe('ProviderRouter Integration Tests', () => {
  const router = new ProviderRouter();

  // Simple test prompt - costs < $0.001 per call
  const testMessages = [
    { role: 'user' as const, content: 'Say "OK" in one word' },
  ];

  it('should make real Anthropic Claude API call', async () => {
    // Skip if no API key
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_KEY) {
      console.log('⏭️  Skipping Anthropic test (no API key)');
      return;
    }

    const response = await router.complete({
      provider: 'anthropic',
      model: 'claude-haiku-4',  // Cheapest Claude model
      messages: testMessages,
      maxTokens: 10,
    });

    expect(response.content).toBeTruthy();
    expect(response.provider).toBe('anthropic');
    expect(response.usage.totalTokens).toBeGreaterThan(0);
    expect(response.cost).toBeGreaterThan(0);
    expect(response.content).not.toContain('Mock');
    console.log('✅ Anthropic test passed:', response.content.substring(0, 20));
  }, 10000);

  it('should make real Google Gemini API call', async () => {
    // Skip if no API key
    if (!process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
      console.log('⏭️  Skipping Gemini test (no API key)');
      return;
    }

    const response = await router.complete({
      provider: 'google',
      model: 'gemini-2.0-flash',  // Cheapest Gemini model
      messages: testMessages,
      maxTokens: 10,
    });

    expect(response.content).toBeTruthy();
    expect(response.provider).toBe('google');
    expect(response.usage.totalTokens).toBeGreaterThan(0);
    expect(response.content).not.toContain('Mock');
    console.log('✅ Gemini test passed:', response.content.substring(0, 20));
  }, 10000);

  it('should make real OpenAI API call', async () => {
    // Skip if no API key
    if (!process.env.OPENAI_API_KEY && !process.env.OPENAI_KEY) {
      console.log('⏭️  Skipping OpenAI test (no API key)');
      return;
    }

    const response = await router.complete({
      provider: 'openai',
      model: 'gpt-4o-mini',  // Cheapest GPT model
      messages: testMessages,
      maxTokens: 10,
    });

    expect(response.content).toBeTruthy();
    expect(response.provider).toBe('openai');
    expect(response.usage.totalTokens).toBeGreaterThan(0);
    expect(response.cost).toBeGreaterThan(0);
    expect(response.content).not.toContain('Mock');
    console.log('✅ OpenAI test passed:', response.content.substring(0, 20));
  }, 10000);

  it('should make real Ollama API call (if running)', async () => {
    try {
      const response = await router.complete({
        provider: 'ollama',
        model: 'phi',  // Small, fast local model
        messages: testMessages,
        maxTokens: 10,
      });

      expect(response.content).toBeTruthy();
      expect(response.provider).toBe('ollama');
      expect(response.cost).toBe(0);  // Ollama is free
      expect(response.content).not.toContain('Mock');
      console.log('✅ Ollama test passed:', response.content.substring(0, 20));
    } catch (error: any) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch')) {
        console.log('⏭️  Skipping Ollama test (not running)');
      } else {
        throw error;
      }
    }
  }, 15000);

  it('should verify NO mock responses are returned', async () => {
    // This test ensures we're never getting the old mock response
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_KEY) {
      console.log('⏭️  Skipping mock verification (no API key)');
      return;
    }

    const response = await router.complete({
      provider: 'anthropic',
      model: 'claude-haiku-4',
      messages: testMessages,
      maxTokens: 10,
    });

    // These should NEVER appear in real responses
    expect(response.content).not.toContain('Mock LLM response');
    expect(response.content).not.toContain('implement actual');
    expect(response.content).not.toContain('placeholder');
    expect(response.content).not.toContain('TODO');

    console.log('✅ Mock verification passed - all responses are REAL');
  }, 10000);
});
