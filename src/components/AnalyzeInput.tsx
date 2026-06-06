"use client";

import { useState } from "react";
import { mockAnalyzeText } from "@/lib/mockAnalyzeText";
import type { Task, TaskStatus } from "@/types/task";
import styles from "./AnalyzeInput.module.css";

type AnalyzeInputProps = {
  onAnalyze: (tasks: Task[]) => void;
  onCreateManualTask: (sourceText: string) => void;
};

type AnalyzeApiTask = Omit<Task, "id">;

type AnalyzeApiError = {
  error?: unknown;
  message?: unknown;
};

const useMockAI = process.env.NEXT_PUBLIC_USE_MOCK_AI === "true";

function createTemporaryId(index: number) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `ai-${crypto.randomUUID()}`;
  }

  return `ai-${Date.now()}-${index}`;
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "not_started" || value === "in_progress" || value === "completed";
}

function normalizeApiTask(task: AnalyzeApiTask, index: number, sourceText: string): Task {
  const title = typeof task.title === "string" ? task.title.trim() : "";
  const note = typeof task.note === "string" ? task.note : "";
  const taskSourceText = typeof task.sourceText === "string" ? task.sourceText : "";

  return {
    id: createTemporaryId(index),
    title: title || `待办任务 ${index + 1}`,
    deadlineDate: typeof task.deadlineDate === "string" ? task.deadlineDate : null,
    deadlineTime: typeof task.deadlineTime === "string" ? task.deadlineTime : null,
    status: isTaskStatus(task.status) ? task.status : "not_started",
    note,
    sourceText: taskSourceText || sourceText,
  };
}

function getApiErrorMessage(data: AnalyzeApiError) {
  if (typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }

  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }

  return "AI 分析失败，请稍后重试";
}

async function readAnalyzeResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    return text ? { error: text } : {};
  }

  return (await response.json()) as AnalyzeApiTask[] | AnalyzeApiError;
}

async function requestAnalyze(text: string) {
  const response = await fetch("/api/analyze", {
    body: JSON.stringify({ text }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const data = await readAnalyzeResponse(response);

  if (!response.ok) {
    throw new Error(!Array.isArray(data) ? getApiErrorMessage(data) : "AI 分析失败，请稍后重试");
  }

  if (!Array.isArray(data)) {
    throw new Error(getApiErrorMessage(data));
  }

  return data.map((task, index) => normalizeApiTask(task, index, text));
}

export function AnalyzeInput({ onAnalyze, onCreateManualTask }: AnalyzeInputProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleAnalyze() {
    const trimmedText = text.trim();

    if (!trimmedText) {
      setError("请先输入任务内容");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const tasks = useMockAI ? mockAnalyzeText(trimmedText) : await requestAnalyze(trimmedText);
      onAnalyze(tasks);
    } catch (analyzeError) {
      console.error("AI 分析失败。", analyzeError);
      setError(analyzeError instanceof Error ? analyzeError.message : "AI 分析失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  }

  function handleCreateManualTask() {
    setError("");
    onCreateManualTask(text.trim());
  }

  return (
    <section className={styles.card} aria-labelledby="task-input-title">
      <label className={styles.label} htmlFor="task-content" id="task-input-title">
        粘贴任务内容
      </label>
      <textarea
        id="task-content"
        className={styles.textarea}
        disabled={isLoading}
        onChange={(event) => {
          setText(event.target.value);
          if (error) {
            setError("");
          }
        }}
        placeholder="例如：明天下午 3 点前整理会议纪要，周五提醒我给客户发报价单。"
        rows={7}
        value={text}
      />

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          disabled={isLoading}
          onClick={handleAnalyze}
          type="button"
        >
          {isLoading ? "分析中..." : "AI 分析"}
        </button>
        <button
          className={styles.secondaryButton}
          disabled={isLoading}
          onClick={handleCreateManualTask}
          type="button"
        >
          手动新建
        </button>
      </div>
    </section>
  );
}
