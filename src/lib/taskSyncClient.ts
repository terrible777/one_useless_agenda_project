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

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    return text ? { error: text } : {};
  }

  return (await response.json()) as unknown;
}

function createSyncError(response: Response, data: unknown) {
  const message =
    !Array.isArray(data) && typeof data === "object" && data !== null
      ? getErrorMessage(data as ApiError)
      : "云端同步失败";

  if (response.status === 503 || message.includes("尚未配置")) {
    return new TaskSyncError("云端同步尚未配置", "not_configured", response.status);
  }

  return new TaskSyncError(message, "unknown", response.status);
}

async function requestJson<T>(path: string, init: RequestInit = {}) {
  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    const data = await readJsonResponse(response);

    if (!response.ok) {
      throw createSyncError(response, data);
    }

    return data as T;
  } catch (error) {
    if (error instanceof TaskSyncError) {
      throw error;
    }

    throw new TaskSyncError("云端同步失败，已保存在本地。", "network");
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
