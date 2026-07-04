import fs from 'node:fs/promises';
import path from 'node:path';
import type { AddModelInput, ModelConfig, UpdateModelInput } from './types.ts';
import { fileExists } from '../app-setup/utils.ts';

const userDataPath =
  process.env.USER_DATA_PATH ??
  path.resolve(process.cwd(), '..', '..', 'storage');

const modelsConfigPath = path.join(userDataPath, 'llm-models.json');
const modelsDir = path.join(userDataPath, 'models');

class LLMModelService {
  private async readConfig() {
    try {
      const file = await fs.readFile(modelsConfigPath, 'utf-8');

      return JSON.parse(file) as {
        activeModelId: string | null;
        models: ModelConfig[];
      };
    } catch {
      return {
        activeModelId: null,
        models: [],
      };
    }
  }

  private async writeConfig(data: {
    activeModelId: string | null;
    models: ModelConfig[];
  }) {
    await fs.mkdir(userDataPath, { recursive: true });

    await fs.writeFile(
      modelsConfigPath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
  }

  sanitizeModelId(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, '-');
  }

  getManagedPaths(modelId: string) {
    const normalizedModelId = this.sanitizeModelId(modelId);
    const targetDir = path.join(modelsDir, normalizedModelId);
    const modelPath = path.join(targetDir, 'model.gguf');

    return {
      modelId: normalizedModelId,
      targetDir,
      modelPath,
    };
  }

  private async upsertModelConfig(model: ModelConfig) {
    const data = await this.readConfig();

    data.models = data.models.filter((m) => m.id !== model.id);
    data.models.push(model);

    if (!data.activeModelId) {
      data.activeModelId = model.id;
    }

    await this.writeConfig(data);

    return model;
  }

  async checkModels() {
    const data = await this.readConfig();

    const models = await Promise.all(
      data.models.map(async (model) => {
        const modelExists = await fileExists(model.modelPath);

        return {
          ...model,
          installed: modelExists,
          modelExists,
        };
      })
    );

    const activeModel = models.find(
      (model) => model.id === data.activeModelId
    );

    return {
      configured: models.length > 0,
      activeModelId: data.activeModelId,
      activeModelReady: Boolean(activeModel?.installed),
      models,
    };
  }

  async addModel(input: AddModelInput) {
    const { modelId, targetDir, modelPath } = this.getManagedPaths(input.id);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.copyFile(input.modelTempPath, modelPath);

    const model: ModelConfig = {
      id: modelId,
      name: input.name,
      modelPath,

      contextSize: input.contextSize ?? 1024,
      maxTokens: input.maxTokens ?? 256,
      temperature: input.temperature ?? 0.4,
      topP: input.topP ?? 0.95,
      topK: input.topK ?? 40,
      repeatPenalty: input.repeatPenalty ?? 1.1,
    };

    return this.upsertModelConfig(model);
  }

  async registerModel(input: {
    id: string;
    name: string;
    modelPath: string;
    contextSize?: number;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    repeatPenalty?: number;
  }) {
    const modelId = this.sanitizeModelId(input.id);

    const model: ModelConfig = {
      id: modelId,
      name: input.name,
      modelPath: input.modelPath,
      contextSize: input.contextSize ?? 1024,
      maxTokens: input.maxTokens ?? 256,
      temperature: input.temperature ?? 0.4,
      topP: input.topP ?? 0.95,
      topK: input.topK ?? 40,
      repeatPenalty: input.repeatPenalty ?? 1.1,
    };

    return this.upsertModelConfig(model);
  }

  async getActiveModel() {
    const models = await this.checkModels();

    const activeModel = models.models.find(
      (model) => model.id === models.activeModelId
    );

    if (!activeModel || !activeModel.installed) {
      return null;
    }

    return activeModel;
  }

  async setActiveModel(modelId: string) {
    const data = await this.readConfig();

    const modelExists = data.models.some((model) => model.id === modelId);

    if (!modelExists) {
      throw new Error('Model not found');
    }

    data.activeModelId = modelId;

    await this.writeConfig(data);

    return {
      activeModelId: modelId,
    };
  }

  async updateModel(input: UpdateModelInput) {
    const data = await this.readConfig();

    const modelIndex = data.models.findIndex(
      (model) => model.id === input.modelId
    );

    if (modelIndex === -1) {
      throw new Error('Model not found');
    }

    const currentModel = data.models[modelIndex];

    data.models[modelIndex] = {
      ...currentModel,
      name: input.name ?? currentModel.name,
      contextSize: input.contextSize ?? currentModel.contextSize,
      maxTokens: input.maxTokens ?? currentModel.maxTokens,
      temperature: input.temperature ?? currentModel.temperature,
      topP: input.topP ?? currentModel.topP,
      topK: input.topK ?? currentModel.topK,
      repeatPenalty: input.repeatPenalty ?? currentModel.repeatPenalty,
    };

    await this.writeConfig(data);

    return data.models[modelIndex];
  }

  async removeModel(modelId: string) {
    const data = await this.readConfig();

    const model = data.models.find((m) => m.id === modelId);

    if (!model) {
      throw new Error('Model not found');
    }

    data.models = data.models.filter((m) => m.id !== modelId);

    if (data.activeModelId === modelId) {
      data.activeModelId = data.models[0]?.id ?? null;
    }

    const modelDir = path.dirname(model.modelPath);

    await fs.rm(modelDir, {
      recursive: true,
      force: true,
    });

    await this.writeConfig(data);

    return {
      removed: true,
      activeModelId: data.activeModelId,
    };
  }
}

export const llmModelService = new LLMModelService();
