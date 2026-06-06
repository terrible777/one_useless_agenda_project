import type { Task, TaskStatus } from "@/types/task";
import { TASK_STATUSES } from "@/types/task";

const STORAGE_KEY = "agenda_generate_tasks";
const DIRTY_STORAGE_KEY = "agenda_generate_tasks_dirty";

function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && TASK_STATUSES.includes(value as TaskStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseTask(value: unknown): Task | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    !isTaskStatus(value.status) ||
    typeof value.note !== "string" ||
    typeof value.sourceText !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    deadlineDate: readNullableString(value.deadlineDate),
    deadlineTime: readNullableString(value.deadlineTime),
    deadlineAt: readNullableString(value.deadlineAt),
    status: value.status,
    note: value.note,
    sourceText: value.sourceText,
    sortOrder: readOptionalNumber(value.sortOrder),
    createdAt: readOptionalString(value.createdAt),
    updatedAt: readOptionalString(value.updatedAt),
  };
}

function getLocalStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function loadTasksFromStorage(): Task[] {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return [];
  }

  try {
    const rawTasks = localStorage.getItem(STORAGE_KEY);

    if (!rawTasks) {
      return [];
    }

    const parsedTasks: unknown = JSON.parse(rawTasks);

    if (!Array.isArray(parsedTasks)) {
      throw new Error("Stored tasks are not an array.");
    }

    const tasks = parsedTasks.map(parseTask);

    if (tasks.some((task) => task === null)) {
      throw new Error("Stored tasks contain invalid items.");
    }

    return tasks as Task[];
  } catch (error) {
    console.warn("localStorage 中的任务数据损坏，已清空。", error);
    clearTasksInStorage();
    return [];
  }
}

export function saveTasksToStorage(tasks: Task[]) {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.error("任务保存到 localStorage 失败。", error);
  }
}

export function clearTasksInStorage() {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
}

export function areTasksMarkedDirtyInStorage() {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return false;
  }

  try {
    return localStorage.getItem(DIRTY_STORAGE_KEY) === "true";
  } catch (error) {
    console.warn("Failed to read task sync dirty flag.", error);
    return false;
  }
}

export function setTasksDirtyInStorage(isDirty: boolean) {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return;
  }

  try {
    if (isDirty) {
      localStorage.setItem(DIRTY_STORAGE_KEY, "true");
      return;
    }

    localStorage.removeItem(DIRTY_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to update task sync dirty flag.", error);
  }
}
