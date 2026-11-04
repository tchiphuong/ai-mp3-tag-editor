export type Tags = {
  title: string; artist: string; album: string; albumArtist: string;
  genre: string; year: string; track: string; composer: string; comment: string;
};
export type ArtworkCandidate = { album: string; artist: string; url: string; storeUrl: string };
export type Track = {
  path: string; name: string; duration: number; size: number; tags: Tags;
  coverDataUrl?: string | null;
  lyrics: string; syncedLyrics: string;
  suggested?: Tags; status?: "idle" | "analyzing" | "ready" | "saved" | "error";
  error?: string; backupPath?: string; artworkCandidates?: ArtworkCandidate[];
  selectedArtwork?: string;
};
declare global {
  interface Window {
    desktop: {
      chooseFolder(): Promise<string | null>;
      chooseFiles(): Promise<string[]>;
      chooseImage(): Promise<string | null>;
      scanFolder(folder: string): Promise<string[]>;
      readFile(path: string): Promise<Omit<Track, "status">>;
      getSettings(): Promise<{ configured: boolean }>;
      saveApiKey(key: string): Promise<boolean>;
      searchArtwork(input: { artist: string; album: string; title: string }): Promise<ArtworkCandidate[]>;
      embedArtwork(input: { path: string; imageDataUrl: string }): Promise<{ backupPath: string }>;
      analyze(input: { path: string; tags: Tags; useAudio: boolean; model: string }): Promise<Tags>;
      writeTags(input: { path: string; tags: Tags; lyrics: string; syncedLyrics: string }): Promise<{ backupPath: string; lrcPath?: string }>;
      restoreBackup(backupPath: string, targetPath: string): Promise<boolean>;
    };
  }
}
