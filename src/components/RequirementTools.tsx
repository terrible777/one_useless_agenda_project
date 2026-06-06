import type { RequirementKind } from "@/lib/requirementStorage";
import styles from "./RequirementTools.module.css";

type RequirementToolsProps = {
  onOpen: (kind: RequirementKind) => void;
};

export function RequirementTools({ onOpen }: RequirementToolsProps) {
  return (
    <section className={styles.card} aria-labelledby="requirement-tools-title">
      <div>
        <p className={styles.label}>教务材料整理</p>
        <h2 id="requirement-tools-title">要求整理</h2>
      </div>
      <div className={styles.actions}>
        <button className={styles.examButton} onClick={() => onOpen("exam")} type="button">
          排考要求
        </button>
        <button className={styles.courseButton} onClick={() => onOpen("course")} type="button">
          排课要求
        </button>
      </div>
    </section>
  );
}
