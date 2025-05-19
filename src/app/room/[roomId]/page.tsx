'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { ReceiveMessage } from '@/types/chat';
import Cookies from 'js-cookie';
import { EmojiPicker } from '@/components/EmojiPicker';
import { CommandPalette, Command} from '@/components/CommandPalette';
import { MentionPalette } from '@/components/MentionPalette';
import getCaretCoordinates from 'textarea-caret';
import throttle from 'lodash.throttle';
import './terminal-styles.css';
import '@/styles/terminal-emoji.css';
import '@/styles/CommandPalette.css';
import '@/styles/MentionPalette.css';
import { useTheme, ThemeType } from '@/hooks/useTheme';
import { useNotification } from '@/hooks/useNotification';
import { useChatMessageHook, ExtendedReceiveMessage } from '@/hooks/useChatMessageHook';

import type { VoiceParticipant, VoiceChannelStateMessage } from '../../../../types/agora'; // 语音相关类型
import dynamic from 'next/dynamic';

// 在文件顶部添加样式
const systemMessageStyle = `
  .message.system-msg {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    position: relative;
    transform-origin: top;
    max-height: 500px;
    opacity: 1;
  }
  
  .message.system-msg.collapsed {
    opacity: 0.5;
    max-height: 24px;
    cursor: pointer;
    color: #666;
  }
  
  .message.system-msg.collapsed:hover {
    opacity: 0.7;
    color: #888;
    background-color: rgba(255, 255, 255, 0.02);
  }
  
  .message.system-msg:not(.collapsed):hover {
    background-color: rgba(255, 255, 255, 0.05);
  }

  .message.system-msg .message-content {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .message.system-msg.collapsed .message-content {
    transform: translateY(-2px);
  }
`;

const USER_ID_COOKIE = 'chat_user_id';
const APP_VERSION = '1.0.1';

// 添加音效对象和控制变量
const notifySound = typeof Audio !== 'undefined' ? new Audio('/notify.wav') : null;
const sendSound = typeof Audio !== 'undefined' ? new Audio('/send.wav') : null;

// 用于控制通知音效的节流
const NOTIFY_COOLDOWN = 2000; // 通知音效的冷却时间（毫秒）
let lastNotifyTime = 0;
let pendingNotifications = 0;

// 预加载音效
if (notifySound) {
  notifySound.load();
  notifySound.volume = 0.6; // 设置音量为60%
  
  // 添加音效播放完成的处理
  notifySound.addEventListener('ended', () => {
    // 如果还有待播放的通知，且已经过了冷却时间，则播放
    if (pendingNotifications > 0 && Date.now() - lastNotifyTime >= NOTIFY_COOLDOWN) {
      pendingNotifications = 0;
      lastNotifyTime = Date.now();
      notifySound.play().catch(err => console.log('播放通知音效失败:', err));
    }
  });
}
if (sendSound) {
  sendSound.load();
  sendSound.volume = 0.6; // 设置音量为60%
}

// 添加智能通知音效播放函数
const playNotifySound = () => {
  if (!notifySound) return;

  const now = Date.now();
  if (now - lastNotifyTime >= NOTIFY_COOLDOWN) {
    // 如果超过冷却时间，直接播放
    lastNotifyTime = now;
    pendingNotifications = 0;
    notifySound.play().catch(err => console.log('播放通知音效失败:', err));
  } else {
    // 如果在冷却时间内，增加待播放计数
    pendingNotifications++;
  }
};

const imageContentStyle = `
  .image-content:hover {
    background: transparent !important;
  }
`;

// 添加链接样式
const linkStyle = `
  .message-link {
    color: #87CEFA; /* LightSkyBlue, good for dark themes */
    text-decoration: underline;
  }
  .message-link:hover {
    color: #ADD8E6; /* LightBlue, slightly different for hover */
    text-decoration: underline;
  }
`;

// 更新 MediaPreview 组件
const MediaPreview = ({ src, onClose, type = 'image' }: { src: string; onClose: () => void; type?: 'image' | 'video' }) => {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh] w-full h-full flex items-center justify-center">
        <div className="absolute top-4 right-4 flex gap-2 z-50">
          <a 
            href={src} 
            download 
            className="px-4 py-2 text-white hover:text-gray-300 transition-colors flex items-center gap-2"
            onClick={e => e.stopPropagation()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            下载
          </a>
          <button
            className="px-4 py-2 text-white hover:text-gray-300 transition-colors flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            关闭
          </button>
        </div>
        
        {type === 'image' ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={src}
            alt="预览"
            className="max-w-full max-h-[90vh] object-contain"
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <div className="relative w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
            <video
              src={src}
              className="max-w-full max-h-[90vh] w-auto h-auto object-contain"
              controls
              autoPlay
              controlsList="nodownload"
              style={{
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              }}
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// 添加右键菜单组件
interface ContextMenuProps {
  x: number;
  y: number;
  messageId: string;
  content: string;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x, y, messageId, content, onEdit, onDelete, onClose
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="context-menu-item edit"
        onClick={() => {
          onEdit(messageId, content);
          onClose();
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
        </svg>
        编辑消息
      </button>
      <button
        className="context-menu-item delete"
        onClick={() => {
          onDelete(messageId);
          onClose();
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m6.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
        删除消息
      </button>
    </div>
  );
};

// 添加通知相关状态和函数
const APP_TITLE = 'Private Chat Terminal';

// 更新视频预览组件
const VideoPreview = ({ msg, onMediaClick }: { msg: ReceiveMessage; onMediaClick: (url: string, type: 'image' | 'video', isEmoji: boolean) => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [thumbnail, setThumbnail] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false); // 用于控制动画
  
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      // 沿用之前工作正常的预览图生成逻辑
      video.currentTime = 0.1; // 设置初始时间
      
      const handleLoadedData = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            setThumbnail(dataUrl);
          }
        } catch (err) {
          console.error('生成预览图失败:', err);
        }
      };

      video.addEventListener('loadeddata', handleLoadedData);
      return () => {
        video.removeEventListener('loadeddata', handleLoadedData);
      };
    }
  }, []);

  // 处理鼠标悬停
  const handleMouseEnter = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 1; // 从第1秒开始播放
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            // 只有在视频成功开始播放时才设置 isPlaying 为 true
            if (videoRef.current && !videoRef.current.paused) {
              setIsPlaying(true);
            }
          })
          .catch(error => {
            // 捕获并忽略因 pause() 中断 play() 导致的错误
            if (error.name === 'AbortError') {
              console.log('Video play() was interrupted by pause().');
            } else {
              console.error('视频播放失败:', error);
            }
          });
      }
    }
  }, []);

  // 处理鼠标离开
  const handleMouseLeave = useCallback(() => {
    if (videoRef.current) {
      // 只有在视频确实在播放或准备播放时才调用 pause
      if (!videoRef.current.paused) {
        videoRef.current.pause();
      }
      setIsPlaying(false);
    }
  }, []);

  return (
    <div style={{ margin: '8px 0' }}>
      <div 
        className="video-thumbnail cursor-pointer relative"
        onClick={() => onMediaClick(msg.fileMeta!.url, 'video', false)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          maxWidth: '300px',
          maxHeight: '169px',
          overflow: 'hidden',
          borderRadius: '4px',
          backgroundColor: '#000',
          aspectRatio: '16/9',
          transition: 'opacity 0.3s ease', // 添加过渡效果
        }}
      >
        <video 
          ref={videoRef}
          src={msg.fileMeta!.url}
          className="w-full h-full object-cover"
          crossOrigin="anonymous"
          preload="metadata"
          muted
          playsInline
          loop // 可选：悬停时循环播放
          style={{ 
            display: 'block', // 始终显示，通过透明度控制
            opacity: isPlaying ? 1 : 0,
            transition: 'opacity 0.3s ease',
            objectFit: 'cover',
          }}
        />
        {thumbnail && (
          <img 
            src={thumbnail} 
            alt="视频预览"
            className="w-full h-full object-cover absolute inset-0"
            style={{ 
              opacity: isPlaying ? 0 : 1, 
              transition: 'opacity 0.3s ease', 
              zIndex: 1 // 确保预览图在视频之上（未播放时）
            }}
          />
        )}
        {!isPlaying && (
          <div 
            className="absolute inset-0 flex items-center justify-center bg-black/30"
            style={{ zIndex: 2 }} // 确保播放按钮在最上层
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};

// 辅助函数：将 VAPID 公钥从 base64url 转换为 Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  console.log('urlBase64ToUint8Array received:', base64String, 'type:', typeof base64String);
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// 新增：命令定义
const availableCommands: Command[] = [
  {
    id: 'theme',
    name: 'theme',
    displayName: '切换主题',
    description: '更改聊天界面的颜色主题。',
    usage: 'eye | default | cyberpunk', // 更新用法提示
    actionPrefix: '/theme ',
    parameters: [
      {
        name: 'mode',
        displayName: '主题模式',
        options: [
          { value: 'eye', displayValue: 'eye (护眼模式)', description: '切换到护眼模式' },
          { value: 'default', displayValue: 'default (默认主题)', description: '恢复到默认主题' },
          { value: 'cyberpunk', displayValue: 'cyberpunk (赛博朋克)', description: '切换到赛博朋克主题' }, // 新增赛博朋克选项
        ],
      },
    ],
  },
  {
    id: 'nick',
    name: 'nick',
    displayName: '修改昵称',
    description: '更改您在聊天中的显示名称。',
    usage: '<新昵称>',
    actionPrefix: '/nick ',
    parameters: [
      {
        name: 'newName',
        displayName: '新昵称',
        isFreeText: true,
        placeholder: '请输入您的新昵称',
      },
    ],
  },
  {
    id: 'invite',
    name: 'invite',
    displayName: '邀请用户',
    description: '通过邮件邀请他人加入当前聊天室。',
    usage: '<邮箱地址>',
    actionPrefix: '/invite ',
    parameters: [
      {
        name: 'email',
        displayName: '邮箱地址',
        isFreeText: true,
        placeholder: '请输入对方的邮箱地址',
      },
    ],
  },
  {
    id: 'clear',
    name: 'clear',
    displayName: '清除消息',
    description: '清除您自己发送的所有消息。',
    usage: 'me',
    actionPrefix: '/clear ',
    parameters: [
      {
        name: 'target',
        displayName: '清除目标',
        options: [
          { value: 'me', displayValue: 'me (我的消息)', description: '清除我发送的所有消息' },
        ],
      },
    ],
  },
  // 新增通知命令
  {
    id: 'notify',
    name: 'notify',
    displayName: '通知推送',
    description: '启用或禁用当前房间的离线消息推送通知。',
    usage: 'enable | disable',
    actionPrefix: '/notify ',
    parameters: [
      {
        name: 'action',
        displayName: '操作',
        options: [
          { value: 'enable', displayValue: 'enable (启用推送)', description: '为此房间启用推送通知' },
          { value: 'disable', displayValue: 'disable (禁用推送)', description: '为此房间禁用推送通知' },
        ],
      },
    ],
  },
  {
    id: 'peeking',
    name: 'peeking',
    displayName: '谁在偷窥',
    description: '实时捕捉谁在看但又不说话。把偷窥的杂鱼抓出来吧~',
    usage: '', // 无需参数
    actionPrefix: '/peeking ',
    parameters: [], // 无参数
  },
];

// 为窥屏响应定义一个接口
interface PeekingResponsePayload {
  action: 'peeking_list_response';
  details: string;
}

// 类型守卫函数
function isPeekingResponsePayload(content: unknown): content is PeekingResponsePayload {
  return (
    typeof content === 'object' &&
    content !== null &&
    (content as Record<string, unknown>).action === 'peeking_list_response' &&
    typeof (content as Record<string, unknown>).details === 'string'
  );
}

const VoiceControls = dynamic(() => import('./VoiceControls'), { ssr: false });

export default function ChatRoom() {
  const { roomId } = useParams() as { roomId: string };
  const [isInitialized, setIsInitialized] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [initialUserIdForWs, setInitialUserIdForWs] = useState<string>('');
  const [isJoined, setIsJoined] = useState(false);
  const [joinTimestamp, setJoinTimestamp] = useState<number>(0);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [showCustomCaret, setShowCustomCaret] = useState(false);
  const [customCaretStyle, setCustomCaretStyle] = useState({ top: 0, left: 0, height: 0, opacity: 0 });
  const blinkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const latestCoordsRef = useRef({ top: 0, left: 0, height: 0 });
  const rafIdRef = useRef<number | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    messageId: string;
    content: string;
  } | null>(null);

  const [currentTheme, setCurrentTheme] = useTheme();
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandPaletteFilter, setCommandPaletteFilter] = useState('');
  const [showMentionPalette, setShowMentionPalette] = useState(false);
  const [mentionPaletteFilter, setMentionPaletteFilter] = useState('');
  const [showPrompt] = useState(true);
  const [nickInput, setNickInput] = useState('');
  const [caretPosition, setCaretPosition] = useState({ left: 0, top: 0, height: 0 });
  const loginInputRef = useRef<HTMLInputElement>(null);
  const [notificationPermission, requestNotification, sendBrowserNotification] = useNotification();
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const [isSubscribedToPush, setIsSubscribedToPush] = useState(false);
  // 在 ChatRoom 组件内部，新增语音成员状态
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>([]); // 语音成员列表

  const {
    allMessages,
    setAllMessages,
    onlineUserNicks,
    collapsedMessages,
    toggleMessageCollapse,
    isConnected,
    sendMessage,
    uploadFile,
    uploading,
    uploadError,
    deleteMessageOnServer,
    editMessageOnServer,
    deleteAllMessagesOnServer,
    addSystemMessage,
    addOptimisticMessage,
    lastMessageBatchDetails,
  } = useChatMessageHook({
    roomId: roomId,
    currentUserId: userId,
    initialWsUserId: initialUserIdForWs,
    joinTimestamp: joinTimestamp,
  });

  const lastVisibilityStateRef = useRef<boolean | null>(null);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const currentVisibility = !document.hidden;
      // 只有当状态实际改变时才发送
      if (lastVisibilityStateRef.current !== currentVisibility) {
        console.log(`Page visibility changed to: ${currentVisibility ? 'visible' : 'hidden'}. Sending update.`);
        sendMessage('user_visibility', JSON.stringify({ 
          userId: userId, // 使用当前 userId
          roomId: roomId, 
          isVisible: currentVisibility 
        }));
        lastVisibilityStateRef.current = currentVisibility;
      }
    };

    // 只有当用户已加入且 WebSocket 连接建立后才开始监听和发送
    if (isJoined && userId && roomId && isConnected) {
      // 发送初始状态
      const initialVisibility = !document.hidden;
      console.log(`Initial page visibility: ${initialVisibility ? 'visible' : 'hidden'}. Sending update.`);
      sendMessage('user_visibility', JSON.stringify({ 
        userId: userId, 
        roomId: roomId, 
        isVisible: initialVisibility 
      }));
      lastVisibilityStateRef.current = initialVisibility;

      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        sendMessage('user_visibility', JSON.stringify({ userId: userId, roomId: roomId, isVisible: false }));
      };
    }
  }, [isJoined, userId, roomId, sendMessage, isConnected]); // 添加 isConnected 到依赖项

  useEffect(() => {
    const savedUserId = Cookies.get(USER_ID_COOKIE);
    if (savedUserId) {
      setUserId(savedUserId);
      setInitialUserIdForWs(savedUserId);
      setIsJoined(true);
      setJoinTimestamp(Date.now());
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Service Worker 注册成功:', registration);
          swRegistrationRef.current = registration;
        })
        .catch(error => {
          console.error('Service Worker 注册失败:', error);
        });
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        document.title = `${APP_TITLE} - ${roomId}`;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [roomId]);

  useEffect(() => {
    if (lastMessageBatchDetails && lastMessageBatchDetails.batchProcessedCounter > 0) {
      if (lastMessageBatchDetails.newUserMessageForSound) {
        playNotifySound();
      }
      if (lastMessageBatchDetails.notificationPayload && document.hidden) {
        const { userId: senderId, content } = lastMessageBatchDetails.notificationPayload;
        const newCount = document.title.match(/^\\((\\d+)\\)/)
          ? Number(document.title.match(/^\\((\\d+)\\)/)?.[1] || 0) + 1
            : 1;
          document.title = `(${newCount}) ${APP_TITLE} - ${roomId}`;
        sendBrowserNotification(`来自 ${senderId} 的新消息`, content);
      }
    }
  }, [lastMessageBatchDetails, roomId, sendBrowserNotification]);

  useEffect(() => {
    const newMessagesElements = document.querySelectorAll('.message[data-is-new="true"]');
    newMessagesElements.forEach(msgEl => {
      const messageId = msgEl.getAttribute('data-message-id');
      if (!messageId) return;
      msgEl.classList.add('animate-new');
      const onAnimationEnd = () => {
        msgEl.classList.remove('animate-new');
        msgEl.removeAttribute('data-is-new');
        setAllMessages(prev => 
          prev.map(m => 
            m.id === messageId 
              ? { ...m, isNew: false }
              : m
          )
        );
      };
      msgEl.addEventListener('animationend', onAnimationEnd, { once: true });
    });
  }, [allMessages, setAllMessages]);

  useEffect(() => {
    if (allMessages.length > 0) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [allMessages, allMessages.length]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
      throttledUpdateCustomCaretPosition();
    }
  }, [messageInput]);

  const actualUpdateCustomCaretPosition = useCallback(() => {
    if (!inputRef.current || !showCustomCaret || !isInputFocused) return;
    const textarea = inputRef.current;
    const position = textarea.selectionStart;
    const coordinates = getCaretCoordinates(textarea, position);
    const scrollTop = textarea.scrollTop;
    const scrollLeft = textarea.scrollLeft;
    latestCoordsRef.current = {
      top: coordinates.top - scrollTop,
      left: (coordinates.left - scrollLeft) + 2,
      height: coordinates.height,
    };
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        const currentHeight = latestCoordsRef.current.height;
        const currentTop = latestCoordsRef.current.top;
        const newHeight = Math.max(2, currentHeight - 4);
        const heightReduction = currentHeight - newHeight;
        const newTop = currentTop - heightReduction / 4;
        setCustomCaretStyle(prev => ({
          ...prev,
          top: newTop,
          left: latestCoordsRef.current.left,
          height: newHeight,
        }));
        rafIdRef.current = null;
      });
    }
  }, [showCustomCaret, isInputFocused]);

  const throttledUpdateCustomCaretPosition = useMemo(
    () => throttle(actualUpdateCustomCaretPosition, 20, { leading: true, trailing: true }),
    [actualUpdateCustomCaretPosition]
  );

  useEffect(() => {
    const manageBlinking = () => {
      if (showCustomCaret && isInputFocused) {
        if (blinkIntervalRef.current) clearInterval(blinkIntervalRef.current);
        setCustomCaretStyle(prev => ({ ...prev, opacity: 1 }));
        blinkIntervalRef.current = setInterval(() => {
          setCustomCaretStyle(prev => ({ ...prev, opacity: prev.opacity === 1 ? 0 : 1 }));
        }, 700);
      } else {
        if (blinkIntervalRef.current) {
          clearInterval(blinkIntervalRef.current);
          blinkIntervalRef.current = null;
        }
        setCustomCaretStyle(prev => ({ ...prev, opacity: 0 }));
      }
    };
    manageBlinking();
    return () => {
      if (blinkIntervalRef.current) {
        clearInterval(blinkIntervalRef.current);
      }
    };
  }, [showCustomCaret, isInputFocused]);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (document.activeElement === inputRef.current) {
        throttledUpdateCustomCaretPosition();
        if (blinkIntervalRef.current) clearInterval(blinkIntervalRef.current);
        setCustomCaretStyle(prev => ({ ...prev, opacity: 1 })); 
        blinkIntervalRef.current = setInterval(() => {
          setCustomCaretStyle(prev => ({ ...prev, opacity: prev.opacity === 1 ? 0 : 1 }));
        }, 700);
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [throttledUpdateCustomCaretPosition]);

  const handleInputFocus = () => {
    setShowCustomCaret(true);
    setIsInputFocused(true);
  };

  const handleInputBlur = () => {
    setShowCustomCaret(false);
    setIsInputFocused(false);
  };

  const handleJoin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (nickInput.trim()) {
      const newUserId = nickInput.trim();
      setUserId(newUserId);
      setInitialUserIdForWs(newUserId);
      setIsJoined(true);
      const currentTimestamp = Date.now();
      setJoinTimestamp(currentTimestamp);
      Cookies.set(USER_ID_COOKIE, newUserId, { expires: 30 });
    }
  };

  const handleEditMessage = (messageIdToEdit: string, currentContent: string) => {
    setEditingMessageId(messageIdToEdit);
    setEditingContent(currentContent);
    setMessageInput(currentContent);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingContent('');
    setMessageInput('');
  };

  const handleDeleteMessage = (messageIdToDelete: string) => {
    if (window.confirm('确定要删除这条消息吗？')) {
      deleteMessageOnServer(messageIdToDelete);
    }
  };

  const handleInviteCommand = async (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      addSystemMessage('邮箱格式不正确，请使用正确的邮箱地址');
      return;
    }
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inviterName: userId, recipientEmail: email, roomId: roomId }),
      });
      const data = await response.json();
      addSystemMessage(data.success ? `已成功发送邀请邮件到 ${email}` : `发送邀请邮件失败: ${data.error || '未知错误'}`);
    } catch (error) {
      console.error('发送邀请邮件失败:', error);
      addSystemMessage('发送邀请邮件失败，请稍后重试');
    }
  };

  const handleNameChange = (newName: string) => {
    if (!newName.trim()) {
      addSystemMessage('新名称不能为空');
      return;
    }
    const oldName = userId;
    Cookies.set(USER_ID_COOKIE, newName.trim(), { expires: 30 });
    const renameNotificationMessage = `${oldName} 已将名称更改为 ${newName.trim()} - 本地修改 请自行确认安全性`;
    const tempIdRename = `temp-${Date.now()}-rename-notify`;
    addOptimisticMessage(renameNotificationMessage, tempIdRename, oldName);
    sendMessage('message', renameNotificationMessage, tempIdRename);
    addSystemMessage(`名称已成功更改为 ${newName.trim()}。页面即将刷新...`);
    setTimeout(() => { window.location.reload(); }, 1500);
  };

  const handleSubmitMessage = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (messageInput.trim()) {
      const trimmedInput = messageInput.trim();
      let commandProcessed = false;
      if (trimmedInput.startsWith('/')) {
        const [commandNamePart, ...argsParts] = trimmedInput.substring(1).split(' ');
        const commandName = commandNamePart.toLowerCase();
        const argString = argsParts.join(' ').trim();

        if (commandName === 'clear' && argString === 'me') {
          if (window.confirm('确定要删除你发送的所有消息吗？此操作不可撤销。')) {
            deleteAllMessagesOnServer();
          }
          commandProcessed = true;
        } else if (commandName === 'nick' && argString) {
          handleNameChange(argString);
          commandProcessed = true;
        } else if (commandName === 'invite' && argString) {
          handleInviteCommand(argString);
          commandProcessed = true;
        } else if (commandName === 'theme') {
          const newThemeArg = argString.toLowerCase();
          let themeToSet = 'default';
          if (newThemeArg === 'eye') themeToSet = 'eye-care';
          else if (newThemeArg === 'cyberpunk') themeToSet = 'cyberpunk';
          else if (newThemeArg === 'default') themeToSet = 'default';
          if (['eye-care', 'default', 'cyberpunk'].includes(themeToSet)) {
            if (currentTheme !== themeToSet) {
                setCurrentTheme(themeToSet as ThemeType);
                let themeNameForMessage = '';
                if (themeToSet === 'eye-care') themeNameForMessage = '护眼模式';
                else if (themeToSet === 'cyberpunk') themeNameForMessage = '赛博朋克主题';
                else themeNameForMessage = '默认主题';
                addSystemMessage(`${themeNameForMessage}已启用。`);
            } else {
                let themeNameForMessage = '';
                if (currentTheme === 'eye-care') themeNameForMessage = '护眼模式';
                else if (currentTheme === 'cyberpunk') themeNameForMessage = '赛博朋克主题';
                else themeNameForMessage = '默认主题';
                addSystemMessage(`${themeNameForMessage}已是当前主题。`);
            }
          } else {
            addSystemMessage(`无效的主题参数: '${argString}'. 可用: eye, default, cyberpunk`);
          }
          commandProcessed = true;
        } else if (commandName === 'notify') {
          if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) {
            addSystemMessage('此浏览器不支持推送通知功能。');
            commandProcessed = true;
          } else if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
            addSystemMessage('推送通知功能未配置VAPID密钥，请联系管理员。');
          commandProcessed = true;
        } else {
            if (argString === 'enable') {
              if (isSubscribedToPush) {
                addSystemMessage('已为此房间启用了离线消息推送。');
              } else if (notificationPermission === 'denied') {
                addSystemMessage('无法启用离线消息推送，通知权限已被浏览器永久拒绝。请在浏览器设置中修改。');
              } else if (notificationPermission === 'default') {
                addSystemMessage('请求用户授权以启用离线消息推送...');
                requestNotification().then(permission => {
                  if (permission === 'granted') {
                    addSystemMessage('通知权限已获取，正在启用离线消息推送...');
                    subscribeUserToPush();
                  } else {
                    addSystemMessage('未授予通知权限，无法启用离线消息推送。');
                  }
                });
              } else if (notificationPermission === 'granted') {
                 addSystemMessage('通知权限已具备，正在启用离线消息推送...');
                 subscribeUserToPush();
              }
            } else if (argString === 'disable') {
              if (!isSubscribedToPush && notificationPermission !== 'denied') {
                 addSystemMessage('当前房间未启用离线消息推送，无需禁用。');
              } else if (notificationPermission === 'denied'){
                 addSystemMessage('通知权限已被永久拒绝，无法管理推送状态。');
              }
              else {
                addSystemMessage('正在禁用此房间的离线消息推送...');
                unsubscribeUserFromPush();
              }
            } else {
              addSystemMessage(`无效的通知操作: '${argString}'. 可用: enable, disable`);
            }
           commandProcessed = true; 
        }
        } else if (commandName === 'peeking') {
          if (!isConnected) {
            addSystemMessage('未连接到服务器，无法获取窥屏者名单。');
          } else {
            sendMessage('request_peeking_list', JSON.stringify({ roomId: roomId, requesterId: userId }));
          }
          commandProcessed = true;
        } else {
           addSystemMessage(`未知命令或参数不正确: '${trimmedInput}'`);
           commandProcessed = true; 
        }
      }
      if (commandProcessed) {
        setMessageInput('');
        if (inputRef.current) inputRef.current.style.height = 'auto';
        setShowCommandPalette(false);
        return;
      }
      sendSound?.play().catch(err => console.log('播放发送音效失败:', err));
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (editingMessageId) {
        editMessageOnServer(editingMessageId, trimmedInput, editingContent);
        setEditingMessageId(null); setEditingContent('');
      } else {
        addOptimisticMessage(trimmedInput, tempId, userId);
        sendMessage('message', trimmedInput, tempId);
      }
      setMessageInput('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
      setShowCommandPalette(false);
    }
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitMessage();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const response = await uploadFile(file);
        if (response && response.meta) {
          const fileMeta = {
            fileName: response.meta.fileName,
            fileSize: response.meta.fileSize,
            mimeType: response.meta.mimeType,
            url: response.url,
            encryption: response.meta.encryption,
          };
          const tempId = `temp-file-${Date.now()}`;
          const content = `[文件] ${file.name}`;
          addOptimisticMessage(content, tempId, userId, fileMeta);
          sendMessage('message', content, tempId, fileMeta);
        } else {
          console.error('文件上传失败，响应无效', response);
          addSystemMessage(`文件 ${file.name} 上传失败。`);
        }
      } catch (err) {
        console.error('文件上传处理错误:', err);
        addSystemMessage(`文件 ${file.name} 上传过程中发生错误。`);
      }
      if (e.target) e.target.value = '';
    }
  };

  const handleEmojiSelect = (emoji: { url: string; emoji_id: string }) => {
    const fileMeta = {
        fileName: '表情',
        fileSize: 0,
        mimeType: 'image/png',
        url: emoji.url,
        emoji_id: emoji.emoji_id,
    };
    const content = `[表情]`;
    const tempId = `temp-emoji-${Date.now()}`;
    addOptimisticMessage(content, tempId, userId, fileMeta);
    sendMessage('message', content, tempId, fileMeta);
    setShowEmojiPicker(false);
  };

  const handleMediaClick = (url: string, type: 'image' | 'video', isEmoji: boolean) => {
    if (!isEmoji) setPreviewImage({ url, type });
  };

  const renderMessageContent = (msg: ExtendedReceiveMessage, isCurrentUser: boolean): React.ReactNode => {
    if (msg.fileMeta) {
      if (msg.fileMeta.emoji_id && msg.content === '[表情]') {
        return (
          <div style={{ margin: '8px 0' }}>
            <Image 
              src={msg.fileMeta.url} 
              alt={msg.fileMeta.fileName}
              width={200}
              height={200}
              style={{ 
                width: '200px !important',
                height: 'auto !important',
                display: 'block',
                maxWidth: 'none !important'
              }}
              unoptimized={true}
            />
          </div>
        );
      }
      if (msg.fileMeta.mimeType?.startsWith('video/')) {
        return <VideoPreview msg={msg as ReceiveMessage} onMediaClick={handleMediaClick} />;
      }
      if (msg.fileMeta.mimeType?.startsWith('image/')) {
        return (
          <div style={{ margin: '8px 0' }}>
            <Image 
              src={msg.fileMeta.url} 
              alt={msg.fileMeta.fileName}
              width={300}
              height={300}
              style={{ 
                maxWidth: '300px',
                height: 'auto',
                cursor: 'pointer'
              }}
              onClick={() => handleMediaClick(msg.fileMeta!.url, 'image', false)}
              unoptimized={true}
            />
          </div>
        );
      }
      const cleanFileName = msg.fileMeta.fileName.replace(/^\d+_/, '');
      const fileSizeKB = Math.round(msg.fileMeta.fileSize / 1024);
      return (
        <a
          href={msg.fileMeta.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`file-link ${isCurrentUser ? 'text-self-msg-link' : 'text-other-msg-link'}`}
          download={cleanFileName}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 inline-block">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {cleanFileName} ({fileSizeKB}KB)
        </a>
      );
    }

    const baseKey = msg.id;

    const processMentionsInSegment = (segment: string, keyPrefix: string): React.ReactNode[] => {
      const mentionElements: React.ReactNode[] = [];
      const mentionRegexForSplit = /(@\S+)/;
      const parts = segment.split(mentionRegexForSplit).filter(Boolean);

      parts.forEach((part, index) => {
        if (part.startsWith('@')) {
          const username = part.slice(1).replace(/[.,!?，。！？、]$/, '');
          const isSelf = username === userId;
          mentionElements.push(
            <span
              key={`${keyPrefix}-mention-${index}-${username}`}
              className={`at-mention ${isSelf ? 'self' : ''}`}
              onClick={() => handleUserNameClick(username)}
            >
              {part}
            </span>
          );
        } else {
          mentionElements.push(part);
        }
      });
      return mentionElements;
    };

    const processTextForLinksAndMentions = (text: string): React.ReactNode[] => {
      if (typeof text !== 'string') {
        return [String(text)]; 
      }
      const finalElements: React.ReactNode[] = [];
      const urlRegex = /(?:https?:\/\/|www\.)[^\s<>"'`'“”]+/gi;
      const urlMatches = Array.from(text.matchAll(urlRegex));
      let currentIndex = 0;

      if (urlMatches.length === 0) {
        if (text.includes('@')) {
          return processMentionsInSegment(text, `${baseKey}-seg-nou`);
        }
        return [text];
      }

      urlMatches.forEach((match, matchIndex) => {
        const url = match[0];
        const startIndex = match.index!;

        if (startIndex > currentIndex) {
          const precedingText = text.substring(currentIndex, startIndex);
          finalElements.push(...processMentionsInSegment(precedingText, `${baseKey}-seg-${matchIndex}-pre`));
        }

        let href = url;
        if (url.startsWith('www.')) {
          href = `http://${url}`;
        }
        finalElements.push(
          <a
            key={`${baseKey}-url-${matchIndex}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="message-link"
          >
            {url}
          </a>
        );
        currentIndex = startIndex + url.length;
      });

      if (currentIndex < text.length) {
        const trailingText = text.substring(currentIndex);
        finalElements.push(...processMentionsInSegment(trailingText, `${baseKey}-seg-post`));
      }
      
      return finalElements.length > 0 ? finalElements : [text];
    };
    
    return <span className="message-text">{processTextForLinksAndMentions(msg.content)}</span>;
  };

  const handleUserNameClick = (username: string) => {
    if (inputRef.current) {
      const currentValue = inputRef.current.value;
      const atText = `@${username} `;
      if (!currentValue.includes(atText)) {
        setMessageInput(currentValue + atText);
        inputRef.current.focus();
      }
    }
  };

  const handleContextMenuCallback = useCallback((e: React.MouseEvent, messageId: string, content: string) => {
    e.preventDefault();
    let x = e.clientX; let y = e.clientY;
    const menuWidth = 160; const menuHeight = 88;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight;
    const prevHighlighted = document.querySelector('.message[data-context-menu="true"]');
    if (prevHighlighted) prevHighlighted.removeAttribute('data-context-menu');
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) messageElement.setAttribute('data-context-menu', 'true');
    setContextMenu({ x, y, messageId, content });
  }, []);

  useEffect(() => {
    if (!contextMenu) {
      const highlightedMessage = document.querySelector('.message[data-context-menu="true"]');
      if (highlightedMessage) highlightedMessage.removeAttribute('data-context-menu');
    }
  }, [contextMenu]);

  const renderSystemMessage = (msg: ExtendedReceiveMessage, messageKey: string) => {
    const isCollapsed = collapsedMessages.has(msg.id || messageKey);
    let messageType = 'SystemMessage';
    if (msg.type === 'join') messageType = 'UserJoined';
    else if (msg.type === 'leave') messageType = 'UserLeft';
    else if (msg.type === 'onlineList') messageType = 'OnlineUsers';
    
    let processedContent: string;
    const rawContent = msg.content;

    if (msg.type === 'join') {
      processedContent = `${msg.userId} 进入了房间`;
    } else if (msg.type === 'leave') {
      processedContent = `${msg.userId} 离开了房间`;
    } else {
      if (isPeekingResponsePayload(rawContent)) {
        processedContent = rawContent.details;
      } else if (typeof rawContent === 'object' && rawContent !== null) {
        processedContent = JSON.stringify(rawContent);
      } else {
        processedContent = String(rawContent);
      }
    }
    
    return (
      <div 
        key={messageKey} 
        className={`message system-msg ${isCollapsed ? 'collapsed' : ''}`}
        data-is-new={msg.isNew}
        data-deleting={msg.deleting}
        onClick={() => toggleMessageCollapse(msg.id || messageKey)}
        style={{ cursor: 'pointer' }}
      >
        <div className="message-content">
          <span className="timestamp">[{new Date(msg.timestamp).toLocaleTimeString()}]</span>
          {isCollapsed ? (<span className="message-text"> {messageType}</span>) : (<span className="message-text"> {processedContent}</span>)}
        </div>
      </div>
    );
  };

  const renderMessage = (msg: ExtendedReceiveMessage) => {
    const isCurrentUser = msg.userId === userId;
    const messageKey = msg.id || `${msg.type}-${msg.timestamp}-${Math.random().toString(36).slice(2)}-${msg.userId}`;
    if (!isJoined && (msg.type === 'join' || msg.type === 'leave')) return null;
    if ((msg.type === 'join' || msg.type === 'leave')) {
      if (msg.userId === userId && msg.type === 'join') return null;
      if (msg.timestamp < joinTimestamp) return null; 
      return renderSystemMessage(msg, messageKey);
    }
    if (msg.type === 'system' || msg.type === 'error' || msg.type === 'onlineList') {
      return renderSystemMessage(msg, messageKey);
    }
    if (msg.type === 'message' || msg.type === 'edit') {
      return (
        <div 
          key={messageKey} 
          className={`message ${isCurrentUser ? 'self-msg' : 'user-msg'}`} 
          data-is-new={msg.isNew}
          data-message-id={msg.id}
          data-editing={editingMessageId === msg.id}
          data-deleting={msg.deleting}
          onContextMenu={isCurrentUser ? (e) => handleContextMenuCallback(e, msg.id, msg.content) : undefined}
        >
          <div className={`message-content ${msg.fileMeta?.emoji_id ? 'image-content' : ''}`}>
            <span className="timestamp">[{new Date(msg.timestamp).toLocaleTimeString()}]</span>
            {!isCurrentUser && (<span className="user-nick clickable" onClick={() => handleUserNameClick(msg.userId)}>[{msg.userId}]</span>)}
            {isCurrentUser && (<span className="user-nick self-nick clickable" onClick={() => handleUserNameClick(msg.userId)}>[{msg.userId}]</span>)}
            &nbsp;
            {renderMessageContent(msg, isCurrentUser)}
            {isCurrentUser && (
              <div className="message-actions">
                <button className="action-btn edit-btn" onClick={() => handleEditMessage(msg.id!, msg.content)} title="编辑消息">编辑</button>
                <button className="action-btn delete-btn" onClick={() => handleDeleteMessage(msg.id!)} title="删除消息">删除</button>
              </div>
            )}
            {msg.type === 'edit' || msg.isEdited ? (<span className="edit-indicator">(已编辑)</span>) : null}
          </div>
        </div>
      );
    }
    return null;
  };

  useEffect(() => {
    return () => { if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current); };
  }, []);

  useEffect(() => {
    if (loginInputRef.current && showCustomCaret && !isJoined) {
      const updateCaretPosition = () => {
        const input = loginInputRef.current;
        if (!input) return;
        const { selectionStart, value } = input;
        const textBeforeCaret = value.substring(0, selectionStart || 0);
        const span = document.createElement('span');
        span.style.font = window.getComputedStyle(input).font;
        span.style.visibility = 'hidden';
        span.style.position = 'absolute';
        span.textContent = textBeforeCaret;
        document.body.appendChild(span);
        const { offsetLeft, offsetTop, offsetHeight } = input;
        const textWidth = span.offsetWidth;
        document.body.removeChild(span);
        setCaretPosition({ left: offsetLeft + textWidth, top: offsetTop, height: offsetHeight });
      };
      updateCaretPosition();
      window.addEventListener('resize', updateCaretPosition);
      return () => window.removeEventListener('resize', updateCaretPosition);
    }
  }, [nickInput, showCustomCaret, isJoined]);

  const handleClipboardPaste = useCallback(async (e: ClipboardEvent) => {
    if (!isConnected || uploading) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/') || item.type.startsWith('application/') || item.type.startsWith('text/')) {
        const file = item.getAsFile();
        if (file) {
          try {
            const response = await uploadFile(file);
            if (response && response.meta) {
              const fileMeta = {
                fileName: response.meta.fileName,
                fileSize: response.meta.fileSize,
                mimeType: response.meta.mimeType,
                url: response.url,
                encryption: response.meta.encryption,
              };
              const content = item.type.startsWith('image/') ? `[图片] ${file.name}` : `[文件] ${file.name}`;
              const tempId = `temp-paste-${Date.now()}`;
              addOptimisticMessage(content, tempId, userId, fileMeta);
              sendMessage('message', content, tempId, fileMeta);
            } else {
                 addSystemMessage(`粘贴的文件 ${file.name} 上传失败 (无效响应)。`);
            }
          } catch (err) {
            console.error('剪贴板文件上传失败:', err);
            addSystemMessage(`粘贴的文件 ${file.name} 上传失败。`);
          }
        }
      }
    }
  }, [isConnected, uploading, uploadFile, sendMessage, userId, addOptimisticMessage, addSystemMessage]);

  useEffect(() => {
    if (isJoined) {
      document.addEventListener('paste', handleClipboardPaste);
      return () => { document.removeEventListener('paste', handleClipboardPaste); };
    }
  }, [isJoined, handleClipboardPaste]);

  const handleMessageInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessageInput(value);

    const lastAtMatch = value.match(/@(\w*)$/);

    if (!showCommandPalette && lastAtMatch && !value.endsWith('@ ')) {
      setShowMentionPalette(true);
      setMentionPaletteFilter(lastAtMatch[1]);
    } else if (value.startsWith('/') && !value.includes(' ')) {
      setShowCommandPalette(true);
      const mainCommandPart = value.substring(1);
      setCommandPaletteFilter(mainCommandPart);
      setShowMentionPalette(false);
    } else {
      let mentionedPaletteHidden = false;
      if (!lastAtMatch && showMentionPalette) { 
        setShowMentionPalette(false);
        setMentionPaletteFilter('');
        mentionedPaletteHidden = true;
      }

      let commandPaletteHidden = false;
      if (!value.startsWith('/') && showCommandPalette) { 
      setShowCommandPalette(false);
      setCommandPaletteFilter('');
        commandPaletteHidden = true;
      }
      
      if (!value.startsWith('/') && !lastAtMatch && !mentionedPaletteHidden && !commandPaletteHidden) {
        if(showMentionPalette){
      setShowMentionPalette(false);
      setMentionPaletteFilter('');
        }
        if(showCommandPalette){
            setShowCommandPalette(false);
            setCommandPaletteFilter('');
        }
      }
    }
  };

  const handleCommandSelect = (textToInsert: string, isParameterSelection?: boolean, commandJustCompleted?: boolean) => {
    if (isParameterSelection) {
      setMessageInput(prev => {
        const parts = prev.split(' ');
        if (parts.length > 1) { parts[parts.length -1] = textToInsert; return parts.join(' '); }
        return prev + textToInsert; // 回退到第一个参数
      });
    } else {
      setMessageInput(textToInsert); // 主命令被选中
    }

    if (commandJustCompleted) {
      setShowCommandPalette(false);
    }
    
    inputRef.current?.focus();

    // 用setTimeout来确保焦点和光标位置在状态变化后更新
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        throttledUpdateCustomCaretPosition();
        inputRef.current.selectionStart = inputRef.current.selectionEnd = inputRef.current.value.length;
      }
    }, 0);
  };

  const handleMentionSelect = (mention: string) => {
    setMessageInput(prev => {
      const lastAt = prev.lastIndexOf('@');
      if (lastAt !== -1) return prev.substring(0, lastAt) + mention;
      return prev + mention;
    });
    setShowMentionPalette(false);
    setMentionPaletteFilter('');
    inputRef.current?.focus();
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.selectionStart = inputRef.current.selectionEnd = inputRef.current.value.length;
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        throttledUpdateCustomCaretPosition();
      }
    }, 0);
  };

  // Push Notification Subscription Logic
  const subscribeUserToPush = useCallback(async () => {
    if (!swRegistrationRef.current || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !userId || !roomId) {
      addSystemMessage('无法订阅推送：缺少必要信息（SW注册、VAPID密钥、用户ID或房间ID）。');
      return;
    }
    try {
      const subscription = await swRegistrationRef.current.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      });
      console.log('用户已成功订阅推送:', subscription);

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/push/subscribe`, {
        method: 'POST',
        body: JSON.stringify({
          userId: userId,
          subscription: subscription.toJSON(),
          roomId: roomId,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const result = await response.json();
        console.log('推送订阅信息已发送到服务器:', result);
        setIsSubscribedToPush(true);
        addSystemMessage('已成功为此房间启用离线消息推送。');
      } else {
        const errorResult = await response.json();
        console.error('发送推送订阅到服务器失败:', errorResult);
        addSystemMessage(`启用离线消息推送失败: ${errorResult.error || response.statusText}`);
        await subscription.unsubscribe(); // Clean up local subscription
        setIsSubscribedToPush(false);
      }
    } catch (error: unknown) { // Changed from any to unknown
      console.error('订阅用户推送失败:', error);
      let errorMessage = '启用离线消息推送时发生未知错误';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = '订阅推送操作被中止。';
        } else {
          errorMessage = `启用离线消息推送时发生错误: ${error.message}`;
        }
      }      
      if (Notification.permission === 'denied') {
        errorMessage = '无法启用离线消息推送，通知权限已被拒绝。';
      }
      addSystemMessage(errorMessage);
      setIsSubscribedToPush(false);
    }
  }, [userId, roomId, addSystemMessage]);

  const unsubscribeUserFromPush = useCallback(async () => {
    if (!swRegistrationRef.current || !userId || !roomId) {
      addSystemMessage('无法取消订阅推送：缺少必要信息。');
      return;
    }
    try {
      const subscription = await swRegistrationRef.current.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        const unsubscribed = await subscription.unsubscribe();
        if (unsubscribed) {
          console.log('用户已成功取消本地推送订阅。');
          setIsSubscribedToPush(false);

          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/push/unsubscribe`, {
            method: 'POST',
            body: JSON.stringify({ userId: userId, endpoint: endpoint, roomId: roomId }),
            headers: { 'Content-Type': 'application/json' },
          });

          if (response.ok) {
            console.log('取消订阅信息已发送到服务器。');
            addSystemMessage('已成功为此房间禁用离线消息推送。');
          } else {
            const errorResult = await response.json();
            console.error('发送取消订阅到服务器失败:', errorResult);
            addSystemMessage(`禁用离线消息推送时后端出错: ${errorResult.error || response.statusText}`);
          }
        } else {
          console.warn('本地取消订阅失败。');
          addSystemMessage('尝试禁用离线消息推送失败 (本地操作未成功)。');
        }
      } else {
        console.log('用户当前未订阅推送。');
        addSystemMessage('当前房间未启用离线消息推送。');
        setIsSubscribedToPush(false);
      }
    } catch (error: unknown) { // Changed from any to unknown
      console.error('取消用户推送订阅失败:', error);
      let errorMessage = '禁用离线消息推送时发生未知错误';
      if (error instanceof Error) {
        errorMessage = `禁用离线消息推送时发生错误: ${error.message}`;
      }
      addSystemMessage(errorMessage);
    }
  }, [userId, roomId, addSystemMessage]);
  
  useEffect(() => {
    const checkSubscription = async () => {
      if (isJoined && swRegistrationRef.current && userId && roomId && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        if (notificationPermission === 'granted') {
          const existingSubscription = await swRegistrationRef.current.pushManager.getSubscription();
          if (existingSubscription) {
            console.log('已存在推送订阅:', existingSubscription);
            setIsSubscribedToPush(true);
          } else {
            console.log('通知权限已授予，但无现有订阅，尝试自动订阅...');
            setIsSubscribedToPush(false);
          }
        } else {
          setIsSubscribedToPush(false);
        }
      }
    };
    checkSubscription();
  }, [isJoined, userId, roomId, notificationPermission]);

  // 类型守卫：判断是否为 VoiceChannelStateMessage
  function isVoiceChannelStateMessage(msg: unknown): msg is VoiceChannelStateMessage {
    return typeof msg === 'object' && msg !== null && (msg as { type?: string }).type === 'voice-channel-state';
  }

  // 监听 allMessages，处理 voice-channel-state 消息，维护语音成员状态
  useEffect(() => {
    // 只处理 type 为 voice-channel-state 的消息
    const voiceStateMsgs = allMessages.filter(isVoiceChannelStateMessage) as unknown as VoiceChannelStateMessage[];
    // 用 Map 维护最新状态
    const participantMap = new Map<string, VoiceParticipant>();
    for (const msg of voiceStateMsgs) {
      const key = msg.userId;
      if (msg.action === 'user-joined-voice') {
        participantMap.set(key, {
          userId: msg.userId,
          agoraUid: msg.agoraUid,
          displayName: msg.displayName || msg.userId,
          isMuted: false,
          isLocal: msg.userId === userId,
        });
      } else if (msg.action === 'user-left-voice') {
        participantMap.delete(key);
      } else if (msg.action === 'user-muted-audio') {
        const prev = participantMap.get(key);
        if (prev) participantMap.set(key, { ...prev, isMuted: true });
      } else if (msg.action === 'user-unmuted-audio') {
        const prev = participantMap.get(key);
        if (prev) participantMap.set(key, { ...prev, isMuted: false });
      }
    }
    setVoiceParticipants(Array.from(participantMap.values()));
  }, [allMessages, userId]);




  if (!isInitialized || (isJoined && !initialUserIdForWs)) {
    return (
        <>
            <div className="scanline"></div>
            <div className="crt-overlay"></div>
            <section className="terminal" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div className="terminal-content">
                    <p className="message system-msg !mt-[55px]" data-is-new={true}>Initializing terminal... <span className="blink">|</span></p>
                </div>
            </section>
        </>
    );
  }

  if (!isJoined) {
    return (
      <>
        <style jsx global>{imageContentStyle}</style>
        <style jsx global>{linkStyle}</style>
        <div className="crt-overlay"></div>
        <section id="login-form" className="terminal" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div className="terminal-content !mt-[55px]">
            <div className="message system-msg" data-is-new={true}>Private Chat Terminal v{APP_VERSION}</div>
            <div className="message system-msg" data-is-new={true}>使用此客户端以使您在无法访问通讯软件的情况下正常聊天</div>
            <div className="message system-msg" data-is-new={true}>当前房间: {roomId}</div>
            {showPrompt && (
              <form onSubmit={handleJoin} className="terminal-form" data-is-new={true}>
                <div className="message input-line">
                  <span className="prompt">$</span>
                  <input
                    ref={loginInputRef}
                    type="text"
                    id="nick-input"
                    className="input-field"
                    value={nickInput}
                    onChange={e => setNickInput(e.target.value)}
                    placeholder="输入昵称后回车…"
                    autoComplete="off"
                    autoFocus
                    required
                    onFocus={() => setShowCustomCaret(true)}
                    onBlur={() => setShowCustomCaret(false)}
                  />
                  {showCustomCaret && (
                    <div
                      className="custom-caret"
                      style={{
                        left: `${caretPosition.left}px`,
                        top: `${caretPosition.top}px`,
                        height: `${caretPosition.height}px`,
                        animation: 'blinkCustomCaret 1s step-end infinite'
                      }}
                    />
                  )}
                </div>
                <button type="submit" style={{ display: 'none' }}>Join</button>
              </form>
            )}
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <style jsx global>{systemMessageStyle}</style>
      <style jsx global>{imageContentStyle}</style>
      <style jsx global>{linkStyle}</style>
      <div className="crt-overlay"></div>
      <section id="chat-area" className="terminal">
        <div className="terminal-content">
          <div id="messages">
            <div className="message system-msg" data-is-new={true}>
              Private Chat Terminal v{APP_VERSION} - Room: {roomId} - User: {userId}
            </div>
            <div className="message system-msg" data-is-new={true}>
              {isConnected ? 'Connected to server' : 'Connecting to server...'}
            </div>
            {allMessages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="input-container">
          {showCommandPalette && (
            <CommandPalette
              commands={availableCommands}
              filter={commandPaletteFilter}
              currentInputValue={messageInput}
              onSelect={handleCommandSelect}
              onClose={() => setShowCommandPalette(false)}
              inputElement={inputRef.current}
            />
          )}
          {showMentionPalette && onlineUserNicks && onlineUserNicks.length > 0 && (
            <MentionPalette
              users={onlineUserNicks}
              filter={mentionPaletteFilter}
              onSelect={handleMentionSelect}
              onClose={() => setShowMentionPalette(false)}
              inputElement={inputRef.current}
            />
          )}
          {uploadError && (
            <div className="message error-msg" style={{ paddingLeft: 0, marginBottom: '5px' }}>上传失败: {uploadError}</div>
          )}
          <form onSubmit={handleSubmitMessage} className="input-line">
            <span className="prompt">$</span>
            <textarea 
              id="input" 
              ref={inputRef}
              className="input-field"
              rows={1} 
              placeholder="输入消息… (输入 / 查看命令)"
              value={messageInput}
              onChange={handleMessageInputChange}
              onKeyDown={(e) => {
                if (showCommandPalette || showMentionPalette) {
                  if (e.key === 'Enter' && !e.shiftKey) e.preventDefault(); 
                  return; 
                }
                if (e.key === 'Escape' && editingMessageId) {
                  e.preventDefault();
                  handleCancelEdit();
                } else if (e.key === 'Enter' && !e.shiftKey) {
                  handleTextareaKeyDown(e); 
                }
              }}
              onKeyUp={throttledUpdateCustomCaretPosition}
              onClick={throttledUpdateCustomCaretPosition}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              disabled={!isConnected}
            />
            {showCustomCaret && inputRef.current && (
              <span 
                className="custom-caret"
                style={{
                  top: `${customCaretStyle.top + inputRef.current.offsetTop}px`,
                  left: `${customCaretStyle.left + inputRef.current.offsetLeft}px`,
                  height: `${customCaretStyle.height}px`,
                  opacity: customCaretStyle.opacity,
                }}
              />
            )}
            <div className="action-buttons">
              <button 
                id="file-btn"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="terminal-button"
                disabled={!isConnected || uploading}
              >
                {uploading ? '上传中...' : '文件'}
              </button>
              <div className="relative">
                <button 
                  id="emoji-btn" 
                  type="button"
                  ref={emojiButtonRef}
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`terminal-button ${showEmojiPicker ? 'active' : ''}`}
                  disabled={!isConnected || uploading}
                >
                  表情
                </button>
                {showEmojiPicker && (
                  <div className="emoji-panel">
                    <EmojiPicker 
                      onSelect={handleEmojiSelect} 
                      onClose={() => setShowEmojiPicker(false)}
                      buttonRef={emojiButtonRef}
                    />
                  </div>
                )}
              </div>
              {/* 语音相关按钮和弹窗由 VoiceControls 组件负责 */}
              <VoiceControls
                roomId={roomId}
                userId={userId}
                isJoined={isJoined}
                isConnected={isConnected}
                sendMessage={sendMessage}
                voiceParticipants={voiceParticipants}
                setVoiceParticipants={setVoiceParticipants}
              />
              {editingMessageId && (
                <button
                  type="button"
                  className="terminal-button cancel-edit-btn"
                  onClick={handleCancelEdit}
                >
                  取消编辑
                </button>
              )}
              <button type="submit" style={{display: 'none'}}>Send</button>
            </div>
          </form>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            className="hidden"
            style={{ display: 'none'}} 
          />
        </div>
      </section>
      {previewImage && (
        <MediaPreview 
          src={previewImage.url}
          type={previewImage.type}
          onClose={() => setPreviewImage(null)} 
        />
      )}
      {contextMenu && (
        <div
          className="context-menu-container"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0, zIndex: 999
          }}
        >
          <ContextMenu
            {...contextMenu}
            onEdit={handleEditMessage}
            onDelete={handleDeleteMessage}
            onClose={() => setContextMenu(null)}
          />
        </div>
      )}
    </>
  );
} 