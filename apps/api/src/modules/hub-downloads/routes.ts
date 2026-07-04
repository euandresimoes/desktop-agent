import type { FastifyInstance } from 'fastify';
import { hubDownloadsService } from './services.ts';
import { sendErrorReply } from '../../shared/errors.ts';

export async function hubDownloadsRoutes(app: FastifyInstance) {
  app.get('/install', async () => {
    return hubDownloadsService.listJobs();
  });

  app.get('/models', async (request, reply) => {
    const query = request.query as {
      q?: string;
      cursor?: string;
      pipelineTag?: string;
      sort?: string;
      direction?: '1' | '-1';
    };

    if (!query.q?.trim()) {
      return {
        items: [],
        nextCursor: null,
      };
    }

    try {
      return await hubDownloadsService.searchModels({
        query: query.q,
        cursor: query.cursor,
        pipelineTag: query.pipelineTag,
        sort: query.sort,
        direction: query.direction,
      });
    } catch (error) {
      return sendErrorReply(request, reply, error, {
        fallbackMessage: 'Failed to search Hugging Face models',
        context: 'hub:search-models',
      });
    }
  });

  app.post('/install', async (request, reply) => {
    const body = request.body as {
      type?: 'llm' | 'stt' | 'tts';
      repoId?: string;
      fileName?: string;
      displayName?: string;
      contextSize?: number;
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      topK?: number;
      repeatPenalty?: number;
    };

    if (!body.repoId || !body.fileName) {
      return reply.status(400).send({
        error: 'repoId and fileName are required',
      });
    }

    if (!body.type) {
      return reply.status(400).send({
        error: 'type is required',
      });
    }

    const job = hubDownloadsService.createInstallJob({
      type: body.type,
      repoId: body.repoId,
      fileName: body.fileName,
      displayName: body.displayName,
      contextSize: body.contextSize,
      maxTokens: body.maxTokens,
      temperature: body.temperature,
      topP: body.topP,
      topK: body.topK,
      repeatPenalty: body.repeatPenalty,
    });

    return reply.status(202).send(job);
  });

  app.get('/install/:jobId', async (request, reply) => {
    const params = request.params as {
      jobId: string;
    };

    const job = hubDownloadsService.getJob(params.jobId);

    if (!job) {
      return reply.status(404).send({
        error: 'Download job not found',
      });
    }

    return job;
  });

  app.delete('/install/:jobId', async (request, reply) => {
    const params = request.params as {
      jobId: string;
    };

    try {
      return hubDownloadsService.cancelJob(params.jobId);
    } catch (error) {
      return sendErrorReply(request, reply, error, {
        fallbackMessage: 'Download job not found',
        statusCode: 404,
        context: 'hub:cancel-job',
      });
    }
  });
}
