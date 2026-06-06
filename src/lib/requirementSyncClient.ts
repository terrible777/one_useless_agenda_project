"use client";

import type { RequirementKind } from "@/lib/requirementStorage";

type RequirementResponse = {
  content: string;
  type: RequirementKind;
  updatedAt: string | null;
};

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

function getRequirementCloudInitializedKey(kind: RequirementKind) {
  return `agenda_generate_${kind}_requirements_cloud_initialized`;
}

export function isRequirementCloudInitializedInStorage(kind: RequirementKind) {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return false;
  }

  try {
    return localStorage.getItem(getRequirementCloudInitializedKey(kind)) === "true";
  } catch (error) {
    console.warn("读取要求云同步初始化状态失败。", error);
    return false;
  }
}

export function setRequirementCloudInitializedInStorage(
  kind: RequirementKind,
  isInitialized: boolean,
) {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return;
  }

  try {
    if (isInitialized) {
      localStorage.setItem(getRequirementCloudInitializedKey(kind), "true");
      return;
    }

    localStorage.removeItem(getRequirementCloudInitializedKey(kind));
  } catch (error) {
    console.warn("保存要求云同步初始化状态失败。", error);
  }
}

export async function fetchCloudRequirement(kind: RequirementKind) {
  return requestJson<RequirementResponse>(`/api/requirements?type=${kind}`);
}

export async function saveCloudRequirement(kind: RequirementKind, content: string) {
  return requestJson<RequirementResponse>("/api/requirements", {
    body: JSON.stringify({
      content,
      type: kind,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

export async function clearCloudRequirement(kind: RequirementKind) {
  return requestJson<RequirementResponse>(`/api/requirements?type=${kind}`, {
    method: "DELETE",
  });
}

export async function pushRequirementTextToCloud(kind: RequirementKind, content: string) {
  if (!content.trim()) {
    return clearCloudRequirement(kind);
  }

  return saveCloudRequirement(kind, content);
}
