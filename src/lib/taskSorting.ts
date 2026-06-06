import type { Task } from "@/types/task";

function buildDeadlineAt(task: Pick<Task, "deadlineDate" | "deadlineTime">) {
  if (!task.deadlineDate) {
    return null;
  }

  return `${task.deadlineDate}T${task.deadlineTime ?? "15:00"}:00+08:00`;
}

function getDeadlineTimestamp(task: Task) {
  const deadlineAt = task.deadlineAt ?? buildDeadlineAt(task);

  if (!deadlineAt) {
    return null;
  }

  const timestamp = Date.parse(deadlineAt);

  return Number.isFinite(timestamp) ? timestamp : null;
}

export function sortTasksByDeadline(tasks: Task[]) {
  return tasks
    .map((task, index) => ({
      index,
      task,
      timestamp: getDeadlineTimestamp(task),
    }))
    .sort((a, b) => {
      if (a.timestamp !== null && b.timestamp !== null && a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }

      if (a.timestamp !== null && b.timestamp === null) {
        return -1;
      }

      if (a.timestamp === null && b.timestamp !== null) {
        return 1;
      }

      return a.index - b.index;
    })
    .map(({ task }) => task);
}

export function sortTasksByManualOrder(tasks: Task[]) {
  return tasks
    .map((task, index) => ({
      index,
      sortOrder: typeof task.sortOrder === "number" ? task.sortOrder : Number.POSITIVE_INFINITY,
      task,
    }))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }

      return a.index - b.index;
    })
    .map(({ task }) => task);
}

export function inferManualSortEnabled(tasks: Task[]) {
  if (!tasks.some((task) => typeof task.sortOrder === "number")) {
    return false;
  }

  const deadlineOrder = sortTasksByDeadline(tasks)
    .map((task) => task.id)
    .join("\u0000");
  const manualOrder = sortTasksByManualOrder(tasks)
    .map((task) => task.id)
    .join("\u0000");

  return deadlineOrder !== manualOrder;
}
