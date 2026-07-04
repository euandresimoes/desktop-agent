import { piperTTSService } from '../piper-tts/services.ts';
import { appSetupService } from '../app-setup/services.ts';
import { llmService } from '../llama-cpp/services.ts';
import { sttService } from '../stt/services.ts';
import type { VoiceTurnInput, VoiceTurnOutput } from './types.ts';

function toBuffer(value: Buffer | Uint8Array | ArrayBuffer) {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  return Buffer.from(value);
}

class AssistantService {
  async speak(input: { message: string; requestId?: string }) {
    const activeVoice = await appSetupService.getActiveVoice();

    if (!activeVoice) {
      throw new Error('No active voice configured');
    }

    const llmStartedAt = Date.now();

    const llmResponse = await llmService.chat({
      messages: [
        {
          role: 'user',
          content: input.message,
        },
      ],
    });

    console.log('Assistant LLM took', Date.now() - llmStartedAt, 'ms');

    const text = llmResponse.message?.trim();

    if (!text) {
      throw new Error('LLM returned empty response');
    }

    const ttsStartedAt = Date.now();

    const audio = await piperTTSService.speak({
      text,
      requestId: input.requestId,
      voiceId: activeVoice.id,
      modelPath: activeVoice.modelPath,
      configPath: activeVoice.configPath,
      lengthScale: activeVoice.lengthScale,
      noiseScale: activeVoice.noiseScale,
      noiseW: activeVoice.noiseW,
    });

    console.log('Assistant TTS took', Date.now() - ttsStartedAt, 'ms');

    return toBuffer(audio);
  }

  async voiceTurn(input: VoiceTurnInput): Promise<VoiceTurnOutput> {
    const startedAt = Date.now();

    const activeVoice = await appSetupService.getActiveVoice();

    if (!activeVoice) {
      throw new Error('No active voice configured');
    }

    const sttStartedAt = Date.now();

    const transcription = await sttService.transcribe({
      audioPath: input.audioPath,
      requestId: input.requestId,
    });

    const sttDurationMs = Date.now() - sttStartedAt;

    console.log('Assistant STT took', sttDurationMs, 'ms');

    const transcript = transcription.text.trim();

    if (!transcript) {
      throw new Error('STT returned empty transcript');
    }

    const llmStartedAt = Date.now();

    const llmResponse = await llmService.chat({
      messages: [
        {
          role: 'user',
          content: transcript,
        },
      ],
    });

    const llmDurationMs = Date.now() - llmStartedAt;

    console.log('Assistant LLM took', llmDurationMs, 'ms');

    const responseText = llmResponse.message?.trim();

    if (!responseText) {
      throw new Error('LLM returned empty response');
    }

    const ttsStartedAt = Date.now();

    const audio = await piperTTSService.speak({
      text: responseText,
      requestId: input.requestId,
      voiceId: activeVoice.id,
      modelPath: activeVoice.modelPath,
      configPath: activeVoice.configPath,
      lengthScale: activeVoice.lengthScale,
      noiseScale: activeVoice.noiseScale,
      noiseW: activeVoice.noiseW,
    });

    const ttsDurationMs = Date.now() - ttsStartedAt;

    console.log('Assistant TTS took', ttsDurationMs, 'ms');

    return {
      transcript,
      responseText,

      audio: toBuffer(audio),
      audioContentType: 'audio/wav',

      language: transcription.language,
      sttModelId: transcription.modelId,
      llmModelId: llmResponse.modelId,
      llmModelName: llmResponse.modelName,

      durationMs: Date.now() - startedAt,
      sttDurationMs,
      sttServerDurationMs: transcription.serverDurationMs,
      llmDurationMs,
      ttsDurationMs,
    };
  }
}

export const assistantService = new AssistantService();
