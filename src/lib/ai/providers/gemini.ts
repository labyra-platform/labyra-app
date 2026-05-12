/**
 * Google Gemini provider implementation.
 * Note: Gemini uses different system prompt + cache mechanics — we adapt at the
 * provider boundary so callers see a uniform LLMProvider interface.
 *
 * @phase R160-ai-3a
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { calculateCost } from './cost-calculator';
import type { LLMProvider, LLMStreamEvent, LLMStreamRequest, LLMProviderId } from './types';

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

/** Gemini doesn't have a separate 'system' parameter — concatenate into systemInstruction */
function toGeminiSystemInstruction(blocks: LLMStreamRequest['system']): string {
  return blocks.map((b) => b.text).join('\n\n');
}

/** Gemini 'history' is messages excluding the latest user message */
function toGeminiHistory(messages: LLMStreamRequest['messages']) {
  const all = messages.slice(0, -1);
  return all.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
}

export class GeminiProvider implements LLMProvider {
  readonly id: LLMProviderId = 'gemini';
  readonly region = 'global';

  async *streamChat(request: LLMStreamRequest): AsyncIterable<LLMStreamEvent> {
    try {
      const lastMessage = request.messages[request.messages.length - 1];
      if (!lastMessage || lastMessage.role !== 'user') {
        yield { type: 'error', message: 'last_message_must_be_user' };
        return;
      }

      const model = getClient().getGenerativeModel({
        model: request.model,
        systemInstruction: toGeminiSystemInstruction(request.system)
      });

      const chat = model.startChat({
        history: toGeminiHistory(request.messages),
        generationConfig: {
          maxOutputTokens: request.maxTokens ?? 2048,
          temperature: request.temperature
        }
      });

      const result = await chat.sendMessageStream(lastMessage.content);

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          yield { type: 'text_delta', delta: text };
        }
        const meta = chunk.usageMetadata;
        if (meta) {
          inputTokens = meta.promptTokenCount ?? inputTokens;
          outputTokens = meta.candidatesTokenCount ?? outputTokens;
        }
      }

      // Final usage metadata
      const final = await result.response;
      const meta = final.usageMetadata;
      if (meta) {
        inputTokens = meta.promptTokenCount ?? inputTokens;
        outputTokens = meta.candidatesTokenCount ?? outputTokens;
      }

      const usage = calculateCost(request.model, inputTokens, outputTokens);
      yield { type: 'message_complete', usage };
    } catch (e) {
      yield {
        type: 'error',
        message: e instanceof Error ? e.message : 'unknown_gemini_error'
      };
    }
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
      history: toGeminiHistory(request.messages),
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
