// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

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
    overlay: {
        hide: () => ipcRenderer.invoke('overlay:hide'),
        notifyReady: () => ipcRenderer.send('overlay:renderer-ready'),
        setVoiceState: (state: string) => ipcRenderer.send('overlay:set-voice-state', state),
        onCommand: (listener: (payload: { command: string }) => void) => {
            const handler = (_event: IpcRendererEvent, payload: { command: string }) => listener(payload);
            ipcRenderer.on('overlay:command', handler);
            return () => ipcRenderer.removeListener('overlay:command', handler);
        },
        onConfig: (listener: (payload: { position: string; opacity: number; animation: string }) => void) => {
            const handler = (_event: IpcRendererEvent, payload: { position: string; opacity: number; animation: string }) => listener(payload);
            ipcRenderer.on('overlay:config', handler);
            return () => ipcRenderer.removeListener('overlay:config', handler);
        },
    },
});
