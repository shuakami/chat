'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useFileUpload } from '@/hooks/useFileUpload';
import { ReceiveMessage } from '@/types/chat';
import Cookies from 'js-cookie';
import { EmojiPicker } from '@/components/EmojiPicker';
import getCaretCoordinates from 'textarea-caret';
import throttle from 'lodash.throttle';
import './terminal-styles.css';
import '@/styles/terminal-emoji.css';

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

// 移除未使用的SendMessage接口
interface ExtendedReceiveMessage extends ReceiveMessage {
  deleting?: boolean;
  isNew?: boolean;
  isEdited?: boolean;
  editing?: boolean;
  messageId?: string;
  id: string;
  roomId: string;
  timestamp: number;
}

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

// 扩展 NotificationOptions 类型
interface ExtendedNotificationOptions extends NotificationOptions {
  actions?: {
    action: string;
    title: string;
  }[];
}

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
      videoRef.current.currentTime = 0.2; // 从第0.2秒开始播放
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => console.error('视频播放失败:', err));
    }
  }, []);

  // 处理鼠标离开
  const handleMouseLeave = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
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

export default function ChatRoom() {
  const { roomId } = useParams();
  const [isInitialized, setIsInitialized] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [isJoined, setIsJoined] = useState(false);
  const [joinTimestamp, setJoinTimestamp] = useState<number>(0);
  const [messageInput, setMessageInput] = useState('');
  const [allMessages, setAllMessages] = useState<ExtendedReceiveMessage[]>([]);
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

  const [showPrompt] = useState(true);
  const [nickInput, setNickInput] = useState('');
  const [caretPosition, setCaretPosition] = useState({ left: 0, top: 0, height: 0 });
  const loginInputRef = useRef<HTMLInputElement>(null);

  const [collapsedMessages, setCollapsedMessages] = useState<Set<string>>(new Set());

  // 添加通知相关状态
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');


  useEffect(() => {
    const savedUserId = Cookies.get(USER_ID_COOKIE);
    if (savedUserId) {
      setUserId(savedUserId);
      setIsJoined(true);
      setJoinTimestamp(Date.now());
    }
    setIsInitialized(true);
  }, []);

  // 请求通知权限
  const requestNotificationPermission = useCallback(async () => {
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission;
    } catch (error) {
      console.error('请求通知权限失败:', error);
      return 'denied' as NotificationPermission;
    }
  }, []);

  // 注册 Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Service Worker 注册成功:', registration);
        })
        .catch(error => {
          console.error('Service Worker 注册失败:', error);
        });
    }
  }, []);

  // 初始化通知权限状态
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // 发送通知
  const sendNotification = useCallback((title: string, body: string) => {
    console.log('尝试发送通知:', { title, body });
    if (!('Notification' in window)) {
      console.warn('浏览器不支持通知功能');
      return;
    }

    if (notificationPermission !== 'granted') {
      console.log('没有通知权限，请求权限...');
      requestNotificationPermission();
      return;
    }

    try {
      // 检查是否支持 ServiceWorker
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // 使用 ServiceWorker 显示通知
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, {
            body,
            icon: '/favicon.ico',
            badge: '/favicon.ico', // Windows通知中心的小图标
            tag: 'chat-message',
            requireInteraction: true, // 通知会一直显示直到用户交互
            silent: false, // 允许声音
            actions: [
              {
                action: 'open',
                title: '打开聊天'
              },
              {
                action: 'close',
                title: '关闭'
              }
            ]
          } as ExtendedNotificationOptions);
        });
      } else {
        // 降级为普通通知
        const notification = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: 'chat-message'
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }

      console.log('通知发送成功');
    } catch (error) {
      console.error('发送通知失败:', error);
    }
  }, [notificationPermission, requestNotificationPermission]);

  // 监听页面可见性变化
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // 页面变为可见时，重置标题
        document.title = `${APP_TITLE} - ${roomId}`;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [roomId]);

  // 修改消息处理相关代码
  const handleNewMessages = useCallback((newMessages: ReceiveMessage[], isHistory?: boolean) => {
    console.log('收到新消息:', newMessages, '是否是历史消息:', isHistory, '页面可见性:', !document.hidden, '当前用户:', userId);
    
    setAllMessages((prevMessages) => {
      const messages = [...prevMessages] as ExtendedReceiveMessage[];
      let hasNewMessage = false;
      let hasNewUserMessage = false;
      
      for (const msg of newMessages) {
        // 检查是否有新的用户消息
        if (!isHistory && msg.type === 'message' && msg.userId !== userId) {
          hasNewUserMessage = true;
        }
        
        // 播放接收消息音效
        if (!isHistory && msg.type === 'message' && msg.userId !== userId) {
          notifySound?.play().catch(err => console.log('播放通知音效失败:', err));
        }
        
        // 处理删除消息和编辑消息
        if (msg.type === 'system') {
          try {
            const systemAction = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
            
            // 处理删除操作
            if (systemAction.action === 'delete' && systemAction.messageId) {
              console.log('处理删除消息:', systemAction);
              const messageIndex = messages.findIndex(m => m.id === systemAction.messageId);
              if (messageIndex !== -1) {
                messages[messageIndex] = {
                  ...messages[messageIndex],
                  deleting: true
                };
                setTimeout(() => {
                  setAllMessages(prev => 
                    prev.filter(m => m.id !== systemAction.messageId)
                  );
                }, 300);
              }
              continue;
            }
            
            // 处理编辑操作
            if (systemAction.action === 'edit' && systemAction.messageId && systemAction.newMessage) {
              console.log('处理编辑消息:', systemAction);
              const messageIndex = messages.findIndex(m => m.id === systemAction.messageId);
              if (messageIndex !== -1) {
                // 保存旧消息的一些属性
                const oldMessage = messages[messageIndex];
                
                // 先标记为编辑中
                messages[messageIndex] = {
                  ...oldMessage,
                  editing: true
                };

                // 使用 setTimeout 来确保动画正确触发
                setTimeout(() => {
                  setAllMessages(prev => {
                    const newMessages = [...prev];
                    const targetIndex = newMessages.findIndex(m => m.id === systemAction.messageId);
                    if (targetIndex !== -1) {
                      newMessages[targetIndex] = {
                        ...oldMessage,
                        content: systemAction.newMessage.content,
                        timestamp: systemAction.newMessage.timestamp,
                        userId: systemAction.newMessage.userId,
                        isEdited: true,
                        editing: true
                      };
                    }
                    return newMessages;
                  });

                  // 延迟移除编辑状态
                  setTimeout(() => {
                    setAllMessages(prev => 
                      prev.map(m => 
                        m.id === systemAction.messageId 
                          ? { ...m, editing: false }
                          : m
                      )
                    );
                  }, 1500);
                }, 50);
              }
              continue;
            }
          } catch (e) {
            console.error('解析系统消息失败:', e, '原始消息:', msg);
          }
        }

        // 处理在线用户列表更新
        if (msg.type === 'onlineList' && msg.userId === 'system') {
          console.log('处理在线用户列表:', msg);
          try {
            const onlineUsers = JSON.parse(msg.content);
            console.log('解析后的在线用户:', onlineUsers);
            const otherUsers = onlineUsers.filter((user: string) => user !== userId);
            console.log('其他在线用户:', otherUsers);
            
            let content = '';
            if (otherUsers.length === 0) {
              content = '这个房间里面除了你没有其他人在线，不过你可以留言，他们看得到';
            } else {
              content = `这个房间里面有 ${otherUsers.join('、')} ${otherUsers.length > 1 ? '（共' + otherUsers.length + '人）' : ''} 在线`;
            }
            
            // 确保消息 ID 的唯一性
            const messageId = `online-list-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const newMessage: ExtendedReceiveMessage = {
              ...msg,
              content,
              isNew: true,
              id: messageId,
            };
            
            // 设置自动折叠
            setTimeout(() => {
              setCollapsedMessages(prev => new Set([...prev, messageId]));
            }, 5000);
            
            console.log('创建的系统消息:', newMessage);
            messages.push(newMessage);
            hasNewMessage = true;
            continue;
          } catch (e) {
            console.error('解析在线用户列表失败:', e, '原始内容:', msg.content);
          }
        }
        
        // 处理消息ID更新
        if (msg.type === 'message' && msg.messageId) {
          // 查找是否存在对应的临时消息
          const tempMessageIndex = messages.findIndex(
            m => m.userId === userId && 
            m.content === msg.content && 
            m.type === 'message' && 
            m.id?.startsWith('temp-')
          );
          
          if (tempMessageIndex !== -1) {
            // 更新临时消息的ID，并将isNew设为false
            messages[tempMessageIndex] = {
              ...messages[tempMessageIndex],
              id: msg.messageId,
              timestamp: msg.timestamp || messages[tempMessageIndex].timestamp,
              isNew: false // 直接设置为false，避免再次触发动画
            };
            continue;
          }
        }
        
        // 处理其他消息
        const exists = messages.some(
          (m) => m.id === msg.id || (m.timestamp === msg.timestamp && m.userId === msg.userId && m.content === msg.content)
        );

        if (!exists) {
          if ((msg.type === 'join' || msg.type === 'leave') && msg.timestamp < joinTimestamp) {
            continue;
          }
          
          // 确保每条消息都有唯一的 ID
          const messageId = msg.messageId || msg.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const newMsg = {
            ...msg,
            id: messageId,
            isNew: true
          } as ExtendedReceiveMessage;
          
          messages.push(newMsg);
          hasNewMessage = true;

          // 如果是系统消息，设置自动折叠
          if (msg.type === 'system' || msg.type === 'join' || msg.type === 'leave') {
            setTimeout(() => {
              setCollapsedMessages(prev => new Set([...prev, messageId]));
            }, 5000);
          }
        }

        // 处理新消息通知，使用isHistory参数
        if (!isHistory && document.hidden && msg.type === 'message' && msg.userId !== userId) {
          console.log('触发通知条件:', {
            isHistory,
            isHidden: document.hidden,
            msgType: msg.type,
            sender: msg.userId,
            currentUser: userId
          });

          // 更新标题
          const newCount = document.title.match(/^\((\d+)\)/) 
            ? Number(document.title.match(/^\((\d+)\)/)?.[1] || 0) + 1 
            : 1;
          document.title = `(${newCount}) ${APP_TITLE} - ${roomId}`;

          // 发送通知
          sendNotification(
            `来自 ${msg.userId} 的新消息`,
            msg.content
          );
        }
      }

      if (hasNewMessage) {
        // 如果是历史消息，使用auto行为立即滚动，否则使用平滑滚动
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ 
            behavior: isHistory ? 'auto' : 'smooth' 
          });
        }, isHistory ? 0 : 100);
      }

      // 在处理完所有消息后，只播放一次音效
      if (hasNewUserMessage) {
        playNotifySound();
      }

      return messages.sort((a, b) => a.timestamp - b.timestamp);
    });
  }, [userId, roomId, sendNotification, joinTimestamp]);

  // 处理消息动画
  useEffect(() => {
    const newMessages = document.querySelectorAll('.message[data-is-new="true"]');
    newMessages.forEach(msg => {
      const messageId = msg.getAttribute('data-message-id');
      if (!messageId) return;

      msg.classList.add('animate-new');
      
      // 动画结束后移除标记并更新React状态
      const onAnimationEnd = () => {
        msg.classList.remove('animate-new');
        msg.removeAttribute('data-is-new');
        
        // 更新React状态中的isNew标记
        setAllMessages(prev => 
          prev.map(m => 
            m.id === messageId 
              ? { ...m, isNew: false }
              : m
          )
        );
      };
      
      msg.addEventListener('animationend', onAnimationEnd, { once: true });
    });
  }, [allMessages]);

  const { isConnected, sendMessage } = useWebSocket({
    roomId: roomId as string,
    userId,
    onMessagesReceived: handleNewMessages,
  });

  const { uploading, error: uploadError, uploadFile } = useFileUpload({
    roomId: roomId as string,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); // 改为 auto 以便更快滚动
  }, [allMessages]);

  // 自动调整 textarea 高度
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
      throttledUpdateCustomCaretPosition();
    }
  }, [messageInput]); // 依赖 messageInput 保持，节流控制频率

  // useCallback 用于记忆 throttledUpdateCustomCaretPosition 函数本身
  const actualUpdateCustomCaretPosition = useCallback(() => {
    if (!inputRef.current || !showCustomCaret || !isInputFocused) return;

    const textarea = inputRef.current;
    const position = textarea.selectionStart;
    const coordinates = getCaretCoordinates(textarea, position);
    const scrollTop = textarea.scrollTop;
    const scrollLeft = textarea.scrollLeft;

    latestCoordsRef.current = {
      top: coordinates.top - scrollTop,
      left: (coordinates.left - scrollLeft) + 3,
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

  // 创建节流版本的更新函数
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

  // 修复useEffect依赖
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
      setUserId(nickInput.trim());
      setIsJoined(true);
      const currentTimestamp = Date.now();
      setJoinTimestamp(currentTimestamp);
      Cookies.set(USER_ID_COOKIE, nickInput.trim(), { expires: 30 });
    }
  };

  const handleEditMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingContent(content);
    setMessageInput(content);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingContent('');
    setMessageInput('');
  };

  const handleDeleteMessage = (messageId: string) => {
    if (window.confirm('确定要删除这条消息吗？')) {
      sendMessage({
        type: 'delete',
        messageId,
      });
    }
  };

  // 添加邀请命令处理函数
  const handleInviteCommand = async (email: string) => {
    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const errorMsg = '邮箱格式不正确，请使用正确的邮箱地址';
      setAllMessages(prev => [...prev, {
        id: `system-${Date.now()}`,
        type: 'system',
        content: errorMsg,
        userId: 'system',
        timestamp: Date.now(),
        roomId: roomId as string,
        isNew: true
      }]);
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inviterName: userId,
          recipientEmail: email,
          roomId: roomId
        }),
      });

      const data = await response.json();
      
      let message;
      if (data.success) {
        message = `已成功发送邀请邮件到 ${email}`;
      } else {
        message = `发送邀请邮件失败: ${data.error || '未知错误'}`;
      }

      // 添加系统消息显示结果
      setAllMessages(prev => [...prev, {
        id: `system-${Date.now()}`,
        type: 'system',
        content: message,
        userId: 'system',
        timestamp: Date.now(),
        roomId: roomId as string,
        isNew: true
      }]);

    } catch (error) {
      console.error('发送邀请邮件失败:', error);
      // 添加错误消息
      setAllMessages(prev => [...prev, {
        id: `system-${Date.now()}`,
        type: 'system',
        content: '发送邀请邮件失败，请稍后重试',
        userId: 'system',
        timestamp: Date.now(),
        roomId: roomId as string,
        isNew: true
      }]);
    }
  };

  // 添加更换名称的处理函数
  const handleNameChange = (newName: string) => {
    if (!newName.trim()) {
      setAllMessages(prev => [...prev, {
        id: `system-${Date.now()}`,
        type: 'system',
        content: '新名称不能为空',
        userId: 'system',
        timestamp: Date.now(),
        roomId: roomId as string,
        isNew: true
      }]);
      return;
    }

    const oldName = userId;
    // 更新 Cookie 和状态
    Cookies.set(USER_ID_COOKIE, newName.trim(), { expires: 30 });
    setUserId(newName.trim());

    // 发送系统消息
    sendMessage({
      type: 'system',
      content: JSON.stringify({
        action: 'rename',
        oldName: oldName,
        newName: newName.trim()
      })
    });

    // 添加本地系统消息
    setAllMessages(prev => [...prev, {
      id: `system-${Date.now()}`,
      type: 'system',
      content: `你已将名称从 ${oldName} 更改为 ${newName.trim()}`,
      userId: 'system',
      timestamp: Date.now(),
      roomId: roomId as string,
      isNew: true
    }]);
  };

  // 修改 handleSubmitMessage 函数
  const handleSubmitMessage = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (messageInput.trim()) {
      // 检查是否是更换名称命令
      const nameMatch = messageInput.trim().match(/^\/n(?:ame)?\s+(.+)$/);
      if (nameMatch) {
        const newName = nameMatch[1].trim();
        handleNameChange(newName);
        setMessageInput('');
        if (inputRef.current) {
          inputRef.current.style.height = 'auto';
        }
        return;
      }

      // 检查是否是邀请命令
      const inviteMatch = messageInput.trim().match(/^\/i\s+([^\s@]+@[^\s@]+\.[^\s@]+)$/);
      if (inviteMatch) {
        const email = inviteMatch[1];
        handleInviteCommand(email);
        setMessageInput('');
        if (inputRef.current) {
          inputRef.current.style.height = 'auto';
        }
        return;
      }

      // 播放发送消息音效
      sendSound?.play().catch(err => console.log('播放发送音效失败:', err));
      
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (editingMessageId) {
        // 发送编辑消息
        sendMessage({
          type: 'edit',
          messageId: editingMessageId,
          content: messageInput.trim(),
          originalContent: editingContent,
        });
        setEditingMessageId(null);
        setEditingContent('');
      } else {
        // 发送新消息，添加临时消息到列表
        const tempMessage: ExtendedReceiveMessage = {
          id: tempId,
          type: 'message',
          content: messageInput.trim(),
          userId: userId,
          timestamp: Date.now(),
          roomId: roomId as string,
          isNew: true
        };
        setAllMessages(prev => [...prev, tempMessage]);
        // 发送消息到服务器，包含临时ID
        sendMessage({
          type: 'message',
          content: messageInput.trim(),
          tempId: tempId
        });
      }
      setMessageInput('');
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
      setShowEmojiPicker(false);
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
          sendMessage({
            type: 'message',
            content: `[文件] ${file.name}`,
            fileMeta: fileMeta,
          });
        } else {
          console.error('文件上传失败，响应无效', response);
          // 可以考虑向用户显示一个错误消息
        }
      } catch (err) {
        console.error('文件上传处理错误:', err);
      }
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleEmojiSelect = (emoji: { url: string; emoji_id: string }) => {
    sendMessage({
      type: 'message',
      content: `[表情]`, // 用特定标记表示表情，渲染时处理
      fileMeta: {
        fileName: '表情', // 或者使用 emoji_id 作为文件名
        fileSize: 0, // 表情通常没有大小或大小可忽略
        mimeType: 'image/png', // 假设表情是 png
        url: emoji.url,
        emoji_id: emoji.emoji_id,
      },
    });
    setShowEmojiPicker(false);
  };

  // 更新 handleImageClick 为 handleMediaClick
  const handleMediaClick = (url: string, type: 'image' | 'video', isEmoji: boolean) => {
    if (!isEmoji) {
      setPreviewImage({ url, type });
    }
  };

  // 更新 renderMessageContent 函数中的媒体处理部分
  const renderMessageContent = (msg: ReceiveMessage, isCurrentUser: boolean) => {
    if (msg.fileMeta) {
      // 优先处理表情
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
      
      // 处理视频类型
      if (msg.fileMeta.mimeType?.startsWith('video/')) {
        return <VideoPreview msg={msg} onMediaClick={handleMediaClick} />;
      }
      
      // 处理图片类型
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
      
      // 处理其他文件
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
    
    // 处理@消息
    if (msg.content.includes('@')) {
      // 使用更精确的正则表达式匹配@用户名
      const parts = msg.content.split(/(@\S+)/).filter(Boolean);
      return (
        <span className="message-text">
          {parts.map((part, index) => {
            if (part.startsWith('@')) {
              // 移除可能的标点符号
              const username = part.slice(1).replace(/[.,!?，。！？、]$/, '');
              const isSelf = username === userId;
              return (
                <span
                  key={index}
                  className={`at-mention ${isSelf ? 'self' : ''}`}
                  onClick={() => {
                    if (inputRef.current) {
                      const currentValue = inputRef.current.value;
                      const atText = `@${username} `;
                      if (!currentValue.includes(atText)) {
                        setMessageInput(currentValue + atText);
                        inputRef.current.focus();
                      }
                    }
                  }}
                >
                  {part}
                </span>
              );
            }
            return <span key={index}>{part}</span>;
          })}
        </span>
      );
    }
    
    return <span className="message-text">{msg.content}</span>;
  };

  // 添加点击用户名@的处理函数
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

  // 处理右键点击
  const handleContextMenu = useCallback((e: React.MouseEvent, messageId: string, content: string) => {
    e.preventDefault();
    
    // 计算菜单位置，确保不会超出视窗
    let x = e.clientX;
    let y = e.clientY;
    
    const menuWidth = 160; // 菜单宽度
    const menuHeight = 88; // 菜单高度
    
    // 确保菜单不会超出右边界
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth;
    }
    
    // 确保菜单不会超出底部边界
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight;
    }

    // 移除之前可能存在的高亮
    const prevHighlighted = document.querySelector('.message[data-context-menu="true"]');
    if (prevHighlighted) {
      prevHighlighted.removeAttribute('data-context-menu');
    }
    
    // 添加高亮到当前消息
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.setAttribute('data-context-menu', 'true');
    }
    
    setContextMenu({ x, y, messageId, content });
  }, []);

  useEffect(() => {
    // 当右键菜单关闭时，移除高亮
    if (!contextMenu) {
      const highlightedMessage = document.querySelector('.message[data-context-menu="true"]');
      if (highlightedMessage) {
        highlightedMessage.removeAttribute('data-context-menu');
      }
    }
  }, [contextMenu]);

  const toggleMessageCollapse = useCallback((messageId: string) => {
    setCollapsedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  }, []);

  const renderSystemMessage = (msg: ExtendedReceiveMessage, messageKey: string) => {
    const isCollapsed = collapsedMessages.has(msg.id || messageKey);
    
    let messageType = 'SystemMessage';
    if (msg.type === 'join') {
      messageType = 'UserJoined';
    } else if (msg.type === 'leave') {
      messageType = 'UserLeft';
    } else if (msg.type === 'onlineList') {
      messageType = 'OnlineUsers';
    }

    let content = msg.content;
    if (msg.type === 'join') {
      content = `${msg.userId} 进入了房间`;
    } else if (msg.type === 'leave') {
      content = `${msg.userId} 离开了房间`;
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
          {isCollapsed ? (
            <span className="message-text"> {messageType}</span>
          ) : (
            <span className="message-text"> {content}</span>
          )}
        </div>
      </div>
    );
  };

  const renderMessage = (msg: ExtendedReceiveMessage) => {
    const isCurrentUser = msg.userId === userId;
    // 使用更可靠的方式生成 messageKey
    const messageKey = msg.id || `${msg.type}-${msg.timestamp}-${Math.random().toString(36).slice(2)}-${msg.userId}`;

    if (!isJoined && (msg.type === 'join' || msg.type === 'leave')) {
      return null;
    }

    if (msg.type === 'join' || msg.type === 'leave') {
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
          onContextMenu={isCurrentUser ? (e) => handleContextMenu(e, msg.id, msg.content) : undefined}
        >
          <div className={`message-content ${msg.fileMeta?.emoji_id ? 'image-content' : ''}`}>
            <span className="timestamp">[{new Date(msg.timestamp).toLocaleTimeString()}]</span>
            {!isCurrentUser && (
              <span 
                className="user-nick clickable" 
                onClick={() => handleUserNameClick(msg.userId)}
              >
                [{msg.userId}]
              </span>
            )}
            {isCurrentUser && (
              <span 
                className="user-nick self-nick clickable"
                onClick={() => handleUserNameClick(msg.userId)}
              >
                [{msg.userId}]
              </span>
            )}
            &nbsp;
            {renderMessageContent(msg, isCurrentUser)}
            {isCurrentUser && (
              <div className="message-actions">
                <button 
                  className="action-btn edit-btn"
                  onClick={() => handleEditMessage(msg.id!, msg.content)}
                  title="编辑消息"
                >
                  编辑
                </button>
                <button 
                  className="action-btn delete-btn"
                  onClick={() => handleDeleteMessage(msg.id!)}
                  title="删除消息"
                >
                  删除
                </button>
              </div>
            )}
            {msg.type === 'edit' || msg.isEdited ? (
              <span className="edit-indicator">(已编辑)</span>
            ) : null}
          </div>
        </div>
      );
    }

    return null;
  };

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // 更新光标位置
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
        setCaretPosition({
          left: offsetLeft + textWidth,
          top: offsetTop,
          height: offsetHeight
        });
      };
      updateCaretPosition();
      window.addEventListener('resize', updateCaretPosition);
      return () => window.removeEventListener('resize', updateCaretPosition);
    }
  }, [nickInput, showCustomCaret, isJoined]);

  // 在组件加载时立即请求通知权限
  useEffect(() => {
    if (isJoined) {
      console.log('组件加载，检查通知权限');
      requestNotificationPermission();
    }
  }, [isJoined, requestNotificationPermission]);

  const handleClipboardPaste = useCallback(async (e: ClipboardEvent) => {
    if (!isConnected || uploading) return;
    
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
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
              sendMessage({
                type: 'message',
                content: `[图片] ${file.name}`,
                fileMeta: fileMeta,
              });
            }
          } catch (err) {
            console.error('剪贴板图片上传失败:', err);
          }
        }
      } else if (item.type.startsWith('application/') || item.type.startsWith('text/')) {
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
              sendMessage({
                type: 'message',
                content: `[文件] ${file.name}`,
                fileMeta: fileMeta,
              });
            }
          } catch (err) {
            console.error('剪贴板文件上传失败:', err);
          }
        }
      }
    }
  }, [isConnected, uploading, uploadFile, sendMessage]);

  // 添加事件监听
  useEffect(() => {
    if (isJoined) {
      document.addEventListener('paste', handleClipboardPaste);
      return () => {
        document.removeEventListener('paste', handleClipboardPaste);
      };
    }
  }, [isJoined, handleClipboardPaste]);

  if (!isInitialized) {
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

  // 登录视图
  if (!isJoined) {
    return (
      <>
        <style jsx global>{imageContentStyle}</style>
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

  // 聊天主视图
  return (
    <>
      <style jsx global>{systemMessageStyle}</style>
      <style jsx global>{imageContentStyle}</style>
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
              placeholder={editingMessageId ? "编辑消息..." : "输入消息… (Shift+Enter 换行, Enter 发送, /i 邮箱 邀请, /n 新名称)"}
              value={messageInput}
              onChange={(e) => {
                setMessageInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && editingMessageId) {
                  e.preventDefault();
                  handleCancelEdit();
                } else {
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
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999
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