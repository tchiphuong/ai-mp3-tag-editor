import { useEffect, useMemo, useState } from "react";
import { AudioLines, FolderOpen, FileAudio, Sparkles, Save, Settings, Search, RefreshCw, CheckCircle2, AlertCircle, Music2, X, KeyRound, WandSparkles } from "lucide-react";
import type { Tags, Track } from "./types";

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
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [useAudio, setUseAudio] = useState(true);
  const [model, setModel] = useState("gemini-3.8-flash");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { window.desktop.getSettings().then(s => { setConfigured(s.configured); setApiKey(s.key); }).catch(e => setNotice(errorText(e))); }, []);
  const active = tracks.find(t => t.path === selected) ?? tracks[0] ?? null;
  const visible = useMemo(() => tracks.filter(t => t.name.toLowerCase().includes(query.toLowerCase()) || t.tags.title.toLowerCase().includes(query.toLowerCase())), [tracks, query]);
  const updateTrack = (path: string, update: Partial<Track>) => setTracks(old => old.map(t => t.path === path ? { ...t, ...update } : t));
  const loadPaths = async (paths: string[]) => {
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
    setFolder(path); setBusy(true);
    try { await loadPaths(await window.desktop.scanFolder(path)); }
    catch (e) { setNotice(errorText(e)); setBusy(false); }
  };
  const analyzeOne = async (track: Track) => {
    updateTrack(track.path, { status: "analyzing", error: undefined }); setNotice("");
    try {
      const suggested = await window.desktop.analyze({ path: track.path, tags: track.tags, useAudio, model });
      updateTrack(track.path, { suggested, status: "ready" });
    } catch (e) { updateTrack(track.path, { status: "error", error: errorText(e) }); setNotice(errorText(e)); }
  };
  const analyzeAll = async () => {
    if (!configured) { setSettingsOpen(true); setNotice("Hãy cấu hình Gemini API key trước."); return; }
    setBusy(true);
    for (const track of tracks) await analyzeOne(track);
    setBusy(false);
  };
  const saveOne = async (track: Track) => {
    const tags = track.suggested ?? track.tags;
    try {
      const result = await window.desktop.writeTags({ path: track.path, tags });
      updateTrack(track.path, { tags, suggested: undefined, status: "saved", backupPath: result.backupPath });
      setNotice(`Đã lưu tag: ${track.name}`);
    } catch (e) { updateTrack(track.path, { status: "error", error: errorText(e) }); }
  };
  const saveAll = async () => {
    setBusy(true);
    for (const track of tracks.filter(t => t.suggested)) await saveOne(track);
    setBusy(false);
  };
  const edit = (key: keyof Tags, value: string) => {
    if (!active) return;
    const source = active.suggested ?? active.tags;
    updateTrack(active.path, { suggested: { ...source, [key]: value } });
  };
  const saveSettings = async () => {
    try { await window.desktop.saveApiKey(apiKey); setConfigured(true); setSettingsOpen(false); setNotice("Đã lưu API key an toàn trên máy."); }
    catch (e) { setNotice(errorText(e)); }
  };
  const restore = async (track: Track) => {
    if (!track.backupPath || !confirm("Khôi phục toàn bộ file từ bản backup? Các thay đổi sau thời điểm backup sẽ bị ghi đè.")) return;
    await window.desktop.restoreBackup(track.backupPath, track.path);
    const fresh = await window.desktop.readFile(track.path);
    updateTrack(track.path, { ...fresh, status: "idle", backupPath: undefined });
    setNotice("Đã khôi phục file gốc.");
  };
  const formatDuration = (seconds: number) => fmt(seconds);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><AudioLines size={22}/></div><div><strong>TagStudio</strong><small>AI MUSIC LIBRARY</small></div></div>
      <div className="side-label">LIBRARY</div>
      <button className="side-action active"><Music2 size={17}/> All tracks <span>{tracks.length}</span></button>
      <div className="sidebar-bottom">
        <div className="api-state"><span className={configured ? "dot on" : "dot"}/><div><b>{configured ? "Gemini connected" : "Gemini not configured"}</b><small>{configured ? "API key saved locally" : "Add your API key to start"}</small></div></div>
        <button className="settings-link" onClick={() => setSettingsOpen(true)}><Settings size={17}/> Settings</button>
      </div>
    </aside>

    <main className="main">
      <header className="topbar"><div><div className="eyebrow">YOUR MUSIC WORKSPACE</div><h1>MP3 Tag Editor</h1><p>Organize your music library with a little help from AI.</p></div><button className="button secondary" onClick={() => setSettingsOpen(true)}><Settings size={16}/> Settings</button></header>
      <section className="toolbar">
        <button className="button primary" onClick={pickFolder} disabled={busy}><FolderOpen size={17}/> Choose folder</button>
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
          <div className="track-list">{visible.map(t => <button key={t.path} className={`track-row ${active?.path === t.path ? "selected" : ""}`} onClick={() => setSelected(t.path)}><div className="track-art"><Music2 size={18}/></div><div className="track-info"><b>{t.tags.title || t.name.replace(/\.mp3$/i, "")}</b><small>{t.tags.artist || "Unknown artist"} · {formatDuration(t.duration)}</small></div><div className="track-status">{t.status === "ready" ? <CheckCircle2 className="green" size={17}/> : t.status === "analyzing" ? <RefreshCw className="spin" size={16}/> : t.status === "error" ? <AlertCircle className="red" size={17}/> : t.status === "saved" ? <CheckCircle2 className="green" size={17}/> : null}</div></button>)}</div>}
          {tracks.length > 0 && <div className="list-footer"><span>{visible.length} of {tracks.length} tracks</span><button onClick={saveAll} disabled={busy || !tracks.some(t => t.suggested)}><Save size={15}/> Save reviewed tags</button></div>}
        </div>

        <div className="detail-panel">
          {!active ? <div className="empty-detail"><AudioLines size={38}/><p>Select a track to inspect its metadata</p></div> : <>
            <div className="detail-head"><div><div className="eyebrow">TRACK DETAILS</div><h2>{active.name}</h2><p>{sizeFmt(active.size)} · {formatDuration(active.duration)}</p></div><button className="icon-button" title="Analyze this track" onClick={() => analyzeOne(active)} disabled={busy}><Sparkles size={17}/></button></div>
            <div className="cover-placeholder"><div className="cover-disc"><AudioLines size={42}/></div><span>ALBUM ARTWORK</span></div>
            <div className="metadata-heading"><div><h3>Metadata</h3><p>{active.suggested ? "AI suggestions · review before saving" : "Current ID3 information"}</p></div>{active.suggested && <span className="review-badge">AI SUGGESTED</span>}</div>
            <div className="fields">{fields.map(([key, label]) => <label className={key === "comment" ? "field full" : "field"} key={key}><span>{label}</span>{key === "comment" ? <textarea value={(active.suggested ?? active.tags)[key]} onChange={e => edit(key, e.target.value)} rows={2}/> : <input value={(active.suggested ?? active.tags)[key]} onChange={e => edit(key, e.target.value)} placeholder="—"/>}</label>)}</div>
            {active.error && <div className="error-text">{active.error}</div>}
            <div className="detail-actions">{active.backupPath && <button className="button secondary" onClick={() => restore(active)}>Restore backup</button>}<button className="button secondary" onClick={() => analyzeOne(active)} disabled={busy}><Sparkles size={15}/> AI suggest</button><button className="button primary" onClick={() => saveOne(active)} disabled={busy}><Save size={15}/> Save to MP3</button></div>
          </>}
        </div>
      </section>
      <footer className="footer"><span>LOCAL-FIRST · YOUR FILES STAY ON YOUR DEVICE</span><span>Gemini audio analysis sends selected audio to Google API.</span></footer>
    </main>

    {settingsOpen && <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-title"><div className="modal-icon"><KeyRound size={20}/></div><div><h2>Gemini API settings</h2><p>Your key is encrypted and stored in Windows app data.</p></div><button className="icon-button" onClick={() => setSettingsOpen(false)}><X size={17}/></button></div><label className="field"><span>Google AI Studio API key</span><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste your Gemini API key"/></label><label className="field"><span>Model</span><input value={model} onChange={e => setModel(e.target.value)} onBlur={() => setModel(model.trim() || "gemini-3.8-flash")}/></label><p className="modal-help">Audio analysis sends the selected MP3 to Google's Gemini API. Turn off “Analyze audio” to use filename and existing tags only.</p><button className="button primary full-button" onClick={saveSettings}>Save settings</button></div></div>}
  </div>;
}