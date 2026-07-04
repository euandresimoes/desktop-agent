import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const userDataPath =
  process.env.USER_DATA_PATH ??
  path.resolve(process.cwd(), '..', '..', 'storage');

const voicesConfigPath = path.join(userDataPath, 'tts-models.json');
const ttsServerDir = path.resolve(process.cwd(), '..', 'tts-server');

async function main() {
  const file = await fs.readFile(voicesConfigPath, 'utf-8');

  const data = JSON.parse(file) as {
    activeVoiceId: string | null;
    voices: {
      id: string;
      modelPath: string;
      configPath: string;
    }[];
  };

  const activeVoice = data.voices.find(
    (voice) => voice.id === data.activeVoiceId
  );

  if (!activeVoice) {
    throw new Error('No active voice configured');
  }

  const pythonPath = path.join(ttsServerDir, '.venv', 'Scripts', 'python.exe');

  const child = spawn(
    pythonPath,
    ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', '35422'],
    {
      cwd: ttsServerDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        PIPER_MODEL_PATH: activeVoice.modelPath,
        PIPER_CONFIG_PATH: activeVoice.configPath,
      },
    }
  );

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
