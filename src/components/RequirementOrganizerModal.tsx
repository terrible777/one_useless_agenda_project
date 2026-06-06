"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadRequirementText,
  type RequirementKind,
  saveRequirementText,
} from "@/lib/requirementStorage";
import {
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
  saveButton: string;
  title: string;
};

type RequirementApiResponse = {
  error?: unknown;
  message?: unknown;
  result?: unknown;
};

type RequirementEntry = {
  id: string;
  name: string;
  requirement: string;
};

const REQUIREMENT_CONFIGS: Record<RequirementKind, RequirementConfig> = {
  course: {
    analyzeButton: "AI整理排课要求",
    apiPath: "/api/course-requirements",
    emptyError: "请先输入排课要求内容",
    placeholder: "粘贴老师关于排课、上课时间、教室、课程安排的要求",
    saveButton: "保存排课要求",
    title: "排课要求整理",
  },
  exam: {
    analyzeButton: "AI整理排考要求",
    apiPath: "/api/exam-requirements",
    emptyError: "请先输入排考要求内容",
    placeholder: "粘贴老师关于排考、监考、考试时间安排的要求",
    saveButton: "保存排考要求",
    title: "排考要求整理",
  },
};

const USER_ADDRESS_NAMES = new Set(["秦", "秦瑞博", "小秦", "瑞博", "秦老师"]);

function createEntryId(prefix: string, index: number) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${index}`;
}

function normalizeTeacherName(name: string) {
  const normalizedName = name.trim().replace(/老师$/, "");

  if (!normalizedName || USER_ADDRESS_NAMES.has(normalizedName)) {
    return "未注明老师";
  }

  return normalizedName;
}

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
    return `未注明老师：${nextLine}`;
  }

  const rawName = nextLine.slice(0, separatorIndex).trim();
  const requirement = nextLine.slice(separatorIndex + 1).trim();
  const name = normalizeTeacherName(rawName);

  return requirement ? `${name}：${requirement}` : "";
}

function normalizeRequirementResult(text: string) {
  return text
    .split(/\r?\n/)
    .map(normalizeRequirementLine)
    .filter(Boolean)
    .join("\n");
}

function parseRequirementEntries(text: string, prefix: string): RequirementEntry[] {
  const normalizedText = normalizeRequirementResult(text);

  if (!normalizedText) {
    return [];
  }

  return normalizedText
    .split(/\r?\n/)
    .map((line, index) => {
      const separatorIndex = line.indexOf("：");

      if (separatorIndex === -1) {
        return {
          id: createEntryId(prefix, index),
          name: "未注明老师",
          requirement: line.trim(),
        };
      }

      return {
        id: createEntryId(prefix, index),
        name: normalizeTeacherName(line.slice(0, separatorIndex)),
        requirement: line.slice(separatorIndex + 1).trim(),
      };
    })
    .filter((entry) => entry.name || entry.requirement);
}

function entriesToText(entries: RequirementEntry[]) {
  return entries
    .map((entry) => {
      const name = normalizeTeacherName(entry.name);
      const requirement = entry.requirement.trim();

      if (!requirement) {
        return "";
      }

      return `${name}：${requirement}`;
    })
    .filter(Boolean)
    .join("\n");
}

function appendResult(currentText: string, nextText: string) {
  const current = normalizeRequirementResult(currentText);
  const next = normalizeRequirementResult(nextText);

  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  return `${current}\n${next}`;
}

function getEntryToneClassName(name: string) {
  const seed = Array.from(name || "未注明老师").reduce(
    (total, char) => total + char.charCodeAt(0),
    0,
  );

  switch (seed % 6) {
    case 0:
      return styles.entryTone0;
    case 1:
      return styles.entryTone1;
    case 2:
      return styles.entryTone2;
    case 3:
      return styles.entryTone3;
    case 4:
      return styles.entryTone4;
    default:
      return styles.entryTone5;
  }
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

function getRequirementSyncErrorMessage(syncError: unknown) {
  if (syncError instanceof RequirementSyncError) {
    return syncError.message;
  }

  if (syncError instanceof Error) {
    return `云端同步失败，已保存在本地：${syncError.message}`;
  }

  return "云端同步失败，已保存在本地";
}

export function RequirementOrganizerModal({ kind, onClose }: RequirementOrganizerModalProps) {
  const config = REQUIREMENT_CONFIGS[kind];
  const [sourceText, setSourceText] = useState("");
  const [savedEntries, setSavedEntries] = useState<RequirementEntry[]>(() =>
    parseRequirementEntries(loadRequirementText(kind), `saved-${kind}`),
  );
  const [draftEntries, setDraftEntries] = useState<RequirementEntry[]>([]);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingSavedEntryId, setEditingSavedEntryId] = useState<string | null>(null);
  const [savedEditDraft, setSavedEditDraft] = useState<RequirementEntry | null>(null);
  const onCloseRef = useRef(onClose);
  const savedEntriesRef = useRef(savedEntries);
  const draftEntriesRef = useRef(draftEntries);
  const savedEditDraftRef = useRef(savedEditDraft);
  const historyRevisionRef = useRef(0);
  const closeRequestRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    savedEntriesRef.current = savedEntries;
  }, [savedEntries]);

  useEffect(() => {
    draftEntriesRef.current = draftEntries;
  }, [draftEntries]);

  useEffect(() => {
    savedEditDraftRef.current = savedEditDraft;
  }, [savedEditDraft]);

  useEffect(() => {
    let isMounted = true;
    const previousOverflow = document.body.style.overflow;
    const revisionBeforeFetch = historyRevisionRef.current;

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
        const hasUnsavedDraft = Boolean(entriesToText(draftEntriesRef.current).trim());

        if (
          !isMounted ||
          hasUnsavedDraft ||
          revisionBeforeFetch !== historyRevisionRef.current ||
          cloudNote.updatedAt === null
        ) {
          return;
        }

        const cloudEntries = parseRequirementEntries(cloudNote.content, `cloud-${kind}`);

        historyRevisionRef.current += 1;
        savedEntriesRef.current = cloudEntries;
        setSavedEntries(cloudEntries);
        saveRequirementText(kind, entriesToText(cloudEntries));
        setError("");
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

  function replaceSavedEntries(entries: RequirementEntry[]) {
    const normalizedEntries = parseRequirementEntries(entriesToText(entries), `saved-${kind}`);

    historyRevisionRef.current += 1;
    savedEntriesRef.current = normalizedEntries;
    setSavedEntries(normalizedEntries);
    saveRequirementText(kind, entriesToText(normalizedEntries));
  }

  async function syncSavedEntriesToCloud(entries: RequirementEntry[], successMessage: string) {
    replaceSavedEntries(entries);
    setStatusMessage("已保存到本地");
    setError("");
    setIsSyncing(true);

    try {
      await saveCloudRequirement(kind, entriesToText(savedEntriesRef.current));
      setStatusMessage(successMessage);
    } catch (syncError) {
      console.error(`${config.title}云端保存失败。`, syncError);
      setError(getRequirementSyncErrorMessage(syncError));
    } finally {
      setIsSyncing(false);
    }
  }

  function replaceDraftEntries(entries: RequirementEntry[]) {
    const normalizedEntries = parseRequirementEntries(entriesToText(entries), `draft-${kind}`);

    draftEntriesRef.current = normalizedEntries;
    setDraftEntries(normalizedEntries);
  }

  function updateDraftEntry(entryId: string, nextEntry: Partial<RequirementEntry>) {
    setDraftEntries((currentEntries) => {
      const nextEntries = currentEntries.map((entry) =>
        entry.id === entryId ? { ...entry, ...nextEntry } : entry,
      );

      draftEntriesRef.current = nextEntries;
      return nextEntries;
    });

    if (statusMessage) {
      setStatusMessage("");
    }
  }

  function startEditSavedEntry(entry: RequirementEntry) {
    setEditingSavedEntryId(entry.id);
    setSavedEditDraft({ ...entry });
    setStatusMessage("");
    setError("");
  }

  function updateSavedEditDraft(changes: Partial<RequirementEntry>) {
    setSavedEditDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      return { ...currentDraft, ...changes };
    });

    if (statusMessage) {
      setStatusMessage("");
    }
  }

  function cancelEditSavedEntry() {
    setEditingSavedEntryId(null);
    setSavedEditDraft(null);
    setError("");
  }

  function getHasUnsavedSavedEdit() {
    if (!editingSavedEntryId || !savedEditDraftRef.current) {
      return false;
    }

    const originalEntry = savedEntriesRef.current.find((entry) => entry.id === editingSavedEntryId);

    if (!originalEntry) {
      return false;
    }

    return entriesToText([originalEntry]) !== entriesToText([savedEditDraftRef.current]);
  }

  async function saveSavedEntryEdit() {
    if (!editingSavedEntryId || !savedEditDraftRef.current) {
      return true;
    }

    const normalizedDraft = parseRequirementEntries(
      entriesToText([savedEditDraftRef.current]),
      `saved-edit-${kind}`,
    )[0];

    if (!normalizedDraft) {
      setError("要求内容不能为空");
      return false;
    }

    const nextEntries = savedEntriesRef.current.map((entry) =>
      entry.id === editingSavedEntryId
        ? {
            ...normalizedDraft,
            id: entry.id,
          }
        : entry,
    );

    setEditingSavedEntryId(null);
    setSavedEditDraft(null);
    await syncSavedEntriesToCloud(nextEntries, "已修改并同步");
    return true;
  }

  async function saveDraftToLocalAndCloud() {
    const draftText = entriesToText(draftEntriesRef.current);

    if (!draftText.trim()) {
      setError("暂无本次整理结果可保存");
      return;
    }

    const nextHistoryText = appendResult(entriesToText(savedEntriesRef.current), draftText);
    const nextHistoryEntries = parseRequirementEntries(nextHistoryText, `saved-${kind}`);

    await syncSavedEntriesToCloud(nextHistoryEntries, "已保存并同步");
    replaceDraftEntries([]);
    setSourceText("");
  }

  async function handleCloseRequest() {
    const draftText = entriesToText(draftEntriesRef.current);

    if (getHasUnsavedSavedEdit()) {
      if (window.confirm("当前要求修改尚未保存，是否保存后关闭？")) {
        const isSaved = await saveSavedEntryEdit();

        if (!isSaved) {
          return;
        }
      }
    }

    if (!draftText.trim()) {
      onCloseRef.current();
      return;
    }

    if (window.confirm("本次整理结果尚未保存，是否保存后关闭？")) {
      await saveDraftToLocalAndCloud();
    }

    onCloseRef.current();
  }

  useEffect(() => {
    closeRequestRef.current = handleCloseRequest;
  });

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
      const nextDraftEntries = parseRequirementEntries(organizedText, `draft-${kind}`);

      if (nextDraftEntries.length === 0) {
        throw new Error("AI 未返回有效整理结果");
      }

      replaceDraftEntries(nextDraftEntries);
      setStatusMessage("已整理，可编辑本次结果后保存");
    } catch (analyzeError) {
      console.error(`${config.title}失败。`, analyzeError);
      setError(analyzeError instanceof Error ? analyzeError.message : "AI 整理失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopy() {
    const textToCopy = entriesToText(savedEntries);

    if (!textToCopy) {
      setError("暂无可复制内容");
      return;
    }

    setError("");
    setStatusMessage("");

    try {
      await navigator.clipboard.writeText(textToCopy);
      setStatusMessage("已复制");
    } catch (copyError) {
      console.error("复制要求整理结果失败。", copyError);
      setError("复制失败，请手动选择文本复制");
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
            <p className={styles.label}>本地 + 云端保存</p>
            <h2 id="requirement-organizer-title">{config.title}</h2>
          </div>
          <button className={styles.closeButton} onClick={() => void handleCloseRequest()} type="button">
            关闭
          </button>
        </div>

        <div className={styles.content}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3>要求列表</h3>
              <span>{savedEntries.length} 条</span>
            </div>

            {savedEntries.length > 0 ? (
              <div className={styles.entryList}>
                {savedEntries.map((entry) => (
                  <article
                    className={`${styles.entryCard} ${getEntryToneClassName(entry.name)}`}
                    key={entry.id}
                  >
                    {editingSavedEntryId === entry.id && savedEditDraft ? (
                      <div className={styles.savedEditForm}>
                        <input
                          aria-label="老师姓名"
                          className={styles.savedNameInput}
                          onChange={(event) => updateSavedEditDraft({ name: event.target.value })}
                          value={savedEditDraft.name}
                        />
                        <textarea
                          aria-label="要求内容"
                          className={styles.savedRequirementTextarea}
                          onChange={(event) =>
                            updateSavedEditDraft({ requirement: event.target.value })
                          }
                          rows={2}
                          value={savedEditDraft.requirement}
                        />
                        <div className={styles.savedEditActions}>
                          <button
                            className={styles.miniSaveButton}
                            onClick={() => void saveSavedEntryEdit()}
                            type="button"
                          >
                            保存
                          </button>
                          <button
                            className={styles.miniCancelButton}
                            onClick={cancelEditSavedEntry}
                            type="button"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className={styles.entryLine}>
                          <strong>{entry.name}：</strong>
                          {entry.requirement}
                        </p>
                        <button
                          className={styles.entryEditButton}
                          onClick={() => startEditSavedEntry(entry)}
                          type="button"
                        >
                          编辑
                        </button>
                      </>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyState}>暂无要求</p>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3>本次整理结果</h3>
              <span>{draftEntries.length > 0 ? `${draftEntries.length} 条待保存` : "未整理"}</span>
            </div>

            {draftEntries.length > 0 ? (
              <div className={styles.entryList}>
                {draftEntries.map((entry) => (
                  <article
                    className={`${styles.entryEditor} ${getEntryToneClassName(entry.name)}`}
                    key={entry.id}
                  >
                    <label>
                      <span>老师姓名</span>
                      <input
                        className={styles.nameInput}
                        onChange={(event) =>
                          updateDraftEntry(entry.id, { name: event.target.value })
                        }
                        value={entry.name}
                      />
                    </label>
                    <label>
                      <span>要求内容</span>
                      <textarea
                        className={styles.requirementTextarea}
                        onChange={(event) =>
                          updateDraftEntry(entry.id, { requirement: event.target.value })
                        }
                        rows={3}
                        value={entry.requirement}
                      />
                    </label>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyState}>新粘贴内容整理后会显示在这里。</p>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3>原始内容</h3>
            </div>
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
              rows={6}
              value={sourceText}
            />

            <button
              className={styles.analyzeButton}
              disabled={isLoading}
              onClick={handleAnalyze}
              type="button"
            >
              {isLoading ? "整理中..." : config.analyzeButton}
            </button>
          </section>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          {statusMessage ? <p className={styles.status}>{statusMessage}</p> : null}

          <div className={styles.actions}>
            <button className={styles.saveButton} onClick={() => void saveDraftToLocalAndCloud()} type="button">
              {isSyncing ? "同步中..." : config.saveButton}
            </button>
            <button className={styles.secondaryButton} onClick={() => void handleCopy()} type="button">
              复制结果
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
