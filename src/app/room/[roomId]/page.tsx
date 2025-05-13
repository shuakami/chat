'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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

// 扩展ReceiveMessage类型
interface ExtendedReceiveMessage extends ReceiveMessage {
  deleting?: boolean;
  isNew?: boolean;
}

const USER_ID_COOKIE = 'chat_user_id';
const APP_VERSION = '1.0.1';

const imageContentStyle = `
  .image-content:hover {
    background: transparent !important;
  }
`;

// 添加图片预览模态框组件
const ImagePreview = ({ src, onClose }: { src: string; onClose: () => void }) => {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]">
        <button
          className="absolute top-4 right-4 text-white hover:text-gray-300 z-50"
          onClick={onClose}
        >
          关闭
        </button>
        <a 
          href={src} 
          download 
          className="absolute top-4 left-4 text-white hover:text-gray-300 z-50"
          onClick={e => e.stopPropagation()}
        >
          下载
        </a>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="预览"
          className="max-w-full max-h-[90vh] object-contain"
          onClick={e => e.stopPropagation()}
        />
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

export default function ChatRoom() {
  const { roomId } = useParams();
  const [isInitialized, setIsInitialized] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [userIdInput, setUserIdInput] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [joinTimestamp, setJoinTimestamp] = useState<number>(0);
  const [messageInput, setMessageInput] = useState('');
  const [allMessages, setAllMessages] = useState<ExtendedReceiveMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
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

  useEffect(() => {
    const savedUserId = Cookies.get(USER_ID_COOKIE);
    if (savedUserId) {
      setUserId(savedUserId);
      setIsJoined(true);
      setJoinTimestamp(Date.now());
    }
    setIsInitialized(true);
  }, []);

  const handleNewMessages = useCallback((newMessages: ReceiveMessage[]) => {
    setAllMessages((prevMessages) => {
      const messages = [...prevMessages] as ExtendedReceiveMessage[];
      let hasNewMessage = false;
      
      for (const msg of newMessages) {
        // 处理删除消息
        if (msg.type === 'delete') {
          const messageToDelete = messages.find(m => m.id === msg.messageId);
          if (messageToDelete) {
            messageToDelete.deleting = true;
            setTimeout(() => {
              setAllMessages(prev => prev.filter(m => m.id !== msg.messageId));
            }, 300);
          }
          continue;
        }
        
        // 处理系统消息中的删除和编辑确认
        if (msg.type === 'system' && msg.userId === 'system') {
          try {
            const actionData = JSON.parse(msg.content);
            
            if (actionData.action === 'delete') {
              const messageToDelete = messages.find(m => m.id === actionData.messageId);
              if (messageToDelete) {
                messageToDelete.deleting = true;
                setTimeout(() => {
                  setAllMessages(prev => prev.filter(m => m.id !== actionData.messageId));
                }, 300);
              }
              continue;
            }
            
            if (actionData.action === 'edit') {
              const newMessage = actionData.newMessage;
              const index = messages.findIndex(m => m.id === actionData.messageId);
              if (index !== -1) {
                messages[index] = {
                  ...messages[index],
                  content: newMessage.content,
                  timestamp: newMessage.timestamp,
                  type: 'edit'
                };
              }
              continue;
            }
          } catch (e) {
            console.error('Failed to parse system message:', e);
          }
        }

        // 处理其他消息
        const exists = messages.some(
          (m) => m.timestamp === msg.timestamp && m.userId === msg.userId && m.content === msg.content
        );

        if (!exists) {
          if ((msg.type === 'join' || msg.type === 'leave') && msg.timestamp < joinTimestamp) {
            continue;
          }
          
          messages.push({
            ...msg,
            isNew: true
          } as ExtendedReceiveMessage);
          hasNewMessage = true;
        }
      }

      if (hasNewMessage) {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }

      return messages.sort((a, b) => a.timestamp - b.timestamp);
    });
  }, [joinTimestamp]);

  // 处理消息动画
  useEffect(() => {
    const newMessages = document.querySelectorAll('.message[data-is-new="true"]');
    newMessages.forEach(msg => {
      msg.classList.add('animate-new');
      // 动画结束后移除标记
      const onAnimationEnd = () => {
        msg.classList.remove('animate-new');
        msg.removeAttribute('data-is-new');
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
    if (inputRef.current && showCustomCaret && isInputFocused) {
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
    }
  }, [showCustomCaret, isInputFocused]);

  // 创建节流版本的更新函数，每 20ms 更新一次
  const throttledUpdateCustomCaretPosition = useCallback(
    throttle(actualUpdateCustomCaretPosition, 20, { leading: true, trailing: true }),
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

  // 监听selection change来更新光标
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

  const handleJoinRoom = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (userIdInput.trim()) {
      const newUserId = userIdInput.trim();
      setUserId(newUserId);
      setIsJoined(true);
      const currentTimestamp = Date.now();
      setJoinTimestamp(currentTimestamp); // 确保在加入时设置时间戳
      Cookies.set(USER_ID_COOKIE, newUserId, { expires: 30 });
      // 发送加入消息，但不显示给自己
      // sendMessage({ type: 'join', content: `${newUserId} 加入了房间。` });
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

  const handleSubmitMessage = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (messageInput.trim()) {
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
        // 发送新消息
        sendMessage({
          type: 'message',
          content: messageInput.trim(),
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

  const handleImageClick = (url: string, isEmoji: boolean) => {
    if (!isEmoji) {
      setPreviewImage(url);
    }
  };

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
      
      // 处理图片类型的文件
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
              onClick={() => handleImageClick(msg.fileMeta!.url, false)}
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
    return <span className="message-text">{msg.content}</span>;
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

  const renderMessage = (msg: ExtendedReceiveMessage) => {
    const isCurrentUser = msg.userId === userId;
    const messageKey = `${msg.type}-${msg.timestamp}-${msg.userId}-${msg.content?.slice(0,10)}`;

    if (!isJoined && (msg.type === 'join' || msg.type === 'leave')) {
      return null;
    }

    if (msg.type === 'join' || msg.type === 'leave') {
      if (msg.userId === userId && msg.type === 'join') return null;
      if (msg.timestamp < joinTimestamp) return null; 
      return (
        <div 
          key={messageKey} 
          className="message system-msg" 
          data-is-new={msg.isNew}
          data-deleting={msg.deleting}
        >
          <span className="timestamp">[{new Date(msg.timestamp).toLocaleTimeString()}]</span>
          <span className="message-text">{msg.content}</span>
        </div>
      );
    }

    if (msg.type === 'system' || msg.type === 'error') {
      return (
        <div 
          key={messageKey} 
          className="message system-msg" 
          data-is-new={msg.isNew}
          data-deleting={msg.deleting}
        >
          <span className="timestamp">[{new Date(msg.timestamp).toLocaleTimeString()}]</span>
          <span className="message-text">{msg.content}</span>
        </div>
      );
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
            {!isCurrentUser && <span className="user-nick">[{msg.userId}]</span>}
            {isCurrentUser && <span className="user-nick self-nick">[{msg.userId}]</span>}
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
            {msg.type === 'edit' && (
              <span className="edit-indicator">(已编辑)</span>
            )}
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
        <section id="login-form" className="terminal">
          <div className="terminal-content">
            <div className="message system-msg" data-is-new={true}>Private Chat Terminal v{APP_VERSION}</div>
            <div className="message system-msg" data-is-new={true}>使用此客户端以使您在无法访问 Private 的情况下正常聊天</div>
            <div className="message system-msg" data-is-new={true}>当前房间: {roomId}</div>
            
            <form onSubmit={handleJoinRoom}>
              <div className="input-line">
                <span className="prompt">$</span>
                <input 
                  id="nick-input" 
                  className="input-field"
                  type="text" 
                  placeholder="输入昵称后回车…"
                  value={userIdInput}
                  onChange={(e) => setUserIdInput(e.target.value)}
                  autoComplete="off"
                  required 
                />
              </div>
              <button type="submit" style={{display: 'none'}}>Join</button>
            </form>
          </div>
        </section>
      </>
    );
  }

  // 聊天主视图
  return (
    <>
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
              placeholder={editingMessageId ? "编辑消息..." : "输入消息… (Shift+Enter 换行, Enter 发送)"}
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
        <ImagePreview 
          src={previewImage} 
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