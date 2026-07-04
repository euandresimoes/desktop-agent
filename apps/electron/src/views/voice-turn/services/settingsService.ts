import { useToast } from "../../../shared/utils/toast";
import { computed, ref } from "vue";
import {
  useHubDownloadsService,
  type HubInstallJob,
  type HubModelSearchResult,
  type HubModelType,
} from "../../../shared/services/hubDownloadsService";

export type ModelType = "llm" | "stt" | "tts";

export interface LlmModel {
  id: string;
  name: string;
  installed: boolean;
  modelPath: string;
  contextSize: number;
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
}

export interface SttModel {
  id: string;
  name: string;
  modelSource: "huggingface" | "local";
  modelPath: string;
  device: "cpu" | "cuda" | "auto";
  computeType: "int8" | "int8_float16" | "float16" | "float32";
  language: string;
  beamSize: number;
  vadFilter: boolean;
}

export interface TtsVoice {
  id: string;
  name: string;
  installed: boolean;
  modelPath: string;
  sampleRate: number;
  lengthScale: number;
  noiseScale: number;
  noiseW: number;
}

export interface NewLlmForm {
  id: string;
  name: string;
  modelTempPath: string;
  contextSize: number;
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
}

export interface NewSttForm {
  id: string;
  name: string;
  modelSource: "huggingface" | "local";
  modelPath: string;
  device: "cpu" | "cuda" | "auto";
  computeType: "int8" | "int8_float16" | "float16" | "float32";
  language: string;
  beamSize: number;
  vadFilter: boolean;
}

export interface NewVoiceForm {
  id: string;
  name: string;
  modelTempPath: string;
  configTempPath: string;
  sampleRate: number;
  lengthScale: number;
  noiseScale: number;
  noiseW: number;
}

const API_BASE = "http://localhost:35421/api/v1";

const dispatchModelsUpdated = () => {
  window.dispatchEvent(new Event("models-library-updated"));
  window.dispatchEvent(new Event("refresh-status"));
};

const hubDownloads = useHubDownloadsService();
const isLoading = ref(false);
const isSaving = ref(false);
const llmModels = ref<LlmModel[]>([]);
const activeLlmId = ref<string | null>(null);
const sttModels = ref<SttModel[]>([]);
const activeSttId = ref<string | null>(null);
const ttsVoices = ref<TtsVoice[]>([]);
const activeVoiceId = ref<string | null>(null);

const installedLlmModels = computed(() =>
  llmModels.value.filter((model) => model.installed)
);
const installedSttModels = computed(() => sttModels.value);
const installedTtsVoices = computed(() =>
  ttsVoices.value.filter((voice) => voice.installed)
);

const createDefaultLlmForm = (): NewLlmForm => ({
  id: "",
  name: "",
  modelTempPath: "",
  contextSize: 1024,
  maxTokens: 128,
  temperature: 0.4,
  topP: 0.75,
  topK: 20,
  repeatPenalty: 1.1,
});

const createDefaultSttForm = (): NewSttForm => ({
  id: "",
  name: "",
  modelSource: "huggingface",
  modelPath: "",
  device: "cpu",
  computeType: "int8",
  language: "en",
  beamSize: 1,
  vadFilter: true,
});

const createDefaultVoiceForm = (): NewVoiceForm => ({
  id: "",
  name: "",
  modelTempPath: "",
  configTempPath: "",
  sampleRate: 22050,
  lengthScale: 1.0,
  noiseScale: 0.667,
  noiseW: 0.8,
});

const newLlm = ref<NewLlmForm>(createDefaultLlmForm());
const newStt = ref<NewSttForm>(createDefaultSttForm());
const newVoice = ref<NewVoiceForm>(createDefaultVoiceForm());
const hubSearchQuery = ref("");
const hubPipelineTag = ref("all");
const hubModelType = ref<HubModelType>("llm");

export function useSettingsService(onUpdated?: () => void) {
  const toast = useToast();

  /** Fetch all model/voice configurations from the backend. */
  const fetchAll = async () => {
    isLoading.value = true;
    try {
      const llmData = await fetch(`${API_BASE}/models`).then((r) => r.json());
      llmModels.value = llmData.models || [];
      activeLlmId.value = llmData.activeModelId;

      const sttData = await fetch(`${API_BASE}/stt/models`).then((r) => r.json());
      sttModels.value = sttData.models || [];
      activeSttId.value = sttData.activeModelId;

      const ttsData = await fetch(`${API_BASE}/setup/voices`).then((r) => r.json());
      ttsVoices.value = ttsData.voices || [];
      activeVoiceId.value = ttsData.activeVoiceId;
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      isLoading.value = false;
    }
  };

  /** Set the active model/voice for a given type. */
  const handleSetActive = async (type: ModelType, id: string) => {
    try {
      let url = "";
      let body: Record<string, unknown> = {};
      if (type === "llm") {
        url = `${API_BASE}/models/active`;
        body = { modelId: id };
      } else if (type === "stt") {
        url = `${API_BASE}/stt/models/active`;
        body = { modelId: id };
      } else if (type === "tts") {
        url = `${API_BASE}/setup/voices/active`;
        body = { voiceId: id };
      }

      await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      await fetchAll();
      dispatchModelsUpdated();
      onUpdated?.();
      toast.success("Active model updated.");
    } catch (err) {
      console.error("Failed to set active model:", err);
    }
  };

  /** Update parameters of an existing model/voice. */
  const handleUpdateModel = async (type: ModelType, model: LlmModel | SttModel | TtsVoice) => {
    try {
      let url = "";
      let body: Record<string, unknown> = {};

      if (type === "llm") {
        const m = model as LlmModel;
        url = `${API_BASE}/models/${m.id}`;
        body = {
          name: m.name,
          contextSize: Number(m.contextSize),
          maxTokens: Number(m.maxTokens),
          temperature: Number(m.temperature),
          topP: Number(m.topP),
          topK: Number(m.topK),
          repeatPenalty: Number(m.repeatPenalty),
        };
      } else if (type === "stt") {
        const m = model as SttModel;
        url = `${API_BASE}/stt/models/${m.id}`;
        body = {
          name: m.name,
          device: m.device,
          computeType: m.computeType,
          language: m.language,
          beamSize: Number(m.beamSize),
          vadFilter: m.vadFilter,
        };
      } else if (type === "tts") {
        const m = model as TtsVoice;
        url = `${API_BASE}/setup/voices/${m.id}`;
        body = {
          name: m.name,
          sampleRate: Number(m.sampleRate),
          lengthScale: Number(m.lengthScale),
          noiseScale: Number(m.noiseScale),
          noiseW: Number(m.noiseW),
        };
      }

      await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      await fetchAll();
      dispatchModelsUpdated();
      onUpdated?.();
      toast.success("Settings saved successfully.");
    } catch (err) {
      console.error("Failed to update model config:", err);
    }
  };

  /** Delete a model/voice by id. */
  const handleDelete = async (type: ModelType, id: string) => {
    toast.warning(`Deleting model "${id}". This action cannot be undone.`, 2000);
    try {
      let url = "";
      if (type === "llm") {
        url = `${API_BASE}/models/${id}`;
      } else if (type === "stt") {
        url = `${API_BASE}/stt/models/${id}`;
      } else if (type === "tts") {
        url = `${API_BASE}/setup/voices/${id}`;
      }

      await fetch(url, { method: "DELETE" });
      await fetchAll();
      dispatchModelsUpdated();
      onUpdated?.();
      toast.success("Model deleted.");
    } catch (err) {
      console.error("Failed to delete model:", err);
    }
  };

  /** Open native Electron file picker. */
  const pickFile = async (type: "llm" | "stt-model" | "tts-model" | "tts-config") => {
    let filters: { name: string; extensions: string[] }[] = [];
    let properties: ("openFile" | "openDirectory")[] = ["openFile"];

    if (type === "llm") {
      filters = [{ name: "GGUF Models", extensions: ["gguf"] }];
    } else if (type === "tts-model") {
      filters = [{ name: "ONNX Model", extensions: ["onnx"] }];
    } else if (type === "tts-config") {
      filters = [{ name: "JSON Config", extensions: ["json"] }];
    } else if (type === "stt-model") {
      properties = ["openFile", "openDirectory"];
    }

    const result = await window.electronAPI.dialog.openFile({
      title: "Select File",
      properties,
      filters,
    });

    if (result && !result.canceled && result.filePaths.length > 0) {
      const path = result.filePaths[0];

      if (type === "llm") {
        newLlm.value.modelTempPath = path;
        if (!newLlm.value.id) {
          newLlm.value.id = path.split(/[\\\/]/).pop()?.replace(".gguf", "").toLowerCase() || "";
        }
        if (!newLlm.value.name) {
          newLlm.value.name = path.split(/[\\\/]/).pop()?.replace(".gguf", "") || "";
        }
      } else if (type === "tts-model") {
        newVoice.value.modelTempPath = path;
        if (!newVoice.value.id) {
          newVoice.value.id = path.split(/[\\\/]/).pop()?.replace(".onnx", "").toLowerCase() || "";
        }
        if (!newVoice.value.name) {
          newVoice.value.name = path.split(/[\\\/]/).pop()?.replace(".onnx", "") || "";
        }
      } else if (type === "tts-config") {
        newVoice.value.configTempPath = path;
      } else if (type === "stt-model") {
        newStt.value.modelPath = path;
        if (!newStt.value.id) {
          newStt.value.id = path.split(/[\\\/]/).pop()?.toLowerCase() || "";
        }
        if (!newStt.value.name) {
          newStt.value.name = path.split(/[\\\/]/).pop() || "";
        }
      }
    }
  };

  /** Create / install a new model or voice. */
  const handleCreate = async (type: ModelType) => {
    isSaving.value = true;
    try {
      let url = "";
      let body: Record<string, unknown> = {};

      if (type === "llm") {
        const b = newLlm.value;
        if (!b.id || !b.name || !b.modelTempPath) {
          toast.warning("ID, name and model file are required.");
          return false;
        }
        url = `${API_BASE}/models`;
        body = { ...b };
      } else if (type === "stt") {
        const b = newStt.value;
        if (!b.id || !b.name || !b.modelPath) {
          toast.warning("All fields are required.");
          return false;
        }
        url = `${API_BASE}/stt/models`;
        body = { ...b };
      } else if (type === "tts") {
        const b = newVoice.value;
        if (!b.id || !b.name || !b.modelTempPath || !b.configTempPath) {
          toast.warning("All files are required.");
          return false;
        }
        url = `${API_BASE}/setup/voices`;
        body = { ...b };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create model");
      }

      // Reset forms
      if (type === "llm") {
        newLlm.value = createDefaultLlmForm();
      } else if (type === "stt") {
        newStt.value = createDefaultSttForm();
      } else if (type === "tts") {
        newVoice.value = createDefaultVoiceForm();
      }

      await fetchAll();
      dispatchModelsUpdated();
      onUpdated?.();
      toast.success("Model installed and loaded!");
      return true;
    } catch (err: any) {
      toast.error("Error: " + err.message);
      return false;
    } finally {
      isSaving.value = false;
    }
  };

  const setHubModelType = (type: HubModelType) => {
    hubModelType.value = type;

    if (type === "llm" && hubPipelineTag.value === "all") {
      hubPipelineTag.value = "text-generation";
    } else if (type === "stt" && hubPipelineTag.value === "all") {
      hubPipelineTag.value = "automatic-speech-recognition";
    } else if (type === "tts" && hubPipelineTag.value === "all") {
      hubPipelineTag.value = "text-to-speech";
    }
  };

  const searchHubModels = async () => {
    try {
      await hubDownloads.searchModels(hubSearchQuery.value, hubModelType.value, {
        pipelineTag: hubPipelineTag.value,
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to search Hugging Face.");
    }
  };

  const loadMoreHubModels = async () => {
    try {
      await hubDownloads.loadMore(hubSearchQuery.value, hubModelType.value);
    } catch (error: any) {
      toast.error(error.message || "Failed to load more repositories.");
    }
  };

  const startHubInstall = async (result: HubModelSearchResult) => {
    const fileName = hubDownloads.selectedFiles.value[result.repoId];

    if (!fileName) {
      toast.warning("Select a compatible file first.");
      return;
    }

    try {
      const displayName = fileName
        .replace(/\.gguf$/i, "")
        .replace(/\.onnx$/i, "")
        .replace(/\.bin$/i, "")
        .replace(/\.pt$/i, "")
        .replace(/\.safetensors$/i, "");

      await hubDownloads.startInstall({
        modelType: hubModelType.value,
        repoId: result.repoId,
        fileName,
        displayName,
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to start model download.");
    }
  };

  const cancelHubInstall = async () => {
    if (!hubDownloads.activeJob.value) {
      return;
    }

    try {
      await hubDownloads.cancelJob(hubDownloads.activeJob.value.id);
    } finally {
      // shared service handles state refresh
    }
  };

  return {
    // State
    isLoading,
    isSaving,
    llmModels,
    activeLlmId,
    installedLlmModels,
    sttModels,
    activeSttId,
    installedSttModels,
    ttsVoices,
    activeVoiceId,
    installedTtsVoices,
    newLlm,
    newStt,
    newVoice,
    hubSearchQuery,
    hubPipelineTag,
    hubModelType,
    isHubSearching: hubDownloads.isSearching,
    hubResults: hubDownloads.searchResults,
    selectedHubFiles: hubDownloads.selectedFiles,
    activeHubInstallJob: hubDownloads.activeJob,
    nextHubCursor: hubDownloads.nextCursor,
    // Methods
    fetchAll,
    handleSetActive,
    handleUpdateModel,
    handleDelete,
    pickFile,
    handleCreate,
    setHubModelType,
    searchHubModels,
    loadMoreHubModels,
    startHubInstall,
    cancelHubInstall,
  };
}

