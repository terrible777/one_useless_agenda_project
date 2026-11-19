type PendingChange<T> = {
  id: string;
  change: T;
};

// Keep failed mutations until the server acknowledges them, including across reloads.
export function createCloudSyncQueue<T>(
  storageKey: string,
  isChange: (value: unknown) => value is T,
  send: (change: T) => Promise<unknown>,
) {
  let fallback: PendingChange<T>[] = [];
  let activeFlush: Promise<void> | null = null;
  let revision = 0;
  let storageUnavailable = false;

  function read() {
    if (storageUnavailable) return fallback;
    try {
      if (typeof window === "undefined") return fallback;
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return [];
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value) || value.some((item) =>
        !item || typeof item.id !== "string" || !isChange(item.change),
      )) {
        throw new Error("Invalid pending sync data");
      }
      return value as PendingChange<T>[];
    } catch (error) {
      storageUnavailable = true;
      console.warn("读取待同步修改失败，保留当前本地数据。", error);
      return fallback;
    }
  }

  function write(changes: PendingChange<T>[]) {
    fallback = changes;
    try {
      if (typeof window === "undefined") return;
      if (changes.length) {
        window.localStorage.setItem(storageKey, JSON.stringify(changes));
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch (error) {
      storageUnavailable = true;
      console.warn("保存待同步修改失败。", error);
    }
  }

  function flush(): Promise<void> {
    if (activeFlush) return activeFlush;
    activeFlush = (async () => {
      for (let pending = read()[0]; pending; pending = read()[0]) {
        await send(pending.change);
        write(read().filter((item) => item.id !== pending.id));
      }
    })().finally(() => { activeFlush = null; });
    return activeFlush;
  }

  function enqueue(changes: T[]) {
    revision += 1;
    write([...read(), ...changes.map((change) => ({ id: crypto.randomUUID(), change }))]);
    return flush();
  }

  return {
    enqueue,
    flush,
    hasPending: () => read().length > 0,
    getRevision: () => revision,
  };
}
