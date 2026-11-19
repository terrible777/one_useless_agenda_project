"use client";

import type { Task } from "@/types/task";
import { parseTask } from "@/lib/taskStorage";
import { cloudSyncRequest } from "@/lib/cloudSyncRequest";
import { createCloudSyncQueue } from "@/lib/cloudSyncQueue";

const TASK_CLOUD_INITIALIZED_KEY = "agenda_generate_tasks_cloud_initialized";

type TaskChange =
  | { type: "upsert"; task: Task }
  | { type: "delete"; id: string }
  | { type: "replace"; tasks: Task[] };

function isTaskChange(value: unknown): value is TaskChange {
  if (typeof value !== "object" || !value) return false;
  const change = value as Partial<TaskChange>;
  if (change.type === "upsert") return parseTask(change.task) !== null;
  if (change.type === "delete") return typeof change.id === "string";
  return change.type === "replace" && Array.isArray(change.tasks) &&
    change.tasks.every((task) => parseTask(task) !== null);
}

function postTask(task: Task) {
  return cloudSyncRequest<Task>("/api/tasks", {
    body: JSON.stringify(task),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

async function sendChange(change: TaskChange) {
  if (change.type === "upsert") return postTask(change.task);
  if (change.type === "delete") {
    return cloudSyncRequest(`/api/tasks?id=${encodeURIComponent(change.id)}`, { method: "DELETE" });
  }
  if (change.tasks.length === 0) {
    return cloudSyncRequest("/api/tasks/clear", { method: "DELETE" });
  }

  // Write the replacement first so an upload failure cannot empty the cloud table.
  for (const task of change.tasks) await postTask(task);
  const cloudTasks = await readCloudTasks();
  const keepIds = new Set(change.tasks.map((task) => task.id));
  for (const task of cloudTasks) {
    if (!keepIds.has(task.id)) {
      await cloudSyncRequest(`/api/tasks?id=${encodeURIComponent(task.id)}`, { method: "DELETE" });
    }
  }
}

const pendingTasks = createCloudSyncQueue(
  "agenda_generate_tasks_pending_sync",
  isTaskChange,
  sendChange,
);

async function readCloudTasks() {
  const data = await cloudSyncRequest<unknown>("/api/tasks");
  if (!Array.isArray(data)) throw new Error("GET /api/tasks 返回的任务列表格式不正确");
  const tasks = data.map(parseTask);
  if (tasks.some((task) => task === null)) throw new Error("GET /api/tasks 包含无效任务");
  return tasks as Task[];
}

export const hasPendingCloudTaskChanges = pendingTasks.hasPending;
export const getTaskSyncRevision = pendingTasks.getRevision;

function getLocalStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function isTaskCloudInitializedInStorage() {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return false;
  }

  try {
    return localStorage.getItem(TASK_CLOUD_INITIALIZED_KEY) === "true";
  } catch (error) {
    console.warn("读取任务云同步初始化状态失败。", error);
    return false;
  }
}

export function setTaskCloudInitializedInStorage(isInitialized: boolean) {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return;
  }

  try {
    if (isInitialized) {
      localStorage.setItem(TASK_CLOUD_INITIALIZED_KEY, "true");
      return;
    }

    localStorage.removeItem(TASK_CLOUD_INITIALIZED_KEY);
  } catch (error) {
    console.warn("保存任务云同步初始化状态失败。", error);
  }
}

export async function fetchCloudTasks() {
  await pendingTasks.flush();
  return readCloudTasks();
}

export function upsertCloudTask(task: Task) {
  return pendingTasks.enqueue([{ type: "upsert", task }]);
}

export function deleteCloudTask(taskId: string) {
  return pendingTasks.enqueue([{ type: "delete", id: taskId }]);
}

export function clearCloudTasks() {
  return pendingTasks.enqueue([{ type: "replace", tasks: [] }]);
}

export function syncCloudTaskList(tasks: Task[]) {
  return pendingTasks.enqueue(tasks.map((task) => ({ type: "upsert", task })));
}

export function replaceCloudTaskList(tasks: Task[]) {
  return pendingTasks.enqueue([{ type: "replace", tasks }]);
}
