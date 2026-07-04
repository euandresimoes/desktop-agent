import type { SpeakInput } from './types.ts';

const TTS_SERVER_URL = process.env.TTS_SERVER_URL ?? 'http://127.0.0.1:35422';

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
      },
      body: JSON.stringify({
        text: input.text,
        voiceId: input.voiceId,
        modelPath: input.modelPath,
        configPath: input.configPath,
        lengthScale: input.lengthScale ?? 1.15,
        noiseScale: input.noiseScale ?? 0.667,
        noiseW: input.noiseW ?? 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `TTS server failed with ${response.status}: ${errorText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();

    return Buffer.from(arrayBuffer);
  }
}

export const piperTTSService = new PiperTTSService();
