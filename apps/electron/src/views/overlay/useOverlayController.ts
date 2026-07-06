import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { AppHttpError } from "../../shared/utils/http";
import { useToast } from "../../shared/utils/toast";
import { useVoiceTurnService } from "../voice-turn/services/voiceTurnService";
import type {
  AppOverlayAnimation,
  AppOverlayPosition,
} from "../../shared/types/app-settings";

type OverlayVoiceState = "hidden" | "idle" | "recording" | "processing" | "speaking";

const mapVoiceState = (value: string): OverlayVoiceState => {
  switch (value) {
    case "recording":
      return "recording";
    case "thinking":
      return "processing";
    case "speaking":
      return "speaking";
    default:
      return "idle";
  }
};

export function useOverlayController() {
  const toast = useToast();
  const voiceTurn = useVoiceTurnService();
  const overlayLoopActive = ref(false);
  const overlayVisible = ref(false);
  const isClosingOverlay = ref(false);
  const pendingRecordingStart = ref(false);
  const isStartingRecording = ref(false);
  const overlayConfig = ref<{
    position: AppOverlayPosition;
    opacity: number;
    animation: AppOverlayAnimation;
  }>({
    position: "bottom-center",
    opacity: 0.94,
    animation: "fade",
  });

  const getAnimationDurationMs = () => {
    switch (overlayConfig.value.animation) {
      case "slide":
        return 220;
      case "pop":
        return 190;
      default:
        return 170;
    }
  };

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  const closeOverlayAnimated = async (cancelVoiceTurn = true) => {
    if (isClosingOverlay.value) {
      return;
    }

    overlayLoopActive.value = false;
    pendingRecordingStart.value = false;
    isStartingRecording.value = false;
    isClosingOverlay.value = true;
    overlayVisible.value = false;

    if (cancelVoiceTurn) {
      voiceTurn.cancelInteraction();
    }

    await wait(getAnimationDurationMs());
    await window.electronAPI.overlay.hide();
    isClosingOverlay.value = false;
  };

  const beginOverlayRecording = async () => {
    if (isStartingRecording.value || voiceTurn.currentState.value !== "ready") {
      return;
    }

    isStartingRecording.value = true;
    pendingRecordingStart.value = false;

    try {
      await voiceTurn.startRecording({
        waitForSpeechActivation: true,
        maxActivationWaitMs: 5000,
        onActivationTimeout: () => {
          void closeOverlayAnimated(false);
        },
      });
    } finally {
      isStartingRecording.value = false;
    }
  };

  const startOverlayRecordingLoop = async () => {
    overlayLoopActive.value = true;
    isClosingOverlay.value = false;
    overlayVisible.value = true;

    if (voiceTurn.currentState.value !== "ready") {
      pendingRecordingStart.value = true;
      void voiceTurn.checkSystemStatus();
      return;
    }

    await beginOverlayRecording();
  };

  const handleOverlayHide = async () => {
    await closeOverlayAnimated(true);
  };

  const handleCommand = async (command: string) => {
    if (command === "start-recording") {
      await startOverlayRecordingLoop();
      return;
    }

    if (command === "stop-recording") {
      await voiceTurn.stopRecording();
      return;
    }

    if (command === "cancel-and-hide") {
      await handleOverlayHide();
    }
  };

  const handleKeydown = async (event: KeyboardEvent) => {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    await handleOverlayHide();
  };

  const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
    if (e.reason instanceof AppHttpError) {
      toast.error(e.reason.message, 6000);
      return;
    }

    const msg = e.reason instanceof Error
      ? e.reason.message
      : String(e.reason ?? "Unhandled error");
    toast.error(msg, 6000);
  };

  const handleWindowError = (e: ErrorEvent) => {
    toast.error(e.message ?? "An unexpected error occurred", 6000);
  };

  let removeOverlayCommandListener: (() => void) | null = null;
  let removeOverlayConfigListener: (() => void) | null = null;

  onMounted(() => {
    removeOverlayCommandListener = window.electronAPI.overlay.onCommand(
      (payload) => {
        void handleCommand(payload.command);
      },
    );
    removeOverlayConfigListener = window.electronAPI.overlay.onConfig(
      (payload) => {
        overlayConfig.value = {
          position: payload.position as AppOverlayPosition,
          opacity: payload.opacity,
          animation: payload.animation as AppOverlayAnimation,
        };
      },
    );

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleWindowError);

    queueMicrotask(() => {
      window.electronAPI.overlay.notifyReady();
    });
  });

  onBeforeUnmount(() => {
    removeOverlayCommandListener?.();
    removeOverlayCommandListener = null;
    removeOverlayConfigListener?.();
    removeOverlayConfigListener = null;
    window.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    window.removeEventListener("error", handleWindowError);
  });

  watch(
    voiceTurn.currentState,
    (value, previousValue) => {
      window.electronAPI.overlay.setVoiceState(mapVoiceState(value));

      if (
        overlayLoopActive.value &&
        !isClosingOverlay.value &&
        previousValue === "speaking" &&
        value === "ready"
      ) {
        void startOverlayRecordingLoop();
      }

      if (
        overlayLoopActive.value &&
        pendingRecordingStart.value &&
        !isClosingOverlay.value &&
        value === "ready"
      ) {
        void beginOverlayRecording();
      }
    },
    { immediate: true },
  );

  const statusHint = computed(() => {
    switch (voiceTurn.currentState.value) {
      case "recording":
        return "Listening";
      case "thinking":
        return "Cancel   Esc";
      case "speaking":
        return "Cancel   Esc";
      default:
        return "Overlay active";
    }
  });

  const overlayTransitionName = computed(() => {
    switch (overlayConfig.value.animation) {
      case "slide":
        return "overlay-slide";
      case "pop":
        return "overlay-pop";
      default:
        return "overlay-fade";
    }
  });

  const overlayPositionClass = computed(
    () => `overlay-pos-${overlayConfig.value.position}`,
  );

  const overlayCardStyle = computed(() => ({
    "--overlay-card-bg": `color-mix(in srgb, var(--color-overlay-base) ${Math.round(overlayConfig.value.opacity * 100)}%, transparent)`,
  }));

  return {
    ...voiceTurn,
    handleOverlayHide,
    statusHint,
    overlayVisible,
    overlayTransitionName,
    overlayPositionClass,
    overlayCardStyle,
  };
}
