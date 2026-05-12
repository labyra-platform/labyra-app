/**
 * Anthropic Claude provider implementation.
 * @phase R160-ai-3a
 */
import Anthropic from '@anthropic-ai/sdk';
import { calculateCost } from './cost-calculator';
import type { LLMProvider, LLMStreamEvent, LLMStreamRequest, LLMProviderId } from './types';

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    throw new Error(
      'ANTHROPIC_API_KEY missing or malformed (expected sk-ant-...). Set in .env.local'
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

interface AnthropicSystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
}

function toAnthropicSystem(blocks: LLMStreamRequest['system']): AnthropicSystemBlock[] {
  return blocks.map((b) => {
    const block: AnthropicSystemBlock = { type: 'text', text: b.text };
    if (b.cache) {
      block.cache_control = b.cacheTtl
        ? { type: 'ephemeral', ttl: b.cacheTtl }
        : { type: 'ephemeral' };
    }
    return block;
  });
}

export class AnthropicProvider implements LLMProvider {
  readonly id: LLMProviderId = 'anthropic';
  readonly region = 'us-east-1';

  async *streamChat(request: LLMStreamRequest): AsyncIterable<LLMStreamEvent> {
    try {
      const stream = await getClient().messages.stream({
        model: request.model,
        max_tokens: request.maxTokens ?? 2048,
        temperature: request.temperature,
        system: toAnthropicSystem(request.system),
        messages: request.messages
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text_delta', delta: event.delta.text };
        }
      }

      const final = await stream.finalMessage();
      const u = final.usage;
      const usage = calculateCost(
        request.model,
        u.input_tokens,
        u.output_tokens,
        u.cache_read_input_tokens ?? 0,
        u.cache_creation_input_tokens ?? 0
      );
      yield { type: 'message_complete', usage };
    } catch (e) {
      yield {
        type: 'error',
        message: e instanceof Error ? e.message : 'unknown_anthropic_error'
      };
    }
  }

  async complete(request: LLMStreamRequest) {
    const response = await getClient().messages.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature,
      system: toAnthropicSystem(request.system),
      messages: request.messages
    });

    const block = response.content[0];
    const text = block?.type === 'text' ? block.text : '';
    const u = response.usage;
    const usage = calculateCost(
      request.model,
      u.input_tokens,
      u.output_tokens,
      u.cache_read_input_tokens ?? 0,
      u.cache_creation_input_tokens ?? 0
    );
    return { text, usage };
  }
}
