import { useState, useCallback, useEffect } from 'react';

interface Emoji {
  summary: string;
  file: string;
  url: string;
  emoji_id: string;
  emoji_package_id: number;
  timestamp: number;
}

interface EmojiResponse {
  data: {
    [key: string]: Emoji;
  };
}

interface PaginationInfo {
  current: number;
  total: number;
  hasMore: boolean;
}

interface PageEmojiResponse {
  data: {
    [key: string]: Emoji;
  };
  pagination: PaginationInfo;
}

export const useEmoji = (autoPreload: boolean = false) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emojis, setEmojis] = useState<Emoji[]>([]);
  const [searchResults, setSearchResults] = useState<Emoji[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isPreloaded, setIsPreloaded] = useState(false);

  const processEmojiData = (data: { [key: string]: Emoji } | null | undefined) => {
    if (!data) return [];
    return Object.values(data);
  };

  const fetchEmojis = useCallback(async (page: number = 1) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/emoji/page/${page}`);
      if (!response.ok) {
        throw new Error('获取表情包失败');
      }
      const result: PageEmojiResponse = await response.json();
      
      if (!result?.data || typeof result.pagination?.current !== 'number' || typeof result.pagination?.total !== 'number') {
        throw new Error('表情包数据格式错误或缺少必要的分页信息');
      }
      
      const newEmojis = processEmojiData(result.data);
      
      const currentPageNum = result.pagination.current;
      const finalTotalPages = result.pagination.total;

      setEmojis(prev => (currentPageNum === 1 && page === 1) ? newEmojis : [...prev, ...newEmojis]);
      setCurrentPage(currentPageNum);
      setTotalPages(finalTotalPages);
      
      if (page === 1) {
        setIsPreloaded(true);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
      if (page === 1) {
        setEmojis([]);
        setCurrentPage(0);
        setTotalPages(1);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const preloadEmojis = useCallback(async () => {
    if (!isPreloaded && !loading) {
      // 使用 requestIdleCallback 在浏览器空闲时加载表情
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        window.requestIdleCallback(
          () => {
            fetchEmojis(1);
          },
          { timeout: 5000 } // 设置5秒超时，确保最终会执行
        );
      } else {
        // 如果不支持 requestIdleCallback，使用 setTimeout 延迟加载
        setTimeout(() => {
          fetchEmojis(1);
        }, 2000);
      }
    }
  }, [fetchEmojis, isPreloaded, loading]);

  useEffect(() => {
    if (autoPreload) {
      preloadEmojis();
    }
  }, [autoPreload, preloadEmojis]);

  const searchEmojis = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/emoji/search?keyword=${encodeURIComponent(keyword)}`);
      if (!response.ok) {
        throw new Error('搜索表情包失败');
      }
      const result: EmojiResponse | { [key: string]: Emoji } = await response.json();
      let emojiData: { [key: string]: Emoji } | null = null;
      if (typeof (result as EmojiResponse).data === 'object') {
        emojiData = (result as EmojiResponse).data;
      } else if (typeof result === 'object') {
        emojiData = result as { [key: string]: Emoji };
      }
      if (!emojiData) {
        throw new Error('表情包搜索结果格式错误');
      }
      setSearchResults(processEmojiData(emojiData));
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    emojis,
    searchResults,
    loading,
    error,
    currentPage,
    totalPages,
    fetchEmojis,
    searchEmojis,
    isPreloaded
  };
};