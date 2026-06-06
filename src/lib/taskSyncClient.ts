import type { Task } from "@/types/task";

type TaskSyncErrorKind = "not_configured" | "network" | "unknown";

type ApiError = {
  error?: unknown;
  message?: unknown;
};

export class TaskSyncError extends Error {
  kind: TaskSyncErrorKind;
  status?: number;

  constructor(message: string, kind: TaskSyncErrorKind, status?: number) {
    super(message);
    this.name = "TaskSyncError";
    this.kind = kind;
    this.status = status;
  }
}

function getErrorMessage(data: ApiError) {
  if (typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }

  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }

  return "云端同步失败";
}

async function readResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    return text ? { error: text } : {};
  }

  return (await response.json()) as unknown;
}

function createSyncError(method: string, path: string, response: Response, data: unknown) {
  const message =
    !Array.isArray(data) && typeof data === "object" && data !== null
      ? getErrorMessage(data as ApiError)
      : "云端同步失败";
  const detail = `云端同步失败：${method} ${path} 返回 ${response.status}：${message}`;

  if (response.status === 503 || message.includes("尚未配置")) {
    return new TaskSyncError(detail, "not_configured", response.status);
  }

  return new TaskSyncError(detail, "unknown", response.status);
}

async function requestJson<T>(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";

  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    const data = await readResponseBody(response);

    if (!response.ok) {
      throw createSyncError(method, path, response, data);
    }

    return data as T;
  } catch (error) {
    if (error instanceof TaskSyncError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "未知网络错误";
    throw new TaskSyncError(
      `云端同步失败：${method} ${path} 请求失败：${message}`,
      "network",
    );
  }
}

export function fetchCloudTasks() {
  return requestJson<Task[]>("/api/tasks", {
    method: "GET",
  });
}

export function upsertCloudTasksFromClient(tasks: Task[]) {
  return requestJson<Task[]>("/api/tasks", {
    body: JSON.stringify({ tasks }),
    method: "POST",
  });
}

export function deleteCloudTaskFromClient(taskId: string) {
  return requestJson<{ ok: true }>(`/api/tasks?id=${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
}

export function clearCloudTasksFromClient() {
  return requestJson<{ ok: true }>("/api/tasks/clear", {
    method: "DELETE",
  });
}
