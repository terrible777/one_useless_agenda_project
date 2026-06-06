"use client";

import type { Task } from "@/types/task";

const TASK_CLOUD_INITIALIZED_KEY = "agenda_generate_tasks_cloud_initialized";

async function readApiResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as { error?: unknown; message?: unknown };
  }

  const text = await response.text();

  return text ? { error: text } : {};
}

function getResponseMessage(data: { error?: unknown; message?: unknown }) {
  if (typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }

  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }

  return "未知错误";
}

async function requestJson<T>(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  const response = await fetch(path, init);
  const data = await readApiResponse(response);

  if (!response.ok) {
    throw new Error(`${method} ${path} 返回 ${response.status}：${getResponseMessage(data)}`);
  }

  return data as T;
}

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
  return requestJson<Task[]>("/api/tasks");
}

export async function upsertCloudTask(task: Task) {
  return requestJson<Task>("/api/tasks", {
    body: JSON.stringify(task),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

export async function deleteCloudTask(taskId: string) {
  return requestJson<{ ok: true }>(`/api/tasks?id=${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
}

export async function clearCloudTasks() {
  return requestJson<{ ok: true }>("/api/tasks/clear", {
    method: "DELETE",
  });
}

export async function syncCloudTaskList(tasks: Task[]) {
  await Promise.all(tasks.map((task) => upsertCloudTask(task)));
}

export async function replaceCloudTaskList(tasks: Task[]) {
  await clearCloudTasks();
  await syncCloudTaskList(tasks);
}
