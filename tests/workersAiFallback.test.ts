import { describe, expect, it } from 'vitest';
import {
  convertGeminiPayloadToMessages,
  getAiFallbackMetrics,
  isFallbackKillSwitchOff,
  canUseWorkersAiFallback,
  runWorkersAiFallback,
  WORKERS_AI_FALLBACK_MODEL,
} from '../cloudflare-unified-worker';

describe('Workers AI fallback', () => {
  it('converts a Gemini turn payload into chat messages with system first', () => {
    const payload = {
      systemInstruction: { parts: [{ text: 'You are Frau Klein.' }] },
      contents: [
        { role: 'model', parts: [{ text: 'Hallo! Willkommen.' }] },
        { role: 'user', parts: [{ text: 'Wie hoch ist die Miete?' }] },
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 700 },
    };
    const messages = convertGeminiPayloadToMessages(payload);
    expect(messages).toEqual([
      { role: 'system', content: 'You are Frau Klein.' },
      { role: 'assistant', content: 'Hallo! Willkommen.' },
      { role: 'user', content: 'Wie hoch ist die Miete?' },
    ]);
  });

  it('handles snake_case system_instruction and drops empty parts safely', () => {
    const messages = convertGeminiPayloadToMessages({
      system_instruction: { parts: [{ text: 'sys' }] },
      contents: [{ role: 'user', parts: [{ text: '' }] }],
    });
    expect(messages).toEqual([{ role: 'system', content: 'sys' }]);
  });

  it('kill switch defaults to enabled and honours AI_FALLBACK_ENABLED=0/false/off', () => {
    expect(isFallbackKillSwitchOff({})).toBe(false);
    expect(isFallbackKillSwitchOff({ AI_FALLBACK_ENABLED: '1' })).toBe(false);
    expect(isFallbackKillSwitchOff({ AI_FALLBACK_ENABLED: '0' })).toBe(true);
    expect(isFallbackKillSwitchOff({ AI_FALLBACK_ENABLED: 'false' })).toBe(true);
    expect(isFallbackKillSwitchOff({ AI_FALLBACK_ENABLED: 'off' })).toBe(true);
  });

  it('fallback requires both a binding and an enabled kill switch', () => {
    expect(canUseWorkersAiFallback({ AI: {}, AI_FALLBACK_ENABLED: '1' })).toBe(true);
    expect(canUseWorkersAiFallback({})).toBe(false);
    expect(canUseWorkersAiFallback({ AI: {}, AI_FALLBACK_ENABLED: '0' })).toBe(false);
  });

  it('runWorkersAiFallback throws when the AI binding is missing', async () => {
    await expect(runWorkersAiFallback({ contents: [] }, {})).rejects.toThrow(/binding unavailable/);
  });

  it('serves a turn through the binding, strips think blocks, counts metrics', async () => {
    const before = getAiFallbackMetrics().served;
    const fakeEnv = {
      AI: {
        run: async (_model: string, options: any) => {
          expect(_model).toBe(WORKERS_AI_FALLBACK_MODEL);
          expect(options.max_tokens).toBe(700);
          expect(options.response_format).toEqual({ type: 'json_object' });
          return {
            response: '<think>reasoning here</think>{"reply_de":"Die Miete beträgt 800 Euro.","reply_ar":"الإيجار 800 يورو."}',
          };
        },
      },
    };
    const text = await runWorkersAiFallback(
      {
        systemInstruction: { parts: [{ text: 'sys' }] },
        contents: [{ role: 'user', parts: [{ text: 'Miete?' }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 700 },
      },
      fakeEnv,
    );
    expect(text).not.toContain('<think>');
    expect(text).toContain('Die Miete');
    expect(getAiFallbackMetrics().served).toBe(before + 1);
  });
});
