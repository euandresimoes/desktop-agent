import { computed, ref } from "vue";
import { fetchJsonOrThrow } from "../utils/http";

const API_BASE = "http://localhost:35421/api/v1";
const dispatchModelsUpdated = () => {
  window.dispatchEvent(new Event("models-library-updated"));
  window.dispatchEvent(new Event("refresh-status"));
};

export type HubModelType = "llm" | "stt" | "tts";
export type HubSearchSortOption = "featured" | "downloads" | "likes" | "updated" | "newest";

export interface HubFileOption {
  fileName: string;
  fileSizeBytes: number | null;
}

export interface HubModelSearchResult {
  id: string;
  author: string;
  repoId: string;
  downloads: number;
  likes: number;
  lastModified: string | null;
  pipelineTag: string | null;
  files: HubFileOption[];
}

export interface HubSearchResponse {
  items: HubModelSearchResult[];
  nextCursor: string | null;
}

export interface HubInstallJob {
  id: string;
  status: "pending" | "downloading" | "installing" | "completed" | "failed" | "cancelled";
  modelType: HubModelType;
  repoId: string;
  fileName: string;
  displayName: string;
  totalBytes: number | null;
  downloadedBytes: number;
  progressPercent: number | null;
  bytesPerSecond: number;
  etaSeconds: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  installedModelId: string | null;
}

export type HubSttCompatibility =
  | {
      compatible: false;
      provider: null;
      requiredFiles: string[] | null;
      statusLabel: "Incompatible" | "Missing files";
      typeLabel: "Other" | "CTranslate2" | "Transformers" | "Parakeet";
    }
  | {
      compatible: true;
      provider: "faster-whisper" | "transformers" | "parakeet";
      requiredFiles: string[];
      statusLabel: "Compatible";
      typeLabel: "CTranslate2" | "Transformers" | "Parakeet";
    };

const jobs = ref<HubInstallJob[]>([]);
const activeJob = ref<HubInstallJob | null>(null);
const isSearching = ref(false);
const searchResults = ref<HubModelSearchResult[]>([]);
const nextCursor = ref<string | null>(null);
const activePipelineTag = ref("all");
const activeSort = ref<HubSearchSortOption>("featured");
const selectedFiles = ref<Record<string, string>>({});
let pollingTimer: ReturnType<typeof setInterval> | null = null;

const activeDownloads = computed(() =>
  jobs.value.filter((job) =>
    job.status === "pending" ||
    job.status === "downloading" ||
    job.status === "installing"
  )
);

const recentDownloads = computed(() => jobs.value.slice(0, 8));

const refreshJobs = async () => {
  const previousJobs = jobs.value;
  const nextJobs = await fetchJsonOrThrow<HubInstallJob[]>(
    `${API_BASE}/hub/install`,
    undefined,
    "Failed to refresh downloads"
  );
  jobs.value = nextJobs;
  activeJob.value =
    nextJobs.find((job) =>
      job.status === "pending" ||
      job.status === "downloading" ||
      job.status === "installing"
    ) ?? null;

  const completedJob = nextJobs.find((job) => {
    const previousJob = previousJobs.find((item) => item.id === job.id);
    return job.status === "completed" && previousJob?.status !== "completed" && Boolean(job.installedModelId);
  });

  if (completedJob) {
    dispatchModelsUpdated();
  }

  if (!activeJob.value && pollingTimer !== null) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
};

const ensurePolling = () => {
  if (pollingTimer !== null) {
    return;
  }

  pollingTimer = setInterval(() => {
    void refreshJobs().catch(() => undefined);
  }, 1000);
};

export function useHubDownloadsService() {
  const isParakeetHint = (value: string) => value.toLowerCase().includes("parakeet");

  const resolveSortParams = (sort: HubSearchSortOption) => {
    switch (sort) {
      case "downloads":
        return { sort: "downloads", direction: "-1" as const };
      case "likes":
        return { sort: "likes", direction: "-1" as const };
      case "updated":
        return { sort: "lastModified", direction: "-1" as const };
      case "newest":
        return { sort: "createdAt", direction: "-1" as const };
      case "featured":
      default:
        return { sort: "trendingScore", direction: "-1" as const };
    }
  };

  const getCompatibleSttBundle = (fileName: string, files: HubFileOption[]) => {
    const normalizedFileName = fileName.replace(/\\/g, "/");

    if (!normalizedFileName.toLowerCase().endsWith("/model.bin") && normalizedFileName.toLowerCase() !== "model.bin") {
      return null;
    }

    const directory = normalizedFileName.includes("/")
      ? normalizedFileName.slice(0, normalizedFileName.lastIndexOf("/"))
      : "";
    const prefix = directory ? `${directory}/` : "";
    const fileSet = new Set(files.map((file) => file.fileName.replace(/\\/g, "/")));
    const requiredFiles = [
      `${prefix}model.bin`,
      `${prefix}config.json`,
      `${prefix}tokenizer.json`,
    ];

    const vocabularyFile = [
      `${prefix}vocabulary.json`,
      `${prefix}vocabulary.txt`,
    ].find((requiredFile) => fileSet.has(requiredFile));

    if (!requiredFiles.every((requiredFile) => fileSet.has(requiredFile)) || !vocabularyFile) {
      return null;
    }

    const optionalFiles = [
      `${prefix}preprocessor_config.json`,
    ].filter((requiredFile) => fileSet.has(requiredFile));

    return [...requiredFiles, vocabularyFile, ...optionalFiles];
  };

  const getCompatibleTransformersBundle = (fileName: string, files: HubFileOption[]) => {
    const normalizedFileName = fileName.replace(/\\/g, "/");
    const lowerFileName = normalizedFileName.toLowerCase();
    const fileNameParts = normalizedFileName.split("/");
    const baseName = fileNameParts[fileNameParts.length - 1]?.toLowerCase() ?? "";
    const supportedWeightFile =
      lowerFileName.endsWith(".safetensors") ||
      baseName === "pytorch_model.bin" ||
      baseName === "model.bin";

    if (!supportedWeightFile) {
      return null;
    }

    const directory = normalizedFileName.includes("/")
      ? normalizedFileName.slice(0, normalizedFileName.lastIndexOf("/"))
      : "";
    const prefix = directory ? `${directory}/` : "";
    const fileSet = new Set(files.map((file) => file.fileName.replace(/\\/g, "/")));
    const configFile = `${prefix}config.json`;

    if (!fileSet.has(configFile)) {
      return null;
    }

    const processorFiles = [
      `${prefix}preprocessor_config.json`,
      `${prefix}processor_config.json`,
      `${prefix}tokenizer.json`,
      `${prefix}tokenizer_config.json`,
      `${prefix}vocab.json`,
      `${prefix}merges.txt`,
      `${prefix}special_tokens_map.json`,
    ].filter((requiredFile) => fileSet.has(requiredFile));

    if (processorFiles.length === 0) {
      return null;
    }

    return [normalizedFileName, configFile, ...processorFiles];
  };

  const getSttCompatibility = (
    fileName: string,
    files: HubFileOption[],
    repoId?: string,
  ): HubSttCompatibility => {
    const fasterWhisperBundle = getCompatibleSttBundle(fileName, files);

    if (fasterWhisperBundle) {
      return {
        compatible: true,
        provider: "faster-whisper",
        requiredFiles: fasterWhisperBundle,
        statusLabel: "Compatible",
        typeLabel: "CTranslate2",
      };
    }

    const transformersBundle = getCompatibleTransformersBundle(fileName, files);

    if (transformersBundle) {
      const isLikelyParakeet =
        isParakeetHint(repoId ?? "") ||
        isParakeetHint(fileName) ||
        files.some((file) => isParakeetHint(file.fileName));

      return {
        compatible: true,
        provider: isLikelyParakeet ? "parakeet" : "transformers",
        requiredFiles: transformersBundle,
        statusLabel: "Compatible",
        typeLabel: isLikelyParakeet ? "Parakeet" : "Transformers",
      };
    }

    const normalizedFileName = fileName.replace(/\\/g, "/").toLowerCase();

    if (normalizedFileName.endsWith("/model.bin") || normalizedFileName === "model.bin") {
      return {
        compatible: false,
        provider: null,
        requiredFiles: null,
        statusLabel: "Missing files",
        typeLabel: "CTranslate2",
      };
    }

    if (
      normalizedFileName.endsWith(".safetensors") ||
      normalizedFileName.endsWith("/pytorch_model.bin") ||
      normalizedFileName === "pytorch_model.bin"
    ) {
      return {
        compatible: false,
        provider: null,
        requiredFiles: null,
        statusLabel: "Missing files",
        typeLabel:
          isParakeetHint(repoId ?? "") || isParakeetHint(fileName)
            ? "Parakeet"
            : "Transformers",
      };
    }

    return {
      compatible: false,
      provider: null,
      requiredFiles: null,
      statusLabel: "Incompatible",
      typeLabel: "Other",
    };
  };

  const applyDefaultSelections = (results: HubModelSearchResult[], modelType: HubModelType) => {
    for (const result of results) {
      if (selectedFiles.value[result.repoId]) continue;
      const compatibleFile = result.files.find((file) =>
        isCompatibleFile(file.fileName, result.files, modelType, result.repoId)
      );
      selectedFiles.value[result.repoId] = compatibleFile?.fileName || result.files[0]?.fileName || "";
    }
  };

  const isCompatibleFile = (
    fileName: string,
    files: HubFileOption[],
    modelType: HubModelType,
    repoId?: string,
  ) => {
    const lower = fileName.toLowerCase();

    if (modelType === "llm") {
      return lower.endsWith(".gguf");
    }

    if (modelType === "stt") {
      return getSttCompatibility(fileName, files, repoId).compatible;
    }

    if (!lower.endsWith(".onnx")) {
      return false;
    }

    const candidates = [
      `${fileName}.json`,
      `${fileName.replace(/\.onnx$/i, "")}.onnx.json`,
      `${fileName.replace(/\.onnx$/i, "")}.json`,
      "config.json",
    ];

    return candidates.some((candidate) => files.some((file) => file.fileName === candidate));
  };

  const searchModels = async (
    query: string,
    modelType: HubModelType,
    options?: { append?: boolean; pipelineTag?: string; sort?: HubSearchSortOption }
  ) => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      searchResults.value = [];
      nextCursor.value = null;
      return { items: [], nextCursor: null } satisfies HubSearchResponse;
    }

    isSearching.value = true;

    try {
      const pipelineTag = options?.pipelineTag ?? activePipelineTag.value;
      const sort = options?.sort ?? activeSort.value;
      if (!options?.append) {
        activePipelineTag.value = pipelineTag;
        activeSort.value = sort;
      }
      const sortParams = resolveSortParams(sort);
      const payload = await fetchJsonOrThrow<HubSearchResponse>(
        `${API_BASE}/hub/models?q=${encodeURIComponent(trimmedQuery)}&pipelineTag=${encodeURIComponent(pipelineTag)}&sort=${encodeURIComponent(sortParams.sort)}&direction=${encodeURIComponent(sortParams.direction)}${
          options?.append && nextCursor.value ? `&cursor=${encodeURIComponent(nextCursor.value)}` : ""
        }`,
        undefined,
        "Failed to search models"
      );
      searchResults.value = options?.append
        ? [...searchResults.value, ...payload.items]
        : payload.items;
      nextCursor.value = payload.nextCursor;
      applyDefaultSelections(payload.items, modelType);

      return payload;
    } finally {
      isSearching.value = false;
    }
  };

  const loadMore = async (query: string, modelType: HubModelType) => {
    if (!nextCursor.value) {
      return null;
    }

    return searchModels(query, modelType, { append: true });
  };

  const startInstall = async (input: {
    modelType: HubModelType;
    repoId: string;
    fileName: string;
    displayName?: string;
  }) => {
    const job = await fetchJsonOrThrow<HubInstallJob>(
      `${API_BASE}/hub/install`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: input.modelType,
          repoId: input.repoId,
          fileName: input.fileName,
          displayName: input.displayName,
        }),
      },
      "Failed to start download"
    );
    activeJob.value = job;
    await refreshJobs();
    ensurePolling();

    return job;
  };

  const cancelJob = async (jobId: string) => {
    await fetchJsonOrThrow(
      `${API_BASE}/hub/install/${jobId}`,
      {
        method: "DELETE",
      },
      "Failed to cancel download"
    );
    await refreshJobs();
  };

  return {
    jobs,
    activeJob,
    activeDownloads,
    recentDownloads,
    isSearching,
    searchResults,
    nextCursor,
    activePipelineTag,
    activeSort,
    selectedFiles,
    refreshJobs,
    searchModels,
    loadMore,
    startInstall,
    cancelJob,
    ensurePolling,
    isCompatibleFile,
    getCompatibleSttBundle,
    getCompatibleTransformersBundle,
    getSttCompatibility,
  };
}
