import { useState, useEffect, useCallback, useRef } from 'react';
import { useEmoji } from '@/hooks/useEmoji';
import debounce from 'lodash/debounce';
import Image from 'next/image';

interface EmojiPickerProps {
  onSelect: (emoji: { url: string; emoji_id: string }) => void;
  onClose: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}

export function EmojiPicker({ onSelect, onClose, buttonRef }: EmojiPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const { emojis, searchResults, loading, error, currentPage, totalPages, fetchEmojis, searchEmojis } = useEmoji(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isInitializedRef = useRef(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [position, setPosition] = useState({ left: 0, alignRight: false });
  const [isSearching, setIsSearching] = useState(false);

  const updatePosition = useCallback(() => {
    if (buttonRef.current && rootRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const rootWidth = rootRef.current.offsetWidth;
      
      const buttonRightEdge = buttonRect.right;
      
      const desiredLeft = buttonRightEdge - rootWidth;
      
      const finalLeft = Math.max(16, desiredLeft);
      
      setPosition({
        left: finalLeft,
        alignRight: false
      });
    }
  }, [buttonRef]);

  useEffect(() => {
    const handleResize = debounce(() => {
      updatePosition();
    }, 100);

    window.addEventListener('resize', handleResize);
    updatePosition();

    return () => {
      window.removeEventListener('resize', handleResize);
      handleResize.cancel();
    };
  }, [updatePosition]);

  useEffect(() => {
    if (!isInitializedRef.current && emojis.length === 0) {
      fetchEmojis(1);
      isInitializedRef.current = true;
    }
  }, [fetchEmojis, emojis.length]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || loading || isLoadingMore || searchTerm) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
    
    if (scrollPercentage > 0.8 && currentPage < totalPages && !isLoadingMore) {
      setIsLoadingMore(true);
      fetchEmojis(currentPage + 1).finally(() => {
        setIsLoadingMore(false);
      });
    }
  }, [loading, searchTerm, currentPage, totalPages, fetchEmojis, isLoadingMore]);

  const debouncedScroll = debounce(handleScroll, 100);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', debouncedScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', debouncedScroll);
      debouncedScroll.cancel();
    };
  }, [debouncedScroll]);

  const debouncedSearch = debounce((term: string) => {
    searchEmojis(term);
  }, 300);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    setIsSearching(true);
    debouncedSearch(term);
    setSelectedIndex(-1);
  };

  useEffect(() => {
    if (searchResults.length > 0 || (!loading && searchTerm === '')) {
      setIsSearching(false);
    }
  }, [searchResults, loading, searchTerm]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const displayEmojis = searchTerm ? searchResults : emojis;
    const cols = 4;
    const currentRow = Math.floor(selectedIndex / cols);

    switch(e.key) {
      case 'ArrowRight':
        e.preventDefault();
        if (selectedIndex < displayEmojis.length - 1) {
          setSelectedIndex(prev => prev + 1);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (selectedIndex > 0) {
          setSelectedIndex(prev => prev - 1);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (currentRow > 0) {
          const newIndex = selectedIndex - cols;
          if (newIndex >= 0) {
            setSelectedIndex(newIndex);
          }
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        const newIndex = selectedIndex + cols;
        if (newIndex < displayEmojis.length) {
          setSelectedIndex(newIndex);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < displayEmojis.length) {
          const emoji = displayEmojis[selectedIndex];
          onSelect({ url: emoji.url, emoji_id: emoji.emoji_id });
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  const displayEmojis = searchTerm ? searchResults : emojis;

  return (
    <div 
      ref={rootRef} 
      className="terminal-emoji-picker"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      style={{
        position: 'fixed',
        bottom: '70px',
        left: `${position.left}px`,
        transformOrigin: 'bottom right'
      }}
    >
      <div className="terminal-emoji-header">
        <div className="terminal-line">
          <span className="prompt">$</span>
          <input
            type="text"
            placeholder="search_emoji..."
            value={searchTerm}
            onChange={handleSearch}
            className="terminal-input"
            autoFocus
          />
        </div>
        {error && (
          <div className="terminal-error">
            Error: {error}
          </div>
        )}
      </div>
      
      <div 
        ref={containerRef} 
        className="terminal-emoji-grid"
        onScroll={debouncedScroll}
      >
        {displayEmojis.length > 0 ? (
          <div className={`terminal-grid ${isSearching ? 'searching' : ''}`}>
            {displayEmojis.map((emoji, index) => (
              <button
                key={emoji.emoji_id}
                onClick={() => onSelect({ url: emoji.url, emoji_id: emoji.emoji_id })}
                className={`terminal-emoji-item ${index === selectedIndex ? 'selected' : ''}`}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <Image
                  src={emoji.url}
                  alt={emoji.summary}
                  title={emoji.summary}
                  width={64}
                  height={64}
                  className="terminal-emoji-image"
                  loading={index < 12 ? "eager" : "lazy"}
                  priority={index < 6}
                  unoptimized
                />
              </button>
            ))}
          </div>
        ) : !loading && (
          <div className="terminal-empty">
            {searchTerm ? '> No emojis found' : '> No emojis available'}
          </div>
        )}
        
        {(loading || isLoadingMore) && (
          <div className="terminal-loading">
            <span className="loading-text">Loading...</span>
          </div>
        )}
      </div>
    </div>
  );
} 