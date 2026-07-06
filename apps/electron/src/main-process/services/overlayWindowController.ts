import { BrowserWindow, screen } from "electron";
import path from "node:path";

import type { AppSettings } from "../../shared/types/app-settings";
import type {
  OverlayRendererConfig,
  OverlayRendererCommand,
  OverlayVoiceState,
} from "./overlayTypes";
import { resolveOverlayBounds } from "./overlayPositioning";

type OverlayWindowControllerOptions = {
  devServerUrl?: string;
  rendererName: string;
};

const OVERLAY_WIDTH = 420;
const OVERLAY_HEIGHT = 146;
const OVERLAY_MARGIN = 18;

export function createOverlayWindowController(
  options: OverlayWindowControllerOptions,
) {
  let overlayWindow: BrowserWindow | null = null;
  let loadPromise: Promise<void> | null = null;
  let voiceState: OverlayVoiceState = "hidden";
  let rendererReady = false;
  let resolveRendererReady: (() => void) | null = null;
  let rendererReadyPromise: Promise<void> | null = null;

  const resetRendererReady = () => {
    rendererReady = false;
    rendererReadyPromise = new Promise<void>((resolve) => {
      resolveRendererReady = resolve;
    });
  };

  const markRendererReady = () => {
    if (rendererReady) {
      return;
    }

    rendererReady = true;
    resolveRendererReady?.();
    resolveRendererReady = null;
  };

  const waitForRendererReady = async () => {
    if (rendererReady || !rendererReadyPromise) {
      return;
    }

    await Promise.race([
      rendererReadyPromise,
      new Promise<void>((resolve) => {
        setTimeout(resolve, 800);
      }),
    ]);
  };

  const sendCommand = (command: OverlayRendererCommand) => {
    overlayWindow?.webContents.send("overlay:command", { command });
  };

  const sendConfig = (settings: AppSettings) => {
    const config: OverlayRendererConfig = {
      position: settings.overlayPosition,
      opacity: settings.overlayOpacity,
      animation: settings.overlayAnimation,
    };

    overlayWindow?.webContents.send("overlay:config", config);
  };

  const updatePosition = (settings: AppSettings) => {
    if (!overlayWindow) {
      return;
    }

    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const { x, y } = resolveOverlayBounds({
      workArea: display.workArea,
      overlayWidth: OVERLAY_WIDTH,
      overlayHeight: OVERLAY_HEIGHT,
      margin: OVERLAY_MARGIN,
      position: settings.overlayPosition,
    });

    overlayWindow.setBounds({
      x,
      y,
      width: OVERLAY_WIDTH,
      height: OVERLAY_HEIGHT,
    });
  };

  const ensureWindow = async (settings: AppSettings) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      if (loadPromise) {
        await loadPromise;
      }
      updatePosition(settings);
      sendConfig(settings);
      return overlayWindow;
    }

    overlayWindow = new BrowserWindow({
      width: OVERLAY_WIDTH,
      height: OVERLAY_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
      },
    });

    overlayWindow.on("closed", () => {
      overlayWindow = null;
      loadPromise = null;
      voiceState = "hidden";
      rendererReady = false;
      rendererReadyPromise = null;
      resolveRendererReady = null;
    });

    overlayWindow.on("hide", () => {
      voiceState = "hidden";
    });

    updatePosition(settings);
    resetRendererReady();

    loadPromise = (async () => {
      if (options.devServerUrl) {
        await overlayWindow?.loadURL(`${options.devServerUrl}#overlay`);
      } else if (overlayWindow) {
        await overlayWindow.loadFile(
          path.join(
            __dirname,
            `../renderer/${options.rendererName}/index.html`,
          ),
          { hash: "overlay" },
        );
      }
    })().finally(() => {
      loadPromise = null;
    });

    await loadPromise;
    await waitForRendererReady();
    sendConfig(settings);

    return overlayWindow;
  };

  return {
    async show(settings: AppSettings) {
      const window = await ensureWindow(settings);
      updatePosition(settings);
      sendConfig(settings);
      window.show();
      window.focus();
      if (voiceState === "hidden") {
        voiceState = "idle";
      }
    },
    async openAndStartRecording(settings: AppSettings) {
      const window = await ensureWindow(settings);
      updatePosition(settings);
      sendConfig(settings);
      window.show();
      window.focus();
      voiceState = "idle";
      sendCommand("start-recording");
    },
    stopRecording() {
      if (!overlayWindow || overlayWindow.isDestroyed()) {
        return;
      }

      sendCommand("stop-recording");
    },
    startRecording() {
      if (!overlayWindow || overlayWindow.isDestroyed()) {
        return;
      }

      sendCommand("start-recording");
    },
    hide() {
      if (!overlayWindow || overlayWindow.isDestroyed()) {
        return;
      }

      voiceState = "hidden";
      overlayWindow.hide();
    },
    hideAndCancel() {
      if (!overlayWindow || overlayWindow.isDestroyed()) {
        return;
      }

      sendCommand("cancel-and-hide");
      voiceState = "hidden";
      overlayWindow.hide();
    },
    updatePosition,
    applySettings(settings: AppSettings) {
      updatePosition(settings);
      sendConfig(settings);
    },
    markRendererReady,
    setVoiceState(nextState: OverlayVoiceState) {
      voiceState = nextState;
    },
    getVoiceState() {
      return voiceState;
    },
    isVisible() {
      return Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible());
    },
    getWindow() {
      return overlayWindow;
    },
    destroy() {
      if (!overlayWindow || overlayWindow.isDestroyed()) {
        overlayWindow = null;
        return;
      }

      overlayWindow.destroy();
      overlayWindow = null;
      loadPromise = null;
      voiceState = "hidden";
    },
  };
}
