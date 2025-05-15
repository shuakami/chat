import React, { useEffect, useRef, useState } from 'react';
import '@/styles/MentionPalette.css';

interface MentionPaletteProps {
  users: string[];
  filter: string;
  onSelect: (mention: string) => void;
  onClose: () => void;
  inputElement: HTMLTextAreaElement | null;
}

export const MentionPalette: React.FC<MentionPaletteProps> = ({
  users,
  filter,
  onSelect,
  onClose,
  inputElement,
}) => {
  const paletteRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedItemRef = useRef<HTMLLIElement>(null);

  const filteredUsers = users.filter(user =>
    user.toLowerCase().includes(filter.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!inputElement || document.activeElement !== inputElement) return;
      if (!filteredUsers.length && e.key !== 'Escape') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev + 1) % (filteredUsers.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev - 1 + (filteredUsers.length || 1)) % (filteredUsers.length || 1));
      } else if (e.key === 'Enter' || e.key === 'Tab') { // Tab键也可以用于选择确认
        e.preventDefault();
        e.stopPropagation();
        if (filteredUsers[selectedIndex]) {
          onSelect(`@${filteredUsers[selectedIndex]} `);
        }
      }
    };

    inputElement?.addEventListener('keydown', handleKeyDown as EventListener);
    return () => {
      inputElement?.removeEventListener('keydown', handleKeyDown as EventListener);
    };
  }, [inputElement, filteredUsers, selectedIndex, onClose, onSelect]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView?.({ block: 'nearest' });
    }
  }, [selectedIndex, filteredUsers]);

  const getPaletteStyle = (): React.CSSProperties => {
    if (inputElement) {
      const rect = inputElement.getBoundingClientRect();
      // 尝试将面板定位在@符号附近，如果能获取到更精确的光标位置会更好
      // 但为了简单起见，目前是定位在输入框的左上方（底部对齐输入框顶部）
      return {
        position: 'fixed',
        bottom: `${window.innerHeight - rect.top}px`, 
        left: `${rect.left}px`,
        width: `${Math.max(200, rect.width / 2)}px`, // 面板宽度可以比输入框窄一些，最小200px
        maxHeight: '200px',
        overflowY: 'auto',
      };
    }
    return {};
  };

  if (!filteredUsers.length && !filter) return null; // 如果没有过滤条件且用户列表为空(初始状态)，则不显示面板
  if (!filteredUsers.length && filter) {
    return (
      <div ref={paletteRef} className="mention-palette" style={getPaletteStyle()}>
        <div className="mention-item-empty">未找到用户: &apos;{filter}&apos;</div>
      </div>
    );
  }
  if (!filteredUsers.length) return null; // 如果过滤后最终没有用户匹配，则不显示面板
  
  return (
    <div ref={paletteRef} className="mention-palette" style={getPaletteStyle()}>
      <ul>
        {filteredUsers.map((user, index) => (
          <li
            key={user}
            ref={index === selectedIndex ? selectedItemRef : null}
            className={`mention-item ${index === selectedIndex ? 'selected' : ''}`}
            onClick={() => onSelect(`@${user} `)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            {user}
          </li>
        ))}
      </ul>
    </div>
  );
}; 