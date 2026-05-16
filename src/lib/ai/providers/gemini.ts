/**
 * Google Gemini provider — @google/genai SDK (R176-2a migration).
 *
 * Migration from legacy @google/generative-ai@0.24.1:
 * - GoogleGenerativeAI → GoogleGenAI
 * - getGenerativeModel({...}).startChat() → ai.models.generateContentStream({...})
 * - SchemaType → Type
 * - Stream: async iterable directly (no .stream/.response split)
 * - History: Content[] with parts incl. thoughtSignature pass-through (forward-compat Gemini 3)
 * - role='function' for functionResponse → SDK handles via standard 'user' role with functionResponse part
 *
 * Provider abstraction preserved — caller-facing interface unchanged.
 *
 * @phase R176-2a
 */
import {
  type Content,
  type FunctionDeclaration,
  GoogleGenAI,
  type Part,
  type Schema,
  Type
} from '@google/genai';
import { calculateCost } from './cost-calculator';
import type {
  LLMProvider,
  LLMProviderId,
  LLMStreamEvent,
  LLMStreamRequest,
  LLMToolDefinition
} from './types';

let _client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.startsWith('AIza')) {
    throw new Error('GEMINI_API_KEY missing or malformed (expected AIza...). Set in .env.local');
  }
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

function toSystemInstruction(blocks: LLMStreamRequest['system']): string {
  return blocks.map((b) => b.text).join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Message → Content[] history
// ─────────────────────────────────────────────────────────────────────────────
//
// Anthropic block shape (Labyra internal):
//   { type: 'text', text }
//   { type: 'tool_use', id, name, input }
//   { type: 'tool_result', tool_use_id, content }
//
// Gemini @google/genai Content shape:
//   { role: 'user' | 'model', parts: Part[] }
//   Part: { text } | { functionCall: { name, args, id? } } |
//         { functionResponse: { name, response, id? } } |
//         { thoughtSignature } // forward-compat Gemini 3
//
// R174-hotfix3 historical context: legacy SDK rejected functionResponse on
// role='user', requiring role='function'. @google/genai accepts
// functionResponse on standard roles + auto-routes — we keep functionResponse
// parts in their natural role and let SDK handle.
//
// @phase R176-2a

type LabyraBlock = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  thoughtSignature?: string; // forward-compat from prior assistant turn
};

function buildHistory(messages: LLMStreamRequest['messages']): Content[] {
  // Exclude last message — caller sends that as the new turn
  const historicalMessages = messages.slice(0, -1);
  const out: Content[] = [];

  for (const m of historicalMessages) {
    const role: 'user' | 'model' = m.role === 'assistant' ? 'model' : 'user';

    if (typeof m.content === 'string') {
      out.push({ role, parts: [{ text: m.content }] });
      continue;
    }

    const blocks = (m.content ?? []) as LabyraBlock[];
    const parts: Part[] = [];

    for (const b of blocks) {
      if (b.type === 'text' && typeof b.text === 'string') {
        parts.push({ text: b.text });
      } else if (b.type === 'tool_use') {
        const part: Part = {
          functionCall: {
            name: b.name ?? '',
            args: (b.input as Record<string, unknown>) ?? {}
          }
        };
        // Forward-compat: preserve thoughtSignature if we ever store it
        if (b.thoughtSignature) {
          (part as Part & { thoughtSignature?: string }).thoughtSignature = b.thoughtSignature;
        }
        parts.push(part);
      } else if (b.type === 'tool_result') {
        parts.push({
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

    if (parts.length > 0) {
      out.push({ role, parts });
    } else {
      // Empty fallback to keep history non-broken
      out.push({ role, parts: [{ text: '' }] });
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Last message → Content for current turn
// ─────────────────────────────────────────────────────────────────────────────

function buildCurrentTurnParts(content: unknown): Part[] {
  if (typeof content === 'string') {
    return [{ text: content }];
  }
  if (!Array.isArray(content)) {
    return [{ text: String(content ?? '') }];
  }
  const parts: Part[] = [];
  for (const b of content as LabyraBlock[]) {
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
  return parts.length > 0 ? parts : [{ text: '' }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool schema conversion
// ─────────────────────────────────────────────────────────────────────────────

function mapJsonTypeToGemini(type: string): Type {
  switch (type) {
    case 'string':
      return Type.STRING;
    case 'number':
      return Type.NUMBER;
    case 'integer':
      return Type.INTEGER;
    case 'boolean':
      return Type.BOOLEAN;
    case 'array':
      return Type.ARRAY;
    case 'object':
      return Type.OBJECT;
    default:
      return Type.STRING;
  }
}

function toFunctionDeclarations(tools: LLMToolDefinition[]): FunctionDeclaration[] {
  return tools.map((t) => {
    const properties: Record<string, Schema> = {};
    for (const [k, v] of Object.entries(t.parameters.properties)) {
      const prop = v as {
        type: string;
        description: string;
        enum?: string[];
      };
      if (prop.enum && prop.type === 'string') {
        properties[k] = {
          type: Type.STRING,
          format: 'enum',
          description: prop.description,
          enum: prop.enum
        };
      } else {
        properties[k] = {
          type: mapJsonTypeToGemini(prop.type),
          description: prop.description
        };
      }
    }
    return {
      name: t.name,
      description: t.description,
      parameters: {
        type: Type.OBJECT,
        properties,
        required: t.parameters.required ?? []
      }
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export class GeminiProvider implements LLMProvider {
  readonly id: LLMProviderId = 'gemini';
  readonly region = 'global';

  async *streamChat(request: LLMStreamRequest): AsyncIterable<LLMStreamEvent> {
    try {
      const ai = getClient();

      // Build full contents: history + current turn parts
      const history = buildHistory(request.messages);

      // Handle two cases:
      //   (a) toolResults passed separately (post-tool execution from caller)
      //   (b) lastMessage is the current turn
      let currentParts: Part[];
      if (request.toolResults && request.toolResults.length > 0) {
        currentParts = request.toolResults.map<Part>((tr) => ({
          functionResponse: {
            name: tr.toolCallId,
            response: {
              result: tr.result,
              ...(tr.isError ? { error: true } : {})
            }
          }
        }));
      } else {
        const lastMessage = request.messages[request.messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'user') {
          yield { type: 'error', message: 'last_message_must_be_user' };
          return;
        }
        currentParts = buildCurrentTurnParts(lastMessage.content);
      }

      const contents: Content[] = [...history, { role: 'user', parts: currentParts }];

      const tools =
        request.tools && request.tools.length > 0
          ? [{ functionDeclarations: toFunctionDeclarations(request.tools) }]
          : undefined;

      const stream = await ai.models.generateContentStream({
        model: request.model,
        contents,
        config: {
          systemInstruction: toSystemInstruction(request.system),
          maxOutputTokens: request.maxTokens ?? 2048,
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(tools ? { tools } : {})
        }
      });

      yield* this.consumeStream(stream, request.model);
    } catch (e) {
      yield {
        type: 'error',
        message: e instanceof Error ? e.message : 'unknown_gemini_error'
      };
    }
  }

  private async *consumeStream(
    stream: AsyncIterable<{
      text?: string;
      functionCalls?: Array<{
        name?: string;
        args?: Record<string, unknown>;
        id?: string;
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    }>,
    model: string
  ): AsyncIterable<LLMStreamEvent> {
    let inputTokens = 0;
    let outputTokens = 0;
    let toolCallsEmitted = 0;

    for await (const chunk of stream) {
      // Text delta — .text is a string getter in @google/genai
      if (chunk.text) {
        yield { type: 'text_delta', delta: chunk.text };
      }

      // Function calls — array property (not method) in @google/genai
      if (chunk.functionCalls && chunk.functionCalls.length > 0) {
        for (const call of chunk.functionCalls) {
          toolCallsEmitted++;
          yield {
            type: 'tool_use',
            toolCall: {
              id: call.id ?? `gemini-tc-${toolCallsEmitted}`,
              name: call.name ?? '',
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

    const ai = getClient();
    const history = buildHistory(request.messages);
    const currentParts = buildCurrentTurnParts(lastMessage.content);
    const contents: Content[] = [...history, { role: 'user', parts: currentParts }];

    const response = await ai.models.generateContent({
      model: request.model,
      contents,
      config: {
        systemInstruction: toSystemInstruction(request.system),
        maxOutputTokens: request.maxTokens ?? 1024,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {})
      }
    });

    const text = response.text ?? '';
    const meta = response.usageMetadata;
    const usage = calculateCost(
      request.model,
      meta?.promptTokenCount ?? 0,
      meta?.candidatesTokenCount ?? 0
    );
    return { text, usage };
  }
}
