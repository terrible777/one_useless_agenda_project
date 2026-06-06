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
  if (tasks.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} aria-labelledby="pending-task-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.label}>待保存任务</p>
          <h2 id="pending-task-title">待确认任务卡片</h2>
        </div>
        <span className={styles.count}>{tasks.length} 项</span>
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
  );
}
