export type ModelConfig = {
  id: string;
  name: string;
  modelPath: string;

  contextSize: number;
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
};

export type AddModelInput = {
  id: string;
  name: string;
  modelTempPath: string;

  contextSize?: number;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
};

export type UpdateModelInput = {
  modelId: string;
  name?: string;
  contextSize?: number;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
};