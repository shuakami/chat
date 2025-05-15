import { useState, useCallback } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useFileUpload } from '@/hooks/useFileUpload';
import { ReceiveMessage, FileMeta, MessageType } from '@/types/chat';

// 从 page.tsx 复制过来的接口定义
export interface ExtendedReceiveMessage extends ReceiveMessage {
  deleting?: boolean;
  isNew?: boolean;
  isEdited?: boolean;
  editing?: boolean;
  messageId?: string;
  id: string;
  roomId: string;
  timestamp: number;
}

export interface ChatMessageHookProps {
  roomId: string;
  currentUserId: string; // 当前活跃的userId，可能通过 /nick 更改
  initialWsUserId: string; // 用于WebSocket连接的userId，加入后固定
  joinTimestamp: number;
}

export interface LastMessageBatchDetails {
  newUserMessageForSound: boolean;
  notificationPayload: { userId: string; content: string } | null;
  batchProcessedCounter: number; // 用于确保useEffect能正确触发
}

export function useChatMessageHook({
  roomId,
  currentUserId,
  initialWsUserId,
  joinTimestamp,
}: ChatMessageHookProps) {
  const [allMessages, setAllMessages] = useState<ExtendedReceiveMessage[]>([]);
  const [onlineUserNicks, setOnlineUserNicks] = useState<string[]>([]);
  const [collapsedMessages, setCollapsedMessages] = useState<Set<string>>(new Set());
  const [lastMessageBatchDetails, setLastMessageBatchDetails] = useState<LastMessageBatchDetails>({
    newUserMessageForSound: false,
    notificationPayload: null,
    batchProcessedCounter: 0,
  });

  const handleNewMessagesInternal = useCallback(
    (newReceivedMessages: ReceiveMessage[], isHistory?: boolean) => {
      console.log('收到新消息 (hook):', newReceivedMessages, '是否是历史消息:', isHistory, '当前用户 (hook):', currentUserId);

      let hasNewUserMessageOverallInBatch = false;
      let latestNotificationPayloadInBatch: { userId: string; content: string } | null = null;

      setAllMessages((prevMessages) => {
        const messages = [...prevMessages] as ExtendedReceiveMessage[];
        // let hasNewMessageInLoop = false; // 用于判断是否需要滚动，滚动逻辑在组件中

        for (const msg of newReceivedMessages) {
          if (!isHistory && msg.type === 'message' && msg.userId !== currentUserId) {
            hasNewUserMessageOverallInBatch = true;
            latestNotificationPayloadInBatch = { userId: msg.userId, content: msg.content };
          }

          if (msg.type === 'system') {
            try {
              const systemAction = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;

              if (systemAction.action === 'deleteAll' && systemAction.userId) {
                console.log('处理批量删除消息 (hook):', systemAction);
                messages.forEach(m => {
                  if (m.userId === systemAction.userId) {
                    m.deleting = true;
                  }
                });
                setTimeout(() => {
                  setAllMessages(prev => prev.filter(m => m.userId !== systemAction.userId));
                }, 300);
                const systemMsg: ExtendedReceiveMessage = {
                  id: `system-${Date.now()}`,
                  type: 'system',
                  content: `${systemAction.userId} 的 ${systemAction.count} 条消息已被删除`,
                  userId: 'system',
                  timestamp: Date.now(),
                  roomId: roomId,
                  isNew: true,
                };
                messages.push(systemMsg);
                // hasNewMessageInLoop = true;
                continue;
              }

              if (systemAction.action === 'delete' && systemAction.messageId) {
                console.log('处理删除消息 (hook):', systemAction);
                const messageIndex = messages.findIndex(m => m.id === systemAction.messageId);
                if (messageIndex !== -1) {
                  messages[messageIndex] = { ...messages[messageIndex], deleting: true };
                  setTimeout(() => {
                    setAllMessages(prev => prev.filter(m => m.id !== systemAction.messageId));
                  }, 300);
                }
                continue;
              }

              if (systemAction.action === 'edit' && systemAction.messageId && systemAction.newMessage) {
                console.log('处理编辑消息 (hook):', systemAction);
                const messageIndex = messages.findIndex(m => m.id === systemAction.messageId);
                if (messageIndex !== -1) {
                  const oldMessage = messages[messageIndex];
                  messages[messageIndex] = { ...oldMessage, editing: true };
                  setTimeout(() => {
                    setAllMessages(prev => {
                      const newMsgs = [...prev];
                      const targetIdx = newMsgs.findIndex(m => m.id === systemAction.messageId);
                      if (targetIdx !== -1) {
                        newMsgs[targetIdx] = {
                          ...newMsgs[targetIdx], // 保留旧消息的deleting等状态
                          content: systemAction.newMessage.content,
                          timestamp: systemAction.newMessage.timestamp,
                          userId: systemAction.newMessage.userId,
                          isEdited: true,
                          editing: true, // 保持编辑状态用于动画
                        };
                      }
                      return newMsgs;
                    });
                    setTimeout(() => {
                      setAllMessages(prev =>
                        prev.map(m => m.id === systemAction.messageId ? { ...m, editing: false } : m)
                      );
                    }, 1500); // 动画时间 + 移除编辑状态
                  }, 50);
                }
                continue;
              }
            } catch (e) {
              console.error('解析系统消息失败 (hook):', e, '原始消息:', msg);
            }
          }

          if (msg.type === 'onlineList' && msg.userId === 'system') {
            console.log('处理在线用户列表 (hook):', msg);
            try {
              const onlineUsersRaw = JSON.parse(msg.content);
              const otherUserNicks = onlineUsersRaw.filter((nick: string) => nick !== currentUserId);
              setOnlineUserNicks(otherUserNicks); // 更新 onlineUserNicks 状态
              
              let content = '';
              if (otherUserNicks.length === 0) {
                content = '这个房间里面除了你没有其他人在线，不过你可以留言，他们看得到';
              } else {
                content = `这个房间里面有 ${otherUserNicks.join('、')} ${otherUserNicks.length > 1 ? '（共' + otherUserNicks.length + '人）' : ''} 在线`;
              }
              const messageId = `online-list-${Date.now()}-${Math.random().toString(36).slice(2)}`;
              const newMessage: ExtendedReceiveMessage = {
                ...(msg as ExtendedReceiveMessage), // 类型断言
                content,
                isNew: true,
                id: messageId,
                roomId: roomId, // 确保roomId存在
              };
              setTimeout(() => {
                setCollapsedMessages(prev => new Set([...prev, messageId]));
              }, 5000);
              messages.push(newMessage);
              // hasNewMessageInLoop = true;
              continue;
            } catch (e) {
              console.error('解析在线用户列表失败 (hook):', e, '原始内容:', msg.content);
            }
          }

          if (msg.type === 'message' && msg.messageId) {
            const tempMessageIndex = messages.findIndex(
              m => m.userId === currentUserId && // 确保是当前用户发送的临时消息
              m.content === msg.content &&
              m.type === 'message' &&
              m.id?.startsWith('temp-')
            );
            if (tempMessageIndex !== -1) {
              messages[tempMessageIndex] = {
                ...messages[tempMessageIndex],
                id: msg.messageId,
                timestamp: msg.timestamp || messages[tempMessageIndex].timestamp,
                isNew: false, // 已确认，不再是新消息动画目标
              };
              continue;
            }
          }

          const exists = messages.some(
            (m) => m.id === msg.id || (m.timestamp === msg.timestamp && m.userId === msg.userId && m.content === msg.content)
          );

          if (!exists) {
            if ((msg.type === 'join' || msg.type === 'leave') && msg.timestamp < joinTimestamp) {
              continue;
            }
            const messageId = msg.messageId || msg.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const newMsgToAdd = {
              ...(msg as ExtendedReceiveMessage), // 类型断言
              id: messageId,
              isNew: true,
              roomId: roomId, // 确保roomId存在
            };
            messages.push(newMsgToAdd);
            // hasNewMessageInLoop = true;

            if (msg.type === 'system' || msg.type === 'join' || msg.type === 'leave') {
              setTimeout(() => {
                setCollapsedMessages(prev => new Set([...prev, messageId]));
              }, 5000);
            }
          }
        }
        // return messages.sort((a, b) => a.timestamp - b.timestamp);
        try {
          return messages.sort((a, b) => {
            const tsA = Number(a.timestamp);
            const tsB = Number(b.timestamp);
            
            if (isNaN(tsA) && isNaN(tsB)) return 0; // 如果两者都是NaN，视为相等
            if (isNaN(tsA)) return 1; // 无效时间戳的a排在后面
            if (isNaN(tsB)) return -1; // 无效时间戳的b排在后面 (即a排在前面)
            
            return tsA - tsB;
          });
        } catch (e) {
          console.error("Error during messages.sort:", e, 
                        "Messages array snapshot before sort (sample):", 
                        JSON.stringify(messages.slice(0, 5).map(m => ({id: m.id, ts: m.timestamp, content: m.content?.substring(0,10)})))); // Log sample for brevity
          // 如果排序出错，返回当前已修改（但未排序）的 messages 数组，以保留本轮处理的更新
          return messages; 
        }
      });

      setLastMessageBatchDetails(prev => ({
        newUserMessageForSound: hasNewUserMessageOverallInBatch,
        notificationPayload: latestNotificationPayloadInBatch,
        batchProcessedCounter: prev.batchProcessedCounter + 1,
      }));
    },
    [currentUserId, roomId, joinTimestamp] // setOnlineUserNicks, setCollapsedMessages 已经是稳定的
  );

  const { isConnected, sendMessage: wsSendMessage } = useWebSocket({
    roomId,
    userId: initialWsUserId, // WebSocket使用初始ID
    onMessagesReceived: handleNewMessagesInternal,
  });

  const { uploading, error: uploadError, uploadFile } = useFileUpload({
    roomId,
  });

  const sendMessage = useCallback(
    (type: MessageType, content: string, tempId?: string, fileMeta?: FileMeta, messageId?: string, originalContent?: string) => {
      wsSendMessage({ type, content, tempId, fileMeta, messageId, originalContent });
    },
    [wsSendMessage]
  );

  const deleteMessageOnServer = useCallback(
    (messageId: string) => {
      wsSendMessage({ type: 'delete', messageId });
    },
    [wsSendMessage]
  );

  const editMessageOnServer = useCallback(
    (messageId: string, newContent: string, originalContent?: string) => {
      wsSendMessage({ type: 'edit', messageId: messageId, content: newContent, originalContent });
    },
    [wsSendMessage]
  );

  const deleteAllMessagesOnServer = useCallback(() => {
    wsSendMessage({ type: 'deleteAll' });
  }, [wsSendMessage]);

  const addSystemMessage = useCallback(
    (content: string) => {
      const systemMsg: ExtendedReceiveMessage = {
        id: `system-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: 'system',
        content,
        userId: 'system',
        timestamp: Date.now(),
        roomId: roomId,
        isNew: true,
      };
      setAllMessages(prev => [...prev, systemMsg].sort((a, b) => a.timestamp - b.timestamp));
      setTimeout(() => {
        setCollapsedMessages(prev => {
          const newSet = new Set(prev);
          newSet.add(systemMsg.id);
          return newSet;
        });
      }, 5000);
    },
    [roomId]
  );

  const addOptimisticMessage = useCallback(
    (content: string, tempId: string, messageUserId: string, fileMeta?: FileMeta) => {
      const tempMessage: ExtendedReceiveMessage = {
        id: tempId,
        type: 'message', // Assuming optimistic messages are always of type 'message'
        content,
        userId: messageUserId,
        timestamp: Date.now(),
        roomId: roomId,
        isNew: true, // 用于动画
        fileMeta: fileMeta,
      };
      setAllMessages(prev => [...prev, tempMessage].sort((a, b) => a.timestamp - b.timestamp));
    },
    [roomId]
  );

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

  return {
    allMessages,
    setAllMessages, // 暴露给 page.tsx 用于清除 isNew 动画标记
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
  };
}
