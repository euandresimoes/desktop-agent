export type STTModelSource = 'huggingface' | 'local';
export type STTProvider = 'faster-whisper' | 'transformers';

export type STTDevice = 'cpu' | 'cuda' | 'auto';

export type STTComputeType =
  | 'int8'
  | 'int8_float16'
  | 'float16'
  | 'float32';

export type STTModelConfig = {
  id: string;
  name: string;
  provider: STTProvider;

  modelSource: STTModelSource;
  modelPath: string;

  device: STTDevice;
  computeType: STTComputeType;

  language?: string;
  beamSize: number;
  vadFilter: boolean;
};

export type AddSTTModelInput = {
  id: string;
  name: string;
  provider: STTProvider;

  modelSource?: STTModelSource;
  modelPath: string;

  device?: STTDevice;
  computeType?: STTComputeType;

  language?: string;
  beamSize?: number;
  vadFilter?: boolean;
};

export type UpdateSTTModelInput = {
  modelId: string;

  name?: string;
  provider?: STTProvider;
  modelPath?: string;
  device?: STTDevice;
  computeType?: STTComputeType;
  language?: string;
  beamSize?: number;
  vadFilter?: boolean;
};

export type TranscribeInput = {
  audioPath: string;
  requestId?: string;
};

export type TranscribeOutput = {
  text: string;
  durationMs: number;
  serverDurationMs?: number;
  language?: string;
  modelId: string;
};
