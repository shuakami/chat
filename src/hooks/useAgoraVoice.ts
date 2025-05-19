import { useState, useEffect, useCallback, useRef } from 'react';
import AgoraRTC, { 
    IAgoraRTCClient, 
    IAgoraRTCRemoteUser, 
    IMicrophoneAudioTrack, 
    UID
} from 'agora-rtc-sdk-ng';
import { AgoraTokenRequest, AgoraTokenResponse, VoiceParticipant, VoiceChannelActionMessage } from '../../types/agora'; // Corrected import path

interface UseAgoraVoiceProps {
  roomId: string;
  userId: string; // 应用内的用户ID
  isJoinedChat: boolean; // 用户是否已经加入了文本聊天 (用于判断是否可以初始化语音)
  sendMessage: (type: 'voice-channel-action', content: VoiceChannelActionMessage, tempId?: string, fileMeta?: undefined) => void; 
  onVoiceStateUpdate?: (participants: VoiceParticipant[]) => void; // 回调函数，用于更新父组件的UI
}

interface UseAgoraVoiceReturn {
  joinVoiceChannel: () => Promise<void>;
  leaveVoiceChannel: () => Promise<void>;
  toggleMuteLocalAudio: () => void;
  localAudioTrack: IMicrophoneAudioTrack | null;
  remoteUsers: IAgoraRTCRemoteUser[];
  voiceParticipants: VoiceParticipant[]; // 维护参与者列表及其状态
  isJoiningVoice: boolean;
  isInVoiceChannel: boolean;
  isLocalAudioMuted: boolean;
  agoraClient: IAgoraRTCClient | null;
}

const useAgoraVoice = ({
  roomId,
  userId,
  isJoinedChat,
  sendMessage,
  onVoiceStateUpdate,
}: UseAgoraVoiceProps): UseAgoraVoiceReturn => {
  const agoraClientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  

  const [agoraSpecificUid, setAgoraSpecificUid] = useState<UID | null>(null); // Renamed from agoraUid to avoid confusion with prop userId if it were named agoraUid

  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>([]);

  const [isJoiningVoice, setIsJoiningVoice] = useState(false);
  const [isInVoiceChannel, setIsInVoiceChannel] = useState(false);
  const [isLocalAudioMuted, setIsLocalAudioMuted] = useState(false);

  // 初始化声网客户端的函数
  const initializeAgoraClient = useCallback(() => {
    if (!agoraClientRef.current) {
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      agoraClientRef.current = client;
      console.log('[Agora] Client created');
    }
    return agoraClientRef.current;
  }, []);

  // 获取 Token 和 AppID
  const fetchAgoraToken = useCallback(async (channelName: string, appUserId: string): Promise<AgoraTokenResponse | null> => {
    try {
      console.log(`[Agora] Fetching token for channel: ${channelName}, user: ${appUserId}`);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agora/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName, userId: appUserId } as AgoraTokenRequest),
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[Agora] Failed to fetch token:', errorData.error || response.statusText);
        throw new Error(`Failed to fetch Agora token: ${errorData.error || response.statusText}`);
      }
      const data: AgoraTokenResponse = await response.json();
      console.log('[Agora] Token fetched successfully:', data);

      setAgoraSpecificUid(data.agoraUid);
      return data;
    } catch (error) {
      console.error('[Agora] Error fetching token:', error);
      return null;
    }
  }, []);

  const updateVoiceParticipants = useCallback((updater: (prev: VoiceParticipant[]) => VoiceParticipant[]) => {
    setVoiceParticipants(updater);
    setVoiceParticipants(prevParticipants => {
        const newParticipants = updater(prevParticipants);
        if (onVoiceStateUpdate) {
            onVoiceStateUpdate(newParticipants);
        }
        return newParticipants;
    });
  }, [onVoiceStateUpdate]);

  // 加入语音频道
  const joinVoiceChannel = useCallback(async () => {
    if (!isJoinedChat || !userId || !roomId) {
      console.warn('[Agora] Cannot join voice channel: User not in chat or missing IDs.');
      return;
    }
    if (isInVoiceChannel || isJoiningVoice) {
      console.warn('[Agora] Already in voice channel or joining.');
      return;
    }

    console.log('[Agora] Attempting to join voice channel...');
    setIsJoiningVoice(true);

    const client = initializeAgoraClient();
    if (!client) {
        console.error('[Agora] Client not initialized');
        setIsJoiningVoice(false);
        return;
    }

    try {
      const tokenData = await fetchAgoraToken(roomId, userId);
      if (!tokenData) {
        throw new Error('Failed to get token data.');
      }

      await client.join(tokenData.appId, roomId, tokenData.token, tokenData.agoraUid);
      console.log(`[Agora] Joined channel ${roomId} successfully with UID ${tokenData.agoraUid}`);
      setIsInVoiceChannel(true);

      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      localAudioTrackRef.current = audioTrack;
      await client.publish([audioTrack]);
      console.log('[Agora] Local audio track published');

      const localParticipant: VoiceParticipant = {
        userId: userId,
        agoraUid: tokenData.agoraUid,
        isMuted: false,
        isLocal: true,
        displayName: userId, 
        audioTrack: audioTrack,
      };
      updateVoiceParticipants(() => [localParticipant]); // Pass updater function
      
      const joinMessage: VoiceChannelActionMessage = {
        type: 'voice-channel-action',
        roomId: roomId,
        userId: userId,
        agoraUid: tokenData.agoraUid,
        action: 'notify-joined',
      };
      // 调试日志
      console.log('[DEBUG][WS] 即将发送 voice-channel-action (notify-joined):', joinMessage);
      console.log('[DEBUG][WS] agoraUid:', joinMessage.agoraUid, '类型:', typeof joinMessage.agoraUid);
      sendMessage('voice-channel-action', joinMessage);
      console.log('[Agora] Sent notify-joined message via WebSocket');

    } catch (error) {
      console.error('[Agora] Failed to join channel or publish audio:', error);
      setIsInVoiceChannel(false);
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }
      if (client && (client.connectionState === 'CONNECTED' || client.connectionState === 'CONNECTING')) {
        await client.leave().catch(e => console.error('[Agora] Error leaving after failed join:', e));
      }
    } finally {
      setIsJoiningVoice(false);
    }
  }, [isJoinedChat, userId, roomId, isInVoiceChannel, isJoiningVoice, initializeAgoraClient, fetchAgoraToken, sendMessage, updateVoiceParticipants]);

  // 离开语音频道
  const leaveVoiceChannel = useCallback(async () => {
    const client = agoraClientRef.current;
    if (!client || !isInVoiceChannel) {
      console.warn('[Agora] Not in a voice channel or client not initialized.');
      return;
    }

    console.log('[Agora] Attempting to leave voice channel...');
    setIsJoiningVoice(true); 

    try {
      if (localAudioTrackRef.current) {
        await client.unpublish([localAudioTrackRef.current]);
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
        console.log('[Agora] Local audio track unpublished and closed');
      }

      await client.leave();
      console.log('[Agora] Left channel successfully');
      setIsInVoiceChannel(false);
      setRemoteUsers([]);
      updateVoiceParticipants((prev: VoiceParticipant[]) => prev.filter(p => !p.isLocal)); 

      if (agoraSpecificUid) { 
        const leaveMessage: VoiceChannelActionMessage = {
          type: 'voice-channel-action',
          roomId: roomId,
          userId: userId,
          agoraUid: agoraSpecificUid as number, 
          action: 'notify-left',
        };
        // 调试日志
        console.log('[DEBUG][WS] 即将发送 voice-channel-action (notify-left):', leaveMessage);
        console.log('[DEBUG][WS] agoraUid:', leaveMessage.agoraUid, '类型:', typeof leaveMessage.agoraUid);
        sendMessage('voice-channel-action', leaveMessage);
        console.log('[Agora] Sent notify-left message via WebSocket');
      }
      // setToken(null); // Not storing token in state
      setAgoraSpecificUid(null); 

    } catch (error) {
      console.error('[Agora] Failed to leave channel:', error);
    } finally {
      setIsJoiningVoice(false);
    }
  }, [isInVoiceChannel, agoraSpecificUid, roomId, userId, sendMessage, updateVoiceParticipants]);

  // 切换本地麦克风静音状态
  const toggleMuteLocalAudio = useCallback(async () => {
    if (localAudioTrackRef.current && isInVoiceChannel && agoraSpecificUid) {
      const currentMuteStatus = localAudioTrackRef.current.muted;
      await localAudioTrackRef.current.setMuted(!currentMuteStatus);
      setIsLocalAudioMuted(!currentMuteStatus);
      console.log(`[Agora] Local audio ${!currentMuteStatus ? 'muted' : 'unmuted'}`);

      updateVoiceParticipants((prev: VoiceParticipant[]) => 
        prev.map((p: VoiceParticipant) => p.isLocal ? { ...p, isMuted: !currentMuteStatus } : p)
      );

      const muteMessage: VoiceChannelActionMessage = {
        type: 'voice-channel-action',
        roomId: roomId,
        userId: userId,
        agoraUid: agoraSpecificUid as number,
        action: !currentMuteStatus ? 'notify-muted' : 'notify-unmuted',
      };
      // 调试日志
      console.log('[DEBUG][WS] 即将发送 voice-channel-action (mute/unmute):', muteMessage);
      console.log('[DEBUG][WS] agoraUid:', muteMessage.agoraUid, '类型:', typeof muteMessage.agoraUid);
      sendMessage('voice-channel-action', muteMessage);
      console.log(`[Agora] Sent ${!currentMuteStatus ? 'notify-muted' : 'notify-unmuted'} message`);
    }
  }, [isInVoiceChannel, agoraSpecificUid, roomId, userId, sendMessage, updateVoiceParticipants]);

  // 处理远端用户相关的事件
  useEffect(() => {
    const client = agoraClientRef.current;
    if (!client || !isInVoiceChannel) return;

    const handleUserPublished = async (
        user: IAgoraRTCRemoteUser,
        mediaType: 'audio' | 'video'
      ) => {
        console.log('[Agora] User published:', user.uid, mediaType);
      
        if (mediaType === 'audio') {
          try {
            // 订阅
            await client.subscribe(user, mediaType);
            console.log(`[Agora] Subscribed to remote user ${user.uid} audio`);
      
            // 订阅完成后 track 才会挂上去
            const remoteAudioTrack = user.audioTrack;
            if (remoteAudioTrack) {
              remoteAudioTrack.play();           // ③ 播放
              console.log(`[Agora] Playing remote user ${user.uid} audio`);
            } else {
              console.warn(`[Agora] audioTrack still undefined after subscribe for ${user.uid}`);
            }
      
            // 维护本地 state
            setRemoteUsers(prev => [...prev.filter(u => u.uid !== user.uid), user]);
            updateVoiceParticipants(prev => {
              const exists = prev.find(p => p.agoraUid === user.uid);
              if (exists) {
                return prev.map(p =>
                  p.agoraUid === user.uid
                    ? { ...p, audioTrack: remoteAudioTrack ?? undefined }
                    : p
                );
              }
              return [
                ...prev,
                {
                  userId: String(user.uid),
                  agoraUid: user.uid as number,
                  isMuted: false,
                  isLocal: false,
                  displayName: String(user.uid),
                  audioTrack: remoteAudioTrack ?? undefined,
                },
              ];
            });
          } catch (err) {
            console.error(`[Agora] subscribe/play failed for ${user.uid}:`, err);
          }
        }
      };
      

    const handleUserUnpublished = (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
      console.log(`[Agora] User unpublished: ${user.uid}, type: ${mediaType}`);
      if (mediaType === 'audio') {
        setRemoteUsers(prevUsers => prevUsers.filter(u => u.uid !== user.uid));
        updateVoiceParticipants((prev: VoiceParticipant[]) => 
          prev.map((p: VoiceParticipant) => p.agoraUid === user.uid ? { ...p, audioTrack: undefined } : p) 
        );
      }
    };

    const handleUserLeft = (user: IAgoraRTCRemoteUser, reason: string) => {
      console.log(`[Agora] User left: ${user.uid}, reason: ${reason}`);
      setRemoteUsers(prevUsers => prevUsers.filter(u => u.uid !== user.uid));
      updateVoiceParticipants((prev: VoiceParticipant[]) => prev.filter((p: VoiceParticipant) => p.agoraUid !== user.uid));
    };
    
    const handleUserMuteUpdate = (uid: UID, audioMuted: boolean) => {
        console.log(`[Agora] User mute update: ${uid}, audioMuted: ${audioMuted}`);
        updateVoiceParticipants((prev: VoiceParticipant[]) =>
            prev.map((p: VoiceParticipant) =>
                p.agoraUid === uid ? { ...p, isMuted: audioMuted } : p
            )
        );
    };

    client.on('user-published', handleUserPublished);
    client.on('user-unpublished', handleUserUnpublished);
    client.on('user-left', handleUserLeft);
    client.on('user-mute-update', handleUserMuteUpdate); // Added listener

    return () => {
      if (client) {
        client.off('user-published', handleUserPublished);
        client.off('user-unpublished', handleUserUnpublished);
        client.off('user-left', handleUserLeft);
        client.off('user-mute-update', handleUserMuteUpdate); // Removed listener
        console.log('[Agora] Event listeners cleaned up');
      }
    };
  }, [isInVoiceChannel, updateVoiceParticipants]);

  // 组件卸载时清理资源
  useEffect(() => {
    return () => {
      console.log('[Agora] Cleaning up useAgoraVoice hook...');
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
        console.log('[Agora] Local audio track closed on unmount');
      }
      const client = agoraClientRef.current; // Capture current value for cleanup
      if (client) {
        if (client.connectionState === 'CONNECTED') {
            client.leave()
                .then(() => console.log('[Agora] Left channel on unmount'))
                .catch(e => console.error('[Agora] Error leaving channel on unmount:', e));
        }
        agoraClientRef.current = null; 
        console.log('[Agora] Client reference released on unmount');
      }
    };
  }, []);

  return {
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMuteLocalAudio,
    localAudioTrack: localAudioTrackRef.current,
    remoteUsers,
    voiceParticipants,
    isJoiningVoice,
    isInVoiceChannel,
    isLocalAudioMuted,
    agoraClient: agoraClientRef.current,
  };
};

export default useAgoraVoice; 