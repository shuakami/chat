// 通知相关事件处理
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open') {
    // 打开或聚焦到聊天窗口
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((windowClients) => {
      // 检查是否已经有打开的窗口
      for (let client of windowClients) {
        if (client.url.includes('/room/')) {
          return client.focus();
        }
      }
      // 如果没有打开的窗口，打开一个新窗口
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    });
  }
});

self.addEventListener('notificationclose', (event) => {
  // 可以在这里处理通知被关闭的事件
  console.log('通知被关闭:', event.notification.tag);
});

// 安装事件
self.addEventListener('install', () => {
  self.skipWaiting();
});

// 激活事件
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
}); 