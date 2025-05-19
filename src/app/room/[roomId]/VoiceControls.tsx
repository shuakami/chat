import React, { useState, useEffect, useRef } from 'react';
import useAgoraVoice from '@/hooks/useAgoraVoice';
import type { VoiceParticipant, VoiceChannelActionMessage } from '../../../../types/agora';
import type { MessageType } from '@/types/chat';

interface VoiceControlsProps {
  roomId: string;
  userId: string;
  isJoined: boolean;
  isConnected: boolean;
  sendMessage: (type: MessageType, content: string) => void;
  voiceParticipants: VoiceParticipant[];
  setVoiceParticipants: (v: VoiceParticipant[]) => void;
}

const VoiceControls: React.FC<VoiceControlsProps> = ({
  roomId,
  userId,
  isJoined,
  isConnected,
  sendMessage,
  voiceParticipants,
}) => {
  const [showVoicePanel, setShowVoicePanel] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const agoraVoice = useAgoraVoice({
    roomId,
    userId,
    isJoinedChat: isJoined,
    sendMessage: (type: 'voice-channel-action', content: VoiceChannelActionMessage) => sendMessage(type as MessageType, JSON.stringify(content)),
    onVoiceStateUpdate: undefined,
  });

  const handleJoinVoice = async () => {
    await agoraVoice.joinVoiceChannel();
  };
  const handleLeaveVoice = async () => {
    await agoraVoice.leaveVoiceChannel();
  };
  const handleToggleMute = async () => {
    await agoraVoice.toggleMuteLocalAudio();
  };

  const handleClosePanel = () => {
    if (isClosing) return;
    setIsClosing(true);
  };

  useEffect(() => {
    if (isClosing && panelRef.current) {
      const animationDuration = 200;
      const timer = setTimeout(() => {
        setShowVoicePanel(false);
        setIsClosing(false);
      }, animationDuration);
      return () => clearTimeout(timer);
    }
  }, [isClosing]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showVoicePanel && !isClosing && panelRef.current && !panelRef.current.contains(event.target as Node)) {
        handleClosePanel();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showVoicePanel, isClosing]);

  return (
    <>
      <div className="relative">
        <button
          type="button"
          className="terminal-button"
          onClick={() => {
            if (showVoicePanel) {
              handleClosePanel();
            } else {
              setShowVoicePanel(true);
            }
          }}
          style={{ minWidth: 36 }}
          title="查看语音成员"
          disabled={!isConnected}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--terminal-highlight, #0f0)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
            <circle cx="12" cy="12" r="10" />
            <path d="M8 15c1.333-2 6.667-2 8 0" />
            <circle cx="9" cy="10" r="1" />
            <circle cx="15" cy="10" r="1" />
          </svg>
        </button>
        {showVoicePanel && (
          <div
            ref={panelRef}
            className={`terminal-emoji-picker voice-member-popover ${isClosing ? 'closing' : ''}`}
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 10px)',
              right: 0,
              zIndex: 1000,
              width: 320,
              height: 'auto',
              minHeight: 120,
              maxHeight: 280,
              display: 'flex',
              flexDirection: 'column',
              padding: '0.75rem',
              transformOrigin: 'bottom right',
            }}
            tabIndex={0}
            onClick={e => e.stopPropagation()}
          >
            <div className="terminal-emoji-header" style={{ marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="prompt" style={{ fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: 0.5 }}>语音成员</span>
                <button
                  className="terminal-button"
                  style={{
                    minWidth: 'auto',
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.8rem',
                    lineHeight: '1',
                  }}
                  onClick={handleClosePanel}
                >
                  关闭
                </button>
              </div>
            </div>
            <div 
              className="terminal-emoji-grid"
              style={{ 
                height: 'auto',
                padding: '0.25rem',
              }}
            >
              {voiceParticipants.length === 0 ? (
                <div className="terminal-empty" style={{ height: 'auto', padding: '1rem 0' }}>
                  &gt; 暂无语音成员
                </div>
              ) : (
                <div className="terminal-grid" style={{ gridTemplateColumns: '1fr', gap: '0.35rem' }}>
                  {voiceParticipants.map((p) => (
                    <div
                      key={p.userId} 
                      className="terminal-emoji-item"
                      style={{
                        padding: '0.4rem 0.6rem',
                        background: p.isLocal ? 'var(--terminal-highlight-bg-secondary, rgba(0, 255, 0, 0.05))' : 'transparent',
                        border: p.isLocal ? '1px solid var(--terminal-highlight, #0f0)' : '1px solid transparent',
                        justifyContent: 'flex-start',
                        gap: '0.75rem',
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.isMuted ? 'var(--terminal-text-dim, #888)' : 'var(--terminal-success, #34d399)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1v22M19 8l-7 7-7-7" />
                      </svg>
                      <span style={{ color: p.isLocal ? 'var(--terminal-highlight, #0f0)' : 'var(--terminal-text, #fff)', fontWeight: p.isLocal ? 600 : 400, fontSize: '0.85rem' }}>
                        {p.displayName || p.userId}
                      </span>
                      {p.isMuted && <span style={{ color: 'var(--terminal-error, #f87171)', marginLeft: 'auto', fontSize: '0.75rem' }}>(静音)</span>}
                      {p.isLocal && !p.isMuted && <span style={{ color: 'var(--terminal-highlight, #0f0)', marginLeft: 'auto', fontSize: '0.75rem' }}>(你)</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {agoraVoice.isInVoiceChannel ? (
        <button className="terminal-button" onClick={handleLeaveVoice} disabled={agoraVoice.isJoiningVoice}>
          离开语音
        </button>
      ) : (
        <button className="terminal-button" onClick={handleJoinVoice} disabled={agoraVoice.isJoiningVoice || !isConnected}>
          加入语音
        </button>
      )}
      {agoraVoice.isInVoiceChannel && (
        <button className="terminal-button" onClick={handleToggleMute}>
          {agoraVoice.isLocalAudioMuted ? '取消静音' : '静音'}
        </button>
      )}
    </>
  );
};

export default VoiceControls; 