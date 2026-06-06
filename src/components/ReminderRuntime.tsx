"use client";

import { useEffect } from "react";
import { REMINDER_CHECK_INTERVAL_MS, runReminderCheck } from "@/lib/reminderScheduler";

export function ReminderRuntime() {
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void runReminderCheck();
    }, REMINDER_CHECK_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  return null;
}
