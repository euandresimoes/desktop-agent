import type { FastifyInstance } from 'fastify';
import { appSetupService } from '../app-setup/services.ts';
import { piperTTSService } from './services.ts';
import { llmService } from '../llama-cpp/services.ts';
import { getTTSCapabilities } from './capabilities.ts';

export async function piperTTSRoutes(app: FastifyInstance) {
  app.get('/capabilities', async () => {
    return getTTSCapabilities({
      provider: 'piper',
      supportsChunkedPostSynthesis: true,
    });
  });

  app.post('/speak', async (rq, rs) => {
    const body = rq.body as { text?: string };

    const text = body.text?.trim();

    if (!text) {
      return rs.status(400).send({
        error: 'Text is required',
      });
    }

    const activeVoice = await appSetupService.getActiveVoice();

    if (!activeVoice) {
      return rs.status(400).send({
        error: 'No active voice configured',
      });
    }

    const message = await llmService.chat({
      messages: [
        {
          role: 'user',
          content: text,
        },
      ],
    });

    const audio = await piperTTSService.speak({
      text: message.message,
      voiceId: activeVoice.id,
      modelPath: activeVoice.modelPath,
      configPath: activeVoice.configPath,
      lengthScale: activeVoice.lengthScale,
      noiseScale: activeVoice.noiseScale,
      noiseW: activeVoice.noiseW,
    });

    return rs.status(200).header('content-type', 'audio/wav').send(audio);
  });
}
