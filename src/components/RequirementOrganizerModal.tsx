"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  hidden: boolean;
  id: string;
  name: string;
  requirement: string;
};

type SortableRequirementEntryProps = {
  entry: RequirementEntry;
  isEditing: boolean;
  isSortingDisabled: boolean;
  onCancelEdit: () => void;
  onDelete: (entry: RequirementEntry) => void;
  onEdit: (entry: RequirementEntry) => void;
  onSaveEdit: () => boolean;
  onToggleHidden: (entry: RequirementEntry) => void;
  onUpdateEditDraft: (changes: Partial<RequirementEntry>) => void;
  savedEditDraft: RequirementEntry | null;
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

const HIDDEN_ENTRY_MARKER = "[[agenda-hidden]]";
const USER_ADDRESS_NAMES = new Set(["秦", "秦瑞博", "小秦", "瑞博", "秦老师"]);

function createEntryId(prefix: string, index: number) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${index}`;
}

function createBlankEntry(prefix: string, index: number): RequirementEntry {
  return {
    hidden: false,
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

function readHiddenEntryMarker(line: string) {
  const trimmedLine = line.trim();

  if (!trimmedLine.startsWith(HIDDEN_ENTRY_MARKER)) {
    return {
      hidden: false,
      line: trimmedLine,
    };
  }

  return {
    hidden: true,
    line: trimmedLine.slice(HIDDEN_ENTRY_MARKER.length).trim(),
  };
}

function normalizeRequirementLine(line: string) {
  const markedLine = readHiddenEntryMarker(line);
  let nextLine = markedLine.line
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
  return text
    .split(/\r?\n/)
    .map((rawLine, index) => {
      const { hidden } = readHiddenEntryMarker(rawLine);
      const line = normalizeRequirementLine(rawLine);

      if (!line) {
        return null;
      }

      const separatorIndex = line.indexOf("：");

      if (separatorIndex === -1) {
        return {
          hidden,
          id: createEntryId(prefix, index),
          name: "未注明老师",
          requirement: line.trim(),
        };
      }

      return {
        hidden,
        id: createEntryId(prefix, index),
        name: normalizeTeacherName(line.slice(0, separatorIndex)),
        requirement: line.slice(separatorIndex + 1).trim(),
      };
    })
    .filter((entry): entry is RequirementEntry => Boolean(entry?.name || entry?.requirement));
}

function entriesToText(entries: RequirementEntry[]) {
  return entries
    .map((entry) => {
      const requirement = entry.requirement.trim();

      if (!requirement) {
        return "";
      }

      return `${entry.hidden ? HIDDEN_ENTRY_MARKER : ""}${normalizeTeacherName(entry.name)}：${requirement}`;
    })
    .filter(Boolean)
    .join("\n");
}

function entriesToDisplayText(entries: RequirementEntry[]) {
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

function mergeVisibleRequirementOrder(
  entries: RequirementEntry[],
  reorderedVisibleEntries: RequirementEntry[],
  showHiddenEntries: boolean,
) {
  if (showHiddenEntries) {
    return reorderedVisibleEntries;
  }

  const reorderedQueue = [...reorderedVisibleEntries];

  return entries.map((entry) => (entry.hidden ? entry : (reorderedQueue.shift() ?? entry)));
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

function SortableRequirementEntry({
  entry,
  isEditing,
  isSortingDisabled,
  onCancelEdit,
  onDelete,
  onEdit,
  onSaveEdit,
  onToggleHidden,
  onUpdateEditDraft,
  savedEditDraft,
}: SortableRequirementEntryProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    disabled: isSortingDisabled,
    id: entry.id,
  });
  const style: CSSProperties = {
    opacity: isDragging ? 0.86 : undefined,
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <article
      className={`${styles.entryCard} ${getEntryToneClassName(entry.name)} ${
        isDragging ? styles.entryDragging : ""
      } ${entry.hidden ? styles.entryHidden : ""}`}
      ref={setNodeRef}
      style={style}
    >
      {isEditing && savedEditDraft ? (
        <div className={styles.savedEditForm}>
          <input
            aria-label="老师姓名"
            className={styles.savedNameInput}
            onChange={(event) => onUpdateEditDraft({ name: event.target.value })}
            value={savedEditDraft.name}
          />
          <textarea
            aria-label="要求内容"
            className={styles.savedRequirementTextarea}
            onChange={(event) => onUpdateEditDraft({ requirement: event.target.value })}
            rows={2}
            value={savedEditDraft.requirement}
          />
          <div className={styles.savedEditActions}>
            <button className={styles.miniSaveButton} onClick={onSaveEdit} type="button">
              保存
            </button>
            <button className={styles.miniCancelButton} onClick={onCancelEdit} type="button">
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
              onClick={() => onEdit(entry)}
              type="button"
            >
              编辑
            </button>
            <button
              className={styles.entryHideButton}
              onClick={() => onToggleHidden(entry)}
              type="button"
            >
              {entry.hidden ? "展示" : "隐藏"}
            </button>
            <button
              {...attributes}
              {...listeners}
              aria-label={`拖动 ${entry.name || "未注明老师"} 的要求排序`}
              className={styles.entryDragButton}
              type="button"
            >
              拖动
            </button>
            <button
              className={styles.entryDeleteButton}
              onClick={() => onDelete(entry)}
              type="button"
            >
              删除
            </button>
          </div>
        </>
      )}
    </article>
  );
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
  const [showHiddenEntries, setShowHiddenEntries] = useState(false);
  const [savedEditDraft, setSavedEditDraft] = useState<RequirementEntry | null>(null);
  const onCloseRef = useRef(onClose);
  const savedEntriesRef = useRef(savedEntries);
  const draftEntriesRef = useRef(draftEntries);
  const savedEditDraftRef = useRef(savedEditDraft);
  const closeRequestRef = useRef<() => Promise<void>>(async () => undefined);
  const savedEntrySensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 120,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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

  function getSavableDraftEntries(entries: RequirementEntry[]) {
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

  function handleToggleSavedEntryHidden(entry: RequirementEntry) {
    replaceSavedEntries(
      savedEntriesRef.current.map((currentEntry) =>
        currentEntry.id === entry.id
          ? {
              ...currentEntry,
              hidden: !currentEntry.hidden,
            }
          : currentEntry,
      ),
      entry.hidden ? "已展示" : "已隐藏",
    );
  }

  function handleSavedEntryDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id || editingSavedEntryId) {
      return;
    }

    const oldIndex = visibleSavedEntries.findIndex((entry) => entry.id === String(active.id));
    const newIndex = visibleSavedEntries.findIndex((entry) => entry.id === String(over.id));

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    replaceSavedEntries(
      mergeVisibleRequirementOrder(
        savedEntries,
        arrayMove(visibleSavedEntries, oldIndex, newIndex),
        showHiddenEntries,
      ),
      "已调整顺序",
    );
  }

  function handleAddManualRequirement() {
    const currentEntry = getSavableDraftEntries(draftEntriesRef.current.slice(0, 1))[0];

    if (!currentEntry) {
      setError("请先填写要求内容");
      return;
    }

    const remainingEntries = getSavableDraftEntries(draftEntriesRef.current.slice(1));

    replaceSavedEntries([...savedEntriesRef.current, currentEntry], "已新增要求");
    replaceDraftEntries(remainingEntries);
    setStatusMessage(remainingEntries.length > 0 ? "已新增要求，已载入下一条" : "已新增要求");
    setError("");
  }

  function saveDraftToLocal() {
    const currentEntry = getSavableDraftEntries(draftEntriesRef.current.slice(0, 1))[0];

    if (!currentEntry) {
      setError("暂无本次整理结果可保存");
      return false;
    }

    const remainingEntries = getSavableDraftEntries(draftEntriesRef.current.slice(1));

    replaceSavedEntries([...savedEntriesRef.current, currentEntry], "已保存");
    replaceDraftEntries(remainingEntries);
    setSourceText("");
    return true;
  }

  async function handleCloseRequest() {
    const draftText = entriesToText(getSavableDraftEntries(draftEntriesRef.current));

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
    const textToCopy = entriesToDisplayText(visibleSavedEntries);

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

  const draftEntryCount = getSavableDraftEntries(draftEntries).length;
  const visibleDraftEntry = draftEntries[0] ?? createBlankEntry(`draft-input-${kind}`, 0);
  const hiddenEntryCount = savedEntries.filter((entry) => entry.hidden).length;
  const visibleSavedEntries = showHiddenEntries
    ? savedEntries
    : savedEntries.filter((entry) => !entry.hidden);

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
              <div className={styles.listHeaderActions}>
                {hiddenEntryCount > 0 ? (
                  <button
                    className={styles.listToggleButton}
                    onClick={() => setShowHiddenEntries((currentValue) => !currentValue)}
                    type="button"
                  >
                    {showHiddenEntries ? "隐藏要求" : "显示要求"}
                  </button>
                ) : null}
                <span>
                  {visibleSavedEntries.length} 条
                  {hiddenEntryCount > 0 ? ` / 隐藏 ${hiddenEntryCount}` : ""}
                </span>
              </div>
            </div>

            {visibleSavedEntries.length > 0 ? (
              <DndContext
                collisionDetection={closestCenter}
                onDragEnd={handleSavedEntryDragEnd}
                sensors={savedEntrySensors}
              >
                <SortableContext
                  items={visibleSavedEntries.map((entry) => entry.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className={styles.entryList}>
                    {visibleSavedEntries.map((entry) => (
                      <SortableRequirementEntry
                        entry={entry}
                        isEditing={editingSavedEntryId === entry.id}
                        isSortingDisabled={editingSavedEntryId !== null}
                        key={entry.id}
                        onCancelEdit={cancelEditSavedEntry}
                        onDelete={handleDeleteSavedEntry}
                        onEdit={startEditSavedEntry}
                        onSaveEdit={saveSavedEntryEdit}
                        onToggleHidden={handleToggleSavedEntryHidden}
                        onUpdateEditDraft={updateSavedEditDraft}
                        savedEditDraft={savedEditDraft}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <p className={styles.emptyState}>
                {savedEntries.length > 0 ? "暂无显示要求，点击右上角显示要求查看隐藏内容。" : "暂无要求"}
              </p>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3>本次整理结果</h3>
              <span>{draftEntryCount > 0 ? `${draftEntryCount} 条待处理` : "未整理"}</span>
            </div>

            <div className={styles.entryList}>
              <article
                className={`${styles.entryEditor} ${styles.draftEditor}`}
                key={visibleDraftEntry.id}
              >
                <label>
                  <span>老师姓名</span>
                  <input
                    className={styles.nameInput}
                    onChange={(event) =>
                      updateDraftEntry(visibleDraftEntry.id, { name: event.target.value })
                    }
                    placeholder="教师姓名"
                    value={visibleDraftEntry.name}
                  />
                </label>
                <label>
                  <span>要求内容</span>
                  <textarea
                    className={styles.requirementTextarea}
                    onChange={(event) =>
                      updateDraftEntry(visibleDraftEntry.id, { requirement: event.target.value })
                    }
                    placeholder="AI 整理结果会显示在这里，也可以直接填写"
                    rows={2}
                    value={visibleDraftEntry.requirement}
                  />
                </label>
              </article>
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
