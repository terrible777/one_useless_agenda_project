const BACKUP_APP_ID = "agenda_generate";
const BACKUP_VERSION = 1;
const LOCAL_DATA_PREFIX = "agenda_generate_";

const DEFAULT_LOCAL_DATA: Record<string, string> = {
  agenda_generate_color_config: JSON.stringify({
    paletteVersion: 1,
  }),
  agenda_generate_user_settings: JSON.stringify({}),
};

type AgendaBackup = {
  app: typeof BACKUP_APP_ID;
  data: Record<string, string>;
  exportedAt: string;
  version: typeof BACKUP_VERSION;
};

function getLocalStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function isAgendaBackup(value: unknown): value is AgendaBackup {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<AgendaBackup>;

  return (
    candidate.app === BACKUP_APP_ID &&
    candidate.version === BACKUP_VERSION &&
    typeof candidate.exportedAt === "string" &&
    typeof candidate.data === "object" &&
    candidate.data !== null &&
    !Array.isArray(candidate.data) &&
    Object.entries(candidate.data).every(
      ([key, storedValue]) =>
        key.startsWith(LOCAL_DATA_PREFIX) && typeof storedValue === "string",
    )
  );
}

export function readAgendaLocalDataSnapshot(): AgendaBackup {
  const localStorage = getLocalStorage();
  const data: Record<string, string> = { ...DEFAULT_LOCAL_DATA };

  if (localStorage) {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);

      if (!key?.startsWith(LOCAL_DATA_PREFIX)) {
        continue;
      }

      const value = localStorage.getItem(key);

      if (typeof value === "string") {
        data[key] = value;
      }
    }
  }

  return {
    app: BACKUP_APP_ID,
    data,
    exportedAt: new Date().toISOString(),
    version: BACKUP_VERSION,
  };
}

export function downloadAgendaBackup() {
  const backup = readAgendaLocalDataSnapshot();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = "agenda-backup.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function restoreAgendaBackup(file: File) {
  const text = await file.text();
  const parsedBackup = JSON.parse(text) as unknown;

  if (!isAgendaBackup(parsedBackup)) {
    throw new Error("备份文件格式不正确");
  }

  const localStorage = getLocalStorage();

  if (!localStorage) {
    throw new Error("当前浏览器不支持 localStorage");
  }

  const keysToRemove: string[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);

    if (key?.startsWith(LOCAL_DATA_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
  Object.entries(parsedBackup.data).forEach(([key, value]) => {
    localStorage.setItem(key, value);
  });
}
