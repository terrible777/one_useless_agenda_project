import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { TaskBoard } from "@/components/TaskBoard";

export default function Home() {
  return (
    <>
      <ServiceWorkerRegister />
      <AppShell>
        <TaskBoard />
      </AppShell>
    </>
  );
}
