export interface AgoraTokenRequest {
  channelName: string;
  userId: string;
}

export interface AgoraTokenResponse {
  token: string;
  agoraUid: number;
  appId: string;
}

// 通过 WebSocket 向后端发送的语音频道操作消息
export interface VoiceChannelActionMessage {
  type: 'voice-channel-action';
  roomId: string;
  userId: string;
  agoraUid: number; // 用户在声网系统中的数字 UID
  action: 'notify-joined' | 'notify-left' | 'notify-muted' | 'notify-unmuted';
}

// 从后端接收到的语音频道状态更新消息
export interface VoiceChannelStateMessage {
  type: 'voice-channel-state';
  roomId: string;
  userId: string; // 应用内用户ID
  agoraUid: number; // 声网UID
  action: 'user-joined-voice' | 'user-left-voice' | 'user-muted-audio' | 'user-unmuted-audio';
  displayName?: string; // 可选，用于UI显示
  timestamp: number;
}

// 用于在前端跟踪语音频道成员及其状态
export interface VoiceParticipant {
  userId: string;        // 应用内用户ID
  agoraUid: number;      // 声网UID
  displayName?: string;  // 应用内用户昵称
  isTalking?: boolean;   // 是否正在说话 (可以通过SDK音量检测实现)
  isMuted: boolean;      // 是否已将自己的麦克风静音 (由用户主动操作)
  isLocal: boolean;      // 是否为本地用户
  audioTrack?: import('agora-rtc-sdk-ng').IMicrophoneAudioTrack | import('agora-rtc-sdk-ng').IRemoteAudioTrack; // 存储本地或远端用户的 AudioTrack
} 