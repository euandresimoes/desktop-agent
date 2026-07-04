import type { FastifyInstance } from 'fastify';
import { assistantPreferencesService } from './services.ts';
import type { AssistantPreferencesPatch } from './types.ts';

export async function assistantPreferencesRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    const settings = await assistantPreferencesService.getPreferences();

    return {
      ...settings,
      compiledSystemPrompt:
        await assistantPreferencesService.buildSystemPrompt(),
    };
  });

  app.put('/', async (request) => {
    const body = (request.body ?? {}) as AssistantPreferencesPatch;
    const settings = await assistantPreferencesService.updatePreferences(body);

    return {
      ...settings,
      compiledSystemPrompt:
        await assistantPreferencesService.buildSystemPrompt(),
    };
  });
}
