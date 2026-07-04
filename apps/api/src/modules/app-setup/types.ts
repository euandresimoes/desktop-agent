export type VoiceConfig = {
  id: string;
  name: string;
  modelPath: string;
  configPath: string;
  sampleRate: number;
  lengthScale: number;
  noiseScale: number;
  noiseW: number;
};

export type AddVoiceInput = {
  id: string;
  name: string;
  modelTempPath: string;
  configTempPath: string;
  sampleRate?: number;
  lengthScale?: number;
  noiseScale?: number;
  noiseW?: number;
};

export type UpdateVoiceInput = {
  voiceId: string;
  name?: string;
  sampleRate?: number;
  lengthScale?: number;
  noiseScale?: number;
  noiseW?: number;
};
