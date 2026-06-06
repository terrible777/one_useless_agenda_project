"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearRequirementText,
  loadRequirementText,
  type RequirementKind,
  saveRequirementText,
} from "@/lib/requirementStorage";
import {
  clearCloudRequirement,
  fetchCloudRequirement,
  RequirementSyncError,
  saveCloudRequirement,
} from "@/lib/requirementSyncClient";
import styles from "./RequirementOrganizerModal.module.css";

type RequirementOrganizerModalProps = {
  kind: RequirementKind;
  onClose: () => void;
};

type RequirementConfig = {
  analyzeButton: string;
  apiPath: string;
  emptyError: string;
  placeholder: string;
  title: string;
};

type RequirementApiResponse = {
  error?: unknown;
  message?: unknown;
  result?: unknown;
};

const REQUIREMENT_CONFIGS: Record<RequirementKind, RequirementConfig> = {
  course: {
    analyzeButton: "AI整理排课要求",
    apiPath: "/api/course-requirements",
    emptyError: "请先输入排课要求内容",
    placeholder: "粘贴老师关于排课、上课时间、教室、课程安排的要求",
    title: "排课要求整理",
  },
  exam: {
    analyzeButton: "AI整理排考要求",
    apiPath: "/api/exam-requirements",
    emptyError: "请先输入排考要求内容",
    placeholder: "粘贴老师关于排考、监考、考试时间安排的要求",
    title: "排考要求整理",
  },
};

function appendResult(currentText: string, nextText: string) {
  const current = currentText.trim();
  const next = nextText.trim();

  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  return `${current}\n\n${next}`;
}

const USER_ADDRESS_NAMES = new Set(["秦", "秦瑞博", "小秦", "瑞博"]);

function normalizeRequirementLine(line: string) {
  let nextLine = line
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*]\s*/, "")
    .replace(/^\d+[.、]\s*/, "");

  if (!nextLine || /^【.*要求汇总】$/.test(nextLine)) {
    return "";
  }

  nextLine = nextLine.replace(/\s*([：:])\s*/, "：");

  const separatorIndex = nextLine.indexOf("：");

  if (separatorIndex === -1) {
    return nextLine;
  }

  const rawName = nextLine.slice(0, separatorIndex).trim();
  const requirement = nextLine.slice(separatorIndex + 1).trim();
  const normalizedName = rawName === "未注明老师" ? rawName : rawName.replace(/老师$/, "");
  const name = USER_ADDRESS_NAMES.has(normalizedName) ? "未注明老师" : normalizedName;

  return requirement ? `${name}：${requirement}` : name;
}

function normalizeRequirementResult(text: string) {
  return text
    .split(/\r?\n/)
    .map(normalizeRequirementLine)
    .filter(Boolean)
    .join("\n");
}

function getApiErrorMessage(data: RequirementApiResponse) {
  if (typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }

  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }

  return "AI 整理失败，请稍后重试";
}

async function readRequirementResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    return text ? { error: text } : {};
  }

  return (await response.json()) as RequirementApiResponse;
}

async function requestRequirementOrganization(config: RequirementConfig, text: string) {
  const response = await fetch(config.apiPath, {
    body: JSON.stringify({ text }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const data = await readRequirementResponse(response);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data));
  }

  if (typeof data.result !== "string" || !data.result.trim()) {
    throw new Error("AI 未返回有效整理结果");
  }

  return data.result.trim();
}

export function RequirementOrganizerModal({ kind, onClose }: RequirementOrganizerModalProps) {
  const config = REQUIREMENT_CONFIGS[kind];
  const [sourceText, setSourceText] = useState("");
  const [resultText, setResultText] = useState(() =>
    normalizeRequirementResult(loadRequirementText(kind)),
  );
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const onCloseRef = useRef(onClose);
  const kindRef = useRef(kind);
  const resultTextRef = useRef(resultText);
  const resultRevisionRef = useRef(0);
  const closeRequestRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    kindRef.current = kind;
  }, [kind]);

  useEffect(() => {
    resultTextRef.current = resultText;
  }, [resultText]);

  useEffect(() => {
    let isMounted = true;
    const previousOverflow = document.body.style.overflow;
    const revisionBeforeFetch = resultRevisionRef.current;

    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        void closeRequestRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    async function syncCloudRequirement() {
      setIsSyncing(true);

      try {
        const cloudNote = await fetchCloudRequirement(kind);

        if (!isMounted || revisionBeforeFetch !== resultRevisionRef.current) {
          return;
        }

        if (cloudNote.updatedAt !== null) {
          const normalizedText = normalizeRequirementResult(cloudNote.content);

          resultTextRef.current = normalizedText;
          setResultText(normalizedText);
          saveRequirementText(kind, normalizedText);
          setError("");
        }
      } catch (syncError) {
        console.error(`${config.title}云端读取失败。`, syncError);

        if (isMounted) {
          setError(getRequirementSyncErrorMessage(syncError));
        }
      } finally {
        if (isMounted) {
          setIsSyncing(false);
        }
      }
    }

    void syncCloudRequirement();

    return () => {
      isMounted = false;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [config.title, kind]);

  function updateResultText(text: string) {
    resultRevisionRef.current += 1;
    resultTextRef.current = text;
    setResultText(text);
  }

  function getRequirementSyncErrorMessage(syncError: unknown) {
    if (syncError instanceof RequirementSyncError) {
      return syncError.message;
    }

    if (syncError instanceof Error) {
      return `云端同步失败，已保存在本地：${syncError.message}`;
    }

    return "云端同步失败，已保存在本地";
  }

  async function saveRequirementToLocalAndCloud(text: string, clearSourceAfterSave: boolean) {
    const normalizedText = normalizeRequirementResult(text);

    updateResultText(normalizedText);
    saveRequirementText(kind, normalizedText);

    if (clearSourceAfterSave) {
      setSourceText("");
    }

    setStatusMessage("已保存到本地");
    setError("");
    setIsSyncing(true);

    try {
      await saveCloudRequirement(kind, normalizedText);
      setStatusMessage("已保存并同步");
    } catch (syncError) {
      console.error(`${config.title}云端保存失败。`, syncError);
      setError(getRequirementSyncErrorMessage(syncError));
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleCloseRequest() {
    if (window.confirm("是否保存当前整理结果？")) {
      await saveRequirementToLocalAndCloud(resultTextRef.current, false);
    }

    onCloseRef.current();
  }

  closeRequestRef.current = handleCloseRequest;

  async function handleAnalyze() {
    const trimmedSource = sourceText.trim();

    if (!trimmedSource) {
      setError(config.emptyError);
      return;
    }

    setError("");
    setStatusMessage("");
    setIsLoading(true);

    try {
      const organizedText = normalizeRequirementResult(
        await requestRequirementOrganization(config, trimmedSource),
      );
      updateResultText(appendResult(resultTextRef.current, organizedText));
      setStatusMessage("已整理，可继续编辑后保存");
    } catch (analyzeError) {
      console.error(`${config.title}失败。`, analyzeError);
      setError(analyzeError instanceof Error ? analyzeError.message : "AI 整理失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopy() {
    const textToCopy = normalizeRequirementResult(resultText);

    if (!textToCopy) {
      setError("暂无可复制内容");
      return;
    }

    setError("");
    setStatusMessage("");

    try {
      await navigator.clipboard.writeText(textToCopy);
      updateResultText(textToCopy);
      setStatusMessage("已复制");
    } catch (copyError) {
      console.error("复制要求整理结果失败。", copyError);
      setError("复制失败，请手动选择文本复制");
    }
  }

  function handleSave() {
    void saveRequirementToLocalAndCloud(resultText, true);
  }

  async function handleClear() {
    if (!window.confirm(`确定清空${config.title}内容吗？`)) {
      return;
    }

    updateResultText("");
    setSourceText("");
    clearRequirementText(kind);
    setStatusMessage("已清空本地");
    setError("");
    setIsSyncing(true);

    try {
      await clearCloudRequirement(kind);
      setStatusMessage("已清空并同步");
    } catch (syncError) {
      console.error(`${config.title}云端清空失败。`, syncError);
      setError(getRequirementSyncErrorMessage(syncError));
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation">
      <section
        aria-labelledby="requirement-organizer-title"
        aria-modal="true"
        className={styles.dialog}
        role="dialog"
      >
        <div className={styles.headingRow}>
          <div>
            <p className={styles.label}>本地保存</p>
            <h2 id="requirement-organizer-title">{config.title}</h2>
          </div>
          <button className={styles.closeButton} onClick={() => void handleCloseRequest()} type="button">
            关闭
          </button>
        </div>

        <div className={styles.content}>
          <label className={styles.field}>
            <span>原始内容</span>
            <textarea
              className={styles.sourceTextarea}
              disabled={isLoading}
              onChange={(event) => {
                setSourceText(event.target.value);
                if (error) {
                  setError("");
                }
              }}
              placeholder={config.placeholder}
              rows={7}
              value={sourceText}
            />
          </label>

          <button
            className={styles.analyzeButton}
            disabled={isLoading}
            onClick={handleAnalyze}
            type="button"
          >
            {isLoading ? "整理中..." : config.analyzeButton}
          </button>

          <label className={styles.field}>
            <span>整理结果</span>
            <textarea
              className={styles.resultTextarea}
              onChange={(event) => {
                updateResultText(event.target.value);
                if (statusMessage) {
                  setStatusMessage("");
                }
              }}
              placeholder="AI 整理结果会显示在这里，也可以直接编辑。"
              rows={9}
              value={resultText}
            />
          </label>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          {statusMessage ? <p className={styles.status}>{statusMessage}</p> : null}

          <div className={styles.actions}>
            <button className={styles.saveButton} onClick={handleSave} type="button">
              {isSyncing ? "同步中..." : `保存${kind === "exam" ? "排考" : "排课"}要求`}
            </button>
            <button className={styles.secondaryButton} onClick={() => void handleCopy()} type="button">
              复制结果
            </button>
            <button className={styles.clearButton} onClick={() => void handleClear()} type="button">
              清空
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
