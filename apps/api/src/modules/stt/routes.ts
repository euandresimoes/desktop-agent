import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { sttService } from './services.ts';
import { sendErrorReply } from '../../shared/errors.ts';

export async function sttRoutes(app: FastifyInstance) {
  app.get('/models', async () => {
    return sttService.checkModels();
  });

  app.get('/models/active', async (_request, reply) => {
    const activeModel = await sttService.getActiveModel();

    if (!activeModel) {
      return reply.status(404).send({
        error: 'No active STT model configured',
      });
    }

    return activeModel;
  });

  app.post('/models', async (request, reply) => {
    const body = request.body as {
      id?: string;
      name?: string;
      provider?: 'faster-whisper' | 'transformers' | 'parakeet';

      modelSource?: 'huggingface' | 'local';
      modelPath?: string;

      device?: 'cpu' | 'cuda' | 'auto';
      computeType?: 'int8' | 'int8_float16' | 'float16' | 'float32';

      language?: string;
      beamSize?: number;
      vadFilter?: boolean;
      cpuThreads?: number;
    };

    if (!body.id || !body.name || !body.modelPath || !body.provider) {
      return reply.status(400).send({
        error: 'id, name, provider and modelPath are required',
      });
    }

    try {
      const model = await sttService.addModel({
        id: body.id,
        name: body.name,
        provider: body.provider,
        modelSource: body.modelSource,
        modelPath: body.modelPath,
        device: body.device,
        computeType: body.computeType,
        language: body.language,
        beamSize: body.beamSize,
        vadFilter: body.vadFilter,
        cpuThreads: body.cpuThreads,
      });

      return reply.status(201).send(model);
    } catch (error) {
      return sendErrorReply(request, reply, error, {
        fallbackMessage: 'Failed to add STT model',
        statusCode: 400,
        context: 'stt:add-model',
      });
    }
  });

  app.patch('/models/active', async (request, reply) => {
    const body = request.body as {
      modelId?: string;
    };

    if (!body.modelId) {
      return reply.status(400).send({
        error: 'modelId is required',
      });
    }

    try {
      return await sttService.setActiveModel(body.modelId);
    } catch (error) {
      return sendErrorReply(request, reply, error, {
        fallbackMessage: 'STT model not found',
        statusCode: 404,
        context: 'stt:set-active',
      });
    }
  });

  app.patch('/models/:modelId', async (request, reply) => {
    const params = request.params as {
      modelId: string;
    };

    const body = request.body as {
      name?: string;
      provider?: 'faster-whisper' | 'transformers' | 'parakeet';
      modelPath?: string;
      device?: 'cpu' | 'cuda' | 'auto';
      computeType?: 'int8' | 'int8_float16' | 'float16' | 'float32';
      language?: string;
      beamSize?: number;
      vadFilter?: boolean;
      cpuThreads?: number;
    };

    try {
      return await sttService.updateModel({
        modelId: params.modelId,
        name: body.name,
        provider: body.provider,
        modelPath: body.modelPath,
        device: body.device,
        computeType: body.computeType,
        language: body.language,
        beamSize: body.beamSize,
        vadFilter: body.vadFilter,
        cpuThreads: body.cpuThreads,
      });
    } catch (error) {
      return sendErrorReply(request, reply, error, {
        fallbackMessage: 'Failed to update STT model',
        statusCode: 400,
        context: 'stt:update-model',
      });
    }
  });

  app.delete('/models/:modelId', async (request, reply) => {
    const params = request.params as {
      modelId: string;
    };

    try {
      return await sttService.removeModel(params.modelId);
    } catch (error) {
      return sendErrorReply(request, reply, error, {
        fallbackMessage: 'STT model not found',
        statusCode: 404,
        context: 'stt:remove-model',
      });
    }
  });

  app.post('/transcribe', async (request, reply) => {
    const file = await request.file();

    if (!file) {
      return reply.status(400).send({
        error: 'Audio file is required',
      });
    }

    const extension = path.extname(file.filename) || '.wav';

    const audioPath = path.join(
      os.tmpdir(),
      `${crypto.randomUUID()}${extension}`
    );

    try {
      await pipeline(file.file, await fs.open(audioPath, 'w').then((handle) => handle.createWriteStream()));

      const startedAt = Date.now();

      const result = await sttService.transcribe({
        audioPath,
      });

      return {
        text: result.text,
        language: result.language,
        modelId: result.modelId,
        durationMs: Date.now() - startedAt,
        sttServerDurationMs: result.serverDurationMs,
      };
    } catch (error) {
      return sendErrorReply(request, reply, error, {
        fallbackMessage: 'Failed to transcribe audio',
        context: 'stt:transcribe',
      });
    } finally {
      await fs.rm(audioPath, {
        force: true,
      });
    }
  });
}
