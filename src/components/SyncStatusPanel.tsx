"use client";

import styles from "./SyncStatusPanel.module.css";

type SyncStatusPanelProps = {
  isSyncing: boolean;
  lastFailureReason: string | null;
  lastSuccessAt: string | null;
  onManualSync: () => void;
};

export function SyncStatusPanel({
  isSyncing,
  lastFailureReason,
  lastSuccessAt,
  onManualSync,
}: SyncStatusPanelProps) {
  return (
    <section className={styles.card} aria-labelledby="sync-status-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.label}>云端同步</p>
          <h2 id="sync-status-title">同步状态</h2>
        </div>
        <span className={styles.badge}>已启用</span>
      </div>

      <dl className={styles.statusList}>
        <div>
          <dt>最近成功</dt>
          <dd>{lastSuccessAt ?? "尚未成功同步"}</dd>
        </div>
        <div>
          <dt>最近失败</dt>
          <dd className={lastFailureReason ? styles.errorText : undefined}>
            {lastFailureReason ?? "暂无失败记录"}
          </dd>
        </div>
      </dl>

      <button
        className={styles.syncButton}
        disabled={isSyncing}
        onClick={onManualSync}
        type="button"
      >
        {isSyncing ? "同步中..." : "手动同步"}
      </button>
    </section>
  );
}
