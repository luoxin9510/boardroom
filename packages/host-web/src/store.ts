/**
 * Everything the app keeps on the device, in one IndexedDB database:
 * - "content": the imported content pack, file by file (key `<game>/<path>`, value {type, data: ArrayBuffer})
 * - "files":   what games write, such as saves (key `<space>/<path>`, value string)
 * - "packs":   one record per imported pack (key game id)
 */
const DB = "boardroom";
const VERSION = 1;
export type StoreName = "content" | "files" | "packs";

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      for (const name of ["content", "files", "packs"]) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, body: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(store, mode);
        const req = body(tx.objectStore(store));
        tx.oncomplete = () => resolve(req ? req.result : (undefined as T));
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const get = <T>(store: StoreName, key: string) => run<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
export const put = (store: StoreName, key: string, value: unknown) => run<IDBValidKey>(store, "readwrite", (s) => s.put(value, key));
export const del = (store: StoreName, key: string) => run<undefined>(store, "readwrite", (s) => s.delete(key));

/** All entries whose key starts with `prefix`. */
export async function entries<T>(store: StoreName, prefix: string): Promise<[string, T][]> {
  const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
  const [keys, values] = await Promise.all([
    run<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys(range)),
    run<T[]>(store, "readonly", (s) => s.getAll(range) as IDBRequest<T[]>),
  ]);
  return keys.map((k, i) => [String(k), values[i] as T]);
}

/** Deletes every entry whose key starts with `prefix`. */
export const clear = (store: StoreName, prefix: string) => run<undefined>(store, "readwrite", (s) => s.delete(IDBKeyRange.bound(prefix, `${prefix}￿`)));

/** Writes many entries in one transaction (all or nothing). */
export function putAll(store: StoreName, items: [string, unknown][]): Promise<void> {
  return run<undefined>(store, "readwrite", (s) => {
    for (const [k, v] of items) s.put(v, k);
  });
}
