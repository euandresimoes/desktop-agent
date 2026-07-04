import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import {
  getAppSettings,
  updateAppSettings,
} from "./main-process/services/appSettingsStore";
import { warmupActiveLlmModel } from "./main-process/services/llmWarmupClient";
import {
  destroyTray,
  ensureTray,
  revealWindowFromTray,
} from "./main-process/services/trayController";
import type {
  AppSettings,
  AppSettingsPatch,
} from "./shared/types/app-settings";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let currentAppSettings: AppSettings | null = null;

const isDev = Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL);

const quitApplication = () => {
  isQuitting = true;
  destroyTray();
  app.quit();
};

const applyAppSettings = async (
  nextSettings: AppSettings,
  previousSettings?: AppSettings,
) => {
  currentAppSettings = nextSettings;

  if (process.platform === "win32" || process.platform === "darwin") {
    app.setLoginItemSettings({
      openAtLogin: nextSettings.openOnStartup,
    });
  }

  if (mainWindow && nextSettings.closeToTray) {
    ensureTray(mainWindow, quitApplication);
  } else if (!nextSettings.closeToTray) {
    destroyTray();
  }

  if (
    mainWindow &&
    nextSettings.launchMaximized &&
    !mainWindow.isMaximized()
  ) {
    mainWindow.maximize();
  }

  if (
    previousSettings &&
    nextSettings.autoWarmupLlm &&
    !previousSettings.autoWarmupLlm
  ) {
    void warmupActiveLlmModel();
  }
};

const createWindow = async () => {
  const settings = currentAppSettings ?? (await getAppSettings());
  currentAppSettings = settings;

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 850,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.on("close", (event) => {
    if (currentAppSettings?.closeToTray && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();

      if (mainWindow) {
        ensureTray(mainWindow, quitApplication);
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow) {
      return;
    }

    if (settings.launchMaximized) {
      mainWindow.maximize();
    }

    mainWindow.show();

    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("before-quit", () => {
  isQuitting = true;
});

app.on("ready", async () => {
  const settings = await getAppSettings();
  await applyAppSettings(settings);
  await createWindow();

  if (settings.autoWarmupLlm) {
    void warmupActiveLlmModel();
  }
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow) {
    revealWindowFromTray(mainWindow);
    return;
  }

  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

ipcMain.on('window:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.minimize();
});

ipcMain.on('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.close();
});

ipcMain.handle('dialog:openFile', async (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  return await dialog.showOpenDialog(win, options || {
    properties: ['openFile']
  });
});

ipcMain.handle('shell:showItemInFolder', async (_event, targetPath: string) => {
  if (!targetPath) {
    return false;
  }

  shell.showItemInFolder(targetPath);
  return true;
});

ipcMain.handle("app-settings:get", async () => {
  const settings = await getAppSettings();
  currentAppSettings = settings;
  return settings;
});

ipcMain.handle(
  "app-settings:update",
  async (_event, patch: AppSettingsPatch) => {
    const previousSettings = await getAppSettings();
    const nextSettings = await updateAppSettings(patch);

    await applyAppSettings(nextSettings, previousSettings);

    return nextSettings;
  },
);
