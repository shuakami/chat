import { useState, useCallback } from 'react';
import { HistoryResponse } from '@/types/chat';

interface UseMessageHistoryProps {
  roomId: string;
}

export const useMessageHistory = ({ roomId }: UseMessageHistoryProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (params?: {
    from?: number;
    to?: number;
    limit?: number;
  }) => {
    try {
      setLoading(true);
      setError(null);
      
      const queryParams = new URLSearchParams({
        room: roomId,
        ...(params?.from && { from: params.from.toString() }),
        ...(params?.to && { to: params.to.toString() }),
        ...(params?.limit && { limit: params.limit.toString() }),
      });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/history?${queryParams}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch history');
      }

      const data: HistoryResponse = await response.json();
      return data.messages;
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载历史消息失败');
      return [];
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  const fetchLatest = useCallback(async (limit?: number) => {
    try {
      setLoading(true);
      setError(null);

      const queryParams = new URLSearchParams({
        room: roomId,
        ...(limit && { limit: limit.toString() }),
      });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/history/latest?${queryParams}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch latest messages');
      }

      const data: HistoryResponse = await response.json();
      return data.messages;
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载最新消息失败');
      return [];
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  return {
    loading,
    error,
    fetchHistory,
    fetchLatest,
  };
}; 