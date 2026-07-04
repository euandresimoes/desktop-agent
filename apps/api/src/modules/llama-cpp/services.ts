import { getLlama, LlamaChatSession, type LlamaModel } from 'node-llama-cpp';
import type { ChatInput } from './types.ts';
import { llmModelService } from '../llm-models/services.ts';
import type { ModelConfig } from '../llm-models/types.ts';
import { assistantPreferencesService } from '../assistant-preferences/services.ts';

class LLMService {
  private loadedModelId: string | null = null;
  private modelPromise: Promise<LlamaModel> | null = null;

  async loadModel() {
    const activeModel = await llmModelService.getActiveModel();

    if (!activeModel) {
      throw new Error('No active model configured');
    }

    if (this.modelPromise && this.loadedModelId === activeModel.id) {
      return {
        model: await this.modelPromise,
        config: activeModel,
      };
    }

    this.loadedModelId = activeModel.id;
    this.modelPromise = this.createModel(activeModel);

    return {
      model: await this.modelPromise,
      config: activeModel,
    };
  }

  async warmup() {
    const startedAt = Date.now();

    const { config } = await this.loadModel();

    console.log({
      module: 'llm',
      event: 'warmup-complete',
      modelId: config.id,
      durationMs: Date.now() - startedAt,
    });
  }

  async warmupActiveModel() {
    const startedAt = Date.now();
    const { config } = await this.loadModel();

    console.log({
      module: 'llm',
      event: 'active-model-warmup-complete',
      modelId: config.id,
      modelName: config.name,
      durationMs: Date.now() - startedAt,
    });

    return {
      modelId: config.id,
      modelName: config.name,
    };
  }

  private async createModel(activeModel: ModelConfig) {
    const llama = await getLlama();

    return llama.loadModel({
      modelPath: activeModel.modelPath,
    });
  }

  private async createSession(model: LlamaModel, activeModel: ModelConfig) {
    const context = await model.createContext({
      contextSize: activeModel.contextSize,
    });

    return new LlamaChatSession({
      contextSequence: context.getSequence(),
    });
  }

  async chat(input: ChatInput) {
    const systemPrompt = await assistantPreferencesService.buildSystemPrompt();
    const conversation = input.messages
      .map((message) => `${message.role.toUpperCase()}: ${message.content.trim()}`)
      .filter((line) => line.length > 0)
      .join('\n\n');

    const message = [systemPrompt, conversation, 'ASSISTANT:']
      .filter((section) => section.trim().length > 0)
      .join('\n\n');

    const { model, config } = await this.loadModel();
    const session = await this.createSession(model, config);

    const response = await session.prompt(message, {
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
      repeatPenalty: {
        penalty: config.repeatPenalty,
      },
    });

    return {
      message: this.cleanResponse(response),
      modelId: config.id,
      modelName: config.name,
    };
  }

  private cleanResponse(text: string) {
    return text
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export const llmService = new LLMService();
