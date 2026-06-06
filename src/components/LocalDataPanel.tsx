"use client";

import { useEffect, useRef, useState } from "react";
import { downloadAgendaBackup, restoreAgendaBackup } from "@/lib/backupStorage";
import {
  readCloudSyncStatus,
  recordCloudSyncFailure,
  recordCloudSyncSuccess,
  subscribeCloudSyncStatus,
  type CloudSyncStatus,
} from "@/lib/cloudSyncStatus";
import styles from "./LocalDataPanel.module.css";

type LocalDataPanelProps = {
  onPullCloudData: () => Promise<void>;
  onPushCloudData: () => Promise<void>;
};

function formatDateTime(value: string) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function LocalDataPanel({ onPullCloudData, onPushCloudData }: LocalDataPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(() => readCloudSyncStatus());

  useEffect(() => {
    return subscribeCloudSyncStatus(() => setSyncStatus(readCloudSyncStatus()));
  }, []);

  function handleExport() {
    setError("");
    setMessage("");

    try {
      downloadAgendaBackup();
      setMessage("已导出 agenda-backup.json");
    } catch (exportError) {
      console.error("导出本地数据失败。", exportError);
      setError("导出失败，请稍后重试");
    }
  }

  async function handlePullCloudData() {
    setError("");
    setMessage("");

    try {
      await onPullCloudData();
      recordCloudSyncSuccess();
      setSyncStatus(readCloudSyncStatus());
      setMessage("已从云端同步");
    } catch (syncError) {
      const message =
        syncError instanceof Error ? syncError.message : "云端同步失败，请稍后重试";

      console.error("手动拉取云端数据失败。", syncError);
      recordCloudSyncFailure(`云端同步失败，已保存在本地：${message}`);
      setSyncStatus(readCloudSyncStatus());
      setError(`云端同步失败，已保存在本地：${message}`);
    }
  }

  async function handlePushCloudData() {
    setError("");
    setMessage("");

    try {
      await onPushCloudData();
      recordCloudSyncSuccess();
      setSyncStatus(readCloudSyncStatus());
      setMessage("已上传本机数据");
    } catch (syncError) {
      const message =
        syncError instanceof Error ? syncError.message : "云端同步失败，请稍后重试";

      console.error("手动上传本机数据失败。", syncError);
      recordCloudSyncFailure(`云端同步失败，已保存在本地：${message}`);
      setSyncStatus(readCloudSyncStatus());
      setError(`云端同步失败，已保存在本地：${message}`);
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file) {
      return;
    }

    if (!window.confirm("导入备份会覆盖当前本地数据，确定继续吗？")) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await restoreAgendaBackup(file);
      await onPushCloudData().catch((syncError) => {
        const syncMessage =
          syncError instanceof Error ? syncError.message : "云端同步失败，请稍后重试";

        console.error("导入后上传云端失败。", syncError);
        recordCloudSyncFailure(`云端同步失败，已保存在本地：${syncMessage}`);
      });
      setMessage("导入成功，正在刷新页面");
      window.location.reload();
    } catch (importError) {
      console.error("导入本地数据失败。", importError);
      setError(importError instanceof Error ? importError.message : "导入失败");
    }
  }

  return (
    <section className={styles.card} aria-labelledby="local-data-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.label}>LocalStorage + Supabase</p>
          <h2 id="local-data-title">数据备份与同步</h2>
        </div>
        <span className={styles.badge}>云端同步已启用</span>
      </div>

      <p className={styles.description}>
        数据会先保存在本机，再自动同步到 Supabase。同步失败时，本地使用不受影响。
      </p>

      <dl className={styles.syncMeta}>
        <div>
          <dt>最近成功</dt>
          <dd>{formatDateTime(syncStatus.lastSuccessAt)}</dd>
        </div>
        <div>
          <dt>最近失败</dt>
          <dd>{syncStatus.lastFailure || "暂无"}</dd>
        </div>
      </dl>

      {message ? <p className={styles.status}>{message}</p> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          onClick={() => void handlePullCloudData()}
          type="button"
        >
          从云端同步
        </button>
        <button
          className={styles.secondaryButton}
          onClick={() => void handlePushCloudData()}
          type="button"
        >
          上传本机数据
        </button>
        <button className={styles.primaryButton} onClick={handleExport} type="button">
          导出数据
        </button>
        <button
          className={styles.secondaryButton}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          导入数据
        </button>
      </div>

      <input
        ref={fileInputRef}
        accept="application/json,.json"
        className={styles.fileInput}
        onChange={(event) => {
          void handleImport(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
        type="file"
      />
    </section>
  );
}
