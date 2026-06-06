export type NotificationPermissionStatus = NotificationPermission | "unsupported";

type SendAppNotificationOptions = {
  body: string;
  tag: string;
};

const NOTIFICATION_TITLE = "AI 待办助手";

export function getNotificationStatus(): NotificationPermissionStatus {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

export async function sendAppNotification({ body, tag }: SendAppNotificationOptions) {
  if (getNotificationStatus() !== "granted") {
    throw new Error("Notification permission is not granted.");
  }

  const options: NotificationOptions = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag,
  };

  if ("serviceWorker" in navigator) {
    try {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("Service worker is not ready.")), 1500);
        }),
      ]);

      if ("showNotification" in registration) {
        await registration.showNotification(NOTIFICATION_TITLE, options);
        return;
      }
    } catch (error) {
      console.warn("Service worker 通知发送失败，尝试使用 Notification fallback。", error);
    }
  }

  const notification = new Notification(NOTIFICATION_TITLE, options);
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
