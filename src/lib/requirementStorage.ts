export type RequirementKind = "exam" | "course";

const STORAGE_KEYS: Record<RequirementKind, string> = {
  course: "agenda_generate_course_requirements",
  exam: "agenda_generate_exam_requirements",
};

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
    localStorage.setItem(STORAGE_KEYS[kind], text);
  } catch (error) {
    console.error("保存要求整理 localStorage 失败。", error);
  }
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
