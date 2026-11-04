import { contextBridge, ipcRenderer } from "electron";

const api = {
  chooseFolder: () => ipcRenderer.invoke("dialog:folder") as Promise<string | null>,
  chooseFiles: () => ipcRenderer.invoke("dialog:files") as Promise<string[]>,
  scanFolder: (folder: string) => ipcRenderer.invoke("library:scan", folder) as Promise<string[]>,
  readFile: (path: string) => ipcRenderer.invoke("library:read", path),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveApiKey: (key: string) => ipcRenderer.invoke("settings:save", key),
  analyze: (input: { path: string; tags: Record<string, string>; useAudio: boolean; model: string }) =>
    ipcRenderer.invoke("ai:analyze", input),
  writeTags: (input: { path: string; tags: Record<string, string> }) =>
    ipcRenderer.invoke("tags:write", input),
  restoreBackup: (backupPath: string, targetPath: string) =>
    ipcRenderer.invoke("tags:restore", backupPath, targetPath)
};

contextBridge.exposeInMainWorld("desktop", api);
