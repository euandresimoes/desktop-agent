import type { AppSettings, AppSettingsPatch } from "../types/app-settings";

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
