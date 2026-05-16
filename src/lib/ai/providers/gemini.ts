/**
 * Google Gemini provider — with function calling.
 * @phase R160-ai-3c1
 */
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { calculateCost } from './cost-calculator';
import type {
  LLMProvider,
  LLMStreamEvent,
  LLMStreamRequest,
  LLMProviderId,
  LLMToolDefinition
} from './types';

let _client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.startsWith('AIza')) {
    throw new Error('GEMINI_API_KEY missing or malformed (expected AIza...). Set in .env.local');
  }
  _client = new GoogleGenerativeAI(apiKey);
  return _client;
}

function toGeminiSystemInstruction(blocks: LLMStreamRequest['system']): string {
  return blocks.map((b) => b.text).join('\n\n');
}

function toGeminiHistory(messages: LLMStreamRequest['messages']): unknown[] {
  const all = messages.slice(0, -1);
  type Block = {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
    tool_use_id?: string;
    content?: unknown;
  };
  // R174-hotfix3: split each message into separate entries by part type.
  // Gemini 2.5+ rejects role='user' containing functionResponse parts; they
  // must be on role='function' (or a separate user message). Splitting also
  // keeps order intact.
  const out: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];
  for (const m of all) {
    const baseRole = m.role === 'assistant' ? 'model' : 'user';
    if (typeof m.content === 'string') {
      out.push({ role: baseRole, parts: [{ text: m.content }] });
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks = m.content as any as Block[];
    const textParts: Array<Record<string, unknown>> = [];
    const toolUseParts: Array<Record<string, unknown>> = [];
    const toolResultParts: Array<Record<string, unknown>> = [];
    for (const b of blocks) {
      if (b.type === 'text' && typeof b.text === 'string') {
        textParts.push({ text: b.text });
      } else if (b.type === 'tool_use') {
        toolUseParts.push({
          functionCall: {
            name: b.name ?? '',
            args: (b.input as object) ?? {}
          }
        });
      } else if (b.type === 'tool_result') {
        toolResultParts.push({
          functionResponse: {
            name: b.tool_use_id ?? '',
            response:
              typeof b.content === 'string'
                ? { result: b.content }
                : { result: JSON.stringify(b.content ?? {}) }
          }
        });
      }
    }
    // Emit text + toolUse on baseRole (typically 'model' if assistant)
    const combinedAssistant = [...textParts, ...toolUseParts];
    if (combinedAssistant.length > 0) {
      out.push({ role: baseRole, parts: combinedAssistant });
    }
    // Emit toolResult on role='function' (Gemini 2.5+ requirement)
    if (toolResultParts.length > 0) {
      out.push({ role: 'function', parts: toolResultParts });
    }
    if (combinedAssistant.length === 0 && toolResultParts.length === 0) {
      out.push({ role: baseRole, parts: [{ text: '' }] });
    }
  }
  return out;
}

function mapJsonSchemaTypeToGemini(type: string): SchemaType {
  switch (type) {
    case 'string':
      return SchemaType.STRING;
    case 'number':
      return SchemaType.NUMBER;
    case 'integer':
      return SchemaType.INTEGER;
    case 'boolean':
      return SchemaType.BOOLEAN;
    case 'array':
      return SchemaType.ARRAY;
    case 'object':
      return SchemaType.OBJECT;
    default:
      return SchemaType.STRING;
  }
}

function toGeminiTools(tools: LLMToolDefinition[]) {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: {
          type: SchemaType.OBJECT,
          properties: Object.fromEntries(
            Object.entries(t.parameters.properties).map(([k, v]) => {
              const prop = v as { type: string; description: string; enum?: string[] };
              if (prop.enum && prop.type === 'string') {
                return [
                  k,
                  {
                    type: SchemaType.STRING,
                    format: 'enum' as const,
                    description: prop.description,
                    enum: prop.enum
                  }
                ];
              }
              return [
                k,
                {
                  type: mapJsonSchemaTypeToGemini(prop.type),
                  description: prop.description
                }
              ];
            })
          ),
          required: t.parameters.required ?? []
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any
    }
  ];
}

export class GeminiProvider implements LLMProvider {
  readonly id: LLMProviderId = 'gemini';
  readonly region = 'global';

  async *streamChat(request: LLMStreamRequest): AsyncIterable<LLMStreamEvent> {
    try {
      // Tool results: must be sent as functionResponse parts in user turn
      if (request.toolResults && request.toolResults.length > 0) {
        const model = getClient().getGenerativeModel({
          model: request.model,
          systemInstruction: toGeminiSystemInstruction(request.system),
          ...(request.tools && request.tools.length > 0
            ? { tools: toGeminiTools(request.tools) }
            : {})
        });

        const chat = model.startChat({
          history: toGeminiHistory(request.messages) as never
        });

        const functionResponses = request.toolResults.map((tr) => ({
          functionResponse: {
            name: tr.toolCallId, // Gemini uses name, we stored name in id
            response: {
              result: tr.result,
              ...(tr.isError ? { error: true } : {})
            }
          }
        }));

        const result = await chat.sendMessageStream(functionResponses);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK third-party type mismatch
        yield* this.consumeGeminiStream(result as any, request.model);
        return;
      }

      const lastMessage = request.messages[request.messages.length - 1];
      if (!lastMessage || lastMessage.role !== 'user') {
        yield { type: 'error', message: 'last_message_must_be_user' };
        return;
      }

      const model = getClient().getGenerativeModel({
        model: request.model,
        systemInstruction: toGeminiSystemInstruction(request.system),
        ...(request.tools && request.tools.length > 0
          ? { tools: toGeminiTools(request.tools) }
          : {})
      });

      const chat = model.startChat({
        history: toGeminiHistory(request.messages) as never,
        generationConfig: {
          maxOutputTokens: request.maxTokens ?? 2048,
          temperature: request.temperature
        }
      });

      // R160-ai-5e-2: lastMessage.content may be block array (user with tool_result blocks).
      // Convert blocks → Gemini parts before sending. block_array_in_last_message.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastContent: any = lastMessage.content;
      let sendPayload: unknown;
      if (typeof lastContent === 'string') {
        sendPayload = lastContent;
      } else if (Array.isArray(lastContent)) {
        const parts: Array<Record<string, unknown>> = [];
        for (const b of lastContent) {
          if (b?.type === 'tool_result') {
            parts.push({
              functionResponse: {
                name: b.tool_use_id ?? '',
                response:
                  typeof b.content === 'string'
                    ? { result: b.content }
                    : { result: JSON.stringify(b.content ?? {}) }
              }
            });
          } else if (b?.type === 'text' && typeof b.text === 'string') {
            parts.push({ text: b.text });
          }
        }
        sendPayload = parts.length > 0 ? parts : '';
      } else {
        sendPayload = String(lastContent ?? '');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await chat.sendMessageStream(sendPayload as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK third-party type mismatch
      yield* this.consumeGeminiStream(result as any, request.model);
    } catch (e) {
      yield {
        type: 'error',
        message: e instanceof Error ? e.message : 'unknown_gemini_error'
      };
    }
  }

  private async *consumeGeminiStream(
    result: {
      stream: AsyncIterable<{
        text: () => string;
        functionCalls?: () => Array<{ name: string; args: Record<string, unknown> }> | undefined;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      }>;
      response: Promise<{
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        functionCalls?: () => Array<{ name: string; args: Record<string, unknown> }> | undefined;
      }>;
    },
    model: string
  ): AsyncIterable<LLMStreamEvent> {
    let inputTokens = 0;
    let outputTokens = 0;
    let toolCallsEmitted = 0;

    for await (const chunk of result.stream) {
      // Text deltas
      const text = chunk.text?.();
      if (text) {
        yield { type: 'text_delta', delta: text };
      }

      // Function calls
      const calls = chunk.functionCalls?.();
      if (calls && calls.length > 0) {
        for (const call of calls) {
          toolCallsEmitted++;
          yield {
            type: 'tool_use',
            toolCall: {
              id: `gemini-tc-${toolCallsEmitted}`,
              name: call.name,
              input: call.args ?? {}
            }
          };
        }
      }

      const meta = chunk.usageMetadata;
      if (meta) {
        inputTokens = meta.promptTokenCount ?? inputTokens;
        outputTokens = meta.candidatesTokenCount ?? outputTokens;
      }
    }

    const final = await result.response;
    const meta = final.usageMetadata;
    if (meta) {
      inputTokens = meta.promptTokenCount ?? inputTokens;
      outputTokens = meta.candidatesTokenCount ?? outputTokens;
    }

    const usage = calculateCost(model, inputTokens, outputTokens);
    yield {
      type: 'message_complete',
      usage,
      stopReason: toolCallsEmitted > 0 ? 'tool_use' : 'end_turn'
    };
  }

  async complete(request: LLMStreamRequest) {
    const lastMessage = request.messages[request.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      throw new Error('last_message_must_be_user');
    }

    const model = getClient().getGenerativeModel({
      model: request.model,
      systemInstruction: toGeminiSystemInstruction(request.system)
    });

    const chat = model.startChat({
      history: toGeminiHistory(request.messages) as never,
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 1024,
        temperature: request.temperature
      }
    });

    const result = await chat.sendMessage(lastMessage.content);
    const text = result.response.text();
    const meta = result.response.usageMetadata;
    const usage = calculateCost(
      request.model,
      meta?.promptTokenCount ?? 0,
      meta?.candidatesTokenCount ?? 0
    );
    return { text, usage };
  }
}
