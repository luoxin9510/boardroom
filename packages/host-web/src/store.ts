/**
 * Everything the app keeps on the device, in one IndexedDB database:
 * - "content": the imported content pack, file by file (key `<game>/<path>`, value {type, data: Uint8Array})
 * - "files":   what games write, such as saves (key `<space>/<path>`, value string)
 * - "packs":   one record per imported pack (key game id)
 */
const DB = "boardroom";
const VERSION = 1;
export type StoreName = "content" | "files" | "packs";

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      for (const name of ["content", "files", "packs"]) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
    };
    req.onsuccess = () => {
      // iOS can drop the connection while the app sits in the background; open a new one next time.
      req.result.onclose = () => (opening = null);
      req.result.onversionchange = () => {
        req.result.close();
        opening = null;
      };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  }).catch((e: unknown) => {
    opening = null;
    throw e;
  });
  return opening;
}

/** Runs one transaction; if the connection turns out to be dead (iOS), reconnects once and tries again. */
async function tx<T>(stores: StoreName[], mode: IDBTransactionMode, body: (t: IDBTransaction) => () => T): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const d = await db();
      return await new Promise<T>((resolve, reject) => {
        const t = d.transaction(stores, mode);
        const result = body(t);
        t.oncomplete = () => resolve(result());
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error ?? new Error("transaction aborted"));
      });
    } catch (e) {
      const name = (e as DOMException | null)?.name;
      if (attempt === 0 && (name === "InvalidStateError" || name === "UnknownError")) {
        opening = null;
        continue;
      }
      throw e;
    }
  }
}

const range = (prefix: string) => IDBKeyRange.bound(prefix, `${prefix}￿`);

export function get<T>(store: StoreName, key: string): Promise<T | undefined> {
  return tx([store], "readonly", (t) => {
    const r = t.objectStore(store).get(key);
    return () => r.result as T | undefined;
  });
}

export function put(store: StoreName, key: string, value: unknown): Promise<void> {
  return tx([store], "readwrite", (t) => {
    t.objectStore(store).put(value, key);
    return () => undefined;
  });
}

export function remove(store: StoreName, key: string): Promise<void> {
  return tx([store], "readwrite", (t) => {
    t.objectStore(store).delete(key);
    return () => undefined;
  });
}

/** All entries whose key starts with `prefix`, read in one transaction. */
export function entries<T>(store: StoreName, prefix: string): Promise<[string, T][]> {
  return tx([store], "readonly", (t) => {
    const s = t.objectStore(store);
    const keys = s.getAllKeys(range(prefix));
    const values = s.getAll(range(prefix));
    return () => keys.result.map((k, i) => [String(k), values.result[i] as T] as [string, T]);
  });
}

/**
 * Replaces one game's content and its pack record in a single transaction: either the new pack is
 * fully stored, or nothing changes and the old pack is still there. `info` null deletes the pack.
 */
export function replacePack(game: string, files: [string, unknown][], info: unknown | null): Promise<void> {
  return tx(["content", "packs"], "readwrite", (t) => {
    const content = t.objectStore("content");
    content.delete(range(`${game}/`));
    for (const [k, v] of files) content.put(v, k);
    if (info === null) t.objectStore("packs").delete(game);
    else t.objectStore("packs").put(info, game);
    return () => undefined;
  });
}
