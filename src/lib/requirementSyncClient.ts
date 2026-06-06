import type { RequirementKind } from "@/lib/requirementStorage";

type RequirementSyncErrorKind = "not_configured" | "network" | "unknown";

type RequirementNoteResponse = {
  content?: unknown;
  error?: unknown;
  message?: unknown;
  type?: unknown;
  updatedAt?: unknown;
};

export type CloudRequirementNote = {
  content: string;
  type: RequirementKind;
  updatedAt: string | null;
};

export class RequirementSyncError extends Error {
  kind: RequirementSyncErrorKind;
  status?: number;

  constructor(message: string, kind: RequirementSyncErrorKind, status?: number) {
    super(message);
    this.name = "RequirementSyncError";
    this.kind = kind;
    this.status = status;
  }
}

function getErrorMessage(data: RequirementNoteResponse) {
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
      ? getErrorMessage(data as RequirementNoteResponse)
      : "云端同步失败";
  const detail = `云端同步失败，已保存在本地：${method} ${path} 返回 ${response.status}：${message}`;

  if (response.status === 503 || message.includes("尚未配置")) {
    return new RequirementSyncError(detail, "not_configured", response.status);
  }

  return new RequirementSyncError(detail, "unknown", response.status);
}

function normalizeRequirementNote(data: RequirementNoteResponse): CloudRequirementNote {
  if (data.type !== "exam" && data.type !== "course") {
    throw new RequirementSyncError("云端同步失败，已保存在本地：返回 type 不正确", "unknown");
  }

  return {
    content: typeof data.content === "string" ? data.content : "",
    type: data.type,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
  };
}

async function requestJson(path: string, init: RequestInit = {}) {
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

    return normalizeRequirementNote(data as RequirementNoteResponse);
  } catch (error) {
    if (error instanceof RequirementSyncError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "未知网络错误";
    throw new RequirementSyncError(
      `云端同步失败，已保存在本地：${method} ${path} 请求失败：${message}`,
      "network",
    );
  }
}

export function fetchCloudRequirement(kind: RequirementKind) {
  return requestJson(`/api/requirements?type=${kind}`, {
    method: "GET",
  });
}

export function saveCloudRequirement(kind: RequirementKind, content: string) {
  return requestJson("/api/requirements", {
    body: JSON.stringify({ content, type: kind }),
    method: "POST",
  });
}

export function clearCloudRequirement(kind: RequirementKind) {
  return requestJson(`/api/requirements?type=${kind}`, {
    method: "DELETE",
  });
}
