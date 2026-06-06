"use client";

import { useEffect } from "react";
import type { Task } from "@/types/task";
import { PendingTaskCard } from "./PendingTaskCard";
import styles from "./PendingTaskList.module.css";

type PendingTaskListProps = {
  tasks: Task[];
  onCancelTask: (taskId: string) => void;
  onChangeTask: (task: Task) => void;
  onSaveTask: (task: Task) => void;
};

export function PendingTaskList({
  tasks,
  onCancelTask,
  onChangeTask,
  onSaveTask,
}: PendingTaskListProps) {
  useEffect(() => {
    if (tasks.length === 0) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        tasks.forEach((task) => onCancelTask(task.id));
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancelTask, tasks]);

  if (tasks.length === 0) {
    return null;
  }

  function handleClose() {
    tasks.forEach((task) => onCancelTask(task.id));
  }

  return (
    <div className={styles.overlay} role="presentation">
      <section
        aria-labelledby="pending-task-title"
        aria-modal="true"
        className={styles.dialog}
        role="dialog"
      >
        <div className={styles.headingRow}>
          <div>
            <p className={styles.label}>待保存任务</p>
            <h2 id="pending-task-title">待确认任务卡片</h2>
          </div>
          <div className={styles.headingActions}>
            <span className={styles.count}>{tasks.length} 项</span>
            <button className={styles.closeButton} onClick={handleClose} type="button">
              关闭
            </button>
          </div>
        </div>

        <div className={styles.list}>
          {tasks.map((task) => (
            <PendingTaskCard
              key={task.id}
              onCancel={() => onCancelTask(task.id)}
              onChange={onChangeTask}
              onSave={() => onSaveTask(task)}
              task={task}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
