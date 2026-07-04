import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { assistantService } from './services.ts';

export async function assistantRoutes(app: FastifyInstance) {
  app.post('/speak', async (request, reply) => {
    const body = request.body as {
      message?: string;
    };

    const message = body.message?.trim();

    if (!message) {
      return reply.status(400).send({
        error: 'Message is required',
      });
    }

    try {
      const audio = await assistantService.speak({
        message,
      });

      return reply
        .status(200)
        .header('content-type', 'audio/wav')
        .send(audio);
    } catch (error) {
      return reply.status(500).send({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to synthesize assistant speech',
      });
    }
  });

  app.post('/voice-turn', async (request, reply) => {
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

    let fileHandle: fs.FileHandle | null = null;

    try {
      fileHandle = await fs.open(audioPath, 'w');

      await pipeline(
        file.file,
        fileHandle.createWriteStream()
      );

      await fileHandle.close();
      fileHandle = null;

      const result = await assistantService.voiceTurn({
        audioPath,
      });

      const audioBase64 = result.audio.toString('base64');

      console.log({
        module: 'assistant',
        event: 'voice-turn-response',
        llmModelId: result.llmModelId,
        llmModelName: result.llmModelName,
        audioBytes: result.audio.length,
        audioBase64Length: audioBase64.length,
        audioContentType: result.audioContentType,
      });

      return reply.status(200).send({
        type: 'voice_turn',

        transcript: result.transcript,
        responseText: result.responseText,

        audioContentType: result.audioContentType,
        audioBase64,

        language: result.language,
        sttModelId: result.sttModelId,
        llmModelId: result.llmModelId,
        llmModelName: result.llmModelName,

        durationMs: result.durationMs,
        sttDurationMs: result.sttDurationMs,
        sttServerDurationMs: result.sttServerDurationMs,
        llmDurationMs: result.llmDurationMs,
        ttsDurationMs: result.ttsDurationMs,
      });
    } catch (error) {
      return reply.status(500).send({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to process assistant voice turn',
      });
    } finally {
      if (fileHandle) {
        await fileHandle.close().catch(() => undefined);
      }

      await fs.rm(audioPath, {
        force: true,
      });
    }
  });
}
