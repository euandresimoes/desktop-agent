import { computed, onBeforeUnmount, onMounted, ref } from "vue";

export interface ActiveConfig {
  llmModel?: string;
  sttModel?: string;
  voice?: string;
}

export interface VoiceTurnMetrics {
  stt?: number;
  llm?: number;
  tts?: number;
  total?: number;
}

interface SystemStatusDetail {
  activeConfig?: ActiveConfig | null;
  metrics?: VoiceTurnMetrics | null;
  isRecording?: boolean;
  currentVolume?: number;
}

const activeConfig = ref<ActiveConfig | null>(null);
const metrics = ref<VoiceTurnMetrics | null>(null);
const isRecording = ref(false);
const currentVolume = ref(0);

const getConfigValue = (value?: string) => value || "Pendent";
const formatMetric = (value?: number) =>
  typeof value === "number" ? `${value}ms` : "-";

const handleUpdate = (event: Event) => {
  const detail = (event as CustomEvent<SystemStatusDetail>).detail;

  if (detail?.activeConfig) {
    activeConfig.value = detail.activeConfig;
  }

  if (detail?.metrics) {
    metrics.value = detail.metrics;
  }

  if (typeof detail?.isRecording === "boolean") {
    isRecording.value = detail.isRecording;
  }

  if (typeof detail?.currentVolume === "number") {
    currentVolume.value = detail.currentVolume;
  }
};

export function useSystemStatus() {
  onMounted(() => {
    window.addEventListener("system-config-updated", handleUpdate);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("system-config-updated", handleUpdate);
  });

  const activeModelItems = computed(() => ({
    llm: getConfigValue(activeConfig.value?.llmModel),
    stt: getConfigValue(activeConfig.value?.sttModel),
    tts: getConfigValue(activeConfig.value?.voice),
  }));

  const metricItems = computed(() => ({
    stt: formatMetric(metrics.value?.stt),
    llm: formatMetric(metrics.value?.llm),
    tts: formatMetric(metrics.value?.tts),
    total: formatMetric(metrics.value?.total),
  }));

  return {
    activeConfig,
    metrics,
    isRecording,
    currentVolume,
    activeModelItems,
    metricItems,
  };
}
