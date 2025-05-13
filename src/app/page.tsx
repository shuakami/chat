'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import './room/[roomId]/terminal-styles.css';

const APP_VERSION = '1.0.1';

export default function Home() {
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [roomIdInput, setRoomIdInput] = useState('');
  const [showCustomCaret, setShowCustomCaret] = useState(true);
  const [caretPosition, setCaretPosition] = useState({ left: 0, top: 0, height: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    // 模拟终端初始化
    setTimeout(() => {
      setIsInitialized(true);
      setTimeout(() => setShowPrompt(true), 500);
    }, 1000);
  }, []);

  // 更新光标位置
  useEffect(() => {
    if (inputRef.current && showCustomCaret) {
      const updateCaretPosition = () => {
        const input = inputRef.current;
        if (!input) return;

        const { selectionStart, value } = input;
        const textBeforeCaret = value.substring(0, selectionStart || 0);
        
        // 创建临时span来测量文本宽度
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
  }, [roomIdInput, showCustomCaret]);

  const handleJoinRoom = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (roomIdInput.trim()) {
      // 添加输入动画效果
      const form = e.currentTarget;
      form.classList.add('processing');
      setTimeout(() => {
        router.push(`/room/${roomIdInput.trim()}`);
      }, 500);
    }
  };

  if (!isInitialized) {
    return (
      <>
        <div className="scanline"></div>
        <div className="crt-overlay"></div>
        <section className="terminal" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div className="terminal-content">
            <p className="message system-msg !mt-[55px]" data-is-new={true}>
              Initializing terminal... <span className="blink">|</span>
            </p>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="scanline"></div>
      <div className="crt-overlay"></div>
      <section className="terminal" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="terminal-content !mt-[55px]">
          <p className="message system-msg" data-is-new={true}>
            Private Chat Terminal v{APP_VERSION}
          </p>
          <p className="message system-msg" data-is-new={true}>
            Welcome to the secure chat system.
          </p>
          <p className="message system-msg" data-is-new={true}>
            Please enter room ID to continue...
          </p>
          
          {showPrompt && (
            <form onSubmit={handleJoinRoom} className="terminal-form" data-is-new={true}>
              <div className="message input-line">
                <span className="prompt">$</span>
                <input 
                  ref={inputRef}
                  type="text"
                  id="roomId"
                  className="input-field"
                  value={roomIdInput}
                  onChange={(e) => setRoomIdInput(e.target.value)}
                  placeholder="enter_room_id..."
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
