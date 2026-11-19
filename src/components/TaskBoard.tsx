"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isManualTaskSortEnabledInStorage,
  loadTasksFromStorage,
  saveTasksToStorage,
  setManualTaskSortEnabledInStorage,
} from "@/lib/taskStorage";
import {
  recordCloudSyncFailure,
  recordCloudSyncSuccess,
} from "@/lib/cloudSyncStatus";
import {
  refreshRequirementFromCloud,
  pushRequirementTextToCloud,
  setRequirementCloudInitializedInStorage,
} from "@/lib/requirementSyncClient";
import { startCloudSyncLifecycle } from "@/lib/cloudSyncLifecycle";
import { sortTasksByDeadline, sortTasksByManualOrder } from "@/lib/taskSorting";
import {
  loadRequirementText,
  type RequirementKind,
} from "@/lib/requirementStorage";
import {
  deleteCloudTask,
  fetchCloudTasks,
  getTaskSyncRevision,
  hasPendingCloudTaskChanges,
  isTaskCloudInitializedInStorage,
  replaceCloudTaskList,
  setTaskCloudInitializedInStorage,
  syncCloudTaskList,
  upsertCloudTask,
} from "@/lib/taskSyncClient";
import type { Task, TaskStatus } from "@/types/task";
import { AnalyzeInput } from "./AnalyzeInput";
import { LocalDataPanel } from "./LocalDataPanel";
import { PendingTaskList } from "./PendingTaskList";
import { RequirementOrganizerModal } from "./RequirementOrganizerModal";
import { RequirementTools } from "./RequirementTools";
import { ReminderRuntime } from "./ReminderRuntime";
import { TodoList } from "./TodoList";

function createTemporaryId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

function getManualTaskTitle(sourceText: string) {
  const compactText = sourceText.replace(/\s+/g, "").trim();

  if (!compactText) {
    return "";
  }

  return compactText.length > 10 ? compactText.slice(0, 10) : compactText;
}

function buildDeadlineAt(task: Pick<Task, "deadlineDate" | "deadlineTime">) {
  if (!task.deadlineDate) {
    return null;
  }

  return `${task.deadlineDate}T${task.deadlineTime ?? "15:00"}:00+08:00`;
}

function touchTask(task: Task) {
  const now = new Date().toISOString();

  return {
    ...task,
    createdAt: task.createdAt ?? now,
    deadlineAt: buildDeadlineAt(task),
    updatedAt: now,
  };
}

function normalizeTaskList(tasks: Task[], isManualSortEnabled: boolean) {
  const now = new Date().toISOString();
  const normalizedTasks = tasks.map((task) => ({
    ...task,
    title: task.title.trim(),
    deadlineAt: task.deadlineAt ?? buildDeadlineAt(task),
    note: task.note.trim(),
    sourceText: task.sourceText.trim(),
    sortOrder: typeof task.sortOrder === "number" ? task.sortOrder : undefined,
    createdAt: task.createdAt ?? now,
    updatedAt: task.updatedAt ?? now,
  }));

  if (isManualSortEnabled) {
    return sortTasksByManualOrder(normalizedTasks).map((task, index) => ({
      ...task,
      sortOrder: index,
    }));
  }

  return sortTasksByDeadline(normalizedTasks).map((task) => ({
    ...task,
    sortOrder: undefined,
  }));
}

function getCloudSyncErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function recordCloudSyncError(error: unknown, resource = "all") {
  const message = `云端同步失败，已保存在本地：${getCloudSyncErrorMessage(error)}`;

  console.error(message, error);
  recordCloudSyncFailure(message, resource);
}

function hasManualSortOrder(tasks: Task[]) {
  return tasks.some((task) => typeof task.sortOrder === "number");
}

export function TaskBoard() {
  const [savedTasks, setSavedTasks] = useState<Task[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [inputClearSignal, setInputClearSignal] = useState(0);
  const [activeRequirementKind, setActiveRequirementKind] = useState<RequirementKind | null>(null);
  const savedTasksRef = useRef<Task[]>([]);
  const isManualSortEnabledRef = useRef(false);
  const cloudRefreshRef = useRef<Promise<void> | null>(null);

  const applySavedTasks = useCallback((tasks: Task[], manualSortEnabled = isManualSortEnabledRef.current) => {
    const nextManualSortEnabled = manualSortEnabled && tasks.length > 0;
    const nextTasks = normalizeTaskList(tasks, nextManualSortEnabled);

    savedTasksRef.current = nextTasks;
    isManualSortEnabledRef.current = nextManualSortEnabled;
    setSavedTasks(nextTasks);
    saveTasksToStorage(nextTasks);
    setManualTaskSortEnabledInStorage(nextManualSortEnabled);

    return nextTasks;
  }, []);

  function commitSavedTasks(
    updater: Task[] | ((currentTasks: Task[]) => Task[]),
    manualSortEnabled = isManualSortEnabledRef.current,
  ) {
    const nextTasks =
      typeof updater === "function" ? updater(savedTasksRef.current) : updater;

    return applySavedTasks(nextTasks, manualSortEnabled);
  }

  const pullTasksFromCloud = useCallback(async (forceCloud = false) => {
    const revision = getTaskSyncRevision();
    const cloudTasks = await fetchCloudTasks();
    if (getTaskSyncRevision() !== revision || hasPendingCloudTaskChanges()) return;
    const localTasks = savedTasksRef.current;
    const hasInitialized = isTaskCloudInitializedInStorage();

    if (forceCloud || cloudTasks.length > 0 || hasInitialized || localTasks.length === 0) {
      applySavedTasks(cloudTasks, hasManualSortOrder(cloudTasks));
    } else {
      // A cached list alone is not evidence that deleted cloud tasks should be recreated.
      return;
    }

    setTaskCloudInitializedInStorage(true);
  }, [applySavedTasks]);

  const pullAllCloudData = useCallback((forceCloud = false): Promise<void> => {
    if (cloudRefreshRef.current) return cloudRefreshRef.current;
    const operations = [
      { resource: "tasks", run: () => pullTasksFromCloud(forceCloud) },
      { resource: "exam", run: () => refreshRequirementFromCloud("exam", forceCloud) },
      { resource: "course", run: () => refreshRequirementFromCloud("course", forceCloud) },
    ];
    cloudRefreshRef.current = (async () => {
      const results = await Promise.allSettled(operations.map(async ({ resource, run }) => {
        try {
          await run();
          recordCloudSyncSuccess(resource);
        } catch (error) {
          recordCloudSyncError(error, resource);
          throw error;
        }
      }));
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length) {
        throw new Error(failures.map((result) => getCloudSyncErrorMessage(result.reason)).join("；"));
      }
      recordCloudSyncSuccess();
    })().finally(() => { cloudRefreshRef.current = null; });
    return cloudRefreshRef.current;
  }, [pullTasksFromCloud]);

  async function pushLocalDataToCloud() {
    await replaceCloudTaskList(loadTasksFromStorage());
    await Promise.all([
      pushRequirementTextToCloud("exam", loadRequirementText("exam")),
      pushRequirementTextToCloud("course", loadRequirementText("course")),
    ]);
    setTaskCloudInitializedInStorage(true);
    setRequirementCloudInitializedInStorage("exam", true);
    setRequirementCloudInitializedInStorage("course", true);
    recordCloudSyncSuccess();
  }

  async function syncTaskToCloud(task: Task) {
    try {
      await upsertCloudTask(task);
      setTaskCloudInitializedInStorage(true);
      recordCloudSyncSuccess("tasks");
    } catch (error) {
      recordCloudSyncError(error, "tasks");
    }
  }

  async function syncTaskListToCloud(tasks: Task[]) {
    try {
      await syncCloudTaskList(tasks);
      setTaskCloudInitializedInStorage(true);
      recordCloudSyncSuccess("tasks");
    } catch (error) {
      recordCloudSyncError(error, "tasks");
    }
  }

  async function syncDeletedTaskToCloud(taskId: string) {
    try {
      await deleteCloudTask(taskId);
      setTaskCloudInitializedInStorage(true);
      recordCloudSyncSuccess("tasks");
    } catch (error) {
      recordCloudSyncError(error, "tasks");
    }
  }

  useEffect(() => {
    applySavedTasks(loadTasksFromStorage(), isManualTaskSortEnabledInStorage());
    return startCloudSyncLifecycle(() => pullAllCloudData(), () => undefined);
  }, [applySavedTasks, pullAllCloudData]);

  function handleAnalyze(tasks: Task[]) {
    setPendingTasks(tasks);
  }

  function handleCreateManualTask(sourceText: string) {
    setPendingTasks([
      {
        id: createTemporaryId("manual"),
        title: getManualTaskTitle(sourceText),
        deadlineAt: null,
        deadlineDate: null,
        deadlineTime: null,
        note: "",
        sourceText,
        status: "not_started",
      },
    ]);
  }

  function handleChangePendingTask(updatedTask: Task) {
    setPendingTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
    );
  }

  function handleSaveTask(taskToSave: Task) {
    const title = taskToSave.title.trim();

    if (!title) {
      window.alert("请先填写任务标题。");
      return;
    }

    const normalizedTask = touchTask({
      ...taskToSave,
      title,
      note: taskToSave.note.trim(),
      sourceText: taskToSave.sourceText.trim(),
      sortOrder: isManualSortEnabledRef.current ? savedTasksRef.current.length : undefined,
    });

    commitSavedTasks(
      (currentTasks) =>
        isManualSortEnabledRef.current
          ? [...currentTasks, normalizedTask]
          : [normalizedTask, ...currentTasks],
      isManualSortEnabledRef.current,
    );
    void syncTaskToCloud(normalizedTask);
    setPendingTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskToSave.id));
    setInputClearSignal((currentSignal) => currentSignal + 1);
  }

  function handleCancelPendingTask(taskId: string) {
    setPendingTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
  }

  function handleDeleteSavedTask(taskId: string) {
    commitSavedTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
    void syncDeletedTaskToCloud(taskId);
  }

  function handleChangeSavedTaskStatus(taskId: string, status: TaskStatus) {
    let changedTask: Task | null = null;

    commitSavedTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        changedTask = touchTask({ ...task, status });
        return changedTask;
      }),
    );

    if (changedTask) {
      void syncTaskToCloud(changedTask);
    }
  }

  function handleUpdateSavedTask(updatedTask: Task) {
    const normalizedTask = touchTask({
      ...updatedTask,
      title: updatedTask.title.trim(),
      note: updatedTask.note.trim(),
    });

    commitSavedTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === normalizedTask.id ? normalizedTask : task)),
    );
    void syncTaskToCloud(normalizedTask);
  }

  function handleReorderSavedTasks(reorderedTasks: Task[]) {
    const now = new Date().toISOString();

    const nextTasks = commitSavedTasks(
      reorderedTasks.map((task, index) => ({
        ...task,
        sortOrder: index,
        updatedAt: now,
      })),
      true,
    );
    void syncTaskListToCloud(nextTasks);
  }

  return (
    <>
      <TodoList
        onChangeTaskStatus={handleChangeSavedTaskStatus}
        onDeleteTask={handleDeleteSavedTask}
        onReorderTasks={handleReorderSavedTasks}
        onUpdateTask={handleUpdateSavedTask}
        tasks={savedTasks}
      />
      <RequirementTools onOpen={setActiveRequirementKind} />
      <AnalyzeInput
        key={inputClearSignal}
        onAnalyze={handleAnalyze}
        onCreateManualTask={handleCreateManualTask}
      />
      {activeRequirementKind ? (
        <RequirementOrganizerModal
          kind={activeRequirementKind}
          key={activeRequirementKind}
          onClose={() => setActiveRequirementKind(null)}
        />
      ) : null}
      <PendingTaskList
        onCancelTask={handleCancelPendingTask}
        onChangeTask={handleChangePendingTask}
        onSaveTask={handleSaveTask}
        tasks={pendingTasks}
      />
      <ReminderRuntime />
      <LocalDataPanel
        onPullCloudData={() => pullAllCloudData(true)}
        onPushCloudData={pushLocalDataToCloud}
      />
    </>
  );
}
