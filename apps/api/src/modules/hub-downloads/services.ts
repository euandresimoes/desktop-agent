import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { llmModelService } from '../llm-models/services.ts';
import { sttService } from '../stt/services.ts';
import { appSetupService } from '../app-setup/services.ts';
import type {
  DownloadJobSnapshot,
  HubModelSearchResponse,
  HubModelSearchResult,
} from './types.ts';
import type { STTProvider } from '../stt/types.ts';

const HUB_API_BASE = 'https://huggingface.co/api';
const HUB_BASE = 'https://huggingface.co';

type HubModelApiResponse = {
  id: string;
  author?: string;
  downloads?: number;
  likes?: number;
  lastModified?: string;
  pipeline_tag?: string;
  siblings?: Array<{
    rfilename: string;
    size?: number;
  }>;
};

type DownloadJobRecord = DownloadJobSnapshot & {
  abortController: AbortController | null;
};

class HubDownloadsService {
  private jobs = new Map<string, DownloadJobRecord>();

  private readonly sttRequiredFiles = [
    'model.bin',
    'config.json',
    'tokenizer.json',
  ] as const;

  private readonly sttOptionalVocabularyFiles = [
    'vocabulary.json',
    'vocabulary.txt',
  ] as const;

  private readonly sttOptionalSupportFiles = [
    'preprocessor_config.json',
  ] as const;

  private readonly transformersProcessorFiles = [
    'preprocessor_config.json',
    'processor_config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'vocab.json',
    'merges.txt',
    'special_tokens_map.json',
  ] as const;

  private isParakeetHint(value: string | null | undefined) {
    return (value ?? '').toLowerCase().includes('parakeet');
  }

  private async fetchRepositoryJsonFile(
    repoId: string,
    fileName: string
  ): Promise<Record<string, unknown> | null> {
    const response = await fetch(
      `${HUB_BASE}/${repoId}/resolve/main/${fileName}?download=true`
    );

    if (!response.ok) {
      return null;
    }

    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private isParakeetConfig(
    config: Record<string, unknown> | null,
    hints: string[]
  ) {
    const configHints = [
      typeof config?.model_type === 'string' ? config.model_type : '',
      typeof config?._name_or_path === 'string' ? config._name_or_path : '',
      ...(Array.isArray(config?.architectures)
        ? config.architectures.filter((value): value is string => typeof value === 'string')
        : []),
    ];

    return [...hints, ...configHints]
      .join(' ')
      .toLowerCase()
      .includes('parakeet');
  }

  async searchModels(input: {
    query: string;
    pipelineTag?: string;
    cursor?: string;
    sort?: string;
    direction?: '1' | '-1';
  }): Promise<HubModelSearchResponse> {
    const trimmedQuery = input.query.trim();

    if (!trimmedQuery) {
      return {
        items: [],
        nextCursor: null,
      };
    }

    const url = new URL(`${HUB_API_BASE}/models`);
    url.searchParams.set('search', trimmedQuery);
    url.searchParams.set('limit', '20');
    url.searchParams.set('full', 'true');

    if (input.pipelineTag && input.pipelineTag !== 'all') {
      url.searchParams.set('pipeline_tag', input.pipelineTag);
    }

    if (input.cursor) {
      url.searchParams.set('cursor', input.cursor);
    }

    if (input.sort?.trim()) {
      url.searchParams.set('sort', input.sort);
    }

    if (input.direction === '1' || input.direction === '-1') {
      url.searchParams.set('direction', input.direction);
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Hugging Face search failed with ${response.status}`);
    }

    const data = (await response.json()) as HubModelApiResponse[];
    const nextCursor = this.extractNextCursor(response.headers.get('link'));

    return {
      items: data.map((item) => this.mapSearchResult(item)),
      nextCursor,
    };
  }

  private extractNextCursor(linkHeader: string | null) {
    if (!linkHeader) {
      return null;
    }

    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/i);

    if (!match) {
      return null;
    }

    const nextUrl = new URL(match[1]);

    return nextUrl.searchParams.get('cursor');
  }

  async searchLlmModels(query: string) {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return [];
    }

    const results = await this.searchModels({
      query: trimmedQuery,
    });

    return results.items;
  }

  createInstallJob(input: {
    type: 'llm' | 'stt' | 'tts';
    repoId: string;
    fileName: string;
    displayName?: string;
    contextSize?: number;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    repeatPenalty?: number;
  }) {
    const jobId = randomUUID();
    const displayName = this.resolveDisplayName({
      repoId: input.repoId,
      fileName: input.fileName,
      type: input.type,
      requestedDisplayName: input.displayName,
    });

    const job: DownloadJobRecord = {
      id: jobId,
      status: 'pending',
      modelType: input.type,
      repoId: input.repoId,
      fileName: input.fileName,
      displayName,
      totalBytes: null,
      downloadedBytes: 0,
      progressPercent: null,
      bytesPerSecond: 0,
      etaSeconds: null,
      startedAt: null,
      finishedAt: null,
      error: null,
      installedModelId: null,
      abortController: new AbortController(),
    };

    this.jobs.set(jobId, job);

    if (input.type === 'llm') {
      void this.runLlmInstall(jobId, {
        ...input,
        type: 'llm',
        displayName,
      });
    } else if (input.type === 'stt') {
      void this.runSttInstall(jobId, {
        repoId: input.repoId,
        fileName: input.fileName,
        displayName,
      });
    } else {
      void this.runTtsInstall(jobId, {
        repoId: input.repoId,
        fileName: input.fileName,
        displayName,
      });
    }

    return this.getJob(jobId);
  }

  getJob(jobId: string) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return null;
    }

    const { abortController: _abortController, ...snapshot } = job;

    return snapshot;
  }

  listJobs() {
    return Array.from(this.jobs.values())
      .map(({ abortController: _abortController, ...snapshot }) => snapshot)
      .sort((a, b) => {
        const aTime = a.startedAt ? Date.parse(a.startedAt) : 0;
        const bTime = b.startedAt ? Date.parse(b.startedAt) : 0;

        return bTime - aTime;
      });
  }

  cancelJob(jobId: string) {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error('Download job not found');
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return this.getJob(jobId);
    }

    console.warn('[hub-downloads] cancelling job', {
      jobId,
      modelType: job.modelType,
      repoId: job.repoId,
      fileName: job.fileName,
    });

    job.abortController?.abort();
    job.status = 'cancelled';
    job.error = 'Cancelled by user';
    job.finishedAt = new Date().toISOString();

    return this.getJob(jobId);
  }

  private markUnexpectedAbort(job: DownloadJobRecord, error: unknown) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'The download was interrupted unexpectedly';

    job.status = 'failed';
    job.error = `Download aborted unexpectedly: ${message}`;
    job.finishedAt = new Date().toISOString();

    console.error('[hub-downloads] unexpected abort', {
      jobId: job.id,
      modelType: job.modelType,
      repoId: job.repoId,
      fileName: job.fileName,
      errorName: error instanceof Error ? error.name : 'unknown',
      errorMessage: message,
    });
  }

  private handleInstallError(job: DownloadJobRecord, error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unexpected download error';
    const wasAborted = error instanceof Error && error.name === 'AbortError';
    const wasExplicitCancellation =
      job.status === 'cancelled' || job.abortController?.signal.aborted === true;

    if (wasAborted && wasExplicitCancellation) {
      job.status = 'cancelled';
      job.error = job.error ?? 'Cancelled by user';
      job.finishedAt = new Date().toISOString();
      return;
    }

    if (wasAborted) {
      this.markUnexpectedAbort(job, error);
      return;
    }

    job.status = 'failed';
    job.error = message;
    job.finishedAt = new Date().toISOString();

    console.error('[hub-downloads] install failed', {
      jobId: job.id,
      modelType: job.modelType,
      repoId: job.repoId,
      fileName: job.fileName,
      errorName: error instanceof Error ? error.name : 'unknown',
      errorMessage: message,
    });
  }

  private mapSearchResult(item: HubModelApiResponse) {
    const files = (item.siblings ?? []).map((sibling) => ({
      fileName: sibling.rfilename,
      fileSizeBytes:
        typeof sibling.size === 'number' && Number.isFinite(sibling.size)
          ? sibling.size
          : null,
    }));

    return {
      id: item.id,
      author: item.author ?? item.id.split('/')[0] ?? 'unknown',
      repoId: item.id,
      downloads: item.downloads ?? 0,
      likes: item.likes ?? 0,
      lastModified: item.lastModified ?? null,
      pipelineTag: item.pipeline_tag ?? null,
      files,
    } satisfies HubModelSearchResult;
  }

  private deriveDisplayNameFromFileName(
    fileName: string,
    type: 'llm' | 'stt' | 'tts'
  ) {
    const extension = path.extname(fileName);
    const baseName =
      type === 'llm'
        ? path.basename(fileName, '.gguf')
        : path.basename(fileName, extension);

    return baseName.replace(/[-_]+/g, ' ').trim() || fileName;
  }

  private isGenericModelDisplayName(value: string) {
    const normalizedValue = value
      .trim()
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, '');

    return new Set([
      '',
      'model',
      'pytorch_model',
      'tf_model',
      'flax_model',
      'voice',
      'audio_model',
    ]).has(normalizedValue);
  }

  private deriveManagedId(
    repoId: string,
    fileName: string,
    type: 'llm' | 'stt' | 'tts'
  ) {
    const repoSegment = repoId.split('/').pop() ?? 'model';
    const extension = path.extname(fileName);
    const fileSegment =
      type === 'llm'
        ? path.basename(fileName, '.gguf')
        : path.basename(fileName, extension);

    return `${repoSegment}-${fileSegment}`
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private resolveDisplayName(input: {
    repoId: string;
    fileName: string;
    type: 'llm' | 'stt' | 'tts';
    requestedDisplayName?: string;
  }) {
    const managedId = this.deriveManagedId(
      input.repoId,
      input.fileName,
      input.type
    );
    const requestedDisplayName = input.requestedDisplayName?.trim() ?? '';

    if (
      requestedDisplayName &&
      !this.isGenericModelDisplayName(requestedDisplayName)
    ) {
      return requestedDisplayName;
    }

    return managedId;
  }

  private async fetchRepositoryFiles(repoId: string) {
    const response = await fetch(`${HUB_API_BASE}/models/${repoId}`);

    if (!response.ok) {
      throw new Error(`Failed to inspect repository files (${response.status})`);
    }

    const payload = (await response.json()) as HubModelApiResponse;

    return (payload.siblings ?? []).map((sibling) => sibling.rfilename);
  }

  private findTtsConfigFile(fileName: string, repoFiles: string[]) {
    const onnxStem = fileName.toLowerCase().endsWith('.onnx')
      ? fileName.slice(0, -'.onnx'.length)
      : fileName;

    const candidates = [
      `${fileName}.json`,
      `${onnxStem}.onnx.json`,
      `${onnxStem}.json`,
      'config.json',
    ];

    return candidates.find((candidate) => repoFiles.includes(candidate)) ?? null;
  }

  private getCompatibleSttBundle(fileName: string, repoFiles: string[]) {
    const normalizedFiles = new Set(
      repoFiles.map((repoFile) => repoFile.replace(/\\/g, '/'))
    );
    const normalizedFileName = fileName.replace(/\\/g, '/');
    const fileDirectory = path.posix.dirname(normalizedFileName);
    const directoryPrefix = fileDirectory === '.'
      ? ''
      : `${fileDirectory}/`;

    if (path.posix.basename(normalizedFileName).toLowerCase() !== 'model.bin') {
      return null;
    }

    const requiredFiles = this.sttRequiredFiles.map((requiredFile) =>
      `${directoryPrefix}${requiredFile}`
    );

    const hasRequiredFiles = requiredFiles.every((requiredFile) =>
      normalizedFiles.has(requiredFile)
    );

    const vocabularyFile = this.sttOptionalVocabularyFiles
      .map((candidate) => `${directoryPrefix}${candidate}`)
      .find((candidate) => normalizedFiles.has(candidate));

    if (!hasRequiredFiles || !vocabularyFile) {
      return null;
    }

    const supportFiles = this.sttOptionalSupportFiles
      .map((candidate) => `${directoryPrefix}${candidate}`)
      .filter((candidate) => normalizedFiles.has(candidate));

    return [...requiredFiles, vocabularyFile, ...supportFiles];
  }

  private detectSttProvider(fileName: string, repoFiles: string[]): STTProvider | null {
    const normalizedFileName = fileName.replace(/\\/g, '/');
    const baseName = path.posix.basename(normalizedFileName).toLowerCase();

    if (baseName === 'model.bin') {
      return this.getCompatibleSttBundle(fileName, repoFiles)
        ? 'faster-whisper'
        : null;
    }

    if (this.getCompatibleSttBundle(fileName, repoFiles)) {
      return 'faster-whisper';
    }

    if (this.getCompatibleTransformersBundle(fileName, repoFiles)) {
      return 'transformers';
    }

    return null;
  }

  private async getCompatibleParakeetBundle(
    repoId: string,
    fileName: string,
    repoFiles: string[]
  ) {
    const normalizedFileName = fileName.replace(/\\/g, '/');
    const baseName = path.posix.basename(normalizedFileName).toLowerCase();
    const supportedWeightFile =
      normalizedFileName.toLowerCase().endsWith('.safetensors') ||
      baseName === 'pytorch_model.bin' ||
      baseName === 'model.bin';

    if (!supportedWeightFile) {
      return null;
    }

    const fileDirectory = path.posix.dirname(normalizedFileName);
    const directoryPrefix = fileDirectory === '.' ? '' : `${fileDirectory}/`;
    const normalizedFiles = new Set(
      repoFiles.map((repoFile) => repoFile.replace(/\\/g, '/'))
    );
    const configFile = `${directoryPrefix}config.json`;

    if (!normalizedFiles.has(configFile)) {
      return null;
    }

    const processorFiles = this.transformersProcessorFiles
      .map((file) => `${directoryPrefix}${file}`)
      .filter((file) => normalizedFiles.has(file));

    if (processorFiles.length === 0) {
      return null;
    }

    const config = await this.fetchRepositoryJsonFile(repoId, configFile);

    if (
      !this.isParakeetConfig(config, [
        repoId,
        fileName,
        ...repoFiles.filter((entry) => this.isParakeetHint(entry)),
      ])
    ) {
      return null;
    }

    return [normalizedFileName, configFile, ...processorFiles];
  }

  private getCompatibleTransformersBundle(fileName: string, repoFiles: string[]) {
    const normalizedFileName = fileName.replace(/\\/g, '/');
    const baseName = path.posix.basename(normalizedFileName).toLowerCase();
    const supportedWeightFile =
      baseName.endsWith('.safetensors') ||
      baseName === 'pytorch_model.bin';

    if (!supportedWeightFile) {
      return null;
    }

    const fileDirectory = path.posix.dirname(normalizedFileName);
    const directoryPrefix = fileDirectory === '.' ? '' : `${fileDirectory}/`;
    const normalizedFiles = new Set(
      repoFiles.map((repoFile) => repoFile.replace(/\\/g, '/'))
    );
    const configFile = `${directoryPrefix}config.json`;

    if (!normalizedFiles.has(configFile)) {
      return null;
    }

    const processorFiles = this.transformersProcessorFiles
      .map((file) => `${directoryPrefix}${file}`)
      .filter((file) => normalizedFiles.has(file));

    if (processorFiles.length === 0) {
      return null;
    }

    return [normalizedFileName, configFile, ...processorFiles];
  }

  private async downloadFileToPath(input: {
    job: DownloadJobRecord;
    downloadUrl: string;
    targetPath: string;
    startedAtMs: number;
    totalBytesOffset?: number;
    totalBytesHint?: number | null;
  }) {
    const response = await fetch(input.downloadUrl, {
      signal: input.job.abortController?.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Model download failed with ${response.status}`);
    }

    const totalBytesHeader = response.headers.get('content-length');
    const fileBytes =
      totalBytesHeader && !Number.isNaN(Number(totalBytesHeader))
        ? Number(totalBytesHeader)
        : null;
    const totalBytes =
      typeof input.totalBytesHint === 'number'
        ? input.totalBytesHint
        : fileBytes === null
          ? null
          : (input.totalBytesOffset ?? 0) + fileBytes;

    await fsPromises.mkdir(path.dirname(input.targetPath), { recursive: true });

    const fileStream = fs.createWriteStream(input.targetPath);
    const reader = response.body.getReader();

    let downloadedBytesForFile = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      await new Promise<void>((resolve, reject) => {
        fileStream.write(Buffer.from(value), (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      downloadedBytesForFile += value.byteLength;
      this.updateJobProgress(
        input.job,
        (input.totalBytesOffset ?? 0) + downloadedBytesForFile,
        totalBytes,
        input.startedAtMs
      );
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.end((error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    return {
      fileBytes,
      downloadedBytes: downloadedBytesForFile,
    };
  }

  private updateJobProgress(job: DownloadJobRecord, downloadedBytes: number, totalBytes: number | null, startedAtMs: number) {
    job.downloadedBytes = downloadedBytes;
    job.totalBytes = totalBytes;

    if (typeof totalBytes === 'number' && totalBytes > 0) {
      job.progressPercent = Math.min(100, (downloadedBytes / totalBytes) * 100);
    } else {
      job.progressPercent = null;
    }

    const elapsedSeconds = Math.max(0.001, (Date.now() - startedAtMs) / 1000);
    job.bytesPerSecond = downloadedBytes / elapsedSeconds;
    job.etaSeconds =
      totalBytes && job.bytesPerSecond > 0
        ? Math.max(0, (totalBytes - downloadedBytes) / job.bytesPerSecond)
        : null;
  }

  private async runLlmInstall(
    jobId: string,
    input: {
      type: 'llm';
      repoId: string;
      fileName: string;
      displayName: string;
      contextSize?: number;
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      topK?: number;
      repeatPenalty?: number;
    }
  ) {
    const job = this.jobs.get(jobId);

    if (!job || !job.abortController) {
      return;
    }

    const startedAtMs = Date.now();
    job.startedAt = new Date(startedAtMs).toISOString();
    job.status = 'downloading';

    const modelId = this.deriveManagedId(input.repoId, input.fileName, 'llm');

    const { targetDir, modelPath } = llmModelService.getManagedPaths(modelId);

    try {
      await fsPromises.mkdir(targetDir, { recursive: true });

      await this.downloadFileToPath({
        job,
        downloadUrl: `${HUB_BASE}/${input.repoId}/resolve/main/${input.fileName}?download=true`,
        targetPath: modelPath,
        startedAtMs,
      });

      job.status = 'installing';

      const registeredModel = await llmModelService.registerModel({
        id: modelId,
        name: input.displayName,
        modelPath,
        contextSize: input.contextSize,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        topP: input.topP,
        topK: input.topK,
        repeatPenalty: input.repeatPenalty,
      });

      job.status = 'completed';
      job.installedModelId = registeredModel.id;
      job.finishedAt = new Date().toISOString();
      job.progressPercent = 100;
      job.etaSeconds = 0;
    } catch (error) {
      this.handleInstallError(job, error);

      await fsPromises.rm(targetDir, {
        recursive: true,
        force: true,
      });
    } finally {
      job.abortController = null;
    }
  }

  private async runSttInstall(
    jobId: string,
    input: {
      repoId: string;
      fileName: string;
      displayName: string;
    }
  ) {
    const job = this.jobs.get(jobId);

    if (!job || !job.abortController) {
      return;
    }

    const repoFiles = await this.fetchRepositoryFiles(input.repoId);
    const fasterWhisperBundle = this.getCompatibleSttBundle(input.fileName, repoFiles);
    const parakeetBundle = await this.getCompatibleParakeetBundle(
      input.repoId,
      input.fileName,
      repoFiles
    );
    const transformersBundle = this.getCompatibleTransformersBundle(
      input.fileName,
      repoFiles
    );
    const bundleFiles = fasterWhisperBundle ?? parakeetBundle ?? transformersBundle;
    const provider =
      fasterWhisperBundle
        ? 'faster-whisper'
        : parakeetBundle
          ? 'parakeet'
          : this.detectSttProvider(input.fileName, repoFiles);

    if (!bundleFiles || !provider) {
      job.status = 'failed';
      job.error =
        'Selected STT file is not compatible with Faster-Whisper, Parakeet or Transformers';
      job.finishedAt = new Date().toISOString();
      job.abortController = null;
      return;
    }

    const startedAtMs = Date.now();
    job.startedAt = new Date(startedAtMs).toISOString();
    job.status = 'downloading';

    const modelId = this.deriveManagedId(input.repoId, input.fileName, 'stt');
    const tempDir = path.join(
      process.env.TEMP ?? path.join(process.cwd(), '.tmp'),
      `hub-stt-${jobId}`
    );

    try {
      let totalBytes: number | null = 0;

      for (const bundleFile of bundleFiles) {
        const headResponse = await fetch(
          `${HUB_BASE}/${input.repoId}/resolve/main/${bundleFile}?download=true`,
          {
            method: 'HEAD',
            signal: job.abortController.signal,
          }
        );

        const fileBytes = Number(headResponse.headers.get('content-length') ?? '');

        if (!Number.isFinite(fileBytes)) {
          totalBytes = null;
          break;
        }

        totalBytes += fileBytes;
      }

      let downloadedBytesOffset = 0;
      const selectedBundleDirectory = path.posix.dirname(input.fileName);
      const localBundleRoot =
        selectedBundleDirectory === '.'
          ? tempDir
          : path.join(tempDir, selectedBundleDirectory.replace(/\//g, path.sep));

      for (const bundleFile of bundleFiles) {
        const targetPath = path.join(
          tempDir,
          bundleFile.replace(/\//g, path.sep)
        );

        const downloadResult = await this.downloadFileToPath({
          job,
          downloadUrl: `${HUB_BASE}/${input.repoId}/resolve/main/${bundleFile}?download=true`,
          targetPath,
          startedAtMs,
          totalBytesOffset: downloadedBytesOffset,
          totalBytesHint: totalBytes,
        });

        downloadedBytesOffset += downloadResult.downloadedBytes;
      }

      job.status = 'installing';

      const registeredModel = await sttService.addLocalModelFromTemp({
        id: modelId,
        name: input.displayName,
        provider,
        modelTempPath: localBundleRoot,
      });

      job.status = 'completed';
      job.installedModelId = registeredModel.id;
      job.finishedAt = new Date().toISOString();
      job.progressPercent = 100;
      job.etaSeconds = 0;
    } catch (error) {
      this.handleInstallError(job, error);
    } finally {
      job.abortController = null;
      await fsPromises.rm(tempDir, {
        recursive: true,
        force: true,
      });
    }
  }

  private async runTtsInstall(
    jobId: string,
    input: {
      repoId: string;
      fileName: string;
      displayName: string;
    }
  ) {
    const job = this.jobs.get(jobId);

    if (!job || !job.abortController) {
      return;
    }

    const startedAtMs = Date.now();
    job.startedAt = new Date(startedAtMs).toISOString();
    job.status = 'downloading';

    const voiceId = this.deriveManagedId(input.repoId, input.fileName, 'tts');
    const tempDir = path.join(
      process.env.TEMP ?? path.join(process.cwd(), '.tmp'),
      `hub-tts-${jobId}`
    );
    const modelTempPath = path.join(tempDir, path.basename(input.fileName));

    try {
      const repoFiles = await this.fetchRepositoryFiles(input.repoId);
      const configFileName = this.findTtsConfigFile(input.fileName, repoFiles);

      if (!configFileName) {
        throw new Error('No compatible TTS config file was found in this repository');
      }

      const modelHead = await fetch(
        `${HUB_BASE}/${input.repoId}/resolve/main/${input.fileName}?download=true`,
        {
          method: 'HEAD',
          signal: job.abortController.signal,
        }
      );
      const configHead = await fetch(
        `${HUB_BASE}/${input.repoId}/resolve/main/${configFileName}?download=true`,
        {
          method: 'HEAD',
          signal: job.abortController.signal,
        }
      );

      const modelBytes = Number(modelHead.headers.get('content-length') ?? '');
      const configBytes = Number(configHead.headers.get('content-length') ?? '');
      const totalBytes =
        Number.isFinite(modelBytes) && Number.isFinite(configBytes)
          ? modelBytes + configBytes
          : null;

      const modelDownload = await this.downloadFileToPath({
        job,
        downloadUrl: `${HUB_BASE}/${input.repoId}/resolve/main/${input.fileName}?download=true`,
        targetPath: modelTempPath,
        startedAtMs,
        totalBytesHint: totalBytes,
      });

      const configTempPath = path.join(tempDir, path.basename(configFileName));

      await this.downloadFileToPath({
        job,
        downloadUrl: `${HUB_BASE}/${input.repoId}/resolve/main/${configFileName}?download=true`,
        targetPath: configTempPath,
        startedAtMs,
        totalBytesOffset: modelDownload.downloadedBytes,
        totalBytesHint: totalBytes,
      });

      job.status = 'installing';

      const registeredVoice = await appSetupService.addVoice({
        id: voiceId,
        name: input.displayName,
        modelTempPath,
        configTempPath,
      });

      job.status = 'completed';
      job.installedModelId = registeredVoice.id;
      job.finishedAt = new Date().toISOString();
      job.progressPercent = 100;
      job.etaSeconds = 0;
    } catch (error) {
      this.handleInstallError(job, error);
    } finally {
      job.abortController = null;
      await fsPromises.rm(tempDir, {
        recursive: true,
        force: true,
      });
    }
  }
}

export const hubDownloadsService = new HubDownloadsService();
