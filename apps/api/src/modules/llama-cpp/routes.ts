import type { FastifyInstance } from 'fastify';
import { llmService } from './services.ts';

export async function llmRoutes(app: FastifyInstance) {
  app.post('/chat', async (request, reply) => {
    const body = request.body as {
      message?: string;
      messages?: {
        role: 'system' | 'user' | 'assistant';
        content: string;
      }[];
    };

    const messages = body.messages ?? [
      {
        role: 'user',
        content: body.message ?? '',
      },
    ];

    if (!messages.at(-1)?.content?.trim()) {
      return reply.status(400).send({
        error: 'message or messages is required',
      });
    }

    return llmService.chat({ messages });
  });
}