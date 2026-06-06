"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
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
import type { Task, TaskStatus } from "@/types/task";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/types/task";
import { TaskEditForm } from "./TaskEditForm";
import styles from "./TodoList.module.css";

type TodoListProps = {
  tasks: Task[];
  onChangeTaskStatus: (taskId: string, status: TaskStatus) => void;
  onDeleteTask: (taskId: string) => void;
  onReorderTasks: (tasks: Task[]) => void;
  onUpdateTask: (task: Task) => void;
};

type SortableTodoItemProps = {
  isEditing: boolean;
  isExpanded: boolean;
  onCancelEdit: () => void;
  onChangeTaskStatus: (taskId: string, status: TaskStatus) => void;
  onDeleteTask: (taskId: string) => void;
  onEdit: () => void;
  onSaveEdit: (task: Task) => void;
  onToggleDetails: () => void;
  task: Task;
};

function formatDeadline(task: Task) {
  if (!task.deadlineDate && !task.deadlineTime) {
    return "未设置截止时间";
  }

  return [task.deadlineDate, task.deadlineTime].filter(Boolean).join(" ");
}

function summarizeSourceText(sourceText: string) {
  const compactText = sourceText.replace(/\s+/g, " ").trim();

  return compactText.length > 60 ? `${compactText.slice(0, 60)}...` : compactText;
}

function getStatusClassName(status: TaskStatus) {
  if (status === "not_started") {
    return `${styles.statusSelect} ${styles.statusNotStarted}`;
  }

  if (status === "in_progress") {
    return `${styles.statusSelect} ${styles.statusInProgress}`;
  }

  return `${styles.statusSelect} ${styles.statusCompleted}`;
}

function SortableTodoItem({
  isEditing,
  isExpanded,
  onCancelEdit,
  onChangeTaskStatus,
  onDeleteTask,
  onEdit,
  onSaveEdit,
  onToggleDetails,
  task,
}: SortableTodoItemProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    disabled: isEditing,
    id: task.id,
  });

  const style: CSSProperties = {
    opacity: isDragging ? 0.86 : undefined,
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <article
      className={`${styles.item} ${isDragging ? styles.itemDragging : ""}`}
      ref={setNodeRef}
      style={style}
    >
      {isEditing ? (
        <TaskEditForm onCancel={onCancelEdit} onSave={onSaveEdit} task={task} />
      ) : (
        <>
          <div className={styles.summaryRow}>
            <button
              {...attributes}
              {...listeners}
              aria-label={`拖动 ${task.title} 排序`}
              className={styles.dragHandle}
              type="button"
            >
              拖动
            </button>
            <h3>{task.title}</h3>
            <select
              aria-label={`${task.title} 状态`}
              className={getStatusClassName(task.status)}
              onChange={(event) => onChangeTaskStatus(task.id, event.target.value as TaskStatus)}
              value={task.status}
            >
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {TASK_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.metaRow}>
            <p>{formatDeadline(task)}</p>
            <div className={styles.actions}>
              <button
                aria-expanded={isExpanded}
                className={styles.detailButton}
                onClick={onToggleDetails}
                type="button"
              >
                {isExpanded ? "收起" : "详情"}
              </button>
              <button className={styles.editButton} onClick={onEdit} type="button">
                编辑
              </button>
              <button
                className={styles.deleteButton}
                onClick={() => onDeleteTask(task.id)}
                type="button"
              >
                删除
              </button>
            </div>
          </div>

          {isExpanded ? (
            <dl className={styles.details}>
              <div>
                <dt>备注</dt>
                <dd>{task.note || "无"}</dd>
              </div>
              <div>
                <dt>原文</dt>
                <dd>{summarizeSourceText(task.sourceText) || "无"}</dd>
              </div>
            </dl>
          ) : null}
        </>
      )}
    </article>
  );
}

export function TodoList({
  tasks,
  onChangeTaskStatus,
  onDeleteTask,
  onReorderTasks,
  onUpdateTask,
}: TodoListProps) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleSaveEdit(task: Task) {
    onUpdateTask(task);
    setEditingTaskId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = tasks.findIndex((task) => task.id === String(active.id));
    const newIndex = tasks.findIndex((task) => task.id === String(over.id));

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    onReorderTasks(arrayMove(tasks, oldIndex, newIndex));
  }

  function toggleDetails(taskId: string) {
    setExpandedTaskIds((currentIds) =>
      currentIds.includes(taskId)
        ? currentIds.filter((currentId) => currentId !== taskId)
        : [...currentIds, taskId],
    );
  }

  return (
    <section className={styles.card} aria-labelledby="todo-list-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.label}>已保存任务</p>
          <h2 id="todo-list-title">待办列表</h2>
        </div>
        <span className={styles.count}>{tasks.length} 项</span>
      </div>

      {tasks.length === 0 ? (
        <p className={styles.empty}>
          暂无任务。可以先粘贴内容进行 AI 分析，也可以手动新建一张待确认任务卡片。
        </p>
      ) : (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
          <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
            <div className={styles.list}>
              {tasks.map((task) => (
                <SortableTodoItem
                  isEditing={editingTaskId === task.id}
                  isExpanded={expandedTaskIds.includes(task.id)}
                  key={task.id}
                  onCancelEdit={() => setEditingTaskId(null)}
                  onChangeTaskStatus={onChangeTaskStatus}
                  onDeleteTask={onDeleteTask}
                  onEdit={() => setEditingTaskId(task.id)}
                  onSaveEdit={handleSaveEdit}
                  onToggleDetails={() => toggleDetails(task.id)}
                  task={task}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
