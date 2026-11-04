import { useEffect, useMemo, useState } from "react";
import { AudioLines, FolderOpen, FileAudio, Sparkles, Save, Settings, Search, RefreshCw, CheckCircle2, AlertCircle, Music2, X, KeyRound, WandSparkles, ImagePlus, Disc3, Trash2 } from "lucide-react";
import type { ArtworkCandidate, Tags, Track } from "./types";

const fields: Array<[keyof Tags, string]> = [
  ["title", "Title"], ["artist", "Artist"], ["album", "Album"],
  ["albumArtist", "Album Artist"], ["genre", "Genre"], ["year", "Year"],
  ["track", "Track"], ["composer", "Composer"], ["comment", "Comment"]
];
const fmt = (n: number) => n < 60 ? `${Math.floor(n)}s` : `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
const sizeFmt = (n: number) => n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const errorText = (e: unknown) => e instanceof Error ? e.message : "Đã xảy ra lỗi không xác định.";

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [folder, setFolder] = useState("");
  const [libraryFolders, setLibraryFolders] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [useAudio, setUseAudio] = useState(true);
  const [model, setModel] = useState("gemini-3.8-flash");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { window.desktop.getSettings().then(s => setConfigured(s.configured)).catch(e => setNotice(errorText(e))); }, []);
  const active = tracks.find(t => t.path === selected) ?? tracks[0] ?? null;
  const visible = useMemo(() => tracks.filter(t => t.name.toLowerCase().includes(query.toLowerCase()) || t.tags.title.toLowerCase().includes(query.toLowerCase())), [tracks, query]);
  const activeTags = active?.suggested ?? active?.tags;
  const activeCover = active?.selectedArtwork ?? active?.coverDataUrl ?? null;
  const updateTrack = (path: string, update: Partial<Track>) => setTracks(old => old.map(t => t.path === path ? { ...t, ...update } : t));

  const loadPaths = async (paths: string[]) => {
    if (!paths.length) return;
    setBusy(true); setNotice("");
    try {
      const unique = [...new Set([...tracks.map(t => t.path), ...paths])];
      const loaded = await Promise.all(unique.map(async p => {
        const existing = tracks.find(t => t.path === p);
        return existing ?? { ...await window.desktop.readFile(p), status: "idle" as const };
      }));
      setTracks(loaded); if (!selected && loaded[0]) setSelected(loaded[0].path);
      setNotice(`Đã nạp ${paths.length} file MP3.`);
    } catch (e) { setNotice(errorText(e)); }
    finally { setBusy(false); }
  };
  const pickFolder = async () => {
    const path = await window.desktop.chooseFolder(); if (!path) return;
    setFolder(path);
    setLibraryFolders(old => {
      const next = old.includes(path) ? old : [...old, path];
      localStorage.setItem("music-library-folders", JSON.stringify(next));
      return next;
    });
    try { const paths = await window.desktop.scanFolder(path); await loadPaths(paths); }
    catch (e) { setNotice(errorText(e)); }
  };
  const removeFolder = (path: string) => {
    setLibraryFolders(old => {
      const next = old.filter(item => item !== path);
      localStorage.setItem("music-library-folders", JSON.stringify(next));
      return next;
    });
    setNotice("Đã bỏ thư mục khỏi thư viện. File MP3 không bị xóa.");
  };
  const editLyrics = (key: "lyrics" | "syncedLyrics", value: string) => {
    if (!active) return;
    updateTrack(active.path, { [key]: value });
  };
  useEffect(() => {
    const raw = localStorage.getItem("music-library-folders");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as string[];
      if (!Array.isArray(saved)) return;
      setLibraryFolders(saved);
      (async () => {
        for (const path of saved) {
          try {
            setFolder(path);
            const paths = await window.desktop.scanFolder(path);
            await loadPaths(paths);
          } catch {
            setNotice(`Không truy cập được thư mục: ${path}`);
          }
        }
      })();
    } catch {
      localStorage.removeItem("music-library-folders");
    }
  }, []);

  const analyzeOne = async (track: Track) => {
    updateTrack(track.path, { status: "analyzing", error: undefined }); setNotice("");
    try {
      const suggested = await window.desktop.analyze({ path: track.path, tags: track.tags, useAudio, model });
      updateTrack(track.path, { suggested, status: "ready" });
    } catch (e) { updateTrack(track.path, { status: "error", error: errorText(e) }); setNotice(errorText(e)); }
  };
  const analyzeAll = async () => {
    if (!configured) { setSettingsOpen(true); setNotice("Hãy nhập Gemini API key trong Settings trước."); return; }
    setBusy(true);
    for (const track of tracks) await analyzeOne(track);
    setBusy(false);
  };
  const saveOne = async (track: Track) => {
    const tags = track.suggested ?? track.tags;
    try {
      const result = await window.desktop.writeTags({ path: track.path, tags, lyrics: track.lyrics ?? "", syncedLyrics: track.syncedLyrics ?? "" });
      updateTrack(track.path, { tags, suggested: undefined, status: "saved", backupPath: result.backupPath });
      setNotice(`Đã lưu metadata: ${track.name}`);
    } catch (e) { updateTrack(track.path, { status: "error", error: errorText(e) }); }
  };
  const saveAll = async () => {
    setBusy(true);
    for (const track of tracks.filter(t => t.suggested || t.lyrics?.trim() || t.syncedLyrics?.trim())) await saveOne(track);
    setBusy(false);
  };
  const edit = (key: keyof Tags, value: string) => {
    if (!active) return;
    const source = active.suggested ?? active.tags;
    updateTrack(active.path, { suggested: { ...source, [key]: value } });
  };
  const saveSettings = async () => {
    try {
      await window.desktop.saveApiKey(apiKey);
      setConfigured(true); setApiKey(""); setSettingsOpen(false);
      setNotice("Đã lưu Gemini API key mã hóa trên máy Windows.");
    } catch (e) { setNotice(errorText(e)); }
  };
  const searchArtwork = async () => {
    if (!active) return;
    setBusy(true); setNotice("");
    try {
      const tags = active.suggested ?? active.tags;
      const candidates = await window.desktop.searchArtwork({ artist: tags.artist, album: tags.album, title: tags.title });
      updateTrack(active.path, { artworkCandidates: candidates, selectedArtwork: candidates[0]?.url });
      if (!candidates.length) setNotice("Không tìm thấy ảnh bìa phù hợp trên MusicBrainz/Cover Art Archive.");
    } catch (e) { setNotice(errorText(e)); }
    finally { setBusy(false); }
  };
  const chooseLocalArtwork = async () => {
    if (!active) return;
    const dataUrl = await window.desktop.chooseImage();
    if (dataUrl) updateTrack(active.path, { selectedArtwork: dataUrl, artworkCandidates: [] });
  };
  const embedArtwork = async () => {
    if (!active || !active.selectedArtwork) return;
    setBusy(true);
    try {
      const result = await window.desktop.embedArtwork({ path: active.path, imageDataUrl: active.selectedArtwork });
      updateTrack(active.path, { coverDataUrl: active.selectedArtwork, selectedArtwork: undefined, backupPath: result.backupPath });
      setNotice("Đã nhúng ảnh bìa vào MP3. Bản gốc đã được backup.");
    } catch (e) { setNotice(errorText(e)); }
    finally { setBusy(false); }
  };
  const restore = async (track: Track) => {
    if (!track.backupPath || !confirm("Khôi phục toàn bộ file từ bản backup? Các thay đổi sau thời điểm backup sẽ bị ghi đè.")) return;
    await window.desktop.restoreBackup(track.backupPath, track.path);
    const fresh = await window.desktop.readFile(track.path);
    updateTrack(track.path, { ...fresh, status: "idle", backupPath: undefined });
    setNotice("Đã khôi phục file gốc.");
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><AudioLines size={22}/></div><div><strong>TagStudio</strong><small>AI MUSIC LIBRARY</small></div></div>
      <div className="side-label">LIBRARY</div>
      <button className="side-action active"><Music2 size={17}/> All tracks <span>{tracks.length}</span></button>
      <div className="side-label folders-label">FOLDERS</div>
      <div className="saved-folders">
        {libraryFolders.map(path => <div className="saved-folder" key={path} title={path}>
          <button onClick={async () => { setFolder(path); const paths = await window.desktop.scanFolder(path); await loadPaths(paths); }}><FolderOpen size={14}/><span>{path.split(/[\\/]/).filter(Boolean).pop() || path}</span></button>
          <button className="remove-folder" title="Remove folder" onClick={() => removeFolder(path)}><Trash2 size={13}/></button>
        </div>)}
        {libraryFolders.length === 0 && <small className="no-folders">No folders added</small>}
      </div>
      <div className="sidebar-bottom">
        <div className="api-state"><span className={configured ? "dot on" : "dot"}/><div><b>{configured ? "Gemini API key saved" : "Gemini not configured"}</b><small>{configured ? "Encrypted on this Windows PC" : "Enter your key in Settings"}</small></div></div>
        <button className="settings-link" onClick={() => setSettingsOpen(true)}><Settings size={17}/> Settings</button>
      </div>
    </aside>

    <main className="main">
      <header className="topbar"><div><div className="eyebrow">YOUR MUSIC WORKSPACE</div><h1>MP3 Tag Editor</h1><p>Organize your local music library with AI.</p></div><button className="button secondary" onClick={() => setSettingsOpen(true)}><Settings size={16}/> Settings</button></header>
      <section className="toolbar">
        <button className="button primary" onClick={pickFolder} disabled={busy}><FolderOpen size={17}/> Add folder</button>
        <button className="button secondary" onClick={async () => loadPaths(await window.desktop.chooseFiles())} disabled={busy}><FileAudio size={17}/> Add MP3 files</button>
        <div className="toolbar-spacer"/>
        <label className="audio-toggle"><input type="checkbox" checked={useAudio} onChange={e => setUseAudio(e.target.checked)}/> Analyze audio</label>
        <button className="button ai-button" onClick={analyzeAll} disabled={busy || tracks.length === 0}><WandSparkles size={17}/> {busy ? "Working..." : "AI fill all"}</button>
      </section>

      {folder && <div className="folder-path"><FolderOpen size={14}/>{folder}</div>}
      {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")}><X size={14}/></button></div>}

      <section className="workspace">
        <div className="track-panel">
          <div className="panel-heading"><div><h2>Music library</h2><p>{tracks.length} tracks · {tracks.filter(t => t.status === "ready").length} ready for review</p></div><div className="search"><Search size={15}/><input placeholder="Search tracks..." value={query} onChange={e => setQuery(e.target.value)}/></div></div>
          {tracks.length === 0 ? <div className="empty"><div className="empty-icon"><Music2 size={30}/></div><h3>Your library starts here</h3><p>Choose a folder or add individual MP3 files from your computer.</p><button className="button primary" onClick={pickFolder}><FolderOpen size={16}/> Browse music folder</button></div> :
          <div className="track-list">{visible.map(t => <button key={t.path} className={`track-row ${active?.path === t.path ? "selected" : ""}`} onClick={() => setSelected(t.path)}><div className="track-art">{t.coverDataUrl ? <img src={t.coverDataUrl} alt="" /> : <Music2 size={18}/>}</div><div className="track-info"><b>{t.tags.title || t.name.replace(/\.mp3$/i, "")}</b><small>{t.tags.artist || "Unknown artist"} · {fmt(t.duration)}</small></div><div className="track-status">{t.status === "ready" ? <CheckCircle2 className="green" size={17}/> : t.status === "analyzing" ? <RefreshCw className="spin" size={16}/> : t.status === "error" ? <AlertCircle className="red" size={17}/> : t.status === "saved" ? <CheckCircle2 className="green" size={17}/> : null}</div></button>)}</div>}
          {tracks.length > 0 && <div className="list-footer"><span>{visible.length} of {tracks.length} tracks</span><button onClick={saveAll} disabled={busy || !tracks.some(t => t.suggested || t.lyrics?.trim() || t.syncedLyrics?.trim())}><Save size={15}/> Save reviewed tags</button></div>}
        </div>

        <div className="detail-panel">
          {!active || !activeTags ? <div className="empty-detail"><AudioLines size={38}/><p>Select a track to inspect its metadata</p></div> : <>
            <div className="detail-head"><div><div className="eyebrow">TRACK DETAILS</div><h2>{active.name}</h2><p>{sizeFmt(active.size)} · {fmt(active.duration)}</p></div><button className="icon-button" title="Analyze this track" onClick={() => analyzeOne(active)} disabled={busy}><Sparkles size={17}/></button></div>

            <div className="cover-section">
              <div className="cover-preview">{activeCover ? <img src={activeCover} alt="Album artwork preview"/> : <div className="cover-empty"><Disc3 size={42}/><span>NO ALBUM ART</span></div>}</div>
              <div className="cover-tools">
                <b>Album artwork</b>
                <small>{active.coverDataUrl ? "Artwork embedded in this MP3" : "Find a matching cover or choose an image"}</small>
                <div className="cover-buttons">
                  <button className="button secondary" onClick={searchArtwork} disabled={busy}><Search size={14}/> Find cover</button>
                  <button className="button secondary" onClick={chooseLocalArtwork} disabled={busy}><ImagePlus size={14}/> Choose image</button>
                  {active.selectedArtwork && <button className="button primary" onClick={embedArtwork} disabled={busy}><Save size={14}/> Embed cover</button>}
                </div>
              </div>
            </div>
            {!!active.artworkCandidates?.length && <div className="artwork-results">{active.artworkCandidates.map((candidate: ArtworkCandidate, i: number) => <button key={candidate.url + i} className={active.selectedArtwork === candidate.url ? "artwork-option chosen" : "artwork-option"} onClick={() => updateTrack(active.path, { selectedArtwork: candidate.url })}><img src={candidate.url} alt=""/><span><b>{candidate.album}</b><small>{candidate.artist}</small></span>{active.selectedArtwork === candidate.url && <CheckCircle2 size={16}/>}</button>)}</div>}

            <div className="metadata-heading"><div><h3>Metadata</h3><p>{active.suggested ? "AI suggestions · review before saving" : "Current ID3 information"}</p></div>{active.suggested && <span className="review-badge">AI SUGGESTED</span>}</div>
            <div className="fields">{fields.map(([key, label]) => <label className={key === "comment" ? "field full" : "field"} key={key}><span>{label}</span>{key === "comment" ? <textarea value={activeTags[key]} onChange={e => edit(key, e.target.value)} rows={2}/> : <input value={activeTags[key]} onChange={e => edit(key, e.target.value)} placeholder="—"/>}</label>)}</div>
            <div className="lyrics-section">
              <div className="metadata-heading"><div><h3>Lyrics</h3><p>Plain lyrics are embedded in ID3 USLT</p></div></div>
              <label className="field full"><span>Full lyrics (plain text)</span><textarea value={active.lyrics ?? ""} onChange={e => editLyrics("lyrics", e.target.value)} rows={5} placeholder="Paste the complete lyrics here..."/></label>
              <label className="field full"><span>Synced lyrics (LRC format)</span><textarea value={active.syncedLyrics ?? ""} onChange={e => editLyrics("syncedLyrics", e.target.value)} rows={6} placeholder={"[00:12.30]First line\\n[00:16.50]Second line\\n[00:20.00]Third line"}/></label>
              <small className="lyrics-hint">When saved, LRC timestamps are also embedded as ID3 SYLT and exported to a .lrc sidecar file.</small>
            </div>
            {active.error && <div className="error-text">{active.error}</div>}
            <div className="detail-actions">{active.backupPath && <button className="button secondary" onClick={() => restore(active)}>Restore backup</button>}<button className="button secondary" onClick={() => analyzeOne(active)} disabled={busy}><Sparkles size={15}/> AI suggest</button><button className="button primary" onClick={() => saveOne(active)} disabled={busy}><Save size={15}/> Save tags</button></div>
          </>}
        </div>
      </section>
      <footer className="footer"><span>LOCAL-FIRST · FILES STAY ON YOUR DEVICE</span><span>Audio is sent to Google only when Analyze audio is enabled.</span></footer>
    </main>

    {settingsOpen && <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-title"><div className="modal-icon"><KeyRound size={20}/></div><div><h2>Gemini API settings</h2><p>Enter your key here in the Windows app.</p></div><button className="icon-button" onClick={() => setSettingsOpen(false)}><X size={17}/></button></div><label className="field"><span>Google AI Studio API key</span><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={configured ? "Key is saved. Enter a new key to replace it." : "Paste your Gemini API key"}/></label><label className="field"><span>Gemini model</span><input value={model} onChange={e => setModel(e.target.value)} onBlur={() => setModel(model.trim() || "gemini-3.8-flash")}/></label><p className="modal-help">The API key is encrypted with Windows safeStorage and stays in this PC's app data. It is never stored in the repository. Audio analysis sends the selected MP3 to Google Gemini. Turn it off to analyze filename and existing tags only.</p><button className="button primary full-button" onClick={saveSettings} disabled={!apiKey.trim()}>Save API settings</button></div></div>}
  </div>;
}