"use client";

const LAST_SUCCESS_KEY = "agenda_generate_cloud_sync_last_success";
const LAST_FAILURE_KEY = "agenda_generate_cloud_sync_last_failure";
const FAILURE_DETAILS_KEY = "agenda_generate_cloud_sync_failures";
const CLOUD_SYNC_STATUS_EVENT = "agenda_generate_cloud_sync_status";

export type CloudSyncStatus = {
  lastFailure: string;
  lastSuccessAt: string;
};

function getLocalStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function emitCloudSyncStatusChange() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(CLOUD_SYNC_STATUS_EVENT));
}

export function readCloudSyncStatus(): CloudSyncStatus {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return {
      lastFailure: "",
      lastSuccessAt: "",
    };
  }

  try {
    return {
      lastFailure: localStorage.getItem(LAST_FAILURE_KEY) ?? "",
      lastSuccessAt: localStorage.getItem(LAST_SUCCESS_KEY) ?? "",
    };
  } catch (error) {
    console.warn("读取云端同步状态失败。", error);
    return {
      lastFailure: "",
      lastSuccessAt: "",
    };
  }
}

function readFailures(): Record<string, string> {
  try {
    const data: unknown = JSON.parse(getLocalStorage()?.getItem(FAILURE_DETAILS_KEY) ?? "{}");
    if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter((entry) => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

export function recordCloudSyncSuccess(resource = "all") {
  const localStorage = getLocalStorage();
  const now = new Date().toISOString();

  if (localStorage) {
    try {
      localStorage.setItem(LAST_SUCCESS_KEY, now);
      const failures = resource === "all" ? {} : readFailures();
      delete failures[resource];
      localStorage.setItem(FAILURE_DETAILS_KEY, JSON.stringify(failures));
      const remaining = Object.values(failures).join("；");
      if (remaining) {
        localStorage.setItem(LAST_FAILURE_KEY, remaining);
      } else {
        localStorage.removeItem(LAST_FAILURE_KEY);
      }
    } catch (error) {
      console.warn("保存云端同步成功状态失败。", error);
    }
  }

  emitCloudSyncStatusChange();
}

export function recordCloudSyncFailure(message: string, resource = "all") {
  const localStorage = getLocalStorage();

  if (localStorage) {
    try {
      const failures = { ...readFailures(), [resource]: message };
      localStorage.setItem(FAILURE_DETAILS_KEY, JSON.stringify(failures));
      localStorage.setItem(LAST_FAILURE_KEY, Object.values(failures).join("；"));
    } catch (error) {
      console.warn("保存云端同步失败状态失败。", error);
    }
  }

  emitCloudSyncStatusChange();
}

export function subscribeCloudSyncStatus(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener(CLOUD_SYNC_STATUS_EVENT, listener);

  return () => window.removeEventListener(CLOUD_SYNC_STATUS_EVENT, listener);
}
