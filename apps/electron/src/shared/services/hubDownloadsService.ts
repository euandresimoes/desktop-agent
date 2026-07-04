import { computed, ref } from "vue";

const API_BASE = "http://localhost:35421/api/v1";
const dispatchModelsUpdated = () => {
  window.dispatchEvent(new Event("models-library-updated"));
  window.dispatchEvent(new Event("refresh-status"));
};

export type HubModelType = "llm" | "stt" | "tts";

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

const jobs = ref<HubInstallJob[]>([]);
const activeJob = ref<HubInstallJob | null>(null);
const isSearching = ref(false);
const searchResults = ref<HubModelSearchResult[]>([]);
const nextCursor = ref<string | null>(null);
const activePipelineTag = ref("all");
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
  const response = await fetch(`${API_BASE}/hub/install`);
  if (!response.ok) {
    throw new Error("Failed to refresh downloads");
  }

  const nextJobs = (await response.json()) as HubInstallJob[];
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
      `${prefix}preprocessor_config.json`,
    ];

    return requiredFiles.every((requiredFile) => fileSet.has(requiredFile))
      ? requiredFiles
      : null;
  };

  const applyDefaultSelections = (results: HubModelSearchResult[], modelType: HubModelType) => {
    for (const result of results) {
      if (selectedFiles.value[result.repoId]) continue;
      const compatibleFile = result.files.find((file) => isCompatibleFile(file.fileName, result.files, modelType));
      selectedFiles.value[result.repoId] = compatibleFile?.fileName || result.files[0]?.fileName || "";
    }
  };

  const isCompatibleFile = (fileName: string, files: HubFileOption[], modelType: HubModelType) => {
    const lower = fileName.toLowerCase();

    if (modelType === "llm") {
      return lower.endsWith(".gguf");
    }

    if (modelType === "stt") {
      return Boolean(getCompatibleSttBundle(fileName, files));
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
    options?: { append?: boolean; pipelineTag?: string }
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
      if (!options?.append) {
        activePipelineTag.value = pipelineTag;
      }
      const response = await fetch(
        `${API_BASE}/hub/models?q=${encodeURIComponent(trimmedQuery)}&pipelineTag=${encodeURIComponent(pipelineTag)}${
          options?.append && nextCursor.value ? `&cursor=${encodeURIComponent(nextCursor.value)}` : ""
        }`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to search models");
      }

      const payload = (await response.json()) as HubSearchResponse;
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
    const response = await fetch(`${API_BASE}/hub/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: input.modelType,
        repoId: input.repoId,
        fileName: input.fileName,
        displayName: input.displayName,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to start download");
    }

    const job = (await response.json()) as HubInstallJob;
    activeJob.value = job;
    await refreshJobs();
    ensurePolling();

    return job;
  };

  const cancelJob = async (jobId: string) => {
    await fetch(`${API_BASE}/hub/install/${jobId}`, {
      method: "DELETE",
    });
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
    selectedFiles,
    refreshJobs,
    searchModels,
    loadMore,
    startInstall,
    cancelJob,
    ensurePolling,
    isCompatibleFile,
    getCompatibleSttBundle,
  };
}
