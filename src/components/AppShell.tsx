import type { ReactNode } from "react";
import styles from "./AppShell.module.css";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <p className={styles.kicker}>PWA 任务入口</p>
        <h1>AI 待办助手</h1>
      </header>
      <section className={styles.content}>{children}</section>
    </main>
  );
}
