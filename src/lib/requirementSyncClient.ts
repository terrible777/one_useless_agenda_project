"use client";

import {
  loadRequirementText,
  saveRequirementText,
  type RequirementKind,
} from "@/lib/requirementStorage";
import { cloudSyncRequest } from "@/lib/cloudSyncRequest";
import { createCloudSyncQueue } from "@/lib/cloudSyncQueue";

type RequirementResponse = {
  content: string;
  type: RequirementKind;
  updatedAt: string | null;
};

function createRequirementQueue(kind: RequirementKind) {
  return createCloudSyncQueue(
    `agenda_generate_${kind}_requirements_pending_sync`,
    (value): value is string => typeof value === "string",
    (content) => cloudSyncRequest<RequirementResponse>(
      content.trim() ? "/api/requirements" : `/api/requirements?type=${kind}`,
      content.trim()
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: kind, content }),
          }
        : { method: "DELETE" },
    ),
  );
}

const queues = {
  exam: createRequirementQueue("exam"),
  course: createRequirementQueue("course"),
};

export function getRequirementSyncRevision(kind: RequirementKind) {
  return queues[kind].getRevision();
}

export function hasPendingCloudRequirementChanges(kind: RequirementKind) {
  return queues[kind].hasPending();
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
  await queues[kind].flush();
  const data = await cloudSyncRequest<RequirementResponse>(`/api/requirements?type=${kind}`);
  if (!data || data.type !== kind || typeof data.content !== "string" ||
    (data.updatedAt !== null && typeof data.updatedAt !== "string")) {
    throw new Error(`GET /api/requirements?type=${kind} 返回的要求格式不正确`);
  }
  return data;
}

export function saveCloudRequirement(kind: RequirementKind, content: string) {
  return queues[kind].enqueue([content]);
}

export function clearCloudRequirement(kind: RequirementKind) {
  return queues[kind].enqueue([""]);
}

export function pushRequirementTextToCloud(kind: RequirementKind, content: string) {
  return queues[kind].enqueue([content]);
}

export async function refreshRequirementFromCloud(kind: RequirementKind, forceCloud = false) {
  const revision = queues[kind].getRevision();
  const data = await fetchCloudRequirement(kind);
  if (queues[kind].getRevision() !== revision || queues[kind].hasPending()) return;

  const localText = loadRequirementText(kind);
  if (!forceCloud && !data.updatedAt && !data.content && localText &&
    !isRequirementCloudInitializedInStorage(kind)) {
    // Keep pre-sync local data for an explicit upload; never resurrect deleted cloud content.
    return;
  }

  saveRequirementText(kind, data.content);
  setRequirementCloudInitializedInStorage(kind, true);
}
