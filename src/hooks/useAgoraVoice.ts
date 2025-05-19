import { useState, useEffect, useCallback, useRef } from 'react';
import AgoraRTC, { 
    IAgoraRTCClient, 
    IAgoraRTCRemoteUser, 
    IMicrophoneAudioTrack, 
    UID
} from 'agora-rtc-sdk-ng';
import { AgoraTokenRequest, AgoraTokenResponse, VoiceParticipant, VoiceChannelActionMessage } from '../../types/agora';

interface UseAgoraVoiceProps {
  roomId: string;
  userId: string;
  isJoinedChat: boolean;
  sendMessage: (type: 'voice-channel-action', content: VoiceChannelActionMessage, tempId?: string, fileMeta?: undefined) => void; 
  onVoiceStateUpdate?: (participants: VoiceParticipant[]) => void;
}

interface UseAgoraVoiceReturn {
  joinVoiceChannel: () => Promise<void>;
  leaveVoiceChannel: () => Promise<void>;
  toggleMuteLocalAudio: () => void;
  localAudioTrack: IMicrophoneAudioTrack | null;
  remoteUsers: IAgoraRTCRemoteUser[];
  voiceParticipants: VoiceParticipant[];
  isJoiningVoice: boolean;
  isInVoiceChannel: boolean;
  isLocalAudioMuted: boolean;
  agoraClient: IAgoraRTCClient | null;
}

// ============ 工具函数 =============
function playSound(path: string, volume = 0.6) {
  const audio = new Audio(path);
  audio.volume = volume;
  audio.play().catch(() => {});
}
// ==================================

const useAgoraVoice = ({
  roomId,
  userId,
  isJoinedChat,
  sendMessage,
  onVoiceStateUpdate,
}: UseAgoraVoiceProps): UseAgoraVoiceReturn => {
  const agoraClientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);

  const [agoraSpecificUid, setAgoraSpecificUid] = useState<UID | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>([]);
  const [isJoiningVoice, setIsJoiningVoice] = useState(false);
  const [isInVoiceChannel, setIsInVoiceChannel] = useState(false);
  const [isLocalAudioMuted, setIsLocalAudioMuted] = useState(false);

  const initializeAgoraClient = useCallback(() => {
    if (!agoraClientRef.current) {
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      agoraClientRef.current = client;
      console.log('[Agora] Client created');
    }
    return agoraClientRef.current;
  }, []);

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

      playSound('/join.wav', 0.6);

      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        AEC: true,
        AGC: true,
        ANS: true,
        encoderConfig: {
          sampleRate: 48000,
          bitrate: 40,
          stereo: false
        }
      });
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
      updateVoiceParticipants(() => [localParticipant]);
      const joinMessage: VoiceChannelActionMessage = {
        type: 'voice-channel-action',
        roomId: roomId,
        userId: userId,
        agoraUid: tokenData.agoraUid,
        action: 'notify-joined',
      };
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
      playSound('/leave.wav', 0.6);
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
        sendMessage('voice-channel-action', leaveMessage);
        console.log('[Agora] Sent notify-left message via WebSocket');
      }
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
      sendMessage('voice-channel-action', muteMessage);
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
            await client.subscribe(user, mediaType);
            // ====== 其他人进来时，播放提示音 ======
            if (user.uid !== agoraSpecificUid) {
              playSound('/join.wav', 0.6);
            }
            const remoteAudioTrack = user.audioTrack;
            if (remoteAudioTrack) {
              remoteAudioTrack.play();
            }
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

    const handleUserLeft = (user: IAgoraRTCRemoteUser) => {
      // ====== 其他人离开时，播放提示音 ======
      if (user.uid !== agoraSpecificUid) {
        playSound('/leave.wav', 0.6);
      }
      setRemoteUsers(prevUsers => prevUsers.filter(u => u.uid !== user.uid));
      updateVoiceParticipants((prev: VoiceParticipant[]) => prev.filter((p: VoiceParticipant) => p.agoraUid !== user.uid));
    };
    
    const handleUserMuteUpdate = (uid: UID, audioMuted: boolean) => {
        updateVoiceParticipants((prev: VoiceParticipant[]) =>
            prev.map((p: VoiceParticipant) =>
                p.agoraUid === uid ? { ...p, isMuted: audioMuted } : p
            )
        );
    };

    client.on('user-published', handleUserPublished);
    client.on('user-unpublished', handleUserUnpublished);
    client.on('user-left', handleUserLeft);
    client.on('user-mute-update', handleUserMuteUpdate);

    return () => {
      if (client) {
        client.off('user-published', handleUserPublished);
        client.off('user-unpublished', handleUserUnpublished);
        client.off('user-left', handleUserLeft);
        client.off('user-mute-update', handleUserMuteUpdate);
      }
    };
  }, [isInVoiceChannel, updateVoiceParticipants, agoraSpecificUid]);

  useEffect(() => {
    return () => {
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }
      const client = agoraClientRef.current;
      if (client) {
        if (client.connectionState === 'CONNECTED') {
            client.leave()
                .then(() => {})
                .catch(() => {});
        }
        agoraClientRef.current = null; 
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
