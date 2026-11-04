export type Tags = {
  title: string; artist: string; album: string; albumArtist: string;
  genre: string; year: string; track: string; composer: string; comment: string;
};
export type Track = {
  path: string; name: string; duration: number; size: number; tags: Tags;
  suggested?: Tags; status?: "idle" | "analyzing" | "ready" | "saved" | "error";
  error?: string; backupPath?: string;
};
declare global {
  interface Window {
    desktop: {
      chooseFolder(): Promise<string | null>;
      chooseFiles(): Promise<string[]>;
      scanFolder(folder: string): Promise<string[]>;
      readFile(path: string): Promise<Omit<Track, "status">>;
      getSettings(): Promise<{ configured: boolean }>;
      saveApiKey(key: string): Promise<boolean>;
      analyze(input: { path: string; tags: Tags; useAudio: boolean; model: string }): Promise<Tags>;
      writeTags(input: { path: string; tags: Tags }): Promise<{ backupPath: string }>;
      restoreBackup(backupPath: string, targetPath: string): Promise<boolean>;
    };
  }
}
