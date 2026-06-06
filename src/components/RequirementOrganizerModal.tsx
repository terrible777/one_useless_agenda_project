"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadRequirementText,
  type RequirementKind,
  saveRequirementText,
} from "@/lib/requirementStorage";
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

function createBlankEntry(prefix: string, index: number): RequirementEntry {
  return {
    id: createEntryId(prefix, index),
    name: "",
    requirement: "",
  };
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
      const requirement = entry.requirement.trim();

      if (!requirement) {
        return "";
      }

      return `${normalizeTeacherName(entry.name)}：${requirement}`;
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

  const toneIndex = seed % 15;
  const toneClassNames = [
    styles.entryTone0,
    styles.entryTone1,
    styles.entryTone2,
    styles.entryTone3,
    styles.entryTone4,
    styles.entryTone5,
    styles.entryTone6,
    styles.entryTone7,
    styles.entryTone8,
    styles.entryTone9,
    styles.entryTone10,
    styles.entryTone11,
    styles.entryTone12,
    styles.entryTone13,
    styles.entryTone14,
  ];

  return toneClassNames[toneIndex];
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

function getCloudSyncErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
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
  const [savedEntries, setSavedEntries] = useState<RequirementEntry[]>(() =>
    parseRequirementEntries(loadRequirementText(kind), `saved-${kind}`),
  );
  const [draftEntries, setDraftEntries] = useState<RequirementEntry[]>(() => [
    createBlankEntry(`draft-input-${kind}`, 0),
  ]);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [editingSavedEntryId, setEditingSavedEntryId] = useState<string | null>(null);
  const [savedEditDraft, setSavedEditDraft] = useState<RequirementEntry | null>(null);
  const onCloseRef = useRef(onClose);
  const savedEntriesRef = useRef(savedEntries);
  const draftEntriesRef = useRef(draftEntries);
  const savedEditDraftRef = useRef(savedEditDraft);
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

  async function syncSavedRequirementTextToCloud(text: string) {
    try {
      await pushRequirementTextToCloud(kind, text);
      setRequirementCloudInitializedInStorage(kind, true);
      recordCloudSyncSuccess();
    } catch (syncError) {
      const message = `云端同步失败，已保存在本地：${getCloudSyncErrorMessage(syncError)}`;

      console.error(`${config.title}云端同步失败。`, syncError);
      recordCloudSyncFailure(message);
      setError(message);
    }
  }

  function replaceSavedEntries(
    entries: RequirementEntry[],
    message = "已保存",
    syncCloud = true,
  ) {
    const normalizedEntries = parseRequirementEntries(entriesToText(entries), `saved-${kind}`);
    const normalizedText = entriesToText(normalizedEntries);

    savedEntriesRef.current = normalizedEntries;
    setSavedEntries(normalizedEntries);
    saveRequirementText(kind, normalizedText);
    setStatusMessage(message);
    setError("");

    if (syncCloud) {
      void syncSavedRequirementTextToCloud(normalizedText);
    }
  }

  function getSavableDraftEntries(entries = draftEntriesRef.current) {
    return parseRequirementEntries(entriesToText(entries), `draft-save-${kind}`);
  }

  function replaceDraftEntries(entries: RequirementEntry[], includeBlankEntry = true) {
    const normalizedEntries = parseRequirementEntries(entriesToText(entries), `draft-${kind}`);
    const nextEntries = includeBlankEntry
      ? [
          ...normalizedEntries,
          createBlankEntry(`draft-input-${kind}`, normalizedEntries.length),
        ]
      : normalizedEntries;

    draftEntriesRef.current = nextEntries;
    setDraftEntries(nextEntries);
  }

  useEffect(() => {
    async function pullSavedRequirementFromCloud() {
      const localText = entriesToText(savedEntriesRef.current);

      try {
        const cloudRequirement = await fetchCloudRequirement(kind);
        const hasInitialized = isRequirementCloudInitializedInStorage(kind);

        if (
          cloudRequirement.content.trim() ||
          hasInitialized ||
          !localText.trim()
        ) {
          replaceSavedEntries(
            parseRequirementEntries(cloudRequirement.content, `saved-${kind}`),
            cloudRequirement.content.trim() ? "已从云端同步" : "",
            false,
          );
        } else {
          await pushRequirementTextToCloud(kind, localText);
        }

        setRequirementCloudInitializedInStorage(kind, true);
        recordCloudSyncSuccess();
      } catch (syncError) {
        const message = `云端同步失败，已保存在本地：${getCloudSyncErrorMessage(syncError)}`;

        console.error(`${config.title}云端读取失败。`, syncError);
        recordCloudSyncFailure(message);
        setError(message);
      }
    }

    void pullSavedRequirementFromCloud();
    // 弹窗打开时拉取一次云端历史；保存、编辑、删除会分别主动同步。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

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

  function saveSavedEntryEdit() {
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
    replaceSavedEntries(nextEntries, "已修改");
    return true;
  }

  function handleDeleteSavedEntry(entry: RequirementEntry) {
    if (!window.confirm(`确定删除“${entry.name}：${entry.requirement}”吗？`)) {
      return;
    }

    replaceSavedEntries(
      savedEntriesRef.current.filter((currentEntry) => currentEntry.id !== entry.id),
      "已删除",
    );
  }

  function handleAddManualRequirement() {
    const lastEntry = draftEntriesRef.current.at(-1);

    if (!lastEntry?.requirement.trim()) {
      setError("请先填写要求内容");
      return;
    }

    replaceDraftEntries(draftEntriesRef.current);
    setStatusMessage("已新增要求，可继续填写下一条");
    setError("");
  }

  function saveDraftToLocal() {
    const draftText = entriesToText(getSavableDraftEntries());

    if (!draftText.trim()) {
      setError("暂无本次整理结果可保存");
      return false;
    }

    const nextHistoryText = appendResult(entriesToText(savedEntriesRef.current), draftText);
    const nextHistoryEntries = parseRequirementEntries(nextHistoryText, `saved-${kind}`);

    replaceSavedEntries(nextHistoryEntries, "已保存");
    replaceDraftEntries([]);
    setSourceText("");
    return true;
  }

  async function handleCloseRequest() {
    const draftText = entriesToText(getSavableDraftEntries());

    if (getHasUnsavedSavedEdit()) {
      if (window.confirm("当前要求修改尚未保存，是否保存后关闭？")) {
        const isSaved = saveSavedEntryEdit();

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
      saveDraftToLocal();
    }

    onCloseRef.current();
  }

  useEffect(() => {
    closeRequestRef.current = handleCloseRequest;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        void closeRequestRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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

  const draftEntryCount = draftEntries.filter((entry) => entry.requirement.trim()).length;

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
            <p className={styles.label}>本地 + 云端</p>
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
                            onClick={saveSavedEntryEdit}
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
                        <div className={styles.entryButtons}>
                          <button
                            className={styles.entryEditButton}
                            onClick={() => startEditSavedEntry(entry)}
                            type="button"
                          >
                            编辑
                          </button>
                          <button
                            className={styles.entryDeleteButton}
                            onClick={() => handleDeleteSavedEntry(entry)}
                            type="button"
                          >
                            删除
                          </button>
                        </div>
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
              <span>{draftEntryCount > 0 ? `${draftEntryCount} 条待保存` : "未整理"}</span>
            </div>

            <div className={styles.entryList}>
              {draftEntries.map((entry) => (
                <article
                  className={`${styles.entryEditor} ${styles.draftEditor}`}
                  key={entry.id}
                >
                  <label>
                    <span>老师姓名</span>
                    <input
                      className={styles.nameInput}
                      onChange={(event) =>
                        updateDraftEntry(entry.id, { name: event.target.value })
                      }
                      placeholder="教师姓名"
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
                      placeholder="AI 整理结果会显示在这里，也可以直接填写"
                      rows={2}
                      value={entry.requirement}
                    />
                  </label>
                </article>
              ))}
            </div>

            <button
              className={`${styles.secondaryButton} ${styles.draftAddButton}`}
              onClick={handleAddManualRequirement}
              type="button"
            >
              新增要求
            </button>
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
              rows={5}
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
            <button className={styles.saveButton} onClick={saveDraftToLocal} type="button">
              {config.saveButton}
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
