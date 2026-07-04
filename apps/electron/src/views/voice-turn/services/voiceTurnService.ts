import { AudioPlayerVisualizer, AudioRecorder } from "../../../shared/utils/audio-recorder";
import { useToast } from "../../../shared/utils/toast";
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { useAppSettingsService } from "../../../shared/services/appSettingsService";

export type VoiceTurnState = "loading" | "not_ready" | "ready" | "recording" | "thinking" | "speaking";

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

function createAudioDataUrl(base64: string, mimeType: string) {
  return `data:${mimeType};base64,${base64}`;
}

const dispatchSystemStatus = (
  activeConfig: ActiveConfig | null,
  metrics: VoiceTurnMetrics | null,
  isRecording: boolean,
  currentVolume: number
) => {
  window.dispatchEvent(
    new CustomEvent("system-config-updated", {
      detail: { activeConfig, metrics, isRecording, currentVolume },
    })
  );
};

const API_BASE = "http://localhost:35421/api/v1";

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function useVoiceTurnService() {
  const toast = useToast();
  const { settings, loadSettings, syncAssistantSettingsToBackend } = useAppSettingsService();

  const currentState = ref<VoiceTurnState>("loading");
  const statusError = ref<string | null>(null);
  const activeConfig = ref<ActiveConfig | null>(null);
  const currentVolume = ref(0);
  const smoothedVolume = ref(0);
  const currentAccentColor = ref("#7c0bcd");
  const lastTranscript = ref("");
  const lastResponse = ref("");
  const metrics = ref<VoiceTurnMetrics | null>(null);

  const audioElement = ref<HTMLAudioElement | null>(null);
  let audioRecorder: AudioRecorder | null = null;
  let playerVisualizer: AudioPlayerVisualizer | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let activeRequestController: AbortController | null = null;
  let smoothingTimer: ReturnType<typeof setInterval> | null = null;

  const parseCssColorToRgb = (value: string) => {
    const trimmed = value.trim();

    const hexMatch = trimmed.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (hexMatch) {
      const rawHex = hexMatch[1] ?? "";
      const expandedHex =
        rawHex.length === 3
          ? rawHex
              .split("")
              .map((char) => `${char}${char}`)
              .join("")
          : rawHex;

      return {
        r: Number.parseInt(expandedHex.slice(0, 2), 16),
        g: Number.parseInt(expandedHex.slice(2, 4), 16),
        b: Number.parseInt(expandedHex.slice(4, 6), 16),
      };
    }

    const rgbMatch = trimmed.match(
      /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i,
    );

    if (rgbMatch) {
      return {
        r: Number.parseInt(rgbMatch[1] ?? "124", 10),
        g: Number.parseInt(rgbMatch[2] ?? "11", 10),
        b: Number.parseInt(rgbMatch[3] ?? "205", 10),
      };
    }

    return { r: 124, g: 11, b: 205 };
  };

  const syncAccentColor = () => {
    const accentValue = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-app-accent")
      .trim();

    currentAccentColor.value = accentValue || "#7c0bcd";
  };

  const bindAudioElement = (element: HTMLAudioElement | null) => {
    audioElement.value = element;

    if (!audioElement.value) {
      return;
    }

    void applyAudioOutputPreferences();

    audioElement.value.onloadedmetadata = () => {
      console.log("[voice-turn] audio metadata loaded", {
        duration: audioElement.value?.duration,
        readyState: audioElement.value?.readyState,
      });
    };

    audioElement.value.onerror = () => {
      console.error("[voice-turn] audio element error", audioElement.value?.error);
    };
  };

  const applyAudioOutputPreferences = async () => {
    if (!audioElement.value) {
      return;
    }

    audioElement.value.volume = Math.min(1, Math.max(0, settings.value.outputVolume));

    const preferredOutputDeviceId = settings.value.audioOutputDeviceId.trim();

    if (
      preferredOutputDeviceId &&
      typeof audioElement.value.setSinkId === "function"
    ) {
      try {
        await audioElement.value.setSinkId(preferredOutputDeviceId);
      } catch (error) {
        console.warn("[voice-turn] failed to set output device", error);
      }
    }
  };

  /** Check backend status — retries every 3 s while the API is unreachable. */
  const checkSystemStatus = async () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    try {
      const res = await fetch(`${API_BASE}/setup/status`);
      if (!res.ok) throw new Error("Erro ao consultar status");
      const data = await res.json();

      await loadSettings();
      void syncAssistantSettingsToBackend(settings.value);

      if (data.ready) {
        currentState.value = "ready";
        statusError.value = null;
      } else {
        currentState.value = "not_ready";
        if (!data.python.installed) {
          statusError.value = "Python is not installed in the global environment.";
        } else if (!data.piper.installed) {
          statusError.value = "The 'piper' library is not installed in Python.";
        } else if (!data.voices.activeVoiceReady) {
          statusError.value = "No active voice is configured or installed.";
        } else {
          statusError.value = "Active models are missing (LLM, STT or Voice).";
        }
      }

      const [llmActive, sttActive, voicesActive] = await Promise.all([
        fetchJson<{ name?: string }>(`${API_BASE}/models/active`),
        fetchJson<{ name?: string }>(`${API_BASE}/stt/models/active`),
        fetchJson<{ activeVoiceId: string; voices: { id: string; name: string }[] }>(`${API_BASE}/setup/voices`),
      ]);

      activeConfig.value = {
        llmModel: llmActive?.name || "Pendent",
        sttModel: sttActive?.name || "Pendent",
        voice: voicesActive?.voices.find((v) => v.id === voicesActive.activeVoiceId)?.name || "Pendent",
      };

      dispatchSystemStatus(
        activeConfig.value,
        metrics.value,
        false,
        currentVolume.value
      );
    } catch {
      currentState.value = "loading";
      statusError.value = null;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        checkSystemStatus();
      }, 3000);
    }
  };

  /** Start recording from the microphone. */
  const startRecording = async () => {
    if (currentState.value !== "ready") return;

    try {
      await loadSettings();
      currentState.value = "recording";
      currentVolume.value = 0;

      audioRecorder = new AudioRecorder({
        silenceThreshold: 0.012,
        silenceDurationMs: 2000,
        selectedDeviceId: settings.value.audioInputDeviceId || undefined,
        inputGain: settings.value.microphoneGain,
        onVolume: (rms: number) => {
          currentVolume.value = rms;
          dispatchSystemStatus(
            activeConfig.value,
            metrics.value,
            true,
            currentVolume.value
          );
        },
        onSilenceDetected: () => {
          stopRecording();
        },
      });

      dispatchSystemStatus(
        activeConfig.value,
        metrics.value,
        true,
        currentVolume.value
      );

      await audioRecorder.start();
    } catch (err: any) {
      console.error("Failed to start recording:", err);
      currentState.value = "ready";
      dispatchSystemStatus(
        activeConfig.value,
        metrics.value,
        false,
        currentVolume.value
      );
      toast.error("Microphone error: " + err.message);
    }
  };

  /** Stop recording, send audio to the backend and play the response. */
  const stopRecording = async () => {
    if (currentState.value !== "recording" || !audioRecorder) return;

    currentState.value = "thinking";
    const audioBlob = audioRecorder.stop();
    audioRecorder = null;
    currentVolume.value = 0;
    dispatchSystemStatus(
      activeConfig.value,
      metrics.value,
      false,
      currentVolume.value
    );

    try {
      activeRequestController?.abort();
      activeRequestController = new AbortController();
      const formData = new FormData();
      formData.append("audio", audioBlob, "user_voice.wav");

      const res = await fetch(`${API_BASE}/assistant/voice-turn`, {
        method: "POST",
        body: formData,
        signal: activeRequestController.signal,
      });

      if (!res.ok) throw new Error("Voice turn request failed");

      const data = await res.json();
      console.log("[voice-turn] response payload", {
        keys: Object.keys(data ?? {}),
        audioContentType: data?.audioContentType,
        audioBase64Length: typeof data?.audioBase64 === "string" ? data.audioBase64.length : null,
        transcriptLength: typeof data?.transcript === "string" ? data.transcript.length : null,
        responseTextLength: typeof data?.responseText === "string" ? data.responseText.length : null,
      });
      lastTranscript.value = data.transcript;
      lastResponse.value = data.responseText;

      metrics.value = {
        stt: data.sttDurationMs,
        llm: data.llmDurationMs,
        tts: data.ttsDurationMs,
        total: data.durationMs,
      };

      dispatchSystemStatus(
        activeConfig.value,
        metrics.value,
        false,
        currentVolume.value
      );

      if (data.audioBase64) {
        if (!audioElement.value) {
          console.error("[voice-turn] audio element is not bound");
          throw new Error("Audio element is not available");
        }

        currentState.value = "speaking";

        if (!playerVisualizer) {
          playerVisualizer = new AudioPlayerVisualizer(audioElement.value, (rms: number) => {
            currentVolume.value = rms;
          });
          playerVisualizer.setup();
        }

        const mimeType = data.audioContentType || "audio/wav";
        console.log("[voice-turn] received audio payload", {
          mimeType,
          base64Length: data.audioBase64.length,
        });

        audioElement.value.src = createAudioDataUrl(data.audioBase64, mimeType);
        audioElement.value.load();
        await applyAudioOutputPreferences();

        playerVisualizer.start();
        console.log("[voice-turn] audio source assigned", {
          src: audioElement.value.src.slice(0, 48),
        });

        try {
          await audioElement.value.play();
          console.log("[voice-turn] audio playback started");
        } catch (playbackError) {
          console.error("[voice-turn] audio playback failed", playbackError);
          throw playbackError;
        }
      } else {
        console.warn("[voice-turn] response without audio payload");
        currentState.value = "ready";
        dispatchSystemStatus(
          activeConfig.value,
          metrics.value,
          false,
          currentVolume.value
        );
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        currentState.value = "ready";
        currentVolume.value = 0;
        dispatchSystemStatus(
          activeConfig.value,
          metrics.value,
          false,
          currentVolume.value
        );
        return;
      }

      console.error("Error processing voice turn:", err);
      currentState.value = "ready";
      dispatchSystemStatus(
        activeConfig.value,
        metrics.value,
        false,
        currentVolume.value
      );
      toast.error("Error processing speech: " + err.message);
    } finally {
      activeRequestController = null;
    }
  };

  const cancelInteraction = () => {
    activeRequestController?.abort();
    activeRequestController = null;

    if (currentState.value === "recording" && audioRecorder) {
      audioRecorder.cancel();
      audioRecorder = null;
    }

    if (currentState.value === "speaking" && audioElement.value) {
      audioElement.value.pause();
      audioElement.value.currentTime = 0;
      audioElement.value.removeAttribute("src");
      audioElement.value.load();
    }


    if (playerVisualizer) {
      playerVisualizer.stop();
    }

    currentVolume.value = 0;
    currentState.value = "ready";
    dispatchSystemStatus(
      activeConfig.value,
      metrics.value,
      false,
      currentVolume.value
    );
  };

  /** Toggle recording on orb click. */
  const handleOrbClick = () => {
    if (currentState.value === "ready") {
      startRecording();
    } else if (currentState.value === "recording" || currentState.value === "thinking" || currentState.value === "speaking") {
      cancelInteraction();
    }
  };

  /** Called when audio playback ends. */
  const handleAudioEnded = () => {
    console.log("[voice-turn] audio ended", {
      currentTime: audioElement.value?.currentTime,
      duration: audioElement.value?.duration,
    });
    if (playerVisualizer) {
      playerVisualizer.stop();
    }
    currentVolume.value = 0;
    currentState.value = "ready";
    dispatchSystemStatus(
      activeConfig.value,
      metrics.value,
      false,
      currentVolume.value
    );
  };

  /** Dynamic CSS style for the orb element based on current state & volume. */
  const orbStyle = computed(() => {
    const vol = currentVolume.value;
    const isActive =
      currentState.value === "recording" ||
      currentState.value === "thinking" ||
      currentState.value === "speaking";
    const scale = isActive ? 1.0 + Math.min(vol, 0.22) * 0.22 : 1;
    const shadowOpacity = isActive ? 0.18 + Math.min(vol, 0.25) * 0.22 : 0.14;
    const { r, g, b } = parseCssColorToRgb(currentAccentColor.value);

    return {
      transform: `scale(${scale})`,
      boxShadow: `0 12px 30px rgba(${r}, ${g}, ${b}, ${shadowOpacity})`,
    };
  });

  const backgroundGlowStyle = computed(() => {
    const isAudioActive =
      currentState.value === "recording" ||
      currentState.value === "speaking";
    const intensity = isAudioActive ? Math.min(1, smoothedVolume.value * 8.2) : 0;
    const { r, g, b } = parseCssColorToRgb(currentAccentColor.value);

    return {
      "--voice-turn-glow": `radial-gradient(circle at center, rgba(${r}, ${g}, ${b}, ${0.03 + intensity * 0.12}) 0%, rgba(${r}, ${g}, ${b}, ${0.018 + intensity * 0.06}) 22%, rgba(${r}, ${g}, ${b}, ${intensity * 0.03}) 38%, rgba(${r}, ${g}, ${b}, 0) 66%)`,
    };
  });

  /** Human-readable label for the current state. */
  const statusLabel = computed(() => {
    switch (currentState.value) {
      case "loading":
        return "Initializing system...";
      case "not_ready":
        return "Configuration pending";
      case "ready":
        return "Click to Speak";
      case "recording":
        return "Listening... click to cancel";
      case "thinking":
        return "Processing... click to cancel";
      case "speaking":
        return "Speaking... click to cancel";
    }
  });

  onMounted(() => {
    syncAccentColor();
    void loadSettings().then(() => {
      void applyAudioOutputPreferences();
    });
    checkSystemStatus();
    window.addEventListener("refresh-status", checkSystemStatus);
    window.addEventListener("app-appearance-updated", syncAccentColor);

    smoothingTimer = setInterval(() => {
      const target = currentVolume.value;
      smoothedVolume.value += (target - smoothedVolume.value) * 0.18;

      if (Math.abs(target - smoothedVolume.value) < 0.001) {
        smoothedVolume.value = target;
      }
    }, 32);
  });

  onBeforeUnmount(() => {
    if (retryTimer !== null) clearTimeout(retryTimer);
    if (smoothingTimer !== null) clearInterval(smoothingTimer);
    window.removeEventListener("refresh-status", checkSystemStatus);
    window.removeEventListener("app-appearance-updated", syncAccentColor);
    if (playerVisualizer) {
      playerVisualizer.close();
    }
    activeRequestController?.abort();
  });

  watch(
    () => [settings.value.audioOutputDeviceId, settings.value.outputVolume],
    () => {
      void applyAudioOutputPreferences();
    },
  );

  return {
    // State
    currentState,
    statusError,
    activeConfig,
    currentVolume,
    lastTranscript,
    lastResponse,
    metrics,
    audioElement,
    bindAudioElement,
    // Computed
    orbStyle,
    backgroundGlowStyle,
    statusLabel,
    // Methods
    checkSystemStatus,
    startRecording,
    stopRecording,
    cancelInteraction,
    handleOrbClick,
    handleAudioEnded,
  };
}
