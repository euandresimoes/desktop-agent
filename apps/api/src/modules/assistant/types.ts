export type VoiceTurnInput = {
  audioPath: string;
  requestId?: string;
};

export type VoiceTurnOutput = {
  transcript: string;
  responseText: string;

  audio: Buffer;
  audioContentType: 'audio/wav';

  language?: string;
  sttModelId: string;
  llmModelId: string;
  llmModelName: string;

  durationMs: number;
  sttDurationMs: number;
  sttServerDurationMs?: number;
  llmDurationMs: number;
  ttsDurationMs: number;
};

export type VoiceTurnPreparationOutput = {
  transcript: string;
  responseText: string;
  language?: string;
  sttModelId: string;
  llmModelId: string;
  llmModelName: string;
  durationMs: number;
  sttDurationMs: number;
  sttServerDurationMs?: number;
  llmDurationMs: number;
};
