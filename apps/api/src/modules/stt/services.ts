import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AddSTTModelInput,
  STTModelConfig,
  TranscribeInput,
  TranscribeOutput,
  UpdateSTTModelInput,
} from './types.ts';
import { fileExists } from '../app-setup/utils.ts';

const userDataPath =
  process.env.USER_DATA_PATH ??
  path.resolve(process.cwd(), '..', '..', 'storage');

const STT_SERVER_URL = process.env.STT_SERVER_URL ?? 'http://127.0.0.1:35423';

const sttModelsConfigPath = path.join(userDataPath, 'stt-models.json');
const sttModelsDir = path.join(userDataPath, 'stt-models');

type STTModelsFile = {
  activeModelId: string | null;
  models: STTModelConfig[];
};

type LocalSttValidationResult = {
  valid: boolean;
  resolvedModelPath: string;
  reason?: string;
};

class STTService {
  private readonly bundledModelIds = new Set([
    'tiny',
    'base',
    'small',
    'medium',
    'large-v1',
    'large-v2',
    'large-v3',
    'distil-large-v2',
    'distil-large-v3',
    'turbo',
  ]);

  private async readConfig(): Promise<STTModelsFile> {
    try {
      const file = await fs.readFile(sttModelsConfigPath, 'utf-8');

      return JSON.parse(file) as STTModelsFile;
    } catch {
      return {
        activeModelId: null,
        models: [],
      };
    }
  }

  private async writeConfig(data: STTModelsFile) {
    await fs.mkdir(userDataPath, { recursive: true });

    await fs.writeFile(
      sttModelsConfigPath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
  }

  private normalizeId(id: string) {
    return id.trim().toLowerCase().replace(/\s+/g, '-');
  }

  private async validateLocalModelPath(
    inputPath: string
  ): Promise<LocalSttValidationResult> {
    const trimmedPath = inputPath.trim();

    if (!trimmedPath) {
      return {
        valid: false,
        resolvedModelPath: trimmedPath,
        reason: 'Local STT model path is empty',
      };
    }

    const exists = await fileExists(trimmedPath);

    if (!exists) {
      return {
        valid: false,
        resolvedModelPath: trimmedPath,
        reason: 'Local STT model path does not exist',
      };
    }

    const stats = await fs.stat(trimmedPath);
    const modelDirectory = stats.isDirectory()
      ? trimmedPath
      : path.dirname(trimmedPath);
    const modelFilePath = stats.isDirectory()
      ? path.join(trimmedPath, 'model.bin')
      : trimmedPath;
    const modelFileName = path.basename(modelFilePath).toLowerCase();

    if (modelFileName !== 'model.bin') {
      return {
        valid: false,
        resolvedModelPath: trimmedPath,
        reason:
          'This STT backend only supports Faster-Whisper/CTranslate2 bundles with a model.bin file',
      };
    }

    const [hasModelFile, hasConfig, hasTokenizer, hasPreprocessorConfig] =
      await Promise.all([
        fileExists(modelFilePath),
        fileExists(path.join(modelDirectory, 'config.json')),
        fileExists(path.join(modelDirectory, 'tokenizer.json')),
        fileExists(path.join(modelDirectory, 'preprocessor_config.json')),
      ]);

    if (!hasModelFile || !hasConfig || !hasTokenizer || !hasPreprocessorConfig) {
      return {
        valid: false,
        resolvedModelPath: trimmedPath,
        reason:
          'Incomplete Faster-Whisper bundle. Expected model.bin, config.json, tokenizer.json, and preprocessor_config.json in the same folder',
      };
    }

    return {
      valid: true,
      resolvedModelPath: modelDirectory,
    };
  }

  private async resolveModelSource(
    model: Pick<STTModelConfig, 'modelSource' | 'modelPath'>
  ) {
    if (model.modelSource === 'huggingface') {
      const valid =
        this.bundledModelIds.has(model.modelPath) ||
        model.modelPath.startsWith('Systran/faster-whisper-');

      return {
        valid,
        resolvedModelPath: model.modelPath,
        reason: valid
          ? undefined
          : 'Only official Faster-Whisper model ids or converted repositories are supported',
      };
    }

    return this.validateLocalModelPath(model.modelPath);
  }

  async checkModels() {
    const data = await this.readConfig();

    const models = await Promise.all(
      data.models.map(async (model) => {
        const validation = await this.resolveModelSource(model);
        const modelExists =
          model.modelSource === 'huggingface'
            ? validation.valid
            : await fileExists(model.modelPath);

        return {
          ...model,
          modelPath: validation.valid
            ? validation.resolvedModelPath
            : model.modelPath,
          installed: modelExists && validation.valid,
          modelExists,
          validationError: validation.valid ? null : validation.reason ?? null,
        };
      })
    );

    const activeModel = models.find((model) => model.id === data.activeModelId);

    return {
      configured: models.length > 0,
      activeModelId: data.activeModelId,
      activeModelReady: Boolean(activeModel?.installed),
      models,
    };
  }

  async addModel(input: AddSTTModelInput) {
    const modelId = this.normalizeId(input.id);

    const data = await this.readConfig();

    const model: STTModelConfig = {
      id: modelId,
      name: input.name,

      modelSource: input.modelSource ?? 'huggingface',
      modelPath: input.modelPath,

      device: input.device ?? 'cpu',
      computeType: input.computeType ?? 'int8',

      language: input.language ?? 'pt',
      beamSize: input.beamSize ?? 1,
      vadFilter: input.vadFilter ?? true,
    };

    const sourceValidation = await this.resolveModelSource(model);

    if (!sourceValidation.valid) {
      throw new Error(sourceValidation.reason ?? 'Invalid STT model');
    }

    model.modelPath = sourceValidation.resolvedModelPath;

    data.models = data.models.filter((m) => m.id !== modelId);
    data.models.push(model);

    if (!data.activeModelId) {
      data.activeModelId = modelId;
    }

    await this.writeConfig(data);

    return model;
  }

  async addLocalModelFromTemp(input: {
    id: string;
    name: string;
    modelTempPath: string;
    device?: STTModelConfig['device'];
    computeType?: STTModelConfig['computeType'];
    language?: string;
    beamSize?: number;
    vadFilter?: boolean;
  }) {
    const modelId = this.normalizeId(input.id);

    const targetDir = path.join(sttModelsDir, modelId);
    await fs.mkdir(targetDir, { recursive: true });

    await fs.cp(input.modelTempPath, targetDir, {
      recursive: true,
    });

    return this.addModel({
      id: modelId,
      name: input.name,
      modelSource: 'local',
      modelPath: targetDir,
      device: input.device,
      computeType: input.computeType,
      language: input.language,
      beamSize: input.beamSize,
      vadFilter: input.vadFilter,
    });
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
    const normalizedModelId = this.normalizeId(modelId);

    const data = await this.readConfig();

    const modelExists = data.models.some(
      (model) => model.id === normalizedModelId
    );

    if (!modelExists) {
      throw new Error('STT model not found');
    }

    data.activeModelId = normalizedModelId;

    await this.writeConfig(data);

    return {
      activeModelId: normalizedModelId,
    };
  }

  async updateModel(input: UpdateSTTModelInput) {
    const modelId = this.normalizeId(input.modelId);

    const data = await this.readConfig();

    const modelIndex = data.models.findIndex((model) => model.id === modelId);

    if (modelIndex === -1) {
      throw new Error('STT model not found');
    }

    const currentModel = data.models[modelIndex];

    const updatedModel: STTModelConfig = {
      ...currentModel,

      name: input.name ?? currentModel.name,
      modelPath: input.modelPath ?? currentModel.modelPath,
      device: input.device ?? currentModel.device,
      computeType: input.computeType ?? currentModel.computeType,
      language: input.language ?? currentModel.language,
      beamSize: input.beamSize ?? currentModel.beamSize,
      vadFilter: input.vadFilter ?? currentModel.vadFilter,
    };

    const sourceValidation = await this.resolveModelSource(updatedModel);

    if (!sourceValidation.valid) {
      throw new Error(sourceValidation.reason ?? 'Invalid STT model');
    }

    updatedModel.modelPath = sourceValidation.resolvedModelPath;

    data.models[modelIndex] = updatedModel;

    await this.writeConfig(data);

    return updatedModel;
  }

  async removeModel(modelId: string) {
    const normalizedModelId = this.normalizeId(modelId);

    const data = await this.readConfig();

    const model = data.models.find((m) => m.id === normalizedModelId);

    if (!model) {
      throw new Error('STT model not found');
    }

    data.models = data.models.filter((m) => m.id !== normalizedModelId);

    if (data.activeModelId === normalizedModelId) {
      data.activeModelId = data.models[0]?.id ?? null;
    }

    const managedModelDir = path.join(sttModelsDir, normalizedModelId);

    if (
      model.modelSource === 'local' &&
      model.modelPath.startsWith(sttModelsDir)
    ) {
      await fs.rm(managedModelDir, {
        recursive: true,
        force: true,
      });
    }

    await this.writeConfig(data);

    return {
      removed: true,
      activeModelId: data.activeModelId,
    };
  }

  async transcribe(input: TranscribeInput): Promise<TranscribeOutput> {
    const activeModel = await this.getActiveModel();

    if (!activeModel) {
      throw new Error('No active STT model configured');
    }

    const audioExists = await fileExists(input.audioPath);

    if (!audioExists) {
      throw new Error('Audio file not found');
    }

    const audioBuffer = await fs.readFile(input.audioPath);

    const formData = new FormData();

    formData.append(
      'audio',
      new Blob([new Uint8Array(audioBuffer)], {
        type: 'audio/wav',
      }),
      path.basename(input.audioPath)
    );
    formData.append('modelId', activeModel.id);
    formData.append('modelPath', activeModel.modelPath);
    formData.append('device', activeModel.device);
    formData.append('computeType', activeModel.computeType);
    formData.append('language', activeModel.language);
    formData.append('beamSize', String(activeModel.beamSize ?? 1));
    formData.append('vadFilter', String(activeModel.vadFilter ?? true));

    const startedAt = Date.now();

    const response = await fetch(`${STT_SERVER_URL}/transcribe`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `STT server failed with ${response.status}: ${errorText}`
      );
    }

    const data = (await response.json()) as {
      text?: string;
      durationMs?: number;
      language?: string;
      modelId?: string;
    };

    if (data.modelId && data.modelId !== activeModel.id) {
      throw new Error(
        `STT server used "${data.modelId}" instead of requested "${activeModel.id}"`
      );
    }

    const text = data.text?.trim();

    if (!text) {
      throw new Error('STT server returned empty transcription');
    }

    return {
      text,
      durationMs: Date.now() - startedAt,
      serverDurationMs: data.durationMs,
      language: data.language,
      modelId: data.modelId ?? activeModel.id,
    };
  }
}

export const sttService = new STTService();
