/**
 * What a game needs from the place it runs in: the Obsidian plugin on a phone, or a browser page
 * during development. Paths are relative to the game's vault root.
 */
export interface Host {
  /** Every markdown note under `folder` (recursively), with its text. */
  readNotes(folder: string): Promise<{ path: string; text: string }[]>;
  /** A URL the page can show for an image in the vault, or null if the file is missing. */
  imageUrl(path: string): string | null;
  /** A file's text, or null if it does not exist. */
  readFile(path: string): Promise<string | null>;
  /** Creates or replaces a file, creating folders as needed. */
  writeFile(path: string, text: string): Promise<void>;
  /** Paths of the files directly in `folder` (not recursive). */
  listFiles(folder: string): Promise<string[]>;
  /** Small per-device settings, such as the chosen language. */
  getSetting<V>(key: string): V | undefined;
  setSetting(key: string, value: unknown): Promise<void>;
  /** The host's interface language, e.g. Obsidian's language or the browser's. */
  locale(): string;
  /** Called when content notes change; returns an unsubscribe function. */
  onContentChange(cb: () => void): () => void;
  /** Leaves the game screen (closes the view in Obsidian). Optional. */
  exit?(): void;
}
