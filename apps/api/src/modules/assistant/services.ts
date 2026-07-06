import { piperTTSService } from '../piper-tts/services.ts';
import { appSetupService } from '../app-setup/services.ts';
import { llmService } from '../llama-cpp/services.ts';
import { sttService } from '../stt/services.ts';
import type {
  VoiceTurnInput,
  VoiceTurnOutput,
  VoiceTurnPreparationOutput,
} from './types.ts';

function toBuffer(value: Buffer | Uint8Array | ArrayBuffer) {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  return Buffer.from(value);
}

function buildTTSSpeakInput(
  activeVoice: {
    id: string;
    modelPath: string;
    configPath: string;
    lengthScale?: number;
    noiseScale?: number;
    noiseW?: number;
  },
  text: string,
  requestId?: string,
) {
  return {
    text,
    requestId,
    voiceId: activeVoice.id,
    modelPath: activeVoice.modelPath,
    configPath: activeVoice.configPath,
    lengthScale: activeVoice.lengthScale,
    noiseScale: activeVoice.noiseScale,
    noiseW: activeVoice.noiseW,
  };
}

class AssistantService {
  async prepareVoiceTurn(
    input: VoiceTurnInput,
  ): Promise<VoiceTurnPreparationOutput> {
    const transcriptOverride = input.transcriptOverride?.trim();
    const sttStartedAt = Date.now();
    const activeSttModel = await sttService.getActiveModel();

    const transcription = transcriptOverride
      ? {
          text: transcriptOverride,
          durationMs: 0,
          serverDurationMs: undefined,
          language: activeSttModel?.language,
          modelId: activeSttModel?.id ?? 'streaming-transcript',
        }
      : await sttService.transcribe({
          audioPath: input.audioPath,
          requestId: input.requestId,
        });

    const sttDurationMs = transcriptOverride
      ? Math.max(0, Math.round(input.sttStreamingDurationMs ?? 0))
      : Date.now() - sttStartedAt;

    console.log({
      module: 'assistant',
      event: 'voice-turn-stt-finished',
      sttMode: input.sttMode ?? 'standard',
      usedTranscriptOverride: Boolean(transcriptOverride),
      sttDurationMs,
      sttServerDurationMs: transcription.serverDurationMs,
      sttModelId: transcription.modelId,
    });

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

    console.log({
      module: 'assistant',
      event: 'voice-turn-llm-finished',
      sttMode: input.sttMode ?? 'standard',
      usedTranscriptOverride: Boolean(transcriptOverride),
      llmDurationMs,
      llmModelId: llmResponse.modelId,
      llmModelName: llmResponse.modelName,
    });

    const responseText = llmResponse.message?.trim();

    if (!responseText) {
      throw new Error('LLM returned empty response');
    }

    const durationMs = transcriptOverride
      ? sttDurationMs + llmDurationMs
      : sttDurationMs + llmDurationMs;

    return {
      transcript,
      responseText,
      language: transcription.language,
      sttModelId: transcription.modelId,
      llmModelId: llmResponse.modelId,
      llmModelName: llmResponse.modelName,
      durationMs,
      sttDurationMs,
      sttServerDurationMs: transcription.serverDurationMs,
      llmDurationMs,
    };
  }

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

    const audio = await piperTTSService.speak(
      buildTTSSpeakInput(activeVoice, text, input.requestId),
    );

    console.log('Assistant TTS took', Date.now() - ttsStartedAt, 'ms');

    return toBuffer(audio);
  }

  async voiceTurn(input: VoiceTurnInput): Promise<VoiceTurnOutput> {
    const activeVoice = await appSetupService.getActiveVoice();

    if (!activeVoice) {
      throw new Error('No active voice configured');
    }
    const prepared = await this.prepareVoiceTurn(input);

    const ttsStartedAt = Date.now();

    const audio = await piperTTSService.speak(
      buildTTSSpeakInput(activeVoice, prepared.responseText, input.requestId),
    );

    const ttsDurationMs = Date.now() - ttsStartedAt;

    console.log({
      module: 'assistant',
      event: 'voice-turn-tts-finished',
      sttMode: input.sttMode ?? 'standard',
      ttsDurationMs,
      voiceId: activeVoice.id,
    });

    return {
      transcript: prepared.transcript,
      responseText: prepared.responseText,

      audio: toBuffer(audio),
      audioContentType: 'audio/wav',

      language: prepared.language,
      sttModelId: prepared.sttModelId,
      llmModelId: prepared.llmModelId,
      llmModelName: prepared.llmModelName,

      durationMs: prepared.durationMs + ttsDurationMs,
      sttDurationMs: prepared.sttDurationMs,
      sttServerDurationMs: prepared.sttServerDurationMs,
      llmDurationMs: prepared.llmDurationMs,
      ttsDurationMs,
    };
  }
}

export const assistantService = new AssistantService();
