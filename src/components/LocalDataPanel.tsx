"use client";

import { useRef, useState } from "react";
import { downloadAgendaBackup, restoreAgendaBackup } from "@/lib/backupStorage";
import styles from "./LocalDataPanel.module.css";

export function LocalDataPanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
          <p className={styles.label}>LocalStorage</p>
          <h2 id="local-data-title">本地数据</h2>
        </div>
        <span className={styles.badge}>仅本机保存</span>
      </div>

      <p className={styles.description}>
        当前数据保存在浏览器本地。换设备使用时，可以导出备份后在另一台设备导入。
      </p>

      {message ? <p className={styles.status}>{message}</p> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
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
