import { AudioPlayerVisualizer, AudioRecorder } from "../../../shared/utils/audio-recorder.ts";
import { TTSPcmStreamPlayer } from "../../../shared/utils/tts-stream-player.ts";
import { useToast } from "../../../shared/utils/toast.ts";
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { useAppSettingsService } from "../../../shared/services/appSettingsService.ts";
import {
  fetchTTSCapabilities,
  type TTSCapabilitiesResponse,
} from "../../../shared/services/ttsCapabilitiesService.ts";
import {
  fetchSTTStreamingCapabilities,
  type STTStreamingCapabilitiesResponse,
} from "../../../shared/services/sttStreamingCapabilitiesService.ts";
import { normalizeSTTPlaybackModeAgainstCapabilities } from "../../../shared/services/sttPlaybackModeService.ts";
import { voiceDetectionSensitivityToThreshold } from "../../../shared/services/voiceDetectionSensitivityService.ts";
import { AppHttpError, fetchJsonOrThrow } from "../../../shared/utils/http.ts";
import { resolveTTSPlaybackMode } from "./voiceTurnPlaybackMode.ts";
import { createSTTStreamingClient } from "./stt-streaming-client.ts";

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

const STREAMING_TRANSCRIPT_REJECTION_PATTERNS = [
  /legendas pela comunidade de amara\.org/i,
  /amara\.org/i,
  /subtitles by/i,
];

type AssistantVoiceTurnPreparationResponse = {
  transcript: string;
  responseText: string;
  language?: string;
  sttModelId: string;
  llmModelId: string;
  llmModelName: string;
  durationMs: number;
  sttDurationMs: number;
  sttServerDurationMs?: number;
  llmDurationMs: number;
};

type AssistantVoiceTurnResponse = AssistantVoiceTurnPreparationResponse & {
  audioContentType?: string;
  audioBase64?: string;
  ttsDurationMs?: number;
};

type VoiceTurnDiagnostics = {
  recordingStartedAtMs?: number;
  recordingStoppedAtMs?: number;
  requestStartedAtMs?: number;
  responseReceivedAtMs?: number;
  ttsStreamOpenedAtMs?: number;
  firstTtsTextAtMs?: number;
  firstTtsAudioAtMs?: number;
  sttMode?: "standard" | "stream";
  usedTranscriptOverride?: boolean;
};

type StartRecordingOptions = {
  waitForSpeechActivation?: boolean;
  maxActivationWaitMs?: number;
  onSpeechActivation?: () => void;
  onActivationTimeout?: () => void;
};

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
    return await fetchJsonOrThrow<T>(url, undefined, "Failed to fetch JSON");
  } catch {
    return null;
  }
}

function resetStreamingSessionState(
  activeTTSStreamSessionId: { value: string | null },
) {
  activeTTSStreamSessionId.value = null;
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
  const liveCaption = ref("");
  const partialUserCaption = ref("");
  const confirmedUserCaptions = ref<string[]>([]);
  const metrics = ref<VoiceTurnMetrics | null>(null);
  const activeTTSStreamSessionId = ref<string | null>(null);
  const ttsCapabilities = ref<TTSCapabilitiesResponse | null>(null);
  const sttStreamingCapabilities = ref<STTStreamingCapabilitiesResponse | null>(null);

  const audioElement = ref<HTMLAudioElement | null>(null);
  let audioRecorder: AudioRecorder | null = null;
  let playerVisualizer: AudioPlayerVisualizer | null = null;
  let ttsStreamPlayer: TTSPcmStreamPlayer | null = null;
  let ttsStreamingSocket: WebSocket | null = null;
  let sttStreamingClient: ReturnType<typeof createSTTStreamingClient> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let activeRequestController: AbortController | null = null;
  let smoothingTimer: ReturnType<typeof setInterval> | null = null;
  let streamedTranscriptResolver: ((text: string) => void) | null = null;
  let streamedTranscriptRejecter: ((error: Error) => void) | null = null;
  let streamedTranscriptPromise: Promise<string> | null = null;
  let recordingStartedAtMs: number | null = null;
  let streamedTranscriptDurationMs = 0;
  let isStoppingRecording = false;
  let interactionGeneration = 0;
  let activationWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let hasSpeechActivationInCurrentRecording = false;
  let diagnostics: VoiceTurnDiagnostics = {};

  const isRejectedStreamingTranscript = (value: string) =>
    STREAMING_TRANSCRIPT_REJECTION_PATTERNS.some((pattern) => pattern.test(value));

  const normalizeStreamingTranscript = (value: string) => {
    const normalized = value.trim();

    if (!normalized || isRejectedStreamingTranscript(normalized)) {
      return "";
    }

    return normalized;
  };

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

  const refreshTTSCapabilities = async () => {
    try {
      ttsCapabilities.value = await fetchTTSCapabilities();
    } catch {
      ttsCapabilities.value = null;
    }
  };

  const refreshSTTStreamingCapabilities = async () => {
    try {
      sttStreamingCapabilities.value = await fetchSTTStreamingCapabilities();
    } catch {
      sttStreamingCapabilities.value = null;
    }
  };

  const resetUserStreamingCaptionState = () => {
    partialUserCaption.value = "";
    confirmedUserCaptions.value = [];
    streamedTranscriptPromise = null;
    streamedTranscriptResolver = null;
    streamedTranscriptRejecter = null;
    streamedTranscriptDurationMs = 0;
  };

  const resetDiagnostics = () => {
    diagnostics = {};
  };

  const clearActivationWaitTimer = () => {
    if (activationWaitTimer !== null) {
      clearTimeout(activationWaitTimer);
      activationWaitTimer = null;
    }
  };

  const buildCurrentStreamingTranscriptCandidate = () => {
    const confirmed = confirmedUserCaptions.value
      .map((segment) => normalizeStreamingTranscript(segment))
      .filter(Boolean);
    const partial = normalizeStreamingTranscript(partialUserCaption.value);

    return [...confirmed, partial].filter(Boolean).join(" ").trim();
  };

  const waitForStreamedTranscript = async (
    committedTranscriptPromise?: Promise<string>,
  ) => {
    if (!streamedTranscriptPromise) {
      return "";
    }

    try {
      const resolved = await Promise.race<string>([
        committedTranscriptPromise ?? streamedTranscriptPromise,
        new Promise<string>((resolve) => {
          setTimeout(() => {
            resolve(buildCurrentStreamingTranscriptCandidate());
          }, 4200);
        }),
      ]);

      return resolved.trim();
    } catch {
      return buildCurrentStreamingTranscriptCandidate();
    }
  };

  const logVoiceTurnDiagnostics = (label: string) => {
    const elapsed = (start?: number, end?: number) =>
      typeof start === "number" && typeof end === "number"
        ? end - start
        : undefined;

    console.log("[voice-turn] diagnostics", {
      label,
      sttMode: diagnostics.sttMode,
      usedTranscriptOverride: diagnostics.usedTranscriptOverride,
      recordingMs: elapsed(
        diagnostics.recordingStartedAtMs,
        diagnostics.recordingStoppedAtMs,
      ),
      requestMs: elapsed(
        diagnostics.requestStartedAtMs,
        diagnostics.responseReceivedAtMs,
      ),
      ttsSocketReadyDelayMs: elapsed(
        diagnostics.responseReceivedAtMs,
        diagnostics.ttsStreamOpenedAtMs,
      ),
      firstTtsTextDelayMs: elapsed(
        diagnostics.responseReceivedAtMs,
        diagnostics.firstTtsTextAtMs,
      ),
      firstTtsAudioDelayMs: elapsed(
        diagnostics.responseReceivedAtMs,
        diagnostics.firstTtsAudioAtMs,
      ),
    });
  };

  const stopPlaybackInfrastructure = () => {
    if (playerVisualizer) {
      playerVisualizer.stop();
    }

    if (ttsStreamPlayer) {
      void ttsStreamPlayer.fadeOutAndStop();
      ttsStreamPlayer = null;
    }

    if (ttsStreamingSocket) {
      ttsStreamingSocket.close();
      ttsStreamingSocket = null;
    }
  };

  const restoreReadyState = () => {
    currentState.value = "ready";
    currentVolume.value = 0;
    dispatchSystemStatus(
      activeConfig.value,
      metrics.value,
      false,
      currentVolume.value,
    );
  };

  /** Check backend status — retries every 3 s while the API is unreachable. */
  const checkSystemStatus = async () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    try {
      const data = await fetchJsonOrThrow<any>(
        `${API_BASE}/setup/status`,
        undefined,
        "Erro ao consultar status"
      );

      await loadSettings();
      await refreshTTSCapabilities();
      await refreshSTTStreamingCapabilities();

      const normalizedSTTMode = normalizeSTTPlaybackModeAgainstCapabilities(
        settings.value.sttPlaybackMode,
        sttStreamingCapabilities.value,
      );

      if (normalizedSTTMode !== settings.value.sttPlaybackMode) {
        await window.electronAPI.appSettings.update({
          sttPlaybackMode: normalizedSTTMode,
        });
        settings.value.sttPlaybackMode = normalizedSTTMode;
      }

      const normalizedPlaybackMode = resolveTTSPlaybackMode(
        settings.value.ttsPlaybackMode,
        ttsCapabilities.value,
      );

      if (normalizedPlaybackMode !== settings.value.ttsPlaybackMode) {
        await window.electronAPI.appSettings.update({
          ttsPlaybackMode: normalizedPlaybackMode,
        });
        settings.value.ttsPlaybackMode = normalizedPlaybackMode;
      }

      void syncAssistantSettingsToBackend(settings.value);

      const canMutateStatusState =
        currentState.value === "loading" ||
        currentState.value === "not_ready" ||
        currentState.value === "ready";

      if (data.ready) {
        if (canMutateStatusState) {
          currentState.value = "ready";
        }
        statusError.value = null;
      } else {
        if (canMutateStatusState) {
          currentState.value = "not_ready";
        }
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
        currentState.value === "recording",
        currentVolume.value
      );
    } catch {
      if (
        currentState.value === "loading" ||
        currentState.value === "not_ready" ||
        currentState.value === "ready"
      ) {
        currentState.value = "loading";
      }
      statusError.value = null;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        checkSystemStatus();
      }, 3000);
    }
  };

  /** Start recording from the microphone. */
  const startRecording = async (options?: StartRecordingOptions) => {
    if (currentState.value !== "ready") return;

    try {
      await loadSettings();
      resetUserStreamingCaptionState();
      liveCaption.value = "";
      resetDiagnostics();
      clearActivationWaitTimer();
      hasSpeechActivationInCurrentRecording = false;
      isStoppingRecording = false;
      interactionGeneration += 1;
      const interactionId = interactionGeneration;
      currentState.value = "recording";
      currentVolume.value = 0;
      recordingStartedAtMs = Date.now();
      diagnostics.recordingStartedAtMs = recordingStartedAtMs;
      diagnostics.sttMode = normalizeSTTPlaybackModeAgainstCapabilities(
        settings.value.sttPlaybackMode,
        sttStreamingCapabilities.value,
      );
      const silenceThreshold = voiceDetectionSensitivityToThreshold(
        settings.value.voiceDetectionSensitivity,
      );

      audioRecorder = new AudioRecorder({
        silenceThreshold,
        silenceDurationMs: 900,
        selectedDeviceId: settings.value.audioInputDeviceId || undefined,
        inputGain: settings.value.microphoneGain,
        waitForSpeechActivation: options?.waitForSpeechActivation ?? false,
        activationThreshold: Math.max(silenceThreshold * 2.35, 0.03),
        activationMinDurationMs: options?.waitForSpeechActivation ? 140 : 0,
        preRollMs: options?.waitForSpeechActivation ? 500 : 0,
        onVolume: (rms: number) => {
          currentVolume.value = rms;
          dispatchSystemStatus(
            activeConfig.value,
            metrics.value,
            true,
            currentVolume.value
          );
        },
        onPcmChunk: (chunk) => {
          if (
            diagnostics.sttMode !== "stream" ||
            !sttStreamingCapabilities.value?.streaming.supported
          ) {
            return;
          }

          if (!sttStreamingClient) {
            sttStreamingClient = createSTTStreamingClient({
              onReady: () => {},
              onPartial: ({ text }) => {
                const normalized = normalizeStreamingTranscript(text);
                if (!normalized) {
                  return;
                }
                console.log("[voice-turn] partial transcript", {
                  text: normalized,
                  length: normalized.length,
                });
                partialUserCaption.value = normalized;
              },
              onConfirmed: ({ text }) => {
                const normalized = normalizeStreamingTranscript(text);
                if (!normalized) {
                  return;
                }
                console.log("[voice-turn] confirmed transcript segment", {
                  text: normalized,
                  length: normalized.length,
                });
                confirmedUserCaptions.value = [...confirmedUserCaptions.value, normalized];
                partialUserCaption.value = "";
              },
              onFinal: ({ text }) => {
                const normalized = normalizeStreamingTranscript(text);
                console.log("[voice-turn] final streamed transcript", {
                  text: normalized,
                  length: normalized.length,
                });
                if (normalized) {
                  lastTranscript.value = normalized;
                }
                partialUserCaption.value = "";
                if (normalized) {
                  confirmedUserCaptions.value = [normalized];
                }
                streamedTranscriptResolver?.(normalized);
              },
              onError: (error) => {
                streamedTranscriptRejecter?.(error);
              },
            });

            streamedTranscriptPromise = new Promise<string>((resolve, reject) => {
              streamedTranscriptResolver = resolve;
              streamedTranscriptRejecter = reject;
            });

            void sttStreamingClient
              .connect({
                sampleRate: chunk.sampleRate,
                channels: 1,
                encoding: "pcm_f32le",
              })
              .then(() => {
                sttStreamingClient?.sendChunk(chunk.samples);
              })
              .catch((error) => {
                console.warn("[voice-turn] failed to start stt streaming", error);
              });
            return;
          }

          sttStreamingClient.sendChunk(chunk.samples);
        },
        onSpeechActivation: () => {
          hasSpeechActivationInCurrentRecording = true;
          clearActivationWaitTimer();
          partialUserCaption.value = "";
          confirmedUserCaptions.value = [];
          options?.onSpeechActivation?.();
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

      if (
        options?.waitForSpeechActivation &&
        (options.maxActivationWaitMs ?? 0) > 0
      ) {
        activationWaitTimer = setTimeout(() => {
          if (
            interactionId !== interactionGeneration ||
            currentState.value !== "recording" ||
            hasSpeechActivationInCurrentRecording
          ) {
            return;
          }

          clearActivationWaitTimer();
          if (audioRecorder) {
            audioRecorder.cancel();
            audioRecorder = null;
          }
          if (sttStreamingClient) {
            void sttStreamingClient.cancel();
            sttStreamingClient.close();
            sttStreamingClient = null;
          }
          recordingStartedAtMs = null;
          currentVolume.value = 0;
          resetUserStreamingCaptionState();
          restoreReadyState();
          void options.onActivationTimeout?.();
        }, options.maxActivationWaitMs);
      }
    } catch (err: any) {
      console.error("Failed to start recording:", err);
      clearActivationWaitTimer();
      hasSpeechActivationInCurrentRecording = false;
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

  const createVoiceTurnFormData = (input: {
    audioBlob: Blob;
    transcriptOverride?: string;
    sttMode?: "standard" | "stream";
    sttStreamingDurationMs?: number;
  }) => {
    const formData = new FormData();
    if (input.transcriptOverride?.trim()) {
      formData.append("transcriptOverride", input.transcriptOverride.trim());
    }
    formData.append("sttMode", input.sttMode ?? "standard");
    if (input.transcriptOverride && (input.sttStreamingDurationMs ?? 0) > 0) {
      formData.append(
        "sttStreamingDurationMs",
        String(input.sttStreamingDurationMs),
      );
    }
    formData.append("audio", input.audioBlob, "user_voice.wav");
    return formData;
  };

  const readErrorFromResponse = async (res: Response) => {
    const text = await res.text();
    let payload: {
      error?: string;
      details?: string | null;
      requestId?: string | null;
      source?: string;
    } | null = null;

    try {
      payload = JSON.parse(text) as {
        error?: string;
        details?: string | null;
        requestId?: string | null;
        source?: string;
      };
    } catch {
      payload = null;
    }

    throw new AppHttpError({
      message:
        payload?.error
          ? `${payload.source ? `${payload.source}: ` : ""}${payload.error}${payload.requestId ? ` (request ${payload.requestId})` : ""}`
          : "Voice turn request failed",
      status: res.status,
      requestId: payload?.requestId,
      source: payload?.source ?? "api",
      details: payload?.details ?? text,
      payload,
    });
  };

  const playStandardAudioPayload = async (data: AssistantVoiceTurnResponse) => {
    if (!data.audioBase64) {
      console.warn("[voice-turn] response without audio payload");
      resetStreamingSessionState(activeTTSStreamSessionId);
      currentState.value = "ready";
      dispatchSystemStatus(
        activeConfig.value,
        metrics.value,
        false,
        currentVolume.value,
      );
      return;
    }

    if (!audioElement.value) {
      console.error("[voice-turn] audio element is not bound");
      throw new Error("Audio element is not available");
    }

    currentState.value = "speaking";
    activeTTSStreamSessionId.value = null;

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

    try {
      await audioElement.value.play();
    } catch (playbackError) {
      console.error("[voice-turn] audio playback failed", playbackError);
      throw playbackError;
    }
  };

  const playStreamingTTS = async (text: string) => {
    const socketUrl = `${API_BASE.replace("http://", "ws://").replace("https://", "wss://")}/tts-streaming/ws`;
    const streamPlayer = new TTSPcmStreamPlayer();
    ttsStreamPlayer = streamPlayer;
    await applyAudioOutputPreferences();

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(socketUrl);
      ttsStreamingSocket = socket;
      let completed = false;

      socket.addEventListener("open", () => {
        diagnostics.ttsStreamOpenedAtMs = Date.now();
        socket.send(
          JSON.stringify({
            type: "session.start",
            payload: { text },
          }),
        );
      });

      socket.addEventListener("message", (event) => {
        void (async () => {
          const message = JSON.parse(String(event.data)) as {
            type: string;
            sessionId?: string;
            payload?: Record<string, unknown>;
          };

          if (message.sessionId) {
            activeTTSStreamSessionId.value = message.sessionId;
          }

          if (message.type === "text.chunk") {
            diagnostics.firstTtsTextAtMs ??= Date.now();
            currentState.value = "speaking";
            liveCaption.value = String(message.payload?.text ?? "");
            return;
          }

          if (message.type === "audio.chunk") {
            diagnostics.firstTtsAudioAtMs ??= Date.now();
            currentState.value = "speaking";
            currentVolume.value = 0.035;

            const audioBase64 = String(message.payload?.audioBase64 ?? "");
            const sampleRate = Number(message.payload?.sampleRate ?? 22050);
            const channels = Number(message.payload?.channels ?? 1);
            const binary = Uint8Array.from(atob(audioBase64), (char) => char.charCodeAt(0));

            await streamPlayer.enqueueChunk({
              pcmBytes: binary,
              sampleRate,
              channels,
              volume: Math.min(1, Math.max(0, settings.value.outputVolume)),
            });
            return;
          }

          if (message.type === "metrics") {
            metrics.value = {
              ...metrics.value,
              tts: Number(message.payload?.elapsedMs ?? 0),
              total:
                (metrics.value?.stt ?? 0) +
                (metrics.value?.llm ?? 0) +
                Number(message.payload?.elapsedMs ?? 0),
            };
            dispatchSystemStatus(
              activeConfig.value,
              metrics.value,
              false,
              currentVolume.value,
            );
            return;
          }

          if (message.type === "session.complete") {
            completed = true;
            currentState.value = "speaking";
            await streamPlayer.waitForDrain();
            stopPlaybackInfrastructure();
            resetStreamingSessionState(activeTTSStreamSessionId);
            currentVolume.value = 0;
            currentState.value = "ready";
            dispatchSystemStatus(
              activeConfig.value,
              metrics.value,
              false,
              currentVolume.value,
            );
            socket.close();
            resolve();
            return;
          }

          if (message.type === "session.cancelled") {
            completed = true;
            socket.close();
            resolve();
            return;
          }

          if (message.type === "session.error") {
            completed = true;
            socket.close();
            reject(
              new Error(String(message.payload?.error ?? "TTS streaming failed")),
            );
          }
        })().catch(reject);
      });

      socket.addEventListener("close", () => {
        ttsStreamingSocket = null;

        if (!completed && currentState.value === "speaking") {
          resolve();
        }
      });

      socket.addEventListener("error", () => {
        reject(new Error("Failed to open TTS streaming socket"));
      });
    });
  };

  /** Stop recording, send audio to the backend and play the response. */
  const stopRecording = async () => {
    if (currentState.value !== "recording" || !audioRecorder || isStoppingRecording) {
      return;
    }

    const interactionId = interactionGeneration;
    isStoppingRecording = true;
    clearActivationWaitTimer();
    const stopResult = audioRecorder.stop();
    const audioBlob = stopResult.audioBlob;
    audioRecorder = null;
    currentVolume.value = 0;
    diagnostics.recordingStoppedAtMs = Date.now();
    dispatchSystemStatus(
      activeConfig.value,
      metrics.value,
      false,
      currentVolume.value
    );

    try {
      activeRequestController?.abort();
      activeRequestController = new AbortController();
      let transcriptOverride: string | undefined;

      if (diagnostics.sttMode === "stream" && sttStreamingClient) {
        const sttWaitStartedAt = Date.now();
        const committedTranscriptPromise = sttStreamingClient.commit("recording_finished");
        const optimisticTranscript = buildCurrentStreamingTranscriptCandidate();
        transcriptOverride = (
          optimisticTranscript ||
          (await waitForStreamedTranscript(committedTranscriptPromise))
        ) || undefined;
        streamedTranscriptDurationMs = Date.now() - sttWaitStartedAt;
      }

      transcriptOverride = normalizeStreamingTranscript(transcriptOverride ?? "") || undefined;

      diagnostics.usedTranscriptOverride = Boolean(transcriptOverride?.trim());

      const hasRecordedAudio = audioBlob.size > 44 && stopResult.hasMeaningfulSpeech;
      const hasTranscriptOverride = Boolean(transcriptOverride?.trim());

      if (!hasRecordedAudio && !hasTranscriptOverride) {
        resetStreamingSessionState(activeTTSStreamSessionId);
        restoreReadyState();
        return;
      }

      currentState.value = "thinking";

      const effectivePlaybackMode = resolveTTSPlaybackMode(
        settings.value.ttsPlaybackMode,
        ttsCapabilities.value,
      );

      if (effectivePlaybackMode === "stream") {
        diagnostics.requestStartedAtMs = Date.now();
        const prepareResponse = await fetch(`${API_BASE}/assistant/voice-turn/prepare`, {
          method: "POST",
          body: createVoiceTurnFormData({
            audioBlob,
            transcriptOverride,
            sttMode: diagnostics.sttMode,
            sttStreamingDurationMs: streamedTranscriptDurationMs,
          }),
          signal: activeRequestController?.signal,
        });

        if (!prepareResponse.ok) {
          await readErrorFromResponse(prepareResponse);
        }

        const data = (await prepareResponse.json()) as AssistantVoiceTurnPreparationResponse;
        if (interactionId !== interactionGeneration) {
          return;
        }
        diagnostics.responseReceivedAtMs = Date.now();
        lastTranscript.value = data.transcript;
        lastResponse.value = data.responseText;
        liveCaption.value = "";
        partialUserCaption.value = "";
        confirmedUserCaptions.value = data.transcript ? [data.transcript] : [];

        metrics.value = {
          stt: data.sttDurationMs,
          llm: data.llmDurationMs,
          total: data.durationMs,
        };

        dispatchSystemStatus(
          activeConfig.value,
          metrics.value,
          false,
          currentVolume.value,
        );

        logVoiceTurnDiagnostics("prepare-complete");
        await playStreamingTTS(data.responseText);
        return;
      }

      diagnostics.requestStartedAtMs = Date.now();
      const res = await fetch(`${API_BASE}/assistant/voice-turn`, {
        method: "POST",
        body: createVoiceTurnFormData({
          audioBlob,
          transcriptOverride,
          sttMode: diagnostics.sttMode,
          sttStreamingDurationMs: streamedTranscriptDurationMs,
        }),
        signal: activeRequestController?.signal,
      });

      if (!res.ok) {
        await readErrorFromResponse(res);
      }

      const data = (await res.json()) as AssistantVoiceTurnResponse;
      if (interactionId !== interactionGeneration) {
        return;
      }
      diagnostics.responseReceivedAtMs = Date.now();
      lastTranscript.value = data.transcript;
      lastResponse.value = data.responseText;
      liveCaption.value = data.responseText;
      partialUserCaption.value = "";
      confirmedUserCaptions.value = data.transcript ? [data.transcript] : [];

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
        currentVolume.value,
      );

      logVoiceTurnDiagnostics("voice-turn-complete");
      await playStandardAudioPayload(data);
    } catch (err: any) {
      if (interactionId !== interactionGeneration) {
        return;
      }
      if (err?.name === "AbortError") {
        resetStreamingSessionState(activeTTSStreamSessionId);
        restoreReadyState();
        return;
      }

      console.error("Error processing voice turn:", err);
      if (err instanceof AppHttpError) {
        console.error("[voice-turn] backend error details", {
          status: err.status,
          source: err.source,
          requestId: err.requestId,
          details: err.details,
          payload: err.payload,
        });
      }
      resetStreamingSessionState(activeTTSStreamSessionId);
      restoreReadyState();
      toast.error("Error processing speech: " + err.message);
    } finally {
      if (sttStreamingClient) {
        sttStreamingClient.close();
        sttStreamingClient = null;
      }
      activeRequestController = null;
      recordingStartedAtMs = null;
      isStoppingRecording = false;
      hasSpeechActivationInCurrentRecording = false;
      clearActivationWaitTimer();
      resetDiagnostics();
    }
  };

  const cancelInteraction = () => {
    interactionGeneration += 1;
    activeRequestController?.abort();
    activeRequestController = null;
    recordingStartedAtMs = null;
    clearActivationWaitTimer();
    hasSpeechActivationInCurrentRecording = false;
    resetDiagnostics();

    if (currentState.value === "recording" && audioRecorder) {
      audioRecorder.cancel();
      audioRecorder = null;
    }

    if (sttStreamingClient) {
      void sttStreamingClient.cancel();
      sttStreamingClient.close();
      sttStreamingClient = null;
    }

    if (currentState.value === "speaking" && audioElement.value) {
      audioElement.value.pause();
      audioElement.value.currentTime = 0;
      audioElement.value.removeAttribute("src");
      audioElement.value.load();
    }

    if (
      ttsStreamingSocket &&
      activeTTSStreamSessionId.value &&
      ttsStreamingSocket.readyState === WebSocket.OPEN
    ) {
      ttsStreamingSocket.send(
        JSON.stringify({
          type: "session.cancel",
          sessionId: activeTTSStreamSessionId.value,
          payload: { reason: "client_cancelled" },
        }),
      );
    }
    stopPlaybackInfrastructure();

    currentVolume.value = 0;
    liveCaption.value = "";
    resetStreamingSessionState(activeTTSStreamSessionId);
    resetUserStreamingCaptionState();
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
      void startRecording();
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
    stopPlaybackInfrastructure();
    resetStreamingSessionState(activeTTSStreamSessionId);
    recordingStartedAtMs = null;
    clearActivationWaitTimer();
    hasSpeechActivationInCurrentRecording = false;
    resetDiagnostics();
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
    void refreshTTSCapabilities();
    void refreshSTTStreamingCapabilities();
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
    clearActivationWaitTimer();
    window.removeEventListener("refresh-status", checkSystemStatus);
    window.removeEventListener("app-appearance-updated", syncAccentColor);
    if (playerVisualizer) {
      playerVisualizer.close();
    }
    if (ttsStreamPlayer) {
      ttsStreamPlayer.close();
      ttsStreamPlayer = null;
    }
    if (ttsStreamingSocket) {
      ttsStreamingSocket.close();
      ttsStreamingSocket = null;
    }
    if (sttStreamingClient) {
      sttStreamingClient.close();
      sttStreamingClient = null;
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
    liveCaption,
    partialUserCaption,
    confirmedUserCaptions,
    lastTranscript,
    lastResponse,
    metrics,
    activeTTSStreamSessionId,
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
