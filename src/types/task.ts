export type TaskStatus = "not_started" | "in_progress" | "completed";

export type Task = {
  id: string;
  title: string;
  deadlineDate: string | null;
  deadlineTime: string | null;
  deadlineAt?: string | null;
  status: TaskStatus;
  note: string;
  sourceText: string;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
};

export const TASK_STATUSES: TaskStatus[] = ["not_started", "in_progress", "completed"];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "未开始",
  in_progress: "进行中",
  completed: "已完成",
};
