"use client";

const LAST_SUCCESS_KEY = "agenda_generate_cloud_sync_last_success";
const LAST_FAILURE_KEY = "agenda_generate_cloud_sync_last_failure";
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

export function recordCloudSyncSuccess() {
  const localStorage = getLocalStorage();
  const now = new Date().toISOString();

  if (localStorage) {
    try {
      localStorage.setItem(LAST_SUCCESS_KEY, now);
      localStorage.removeItem(LAST_FAILURE_KEY);
    } catch (error) {
      console.warn("保存云端同步成功状态失败。", error);
    }
  }

  emitCloudSyncStatusChange();
}

export function recordCloudSyncFailure(message: string) {
  const localStorage = getLocalStorage();

  if (localStorage) {
    try {
      localStorage.setItem(LAST_FAILURE_KEY, message);
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
