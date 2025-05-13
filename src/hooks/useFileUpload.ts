import { useState, useCallback } from 'react';
import { UploadResponse } from '@/types/chat';

interface UseFileUploadProps {
  roomId: string;
}

export const useFileUpload = ({ roomId }: UseFileUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(async (file: File): Promise<UploadResponse | null> => {
    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('roomId', roomId);

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to upload file');
      }

      return await response.json();
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : '文件上传失败');
      return null;
    } finally {
      setUploading(false);
    }
  }, [roomId]);

  const downloadFile = useCallback(async (fileId: string): Promise<Blob | null> => {
    try {
      setError(null);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/files/${fileId}`);
      
      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      return await response.blob();
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件下载失败');
      return null;
    }
  }, []);

  return {
    uploading,
    error,
    uploadFile,
    downloadFile,
  };
}; 