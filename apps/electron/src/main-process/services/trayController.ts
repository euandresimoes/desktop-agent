import { BrowserWindow, Menu, Tray, nativeImage } from "electron";

let tray: Tray | null = null;

const createTrayIcon = () => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect x="5" y="5" width="22" height="22" rx="7" fill="#e9e9e9"/>
      <rect x="10" y="15" width="3" height="7" rx="1.5" fill="#151515"/>
      <rect x="14.5" y="11" width="3" height="11" rx="1.5" fill="#151515"/>
      <rect x="19" y="8" width="3" height="14" rx="1.5" fill="#151515"/>
    </svg>
  `.trim();

  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  );
};

const revealWindow = (mainWindow: BrowserWindow) => {
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.focus();
};

export function ensureTray(
  mainWindow: BrowserWindow,
  onQuit: () => void,
) {
  if (!tray) {
    tray = new Tray(createTrayIcon());
    tray.setToolTip("Desktop Agent");
    tray.on("click", () => revealWindow(mainWindow));
    tray.on("double-click", () => revealWindow(mainWindow));
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open Desktop Agent",
        click: () => revealWindow(mainWindow),
      },
      {
        type: "separator",
      },
      {
        label: "Quit",
        click: onQuit,
      },
    ]),
  );

  return tray;
}

export function destroyTray() {
  tray?.destroy();
  tray = null;
}

export function revealWindowFromTray(mainWindow: BrowserWindow) {
  revealWindow(mainWindow);
}
