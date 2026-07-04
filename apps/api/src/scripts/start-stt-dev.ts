import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

type STTModelConfig = {
  id: string;
  name: string;

  modelSource: 'huggingface' | 'local';
  modelPath: string;

  device: 'cpu' | 'cuda' | 'auto';
  computeType: 'int8' | 'int8_float16' | 'float16' | 'float32';

  language?: string;
  beamSize: number;
  vadFilter: boolean;
};

type STTModelsFile = {
  activeModelId: string | null;
  models: STTModelConfig[];
};

const userDataPath =
  process.env.USER_DATA_PATH ??
  path.resolve(process.cwd(), '..', '..', 'storage');

const sttModelsConfigPath = path.join(userDataPath, 'stt-models.json');
const sttServerDir = path.resolve(process.cwd(), '..', 'stt-server');

function getPythonPath() {
  if (process.platform === 'win32') {
    return path.join(sttServerDir, '.venv', 'Scripts', 'python.exe');
  }

  return path.join(sttServerDir, '.venv', 'bin', 'python');
}

async function main() {
  const file = await fs.readFile(sttModelsConfigPath, 'utf-8');
  const data = JSON.parse(file) as STTModelsFile;

  const activeModel = data.models.find(
    (model) => model.id === data.activeModelId
  );

  if (!activeModel) {
    throw new Error('No active STT model configured');
  }

  const pythonPath = getPythonPath();

  const child = spawn(
    pythonPath,
    [
      '-m',
      'uvicorn',
      'server:app',
      '--host',
      '127.0.0.1',
      '--port',
      process.env.STT_SERVER_PORT ?? '35423',
    ],
    {
      cwd: sttServerDir,
      stdio: 'inherit',
      env: {
        ...process.env,

        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',

        STT_MODEL_PATH: activeModel.modelPath,
        STT_DEVICE: activeModel.device,
        STT_COMPUTE_TYPE: activeModel.computeType,
        STT_LANGUAGE: activeModel.language ?? 'pt',
        STT_BEAM_SIZE: String(activeModel.beamSize ?? 1),
        STT_VAD_FILTER: String(activeModel.vadFilter ?? true),
        STT_CPU_THREADS: process.env.STT_CPU_THREADS ?? '4',
      },
    }
  );

  child.on('error', (error) => {
    console.error('Failed to start STT server:', error);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});