import { useState } from "react";
import type { Task, TaskStatus } from "@/types/task";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/types/task";
import styles from "./PendingTaskCard.module.css";

type PendingTaskCardProps = {
  task: Task;
  onCancel: () => void;
  onChange: (task: Task) => void;
  onSave: () => void;
};

export function PendingTaskCard({ task, onCancel, onChange, onSave }: PendingTaskCardProps) {
  const [error, setError] = useState("");

  function updateTask(changes: Partial<Task>) {
    onChange({ ...task, ...changes });
    if (error) {
      setError("");
    }
  }

  function handleSave() {
    if (!task.title.trim()) {
      setError("请先填写任务标题");
      return;
    }

    onSave();
  }

  return (
    <article className={styles.card}>
      <label className={styles.field}>
        <span>任务标题</span>
        <input
          onChange={(event) => updateTask({ title: event.target.value })}
          placeholder="例如：提交材料"
          type="text"
          value={task.title}
        />
      </label>

      <div className={styles.inlineFields}>
        <label className={styles.field}>
          <span>截止日期</span>
          <input
            onChange={(event) => updateTask({ deadlineDate: event.target.value || null })}
            type="date"
            value={task.deadlineDate ?? ""}
          />
        </label>

        <label className={styles.field}>
          <span>截止时间</span>
          <input
            onChange={(event) => updateTask({ deadlineTime: event.target.value || null })}
            type="time"
            value={task.deadlineTime ?? ""}
          />
        </label>
      </div>

      <label className={styles.field}>
        <span>状态</span>
        <select
          onChange={(event) => updateTask({ status: event.target.value as TaskStatus })}
          value={task.status}
        >
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {TASK_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>备注</span>
        <textarea
          className={styles.note}
          onChange={(event) => updateTask({ note: event.target.value })}
          placeholder="可补充地点、上下文或执行要求"
          rows={3}
          value={task.note}
        />
      </label>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button className={styles.saveButton} onClick={handleSave} type="button">
          保存任务
        </button>
        <button className={styles.cancelButton} onClick={onCancel} type="button">
          取消
        </button>
      </div>
    </article>
  );
}
