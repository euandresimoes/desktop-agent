import type { FastifyInstance } from 'fastify';
import { llmModelService } from './services.ts';
import { llmService } from '../llama-cpp/services.ts';

export async function llmModelRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    return llmModelService.checkModels();
  });

  app.get('/active', async (request, reply) => {
    const activeModel = await llmModelService.getActiveModel();

    if (!activeModel) {
      return reply.status(404).send({
        error: 'No active model configured',
      });
    }

    return activeModel;
  });

  app.post('/', async (request, reply) => {
    const body = request.body as {
      id?: string;
      name?: string;
      modelTempPath?: string;
      contextSize?: number;
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      topK?: number;
      repeatPenalty?: number;
    };

    if (!body.id || !body.name || !body.modelTempPath) {
      return reply.status(400).send({
        error: 'id, name and modelTempPath are required',
      });
    }

    const model = await llmModelService.addModel({
      id: body.id,
      name: body.name,
      modelTempPath: body.modelTempPath,
      contextSize: body.contextSize,
      maxTokens: body.maxTokens,
      temperature: body.temperature,
      topP: body.topP,
      topK: body.topK,
      repeatPenalty: body.repeatPenalty,
    });

    return reply.status(201).send(model);
  });

  app.patch('/active', async (request, reply) => {
    const body = request.body as {
      modelId?: string;
    };

    if (!body.modelId) {
      return reply.status(400).send({
        error: 'modelId is required',
      });
    }

    try {
      const result = await llmModelService.setActiveModel(body.modelId);
      const warmedUp = await llmService.warmupActiveModel();

      return {
        ...result,
        warmedUp,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to activate model';

      return reply.status(message === 'Model not found' ? 404 : 500).send({
        error: error instanceof Error ? error.message : 'Model not found',
      });
    }
  });

  app.post('/active/warmup', async (_request, reply) => {
    try {
      return await llmService.warmupActiveModel();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to warm active model';

      return reply.status(message === 'No active model configured' ? 404 : 500).send({
        error: message,
      });
    }
  });

  app.patch('/:modelId', async (request, reply) => {
    const params = request.params as {
      modelId: string;
    };

    const body = request.body as {
      name?: string;
      contextSize?: number;
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      topK?: number;
      repeatPenalty?: number;
    };

    try {
      return await llmModelService.updateModel({
        modelId: params.modelId,
        name: body.name,
        contextSize: body.contextSize,
        maxTokens: body.maxTokens,
        temperature: body.temperature,
        topP: body.topP,
        topK: body.topK,
        repeatPenalty: body.repeatPenalty,
      });
    } catch (error) {
      return reply.status(404).send({
        error: error instanceof Error ? error.message : 'Model not found',
      });
    }
  });

  app.delete('/:modelId', async (request, reply) => {
    const params = request.params as {
      modelId: string;
    };

    try {
      return await llmModelService.removeModel(params.modelId);
    } catch (error) {
      return reply.status(404).send({
        error: error instanceof Error ? error.message : 'Model not found',
      });
    }
  });
}
