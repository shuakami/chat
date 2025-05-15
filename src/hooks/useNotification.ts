import { useState, useEffect, useCallback } from 'react';

export type NotificationPermissionType = NotificationPermission;

export interface NotificationOptionsExt extends NotificationOptions {
  actions?: { action: string; title: string }[];
  data?: Record<string, unknown>;
}

export function useNotification() {
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionType>('default');

  // 初始化权限状态
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // ServiceWorker 注册（可选）
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // 请求权限
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'denied';
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission;
    } catch {
      setNotificationPermission('denied');
      return 'denied';
    }
  }, []);

  // 发送通知
  const sendNotification = useCallback((title: string, body: string, options?: NotificationOptionsExt) => {
    if (!('Notification' in window)) return;
    if (notificationPermission !== 'granted') return;
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(title, {
            body,
            icon: '/favicon.ico',
            tag: options?.tag || 'chat-message',
            ...options,
          });
        });
      } else {
        const notification = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: options?.tag || 'chat-message',
          ...options,
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    } catch {}
  }, [notificationPermission]);

  return [notificationPermission, requestPermission, sendNotification] as const;
} 