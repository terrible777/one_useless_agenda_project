"use client";

import { useEffect, useRef, useState } from "react";
import {
  areTasksMarkedDirtyInStorage,
  loadTasksFromStorage,
  saveTasksToStorage,
  setTasksDirtyInStorage,
} from "@/lib/taskStorage";
import { sortTasksByDeadline } from "@/lib/taskSorting";
import {
  clearCloudTasksFromClient,
  deleteCloudTaskFromClient,
  fetchCloudTasks,
  TaskSyncError,
  upsertCloudTasksFromClient,
} from "@/lib/taskSyncClient";
import type { RequirementKind } from "@/lib/requirementStorage";
import type { Task, TaskStatus } from "@/types/task";
import { AnalyzeInput } from "./AnalyzeInput";
import { PendingTaskList } from "./PendingTaskList";
import { RequirementOrganizerModal } from "./RequirementOrganizerModal";
import { RequirementTools } from "./RequirementTools";
import { ReminderRuntime } from "./ReminderRuntime";
import { SyncStatusPanel } from "./SyncStatusPanel";
import { TodoList } from "./TodoList";

const SYNC_FAILURE_MESSAGE = "云端同步失败，已保存在本地";

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

function normalizeTaskList(tasks: Task[]) {
  const now = new Date().toISOString();

  const normalizedTasks = tasks.map((task, index) => ({
    ...task,
    title: task.title.trim(),
    deadlineAt: task.deadlineAt ?? buildDeadlineAt(task),
    note: task.note.trim(),
    sourceText: task.sourceText.trim(),
    sortOrder: typeof task.sortOrder === "number" ? task.sortOrder : index,
    createdAt: task.createdAt ?? now,
    updatedAt: task.updatedAt ?? now,
  }));

  return sortTasksByDeadline(normalizedTasks).map((task, index) => ({
    ...task,
    sortOrder: index,
  }));
}

function formatSyncTime() {
  return new Date().toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    year: "numeric",
  });
}

function getSyncFailureReason(error: unknown) {
  if (error instanceof TaskSyncError) {
    return error.message;
  }

  return SYNC_FAILURE_MESSAGE;
}

export function TaskBoard() {
  const [savedTasks, setSavedTasks] = useState<Task[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [inputClearSignal, setInputClearSignal] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncFailureReason, setLastSyncFailureReason] = useState<string | null>(null);
  const [lastSyncSuccessAt, setLastSyncSuccessAt] = useState<string | null>(null);
  const [activeRequirementKind, setActiveRequirementKind] = useState<RequirementKind | null>(null);
  const localRevisionRef = useRef(0);
  const savedTasksRef = useRef<Task[]>([]);
  const hasUnsyncedLocalChangesRef = useRef(false);

  function markLocalSyncPending() {
    hasUnsyncedLocalChangesRef.current = true;
    setTasksDirtyInStorage(true);
  }

  function markLocalSyncSettled() {
    hasUnsyncedLocalChangesRef.current = false;
    setTasksDirtyInStorage(false);
  }

  async function replaceCloudTasksWithLocalSnapshot(tasks: Task[]) {
    await clearCloudTasksFromClient();

    if (tasks.length > 0) {
      await upsertCloudTasksFromClient(tasks);
    }
  }

  useEffect(() => {
    let isMounted = true;

    function applyTasks(tasks: Task[]) {
      const nextTasks = normalizeTaskList(tasks);

      savedTasksRef.current = nextTasks;
      saveTasksToStorage(nextTasks);

      if (isMounted) {
        setSavedTasks(nextTasks);
      }

      return nextTasks;
    }

    function markEffectSyncSuccess() {
      if (!isMounted) {
        return;
      }

      markLocalSyncSettled();
      setLastSyncSuccessAt(formatSyncTime());
      setLastSyncFailureReason(null);
    }

    function markEffectSyncFailure(error: unknown) {
      const reason = getSyncFailureReason(error);

      console.error(reason, error);

      if (isMounted) {
        setLastSyncFailureReason(reason);
      }
    }

    async function pullCloudTasks() {
      const revisionBeforeFetch = localRevisionRef.current;

      if (isMounted) {
        setIsSyncing(true);
      }

      try {
        const cloudTasks = await fetchCloudTasks();

        if (revisionBeforeFetch !== localRevisionRef.current) {
          return;
        }

        if (hasUnsyncedLocalChangesRef.current) {
          await replaceCloudTasksWithLocalSnapshot(savedTasksRef.current);
          markEffectSyncSuccess();
          return;
        }

        if (cloudTasks.length > 0) {
          applyTasks(cloudTasks);
          markEffectSyncSuccess();
          return;
        }

        applyTasks([]);
        markEffectSyncSuccess();
      } catch (error) {
        markEffectSyncFailure(error);
      } finally {
        if (isMounted) {
          setIsSyncing(false);
        }
      }
    }

    const timeoutId = window.setTimeout(() => {
      hasUnsyncedLocalChangesRef.current = areTasksMarkedDirtyInStorage();
      applyTasks(loadTasksFromStorage());
      void pullCloudTasks();
    }, 0);

    function handleRefreshSync() {
      if (document.visibilityState === "visible") {
        void pullCloudTasks();
      }
    }

    window.addEventListener("focus", handleRefreshSync);
    document.addEventListener("visibilitychange", handleRefreshSync);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
      window.removeEventListener("focus", handleRefreshSync);
      document.removeEventListener("visibilitychange", handleRefreshSync);
    };
  }, []);

  function markSyncSuccess() {
    markLocalSyncSettled();
    setLastSyncSuccessAt(formatSyncTime());
    setLastSyncFailureReason(null);
  }

  function markSyncFailure(error: unknown) {
    const reason = getSyncFailureReason(error);

    setLastSyncFailureReason(reason);
    console.error(reason, error);
  }

  function applySavedTasks(tasks: Task[]) {
    const nextTasks = normalizeTaskList(tasks);

    savedTasksRef.current = nextTasks;
    setSavedTasks(nextTasks);
    saveTasksToStorage(nextTasks);

    return nextTasks;
  }

  function commitSavedTasks(updater: Task[] | ((currentTasks: Task[]) => Task[])) {
    const nextTasks =
      typeof updater === "function" ? updater(savedTasksRef.current) : updater;

    localRevisionRef.current += 1;
    markLocalSyncPending();

    return applySavedTasks(nextTasks);
  }

  async function syncAllTasksToCloud(tasks: Task[], expectedRevision = localRevisionRef.current) {
    setIsSyncing(true);

    try {
      await upsertCloudTasksFromClient(tasks);

      if (expectedRevision === localRevisionRef.current) {
        markSyncSuccess();
      }
    } catch (error) {
      markSyncFailure(error);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleManualSync() {
    const revisionBeforeFetch = localRevisionRef.current;

    setIsSyncing(true);

    try {
      const cloudTasks = await fetchCloudTasks();

      if (revisionBeforeFetch !== localRevisionRef.current) {
        return;
      }

      if (hasUnsyncedLocalChangesRef.current) {
        await replaceCloudTasksWithLocalSnapshot(savedTasksRef.current);
        markSyncSuccess();
        return;
      }

      if (cloudTasks.length > 0) {
        applySavedTasks(cloudTasks);
        markSyncSuccess();
        return;
      }

      applySavedTasks([]);
      markSyncSuccess();
    } catch (error) {
      markSyncFailure(error);
    } finally {
      setIsSyncing(false);
    }
  }

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
    });
    const nextTasks = commitSavedTasks((currentTasks) => [normalizedTask, ...currentTasks]);

    setPendingTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskToSave.id));
    setInputClearSignal((currentSignal) => currentSignal + 1);
    void syncAllTasksToCloud(nextTasks);
  }

  function handleCancelPendingTask(taskId: string) {
    setPendingTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
  }

  function handleDeleteSavedTask(taskId: string) {
    const nextTasks = commitSavedTasks((currentTasks) =>
      currentTasks.filter((task) => task.id !== taskId),
    );
    const expectedRevision = localRevisionRef.current;

    void (async () => {
      setIsSyncing(true);

      try {
        if (nextTasks.length > 0) {
          await deleteCloudTaskFromClient(taskId);
          await upsertCloudTasksFromClient(nextTasks);
        } else {
          await clearCloudTasksFromClient();
        }

        if (expectedRevision === localRevisionRef.current) {
          markSyncSuccess();
        }
      } catch (error) {
        markSyncFailure(error);
      } finally {
        setIsSyncing(false);
      }
    })();
  }

  function handleChangeSavedTaskStatus(taskId: string, status: TaskStatus) {
    const nextTasks = commitSavedTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === taskId ? touchTask({ ...task, status }) : task)),
    );

    void syncAllTasksToCloud(nextTasks);
  }

  function handleUpdateSavedTask(updatedTask: Task) {
    const normalizedTask = touchTask({
      ...updatedTask,
      title: updatedTask.title.trim(),
      note: updatedTask.note.trim(),
    });
    const nextTasks = commitSavedTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === normalizedTask.id ? normalizedTask : task)),
    );

    void syncAllTasksToCloud(nextTasks);
  }

  function handleReorderSavedTasks(reorderedTasks: Task[]) {
    const nextTasks = commitSavedTasks(
      reorderedTasks.map((task, index) => ({
        ...task,
        sortOrder: index,
      })),
    );

    void syncAllTasksToCloud(nextTasks);
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
        tasks={pendingTasks}
        onCancelTask={handleCancelPendingTask}
        onChangeTask={handleChangePendingTask}
        onSaveTask={handleSaveTask}
      />
      <ReminderRuntime />
      <SyncStatusPanel
        isSyncing={isSyncing}
        lastFailureReason={lastSyncFailureReason}
        lastSuccessAt={lastSyncSuccessAt}
        onManualSync={() => void handleManualSync()}
      />
    </>
  );
}
