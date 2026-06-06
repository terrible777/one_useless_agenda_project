"use client";

import { useEffect, useRef, useState } from "react";
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
  fetchCloudRequirement,
  isRequirementCloudInitializedInStorage,
  pushRequirementTextToCloud,
  setRequirementCloudInitializedInStorage,
} from "@/lib/requirementSyncClient";
import { sortTasksByDeadline, sortTasksByManualOrder } from "@/lib/taskSorting";
import {
  loadRequirementText,
  saveRequirementText,
  type RequirementKind,
} from "@/lib/requirementStorage";
import {
  deleteCloudTask,
  fetchCloudTasks,
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

function recordCloudSyncError(error: unknown) {
  const message = `云端同步失败，已保存在本地：${getCloudSyncErrorMessage(error)}`;

  console.error(message, error);
  recordCloudSyncFailure(message);
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

  function applySavedTasks(tasks: Task[], manualSortEnabled = isManualSortEnabledRef.current) {
    const nextManualSortEnabled = manualSortEnabled && tasks.length > 0;
    const nextTasks = normalizeTaskList(tasks, nextManualSortEnabled);

    savedTasksRef.current = nextTasks;
    isManualSortEnabledRef.current = nextManualSortEnabled;
    setSavedTasks(nextTasks);
    saveTasksToStorage(nextTasks);
    setManualTaskSortEnabledInStorage(nextManualSortEnabled);

    return nextTasks;
  }

  function commitSavedTasks(
    updater: Task[] | ((currentTasks: Task[]) => Task[]),
    manualSortEnabled = isManualSortEnabledRef.current,
  ) {
    const nextTasks =
      typeof updater === "function" ? updater(savedTasksRef.current) : updater;

    return applySavedTasks(nextTasks, manualSortEnabled);
  }

  async function pullRequirementFromCloud(kind: RequirementKind, forceCloud = false) {
    const localText = loadRequirementText(kind);
    const cloudRequirement = await fetchCloudRequirement(kind);
    const hasInitialized = isRequirementCloudInitializedInStorage(kind);

    if (forceCloud || cloudRequirement.content.trim() || hasInitialized || !localText.trim()) {
      saveRequirementText(kind, cloudRequirement.content);
    } else {
      await pushRequirementTextToCloud(kind, localText);
    }

    setRequirementCloudInitializedInStorage(kind, true);
  }

  async function pullTasksFromCloud(forceCloud = false) {
    const cloudTasks = await fetchCloudTasks();
    const localTasks = savedTasksRef.current;
    const hasInitialized = isTaskCloudInitializedInStorage();

    if (forceCloud || cloudTasks.length > 0 || hasInitialized || localTasks.length === 0) {
      applySavedTasks(cloudTasks, hasManualSortOrder(cloudTasks));
    } else {
      await replaceCloudTaskList(localTasks);
    }

    setTaskCloudInitializedInStorage(true);
  }

  async function pullAllCloudData(forceCloud = false) {
    await pullTasksFromCloud(forceCloud);
    await Promise.all([
      pullRequirementFromCloud("exam", forceCloud),
      pullRequirementFromCloud("course", forceCloud),
    ]);
    recordCloudSyncSuccess();
  }

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
      recordCloudSyncSuccess();
    } catch (error) {
      recordCloudSyncError(error);
    }
  }

  async function syncTaskListToCloud(tasks: Task[]) {
    try {
      await syncCloudTaskList(tasks);
      setTaskCloudInitializedInStorage(true);
      recordCloudSyncSuccess();
    } catch (error) {
      recordCloudSyncError(error);
    }
  }

  async function syncDeletedTaskToCloud(taskId: string) {
    try {
      await deleteCloudTask(taskId);
      setTaskCloudInitializedInStorage(true);
      recordCloudSyncSuccess();
    } catch (error) {
      recordCloudSyncError(error);
    }
  }

  useEffect(() => {
    applySavedTasks(loadTasksFromStorage(), isManualTaskSortEnabledInStorage());
    void pullAllCloudData().catch(recordCloudSyncError);
    // 初始同步只需要在页面加载时执行一次，后续修改由各个保存/删除 handler 主动同步。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
