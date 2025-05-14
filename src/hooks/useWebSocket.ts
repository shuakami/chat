import { useEffect, useRef, useState, useCallback } from 'react';
import { ReceiveMessage, SendMessage } from '@/types/chat';

// 全局 WebSocket 实例
let globalWs: WebSocket | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;

interface UseWebSocketProps {
  roomId: string;
  userId: string;
  onMessagesReceived: (newMessages: ReceiveMessage[], isHistory: boolean) => void;
}

export const useWebSocket = ({ roomId, userId, onMessagesReceived }: UseWebSocketProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!userId) {
      setIsConnected(false);
      return;
    }

    // 清除可能存在的重连定时器
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    // 如果已经有全局连接，先关闭
    if (globalWs) {
      globalWs.close();
      globalWs = null;
    }

    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}?roomId=${roomId}&userId=${userId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      if (process.env.NODE_ENV !== 'development') {
        console.log('WebSocket connected');
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'history' && Array.isArray(data.messages)) {
        onMessagesReceived(data.messages, true);
      } else {
        onMessagesReceived([data], false);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (process.env.NODE_ENV !== 'development') {
        console.log('WebSocket disconnected');
      }
      
      // 清理全局实例
      if (globalWs === ws) {
        globalWs = null;
      }

      // 只有在userId存在且当前ws是最新的全局实例时才重连
      if (userId && !globalWs) {
        reconnectTimeout = setTimeout(connect, 3000);
      }
    };

    ws.onerror = (error) => {
      if (process.env.NODE_ENV !== 'development') {
        console.error('WebSocket error:', error);
      }
      ws.close();
    };

    // 更新全局实例和本地引用
    globalWs = ws;
    wsRef.current = ws;
  }, [roomId, userId, onMessagesReceived]);

  const sendMessage = useCallback((message: SendMessage) => {
    if (globalWs?.readyState === WebSocket.OPEN) {
      globalWs.send(JSON.stringify(message));
    } else {
      if (process.env.NODE_ENV !== 'development') {
        console.error('WebSocket is not connected');
      }
    }
  }, []);

  useEffect(() => {
    if (userId) {
      // 如果没有全局连接，则创建新连接
      if (!globalWs || globalWs.readyState === WebSocket.CLOSED) {
        connect();
      } else {
        // 如果已有全局连接，直接使用
        wsRef.current = globalWs;
        setIsConnected(globalWs.readyState === WebSocket.OPEN);
      }
    } else {
      // 如果没有userId，确保关闭连接
      if (globalWs) {
        globalWs.close();
        globalWs = null;
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      setIsConnected(false);
    }

    return () => {
      // 组件卸载时，只清理重连定时器，保留全局连接
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    };
  }, [connect, userId]);

  return {
    isConnected,
    sendMessage,
  };
}; 