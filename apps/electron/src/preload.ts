// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    window: {
        minimize: () => ipcRenderer.send('window:minimize'),
        maximize: () => ipcRenderer.send('window:maximize'),
        close: () => ipcRenderer.send('window:close'),
    },
    dialog: {
        openFile: (options?: any) => ipcRenderer.invoke('dialog:openFile', options),
    },
    shell: {
        showItemInFolder: (targetPath: string) => ipcRenderer.invoke('shell:showItemInFolder', targetPath),
    },
    appSettings: {
        get: () => ipcRenderer.invoke('app-settings:get'),
        update: (patch: Record<string, unknown>) => ipcRenderer.invoke('app-settings:update', patch),
    },
});
