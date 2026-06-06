"use client";

import { useState } from "react";
import type { Task, TaskStatus } from "@/types/task";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/types/task";
import styles from "./TaskEditForm.module.css";

type TaskEditFormProps = {
  task: Task;
  onCancel: () => void;
  onSave: (task: Task) => void;
};

export function TaskEditForm({ task, onCancel, onSave }: TaskEditFormProps) {
  const [draftTask, setDraftTask] = useState<Task>(task);
  const [error, setError] = useState("");

  function updateDraft(changes: Partial<Task>) {
    setDraftTask((currentTask) => ({ ...currentTask, ...changes }));
    if (error) {
      setError("");
    }
  }

  function handleSave() {
    const title = draftTask.title.trim();

    if (!title) {
      setError("任务标题不能为空");
      return;
    }

    onSave({
      ...draftTask,
      title,
      note: draftTask.note.trim(),
    });
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
    >
      <label className={styles.field}>
        <span>任务标题</span>
        <input
          onChange={(event) => updateDraft({ title: event.target.value })}
          type="text"
          value={draftTask.title}
        />
      </label>

      <div className={styles.inlineFields}>
        <label className={styles.field}>
          <span>截止日期</span>
          <input
            onChange={(event) => updateDraft({ deadlineDate: event.target.value || null })}
            type="date"
            value={draftTask.deadlineDate ?? ""}
          />
        </label>

        <label className={styles.field}>
          <span>截止时间</span>
          <input
            onChange={(event) => updateDraft({ deadlineTime: event.target.value || null })}
            type="time"
            value={draftTask.deadlineTime ?? ""}
          />
        </label>
      </div>

      <label className={styles.field}>
        <span>状态</span>
        <select
          onChange={(event) => updateDraft({ status: event.target.value as TaskStatus })}
          value={draftTask.status}
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
          onChange={(event) => updateDraft({ note: event.target.value })}
          placeholder="可补充地点、上下文或执行要求"
          rows={3}
          value={draftTask.note}
        />
      </label>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button className={styles.saveButton} type="submit">
          保存修改
        </button>
        <button className={styles.cancelButton} onClick={onCancel} type="button">
          取消
        </button>
      </div>
    </form>
  );
}
