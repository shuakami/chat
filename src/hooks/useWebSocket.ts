import { useEffect, useRef, useState, useCallback } from 'react';
import { ReceiveMessage, SendMessage } from '@/types/chat';

interface UseWebSocketProps {
  roomId: string;
  userId: string;
  onMessagesReceived: (newMessages: ReceiveMessage[]) => void;
}

export const useWebSocket = ({ roomId, userId, onMessagesReceived }: UseWebSocketProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!userId) {
      setIsConnected(false);
      return;
    }

    // 如果已经有连接，先关闭
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}?roomId=${roomId}&userId=${userId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'history' && Array.isArray(data.messages)) {
        onMessagesReceived(data.messages);
      } else {
        onMessagesReceived([data]);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');
      // 只有在userId存在时才重连
      if (userId) {
        setTimeout(connect, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws.close();
    };

    wsRef.current = ws;
  }, [roomId, userId, onMessagesReceived]);

  const sendMessage = useCallback((message: SendMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  }, []);

  useEffect(() => {
    if (userId) {
      connect();
    } else {
      // 如果没有userId，确保关闭现有连接
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setIsConnected(false);
      }
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, userId]);

  return {
    isConnected,
    sendMessage,
  };
}; 