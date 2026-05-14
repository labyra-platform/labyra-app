/**
 * Anthropic Claude provider — with tool calling.
 * @phase R160-ai-3c1
 */
import Anthropic from '@anthropic-ai/sdk';
import { calculateCost } from './cost-calculator';
import type {
  LLMProvider,
  LLMStreamEvent,
  LLMStreamRequest,
  LLMProviderId,
  LLMToolDefinition
} from './types';

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

function toAnthropicTools(tools: LLMToolDefinition[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters
  }));
}

/** Build Anthropic messages array including tool_use + tool_result blocks */
function buildAnthropicMessages(request: LLMStreamRequest) {
  // If toolResults supplied, attach to the last assistant message as tool_result blocks
  // The caller is responsible for including the assistant tool_use turn in messages.
  if (request.toolResults && request.toolResults.length > 0) {
    return [
      ...request.messages,
      {
        role: 'user' as const,
        content: request.toolResults.map((tr) => ({
          type: 'tool_result' as const,
          tool_use_id: tr.toolCallId,
          content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
          is_error: tr.isError ?? false
        }))
      }
    ];
  }
  return request.messages;
}

export class AnthropicProvider implements LLMProvider {
  readonly id: LLMProviderId = 'anthropic';
  readonly region = 'us-east-1';

  async *streamChat(request: LLMStreamRequest): AsyncIterable<LLMStreamEvent> {
    try {
      const messages = buildAnthropicMessages(request);
      const params: Record<string, unknown> = {
        model: request.model,
        max_tokens: request.maxTokens ?? 2048,
        temperature: request.temperature,
        system: toAnthropicSystem(request.system),
        messages
      };
      if (request.tools && request.tools.length > 0) {
        params.tools = toAnthropicTools(request.tools);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK third-party type mismatch
      const stream = await getClient().messages.stream(params as any);

      // Accumulate tool_use blocks (they arrive across multiple events)
      const toolUseBuffer: Map<number, { id: string; name: string; jsonStr: string }> = new Map();

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          const block = event.content_block;
          if (block.type === 'tool_use') {
            toolUseBuffer.set(event.index, {
              id: block.id,
              name: block.name,
              jsonStr: ''
            });
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text_delta', delta: event.delta.text };
          } else if (event.delta.type === 'input_json_delta') {
            const buf = toolUseBuffer.get(event.index);
            if (buf) buf.jsonStr += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          const buf = toolUseBuffer.get(event.index);
          if (buf) {
            let parsed: Record<string, unknown> = {};
            try {
              parsed = buf.jsonStr ? JSON.parse(buf.jsonStr) : {};
            } catch {
              parsed = { _parseError: buf.jsonStr };
            }
            yield {
              type: 'tool_use',
              toolCall: { id: buf.id, name: buf.name, input: parsed }
            };
            toolUseBuffer.delete(event.index);
          }
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
      const stopReason =
        final.stop_reason === 'tool_use'
          ? 'tool_use'
          : final.stop_reason === 'max_tokens'
            ? 'max_tokens'
            : 'end_turn';
      yield { type: 'message_complete', usage, stopReason };
    } catch (e) {
      yield {
        type: 'error',
        message: e instanceof Error ? e.message : 'unknown_anthropic_error'
      };
    }
  }

  async complete(request: LLMStreamRequest) {
    const messages = buildAnthropicMessages(request);
    const params: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature,
      system: toAnthropicSystem(request.system),
      messages
    };
    if (request.tools && request.tools.length > 0) {
      params.tools = toAnthropicTools(request.tools);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK third-party type mismatch
    const response = await getClient().messages.create(params as any);

    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock?.type === 'text' ? textBlock.text : '';
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
