import type { AppSettings, AppSettingsPatch } from "../types/app-settings";

type OverlayVoiceState = "hidden" | "idle" | "recording" | "processing" | "speaking";
type OverlayAnimation = "fade" | "slide" | "pop";
type OverlayPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

declare global {
  interface Window {
    electronAPI: {
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      dialog: {
        openFile: (options?: {
          title?: string;
          defaultPath?: string;
          buttonLabel?: string;
          filters?: Array<{ name: string; extensions: string[] }>;
          properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory' | 'promptToCreate' | 'noResolveAliases' | 'treatPackageAsDirectory' | 'dontAddToRecent'>;
        }) => Promise<{ canceled: boolean; filePaths: string[] } | null>;
      };
      shell: {
        showItemInFolder: (targetPath: string) => Promise<boolean>;
      };
      appSettings: {
        get: () => Promise<AppSettings>;
        update: (patch: AppSettingsPatch) => Promise<AppSettings>;
      };
      overlay: {
        hide: () => Promise<boolean>;
        notifyReady: () => void;
        setVoiceState: (state: OverlayVoiceState) => void;
        onCommand: (
          listener: (payload: { command: string }) => void,
        ) => () => void;
        onConfig: (
          listener: (payload: {
            position: OverlayPosition;
            opacity: number;
            animation: OverlayAnimation;
          }) => void,
        ) => () => void;
      };
    };
  }
}

function minimizeWindow() {
    window.electronAPI.window.minimize();
}

function maximizeWindow() {
    window.electronAPI.window.maximize();
}

function closeWindow() {
    window.electronAPI.window.close();
}

export {
    minimizeWindow,
    maximizeWindow,
    closeWindow
}
