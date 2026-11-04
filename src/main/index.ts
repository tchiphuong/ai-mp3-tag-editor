import { app, BrowserWindow, dialog, ipcMain, safeStorage } from "electron";
import { join, basename, extname, dirname } from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { parseFile } from "music-metadata";
import NodeID3 from "node-id3";
const id3 = NodeID3;
const BACKUP_DIR = ".mp3-tag-editor-backups";
const MAX_INLINE_BYTES = 14 * 1024 * 1024;
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png"];

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
  const metadata = await parseFile(filePath);
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
    } satisfies TrackTags,
    coverDataUrl: common.picture?.[0] ? `data:${common.picture[0].format};base64,${Buffer.from(common.picture[0].data).toString("base64")}` : null
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


ipcMain.handle("artwork:search", async (_event, input: { artist: string; album: string; title: string }) => {
  const artist = input.artist.trim();
  const album = (input.album || input.title).trim();
  if (!artist && !album) throw new Error("Cần có Artist hoặc Album để tìm ảnh bìa.");

  const escapeLucene = (value: string) => value.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\\\"');
  const terms = [album ? `release:"${escapeLucene(album)}"` : "", artist ? `artist:"${escapeLucene(artist)}"` : ""].filter(Boolean);
  const searchUrl = new URL("https://musicbrainz.org/ws/2/release/");
  searchUrl.searchParams.set("query", terms.join(" AND "));
  searchUrl.searchParams.set("fmt", "json");
  searchUrl.searchParams.set("limit", "8");

  const headers = { "User-Agent": "AI-MP3-Tag-Editor/0.1.0 (https://github.com/tchiphuong/ai-mp3-tag-editor)" };
  const response = await fetch(searchUrl, { headers });
  if (!response.ok) throw new Error(`MusicBrainz search failed (HTTP ${response.status}).`);
  const body = await response.json() as { releases?: Array<{ id: string; title: string; date?: string; "artist-credit"?: Array<{ name?: string }> }> };
  const releases = body.releases ?? [];

  const candidates = await Promise.all(releases.map(async release => {
    try {
      const coverResponse = await fetch(`https://coverartarchive.org/release/${release.id}`, { headers: { Accept: "application/json" } });
      if (!coverResponse.ok) return null;
      const cover = await coverResponse.json() as { images?: Array<{ front?: boolean; image?: string; thumbnails?: { "500"?: string; large?: string } }> };
      const image = cover.images?.find(item => item.front) ?? cover.images?.[0];
      const imageUrl = image?.thumbnails?.["500"] ?? image?.thumbnails?.large ?? image?.image;
      if (!imageUrl) return null;
      return {
        album: release.title,
        artist: release["artist-credit"]?.map(item => item.name).filter(Boolean).join("") ?? artist,
        url: imageUrl,
        storeUrl: `https://musicbrainz.org/release/${release.id}`
      };
    } catch { return null; }
  }));
  return candidates.filter((item): item is NonNullable<typeof item> => item !== null);
});

ipcMain.handle("dialog:image", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Album artwork", extensions: IMAGE_EXTENSIONS }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const path = result.filePaths[0];
  const extension = extname(path).toLowerCase();
  const mime = extension === ".png" ? "image/png" : "image/jpeg";
  const data = await fs.readFile(path);
  return `data:${mime};base64,${data.toString("base64")}`;
});

ipcMain.handle("artwork:embed", async (_event, input: { path: string; imageDataUrl: string }) => {
  const match = input.imageDataUrl.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Ảnh bìa phải là JPEG hoặc PNG hợp lệ.");
  const imageBuffer = Buffer.from(match[2], "base64");
  if (imageBuffer.byteLength > 10 * 1024 * 1024) throw new Error("Ảnh bìa vượt quá giới hạn 10 MB.");
  const original = await fs.readFile(input.path);
  const backupDir = join(dirname(input.path), BACKUP_DIR);
  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = join(backupDir, `${basename(input.path)}.${Date.now()}.${randomUUID()}.bak`);
  await fs.writeFile(backupPath, original, { flag: "wx" });
  const result = id3.update({
    image: { mime: match[1], type: { id: 3, name: "front cover" }, description: "Album cover", imageBuffer }
  }, input.path);
  if (!result) {
    await fs.copyFile(backupPath, input.path);
    throw new Error("Không thể nhúng ảnh bìa. File đã được khôi phục từ backup.");
  }
  return { backupPath };
});

ipcMain.handle("tags:write", async (_event, payload: { path: string; tags: TrackTags }) => {
  const original = await fs.readFile(payload.path);
  const backupDir = join(dirname(payload.path), BACKUP_DIR);
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
