import type { SpeakInput } from './types.ts';
import { AppError } from '../../shared/errors.ts';

const TTS_SERVER_URL = process.env.TTS_SERVER_URL ?? 'http://127.0.0.1:35422';

export function buildSpeakPayload(
  input: SpeakInput & {
    voiceId?: string;
    modelPath?: string;
    configPath?: string;
  }
) {
  return {
    text: input.text,
    voiceId: input.voiceId,
    provider: 'piper',
    modelPath: input.modelPath,
    configPath: input.configPath,
    lengthScale: input.lengthScale ?? 1.15,
    noiseScale: input.noiseScale ?? 0.667,
    noiseW: input.noiseW ?? 0.8,
  };
}

class PiperTTSService {
  async speak(
    input: SpeakInput & {
      voiceId?: string;
      modelPath?: string;
      configPath?: string;
    }
  ) {
    const response = await fetch(`${TTS_SERVER_URL}/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(input.requestId
          ? {
              'x-request-id': input.requestId,
            }
          : {}),
      },
      body: JSON.stringify(buildSpeakPayload(input)),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let payload:
        | {
            error?: string;
            details?: string | null;
            requestId?: string | null;
            source?: string;
          }
        | null = null;

      try {
        payload = JSON.parse(errorText) as {
          error?: string;
          details?: string | null;
          requestId?: string | null;
          source?: string;
        };
      } catch {
        payload = null;
      }

      const source = payload?.source ? `${payload.source}: ` : '';

      throw new AppError({
        message:
          payload?.error
            ? `${source}${payload.error}`
            : `TTS server failed with ${response.status}`,
        details: payload?.details ?? errorText,
      });
    }

    const arrayBuffer = await response.arrayBuffer();

    return Buffer.from(arrayBuffer);
  }
}

export const piperTTSService = new PiperTTSService();
