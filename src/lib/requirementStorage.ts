export type RequirementKind = "exam" | "course";

const STORAGE_KEYS: Record<RequirementKind, string> = {
  course: "agenda_generate_course_requirements",
  exam: "agenda_generate_exam_requirements",
};
const REQUIREMENT_STORAGE_EVENT = "agenda_generate_requirements_changed";

function getLocalStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function loadRequirementText(kind: RequirementKind) {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return "";
  }

  try {
    return localStorage.getItem(STORAGE_KEYS[kind]) ?? "";
  } catch (error) {
    console.warn("读取要求整理 localStorage 失败。", error);
    return "";
  }
}

export function saveRequirementText(kind: RequirementKind, text: string) {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return;
  }

  try {
    if (localStorage.getItem(STORAGE_KEYS[kind]) === text) return;
    localStorage.setItem(STORAGE_KEYS[kind], text);
    window.dispatchEvent(new CustomEvent(REQUIREMENT_STORAGE_EVENT, { detail: kind }));
  } catch (error) {
    console.error("保存要求整理 localStorage 失败。", error);
  }
}

export function subscribeRequirementText(kind: RequirementKind, listener: () => void) {
  function onChange(event: Event) {
    if ((event as CustomEvent<RequirementKind>).detail === kind) listener();
  }
  function onStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEYS[kind]) listener();
  }
  window.addEventListener(REQUIREMENT_STORAGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(REQUIREMENT_STORAGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function clearRequirementText(kind: RequirementKind) {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEYS[kind]);
  } catch (error) {
    console.error("清空要求整理 localStorage 失败。", error);
  }
}
