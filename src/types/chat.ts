export type MessageType = 'message' | 'system' | 'join' | 'leave' | 'error' | 'edit' | 'delete' | 'onlineList' | 'deleteAll';

export interface FileMeta {
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  encryption?: string;
  emoji_id?: string;  // 可选的表情包ID
}

export interface Message {
  type: MessageType;
  content: string;
  fileMeta?: FileMeta;
  messageId?: string;  // 可选，如果不提供会自动生成
  originalContent?: string;  // 仅在编辑消息时存在
}

export interface ReceiveMessage extends Message {
  id: string;  // 服务器生成的唯一消息ID，对于 onlineList 类型可能为空
  roomId: string;
  userId: string;
  timestamp: number;
  isNew?: boolean;  // 用于标记新消息，控制动画效果
}

export interface OnlineListMessage extends Omit<ReceiveMessage, 'id'> {
  type: 'onlineList';
  userId: 'system';
  content: string; // JSON.stringify(string[]) - 在线用户ID数组
}

export interface HistoryResponse {
  messages: Array<ReceiveMessage>;
}

export interface UploadResponse {
  url: string;
  meta: FileMeta;
}

export interface ChatConfig {
  room: {
    ttl: number;
    maxMessages: number;
    inactiveTtl: number;
    cleanupInterval: number;
  };
}

export interface SendMessage {
  type: MessageType;
  content?: string;
  fileMeta?: FileMeta;
  messageId?: string;  // 可选，如果不提供会自动生成
  originalContent?: string;  // 仅在编辑消息时存在
  tempId?: string;  // 临时消息ID，用于前端追踪消息状态
} 