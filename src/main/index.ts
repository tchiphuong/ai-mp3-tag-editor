import { app, BrowserWindow, dialog, ipcMain, safeStorage } from "electron";
import { join, basename, extname } from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { parseFile } from "music-metadata";
import NodeID3 from "node-id3";
const id3 = require("node-id3") as typeof NodeID3;
const BACKUP_DIR = ".mp3-tag-editor-backups";
const MAX_INLINE_BYTES = 14 * 1024 * 1024;

type TrackTags = {
  title: string; artist: string; album: string; albumArtist: string;
  genre: string; year: string; track: string; composer: string; comment: string;
};

const emptyTags = (): TrackTags => ({
  title: "", artist: "", album: "", albumArtist: "", genre: "",
  year: "", track: "", composer: "", comment: ""
});

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1420, height: 900, minWidth: 1080, minHeight: 700,
    backgroundColor: "#0b1020",
    title: "AI MP3 Tag Editor",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

ipcMain.handle("dialog:folder", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle("dialog:files", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "MP3 Audio", extensions: ["mp3"] }]
  });
  return result.canceled ? [] : result.filePaths;
});

async function scanMp3(folder: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === BACKUP_DIR || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === ".mp3") found.push(full);
    }
  }
  await walk(folder);
  return found;
}

ipcMain.handle("library:scan", async (_event, folder: string) => scanMp3(folder));
ipcMain.handle("library:read", async (_event, filePath: string) => {
  const metadata = await parseFile(filePath, { skipCovers: true });
  const common = metadata.common;
  return {
    path: filePath, name: basename(filePath), duration: metadata.format.duration ?? 0,
    size: (await fs.stat(filePath)).size,
    tags: {
      title: common.title ?? "", artist: common.artist ?? "",
      album: common.album ?? "", albumArtist: common.albumartist ?? "",
      genre: common.genre?.join(", ") ?? "", year: common.year?.toString() ?? "",
      track: common.track.no?.toString() ?? "", composer: common.composer?.join(", ") ?? "",
      comment: common.comment?.map(x => x.text).join("\n") ?? ""
    } satisfies TrackTags
  };
});

ipcMain.handle("settings:get", async () => {
  const path = join(app.getPath("userData"), "gemini-key.bin");
  try { await fs.access(path); return { configured: true }; }
  catch { return { configured: false }; }
});
ipcMain.handle("settings:save", async (_event, key: string) => {
  if (!key.trim()) throw new Error("API key không được để trống.");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows encryption is unavailable. Cannot safely store the API key.");
  await fs.writeFile(join(app.getPath("userData"), "gemini-key.bin"), safeStorage.encryptString(key.trim()));
  return true;
});

ipcMain.handle("ai:analyze", async (_event, input: { path: string; tags: TrackTags; useAudio: boolean; model: string }) => {
  const keyPath = join(app.getPath("userData"), "gemini-key.bin");
  let apiKey: string;
  try { apiKey = safeStorage.decryptString(await fs.readFile(keyPath)); }
  catch { throw new Error("Chưa cấu hình Gemini API key trong Settings."); }

  const file = await fs.readFile(input.path);
  if (input.useAudio && file.byteLength > MAX_INLINE_BYTES) {
    throw new Error("File lớn hơn 14 MB. MVP hiện chỉ gửi audio inline; hãy tắt phân tích âm thanh hoặc dùng file nhỏ hơn.");
  }

  const prompt = [
    "You are a music metadata specialist. Identify the most likely recording from the supplied filename and optional audio.",
    "Return ONLY valid JSON with keys: title, artist, album, albumArtist, genre, year, track, composer, comment.",
    "Use empty strings for unknown values. Do not invent release year, album, track number or composer.",
    "If the audio is instrumental or ambiguous, be conservative. Keep genre concise.",
    "Existing ID3 tags may be hints, not guaranteed truth.",
    "Filename: " + basename(input.path),
    "Existing tags: " + JSON.stringify(input.tags)
  ].join("\n");

  const parts: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
  if (input.useAudio) parts.push({
    type: "audio", data: file.toString("base64"), mime_type: "audio/mp3"
  });

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ model: input.model || "gemini-3.8-flash", input: parts })
  });
  const body = await response.json() as { output_text?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || `Gemini API error: ${response.status}`);
  const raw = body.output_text ?? "";
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Gemini không trả về JSON metadata hợp lệ.");
  const parsed = JSON.parse(json) as Partial<TrackTags>;
  return { ...emptyTags(), ...Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v ?? "")])) };
});

ipcMain.handle("tags:write", async (_event, payload: { path: string; tags: TrackTags }) => {
  const original = await fs.readFile(payload.path);
  const backupDir = join(require("node:path").dirname(payload.path), BACKUP_DIR);
  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = join(backupDir, `${basename(payload.path)}.${Date.now()}.${randomUUID()}.bak`);
  await fs.writeFile(backupPath, original, { flag: "wx" });

  const tags = payload.tags;
  const result = id3.update({
    title: tags.title || undefined, artist: tags.artist || undefined,
    album: tags.album || undefined, performerInfo: tags.albumArtist || undefined,
    genre: tags.genre || undefined, year: tags.year || undefined,
    trackNumber: tags.track || undefined, composer: tags.composer || undefined,
    comment: tags.comment ? { language: "eng", text: tags.comment } : undefined
  }, payload.path);
  if (!result) {
    await fs.copyFile(backupPath, payload.path);
    throw new Error("Không thể ghi ID3 tag. File đã được khôi phục từ backup.");
  }
  return { backupPath };
});

ipcMain.handle("tags:restore", async (_event, backupPath: string, targetPath: string) => {
  await fs.copyFile(backupPath, targetPath);
  return true;
});
