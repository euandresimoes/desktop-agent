import type { FastifyInstance } from 'fastify';
import { appSetupService } from './services.ts';

export async function appSetupRoutes(app: FastifyInstance) {
  app.get('/status', async () => {
    return appSetupService.checkAll();
  });

  app.get('/voices', async () => {
    return appSetupService.checkVoices();
  });

  app.post('/voices', async (rq, rs) => {
    const body = rq.body as any;
    if (!body.id || !body.name || !body.modelTempPath || !body.configTempPath) {
      return rs.status(400).send({ error: 'id, name, modelTempPath and configTempPath are required' });
    }
    try {
      return await appSetupService.addVoice(body);
    } catch (err) {
      return rs.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.patch('/voices/active', async (rq, rs) => {
    const body = rq.body as { voiceId?: string };

    if (!body.voiceId) {
      return rs.status(400).send({ error: 'voiceId is required' });
    }

    return appSetupService.setActiveVoice(body.voiceId);
  });

  app.delete('/voices/:voiceId', async (rq) => {
    const params = rq.params as { voiceId: string };

    return appSetupService.removeVoice(params.voiceId);
  });

  app.patch('/voices/:voiceId', async (rq, rs) => {
    const params = rq.params as { voiceId: string };
    const body = rq.body as {
      name?: string;
      sampleRate?: number;
      lengthScale?: number;
      noiseScale?: number;
      noiseW?: number;
    };

    try {
      return await appSetupService.updateVoice({
        voiceId: params.voiceId,
        ...body,
      });
    } catch (err) {
      return rs.status(404).send({
        error: err instanceof Error ? err.message : 'Voice not found',
      });
    }
  });
}
