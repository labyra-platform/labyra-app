/**
 * Google Gemini provider — @google/genai SDK.
 *
 * R176-2a: migrated from @google/generative-ai@0.24.1 legacy SDK.
 * R176-2bc-hotfix: extract thoughtSignature from raw candidates[*].content.parts
 *   (not SDK helper .functionCalls which strips signature). Required for
 *   Gemini 3 multi-turn tool calling — sending functionResponse back
 *   without matching thought_signature returns 400 INVALID_ARGUMENT.
 *
 * Provider abstraction preserved — caller-facing interface unchanged.
 *
 * @phase R176-2a → R176-2bc-hotfix
 */
// R176-3d-functionresponse-name
// R189-1-gemini-safety-settings
// R189-2-gemini-cost-telemetry
import {
  type Content,
  type FunctionDeclaration,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
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

// R189-1 (G-5): materials science chứa nhiều keyword "dangerous" hợp pháp
// (thermal runaway, explosive precursor, carcinogen pathway). Default
// BLOCK_MEDIUM_AND_ABOVE block oan câu hỏi nghiên cứu -> nới dangerous_content
// về BLOCK_ONLY_HIGH. Harassment/hate giữ ONLY_HIGH, sexual giữ MEDIUM_AND_ABOVE.
const SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
  }
];

function toSystemInstruction(blocks: LLMStreamRequest['system']): string {
  return blocks.map((b) => b.text).join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Message → Content[] history
// ─────────────────────────────────────────────────────────────────────────────

type LabyraBlock = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  thoughtSignature?: string; // R176-2bc-thought-signature
};

function buildHistory(messages: LLMStreamRequest['messages']): Content[] {
  const historicalMessages = messages.slice(0, -1);
  const out: Content[] = [];

  // R176-3d: map tool_use id -> function name across ALL messages, so a
  // tool_result (which carries only tool_use_id) can resolve the function name
  // that Gemini's functionResponse.name requires. tool_use and tool_result live
  // in separate messages (assistant vs user), so this map must be global.
  const toolNameById = new Map<string, string>();
  for (const m of historicalMessages) {
    if (typeof m.content === 'string') continue;
    for (const b of (m.content ?? []) as LabyraBlock[]) {
      if (b.type === 'tool_use' && b.id && b.name) {
        toolNameById.set(b.id, b.name);
      }
    }
  }

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
        // R176-2bc-thought-signature: attach signature to part if persisted
        const part: Part = {
          functionCall: {
            name: b.name ?? '',
            args: (b.input as Record<string, unknown>) ?? {}
          }
        };
        if (b.thoughtSignature) {
          (part as Part & { thoughtSignature?: string }).thoughtSignature = b.thoughtSignature;
        }
        parts.push(part);
      } else if (b.type === 'tool_result') {
        parts.push({
          functionResponse: {
            // R176-3d: function name (not id) per Gemini spec; fallback to id for old data
            name:
              (b.tool_use_id ? toolNameById.get(b.tool_use_id) : undefined) ?? b.tool_use_id ?? '',
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
      const history = buildHistory(request.messages);

      let currentParts: Part[];
      if (request.toolResults && request.toolResults.length > 0) {
        currentParts = request.toolResults.map<Part>((tr) => ({
          functionResponse: {
            // R176-3d: prefer function name; fallback to id for back-compat
            name: tr.toolName ?? tr.toolCallId,
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
          safetySettings: SAFETY_SETTINGS, // R189-1 (G-5)
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
    // R176-2bc-thought-signature: walk raw candidates[0].content.parts to
    // extract thoughtSignature alongside functionCall. SDK helper
    // chunk.functionCalls strips this field.
    stream: AsyncIterable<{
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            functionCall?: {
              name?: string;
              args?: Record<string, unknown>;
              id?: string;
            };
            thoughtSignature?: string;
          }>;
        };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        cachedContentTokenCount?: number; // R189-2 (G-3): implicit cache
        thoughtsTokenCount?: number; // R189-2 (G-4): Gemini 3 thinking @ output rate
      };
    }>,
    model: string
  ): AsyncIterable<LLMStreamEvent> {
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0; // R189-2 (G-3)
    let thoughtsTokens = 0; // R189-2 (G-4)
    let toolCallsEmitted = 0;

    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (typeof part.text === 'string' && part.text.length > 0) {
          yield { type: 'text_delta', delta: part.text };
        }
        if (part.functionCall) {
          toolCallsEmitted++;
          const fc = part.functionCall;
          yield {
            type: 'tool_use',
            toolCall: {
              id: fc.id ?? `gemini-tc-${toolCallsEmitted}`,
              name: fc.name ?? '',
              input: fc.args ?? {},
              ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {})
            }
          };
        }
      }

      const meta = chunk.usageMetadata;
      if (meta) {
        inputTokens = meta.promptTokenCount ?? inputTokens;
        outputTokens = meta.candidatesTokenCount ?? outputTokens;
        cachedTokens = meta.cachedContentTokenCount ?? cachedTokens;
        thoughtsTokens = meta.thoughtsTokenCount ?? thoughtsTokens;
      }
    }

    // R189-2: Gemini promptTokenCount INCLUDES cached -> subtract to avoid
    // double-count (calculateCost ADDS cacheRead). Thoughts charged at output rate.
    const nonCachedInput = Math.max(0, inputTokens - cachedTokens);
    const usage = calculateCost(model, nonCachedInput, outputTokens + thoughtsTokens, cachedTokens);
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
        safetySettings: SAFETY_SETTINGS, // R189-1 (G-5)
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {})
      }
    });

    const text = response.text ?? '';
    const meta = response.usageMetadata;
    // R189-2 (G-3+G-4): subtract cached from input (Gemini prompt INCLUDES cached),
    // add thoughts to output (charged at output rate).
    const _cached = (meta as { cachedContentTokenCount?: number })?.cachedContentTokenCount ?? 0;
    const _thoughts = (meta as { thoughtsTokenCount?: number })?.thoughtsTokenCount ?? 0;
    const _nonCachedInput = Math.max(0, (meta?.promptTokenCount ?? 0) - _cached);
    const usage = calculateCost(
      request.model,
      _nonCachedInput,
      (meta?.candidatesTokenCount ?? 0) + _thoughts,
      _cached
    );
    return { text, usage };
  }
}
