import { globalShortcut } from "electron";

import type { AppSettings } from "../../shared/types/app-settings";

type OverlayHotkeyControllerOptions = {
  getSettings: () => AppSettings | null;
  openAndStartRecording: (settings: AppSettings) => void | Promise<void>;
  isOverlayVisible: () => boolean;
};

const HOTKEY = "CommandOrControl+Space";

export function createOverlayHotkeyController(
  options: OverlayHotkeyControllerOptions,
) {
  const handleHotkey = () => {
    const settings = options.getSettings();

    if (!settings) {
      return;
    }

    if (!options.isOverlayVisible()) {
      void options.openAndStartRecording(settings);
      return;
    }
  };

  return {
    register() {
      const registered = globalShortcut.register(HOTKEY, handleHotkey);

      if (!registered) {
        console.warn(`[overlay-hotkey] Failed to register ${HOTKEY}`);
      }
    },
    unregister() {
      globalShortcut.unregister(HOTKEY);
    },
    unregisterAll() {
      globalShortcut.unregisterAll();
    },
  };
}
