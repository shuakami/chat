// 通知相关事件处理
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const roomId = event.notification.data?.roomId;
  const roomUrl = roomId ? `/room/${roomId}` : '/';

  if (event.action === 'open' || event.action === '') {
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      }).then((windowClients) => {
        for (let client of windowClients) {
          const clientPath = client.url.startsWith(self.registration.scope) 
            ? '/' + client.url.substring(self.registration.scope.length)
            : client.url;
          if (clientPath === roomUrl) {
            if ('focus' in client) {
              return client.focus();
            }
          }
        }
        if (roomUrl !== '/') {
            for (let client of windowClients) {
                if (client.url.includes('/room/')) {
                    if ('focus' in client) {
                        return client.focus();
                    }
                }
            }
        }
        if (clients.openWindow) {
          return clients.openWindow(roomUrl);
        }
      })
    );
  } else {
    console.log(`Unhandled notification action: '${event.action}' for room: ${roomId}`);
  }
});

self.addEventListener('notificationclose', (event) => {
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

// 监听 push 事件 (核心推送逻辑)
self.addEventListener('push', event => {
  let payload;
  try {
    payload = event.data ? event.data.json() : null;
  } catch (e) {
    console.error('无法解析推送数据为JSON:', e);
    payload = null;
  }

  // 如果无法解析 payload 或 payload 为空，则显示默认通知
  if (!payload) {
    payload = {
      title: '收到新消息',
      body: '您有一条新的聊天消息。',
      icon: '/icon.png', // 请确保您有这个默认图标，或替换为您的图标路径
      data: {}
    };
  }

  const title = payload.title || '新通知'; // 提供默认标题
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon.png', // 再次确保默认图标路径正确
    badge: payload.badge || '/badge.png', // 可选：移动设备状态栏小图标, 请提供实际路径或移除
    data: payload.data || {}, // 将 data 附加到通知上
    actions: payload.actions || [] // Pass actions from payload, or empty array if none
  };

  // event.waitUntil 会保持 Service Worker 运行，直到 showNotification 完成
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
}); 