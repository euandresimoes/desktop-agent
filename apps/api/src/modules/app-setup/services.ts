import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import type { AddVoiceInput, UpdateVoiceInput, VoiceConfig } from './types.ts';
import { fileExists } from './utils.ts';

const execFileAsync = promisify(execFile);

const userDataPath =
  process.env.USER_DATA_PATH ??
  path.resolve(process.cwd(), '..', '..', 'storage');

const voicesConfigPath = path.join(userDataPath, 'tts-models.json');
const voicesDir = path.join(userDataPath, 'voices');

class AppSetupService {
  async checkPython() {
    try {
      const { stdout, stderr } = await execFileAsync('python', ['--version']);

      return {
        installed: true,
        version: (stdout || stderr).trim(),
      };
    } catch {
      return {
        installed: false,
        version: null,
      };
    }
  }

  async checkPiper() {
    try {
      await execFileAsync('python', ['-c', "import piper; print('ok')"]);

      return {
        installed: true,
        command: 'python -m piper',
      };
    } catch (err) {
      return {
        installed: false,
        command: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async checkVoices() {
    try {
      const file = await fs.readFile(voicesConfigPath, 'utf-8');
      const data = JSON.parse(file) as {
        activeVoiceId: string | null;
        voices: VoiceConfig[];
      };

      const voices = await Promise.all(
        data.voices.map(async (voice) => {
          const modelExists = await fileExists(voice.modelPath);
          const configExists = await fileExists(voice.configPath);

          return {
            ...voice,
            installed: modelExists && configExists,
            modelExists,
            configExists,
          };
        })
      );

      const activeVoice = voices.find(
        (voice) => voice.id === data.activeVoiceId
      );

      return {
        configured: voices.length > 0,
        activeVoiceId: data.activeVoiceId,
        activeVoiceReady: Boolean(activeVoice?.installed),
        voices,
      };
    } catch {
      return {
        configured: false,
        activeVoiceId: null,
        activeVoiceReady: false,
        voices: [],
      };
    }
  }

  async addVoice(input: AddVoiceInput) {
    const voiceId = input.id.trim().toLowerCase().replace(/\s+/g, '-');

    const targetDir = path.join(voicesDir, voiceId);
    const modelPath = path.join(targetDir, 'model.onnx');
    const configPath = path.join(targetDir, 'model.onnx.json');

    await fs.mkdir(targetDir, { recursive: true });

    await fs.copyFile(input.modelTempPath, modelPath);
    await fs.copyFile(input.configTempPath, configPath);

    let data: {
      activeVoiceId: string | null;
      voices: VoiceConfig[];
    };

    try {
      const file = await fs.readFile(voicesConfigPath, 'utf-8');
      data = JSON.parse(file);
    } catch {
      data = {
        activeVoiceId: null,
        voices: [],
      };
    }

    const voice: VoiceConfig = {
      id: voiceId,
      name: input.name,
      modelPath,
      configPath,
      sampleRate: input.sampleRate ?? 22050,
      lengthScale: input.lengthScale ?? 1.0,
      noiseScale: input.noiseScale ?? 0.667,
      noiseW: input.noiseW ?? 0.8,
    };

    data.voices = data.voices.filter((v) => v.id !== voiceId);
    data.voices.push(voice);

    if (!data.activeVoiceId) {
      data.activeVoiceId = voiceId;
    }

    await fs.mkdir(userDataPath, { recursive: true });
    await fs.writeFile(
      voicesConfigPath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );

    return voice;
  }

  async getActiveVoice() {
    const voices = await this.checkVoices();

    const activeVoice = voices.voices.find(
      (v) => v.id === voices.activeVoiceId
    );

    if (!activeVoice || !activeVoice.installed) {
      return null;
    }

    return activeVoice;
  }

  async setActiveVoice(voiceId: string) {
    const file = await fs.readFile(voicesConfigPath, 'utf-8');
    const data = JSON.parse(file) as {
      activeVoiceId: string | null;
      voices: VoiceConfig[];
    };

    const voiceExists = data.voices.some((v) => v.id === voiceId);

    if (!voiceExists) {
      throw new Error('Voice not found');
    }

    data.activeVoiceId = voiceId;

    await fs.writeFile(
      voicesConfigPath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );

    return {
      activeVoiceId: voiceId,
    };
  }

  async removeVoice(voiceId: string) {
    const file = await fs.readFile(voicesConfigPath, 'utf-8');

    const data = JSON.parse(file) as {
      activeVoiceId: string | null;
      voices: VoiceConfig[];
    };

    const voice = data.voices.find((v) => v.id === voiceId);

    if (!voice) {
      throw new Error('Voice not found');
    }

    data.voices = data.voices.filter((v) => v.id !== voiceId);

    if (data.activeVoiceId === voiceId) {
      data.activeVoiceId = data.voices[0]?.id ?? null;
    }

    const voiceDir = path.dirname(voice.modelPath);

    await fs.rm(voiceDir, {
      recursive: true,
      force: true,
    });

    await fs.writeFile(
      voicesConfigPath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );

    return {
      removed: true,
      activeVoiceId: data.activeVoiceId,
    };
  }

  async updateVoice(input: UpdateVoiceInput) {
    const file = await fs.readFile(voicesConfigPath, 'utf-8');

    const data = JSON.parse(file) as {
      activeVoiceId: string | null;
      voices: VoiceConfig[];
    };

    const voiceIndex = data.voices.findIndex((v) => v.id === input.voiceId);

    if (voiceIndex === -1) {
      throw new Error('Voice not found');
    }

    const currentVoice = data.voices[voiceIndex];

    data.voices[voiceIndex] = {
      ...currentVoice,
      name: input.name ?? currentVoice.name,
      sampleRate: input.sampleRate ?? currentVoice.sampleRate,
      lengthScale: input.lengthScale ?? currentVoice.lengthScale,
      noiseScale: input.noiseScale ?? currentVoice.noiseScale,
      noiseW: input.noiseW ?? currentVoice.noiseW,
    };

    await fs.writeFile(
      voicesConfigPath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );

    return data.voices[voiceIndex];
  }

  async checkAll() {
    const python = await this.checkPython();
    const piper = python.installed
      ? await this.checkPiper()
      : { installed: false, command: null, error: null };

    const voices = await this.checkVoices();

    return {
      python,
      piper,
      voices,
      ready: python.installed && piper.installed && voices.activeVoiceReady,
    };
  }
}

export const appSetupService = new AppSetupService();
