import { sendAppNotification, getNotificationStatus } from "@/lib/notificationSender";
import { loadTasksFromStorage } from "@/lib/taskStorage";
import type { Task } from "@/types/task";

export const REMINDER_CHECK_INTERVAL_MS = 30_000;

const REMINDER_LOG_KEY = "agenda_generate_reminder_logs";
const REMINDER_DUE_WINDOW_MS = 5 * 60 * 1000;

type ReminderType =
  | "not_started_morning"
  | "not_started_afternoon"
  | "deadline_previous_day"
  | "deadline_due";

type ReminderCandidate = {
  body: string;
  scheduledAt: Date;
  task: Task;
  type: ReminderType;
};

type ReminderLog = {
  id: string;
  reminderType: ReminderType;
  scheduledAt: string;
  taskId: string;
  triggeredAt: string;
};

export type ReminderCheckResult = {
  checkedAt: string;
  checkedTaskCount: number;
  errorCount: number;
  skippedReason: string | null;
  sentCount: number;
};

function getLocalStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReminderType(value: unknown): value is ReminderType {
  return (
    value === "not_started_morning" ||
    value === "not_started_afternoon" ||
    value === "deadline_previous_day" ||
    value === "deadline_due"
  );
}

function parseReminderLog(value: unknown): ReminderLog | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.taskId !== "string" ||
    !isReminderType(value.reminderType) ||
    typeof value.scheduledAt !== "string" ||
    typeof value.triggeredAt !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    reminderType: value.reminderType,
    scheduledAt: value.scheduledAt,
    taskId: value.taskId,
    triggeredAt: value.triggeredAt,
  };
}

function loadReminderLogs(): ReminderLog[] {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return [];
  }

  try {
    const rawLogs = localStorage.getItem(REMINDER_LOG_KEY);

    if (!rawLogs) {
      return [];
    }

    const parsedLogs: unknown = JSON.parse(rawLogs);

    if (!Array.isArray(parsedLogs)) {
      throw new Error("Reminder logs are not an array.");
    }

    const logs = parsedLogs.map(parseReminderLog);

    if (logs.some((log) => log === null)) {
      throw new Error("Reminder logs contain invalid items.");
    }

    return logs as ReminderLog[];
  } catch (error) {
    console.warn("localStorage 中的提醒日志损坏，已清空。", error);
    localStorage.removeItem(REMINDER_LOG_KEY);
    return [];
  }
}

function saveReminderLogs(logs: ReminderLog[]) {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return;
  }

  try {
    localStorage.setItem(REMINDER_LOG_KEY, JSON.stringify(logs));
  } catch (error) {
    console.error("提醒日志保存到 localStorage 失败。", error);
  }
}

function createReminderId(taskId: string, type: ReminderType, scheduledAt: string) {
  return `${taskId}:${type}:${scheduledAt}`;
}

function getLocalDateAt(baseDate: Date, hour: number, minute: number) {
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hour,
    minute,
    0,
    0,
  );
}

function parseDeadlineDate(dateText: string | null) {
  if (!dateText) {
    return null;
  }

  const match = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function getDeadlineAt(task: Task) {
  const deadlineDate = parseDeadlineDate(task.deadlineDate);

  if (!deadlineDate) {
    return null;
  }

  const [hour, minute] = task.deadlineTime
    ? task.deadlineTime.split(":").map(Number)
    : [23, 59];

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return getLocalDateAt(deadlineDate, hour, minute);
}

function getPreviousDayReminderAt(task: Task) {
  const deadlineDate = parseDeadlineDate(task.deadlineDate);

  if (!deadlineDate) {
    return null;
  }

  const reminderDate = new Date(deadlineDate);
  reminderDate.setDate(reminderDate.getDate() - 1);

  return getLocalDateAt(reminderDate, 10, 30);
}

function isDue(scheduledAt: Date, now: Date) {
  const delta = now.getTime() - scheduledAt.getTime();

  return delta >= 0 && delta <= REMINDER_DUE_WINDOW_MS;
}

function createReminderCandidates(task: Task, now: Date): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];

  if (task.status === "completed") {
    return candidates;
  }

  if (task.status === "not_started") {
    candidates.push({
      body: `还没开始：${task.title}`,
      scheduledAt: getLocalDateAt(now, 10, 30),
      task,
      type: "not_started_morning",
    });
    candidates.push({
      body: `下午提醒：${task.title}`,
      scheduledAt: getLocalDateAt(now, 14, 30),
      task,
      type: "not_started_afternoon",
    });
  }

  const previousDayReminderAt = getPreviousDayReminderAt(task);

  if (previousDayReminderAt) {
    candidates.push({
      body: `明天截止：${task.title}`,
      scheduledAt: previousDayReminderAt,
      task,
      type: "deadline_previous_day",
    });
  }

  const deadlineAt = getDeadlineAt(task);

  if (deadlineAt) {
    candidates.push({
      body: `现在截止：${task.title}`,
      scheduledAt: deadlineAt,
      task,
      type: "deadline_due",
    });
  }

  return candidates;
}

export async function runReminderCheck(now = new Date()): Promise<ReminderCheckResult> {
  const checkedAt = now.toISOString();
  const permissionStatus = getNotificationStatus();

  if (permissionStatus !== "granted") {
    return {
      checkedAt,
      checkedTaskCount: 0,
      errorCount: 0,
      skippedReason: "通知权限不是已允许，已跳过提醒检查。",
      sentCount: 0,
    };
  }

  const tasks = loadTasksFromStorage();
  const logs = loadReminderLogs();
  const loggedReminderIds = new Set(logs.map((log) => log.id));
  let errorCount = 0;
  let sentCount = 0;

  for (const task of tasks) {
    const dueCandidates = createReminderCandidates(task, now).filter((candidate) =>
      isDue(candidate.scheduledAt, now),
    );

    for (const candidate of dueCandidates) {
      const scheduledAt = candidate.scheduledAt.toISOString();
      const reminderId = createReminderId(task.id, candidate.type, scheduledAt);

      if (loggedReminderIds.has(reminderId)) {
        continue;
      }

      try {
        await sendAppNotification({
          body: candidate.body,
          tag: `agenda-reminder-${reminderId}`,
        });

        logs.push({
          id: reminderId,
          reminderType: candidate.type,
          scheduledAt,
          taskId: task.id,
          triggeredAt: checkedAt,
        });
        loggedReminderIds.add(reminderId);
        sentCount += 1;
      } catch (error) {
        console.error("发送提醒通知失败。", error);
        errorCount += 1;
      }
    }
  }

  if (sentCount > 0) {
    saveReminderLogs(logs);
  }

  return {
    checkedAt,
    checkedTaskCount: tasks.length,
    errorCount,
    skippedReason: null,
    sentCount,
  };
}
