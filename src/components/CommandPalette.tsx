import React, { useEffect, useRef } from 'react';
import '@/styles/CommandPalette.css';

// 定义参数选项的接口
export interface CommandParameterOption {
  value: string;         // 参数的实际值, e.g., "eye"
  displayValue?: string;  // 在面板中显示的值 (如果与value不同)
  description?: string; // 参数的简短描述
}

// 定义命令参数的结构
export interface CommandParameter {
  name: string; // 参数名, e.g., "mode" or "target"
  displayName?: string; // 参数在提示中的显示名, e.g., "模式"
  description?: string; // 描述此参数的作用
  options?: CommandParameterOption[]; // 预定义的参数选项
  isFreeText?: boolean; // 是否接受自由文本输入
  placeholder?: string; // 当 isFreeText 为 true 时，输入框的占位符提示
}

export interface Command {
  id: string;
  name: string; // e.g., "theme"
  displayName: string; // e.g., "切换主题"
  description: string;
  usage: string; // e.g., "eye | default" or "<新昵称>"
  actionPrefix: string; // e.g., "/theme ", this will be inserted upon main command selection
  parameters?: CommandParameter[]; // 命令的参数定义列表
  // execute?: (args: string[], fullInput: string) => void; // 可选：直接执行的函数，更高级
}

interface CommandPaletteProps {
  commands: Command[];
  filter: string; // For main commands: text after /. For params: text after command and space.
  onSelect: (textToInsert: string, isParameterSelection?: boolean, commandJustCompleted?: boolean) => void;
  onClose: () => void;
  inputElement: HTMLTextAreaElement | null;
  currentInputValue: string; // Pass the full input value to help decide mode
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  commands,
  filter, // This filter will now be more context-aware based on currentInputValue
  onSelect,
  onClose,
  inputElement,
  currentInputValue,
}) => {
  const paletteRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const selectedItemRef = useRef<HTMLLIElement>(null); 

  const [activeCommand, setActiveCommand] = React.useState<Command | null>(null);
  const [parameterIndex, setParameterIndex] = React.useState(0);
  const [displayMode, setDisplayMode] = React.useState<'mainCommands' | 'parameters'>('mainCommands');

  const prevFilterRef = useRef(filter);
  const prevActiveCommandRef = useRef(activeCommand);
  const prevParameterIndexRef = useRef(parameterIndex);


  useEffect(() => {
    const parts = currentInputValue.startsWith('/') ? currentInputValue.substring(1).split(' ') : [];
    const commandName = parts[0] || '';
    const potentialCommand = commands.find(cmd => cmd.name === commandName);

    // 仅当还未进入参数模式，并且满足进入参数模式的条件时，才执行完整的参数模式初始化
    if (displayMode !== 'parameters' && 
        potentialCommand && 
        currentInputValue.endsWith(' ') && 
        currentInputValue === potentialCommand.actionPrefix && 
        potentialCommand.parameters && 
        potentialCommand.parameters.length > 0) {
      setActiveCommand(potentialCommand);
      setParameterIndex(0);
      setDisplayMode('parameters');
      setSelectedIndex(0); 
    } else if (potentialCommand && potentialCommand.parameters && potentialCommand.parameters.length > parameterIndex && parts.length > parameterIndex + 1) {
      // 当正在输入参数时，确保 activeCommand 和 displayMode 正确，但不重置 selectedIndex
      if (activeCommand !== potentialCommand) setActiveCommand(potentialCommand);
      if (displayMode !== 'parameters') setDisplayMode('parameters');
    } else if (currentInputValue.startsWith('/')) {
      if (!potentialCommand && currentInputValue.includes(' ') && commandName !=='') {
        onClose(); 
        return;
      }
      setActiveCommand(null);
      setParameterIndex(0);
      setDisplayMode('mainCommands');
    } else {
      onClose(); 
    }
  }, [currentInputValue, commands, parameterIndex, onClose, activeCommand, displayMode]); // 确保所有被读取和设置的状态都在依赖项中

  const mainCommandFilter = displayMode === 'mainCommands' ? filter : '';
  const filteredMainCommands = displayMode === 'mainCommands' 
    ? commands.filter(cmd =>
        cmd.displayName.toLowerCase().includes(mainCommandFilter.toLowerCase()) ||
        cmd.name.toLowerCase().includes(mainCommandFilter.toLowerCase())
      )
    : [];

  const currentParameterDefinition = activeCommand?.parameters?.[parameterIndex];
  const parameterOptions = currentParameterDefinition?.options || [];
  
  const getCurrentParameterInput = () => {
    if (!activeCommand || displayMode !== 'parameters') return '';
    const parts = currentInputValue.substring(1).split(' ');
    return parts[parameterIndex + 1] || ''; 
  };
  const paramFilter = getCurrentParameterInput();


  const filteredParameterOptions = displayMode === 'parameters' && currentParameterDefinition && !currentParameterDefinition.isFreeText
    ? parameterOptions.filter(opt => 
        (opt.displayValue || opt.value).toLowerCase().includes(paramFilter.toLowerCase())
      )
    : [];

  useEffect(() => {
    let shouldReset = false;
    if (filter !== prevFilterRef.current && displayMode === 'mainCommands') {
      shouldReset = true;
    }
    if (activeCommand !== prevActiveCommandRef.current) {
      shouldReset = true;
    }
    if (parameterIndex !== prevParameterIndexRef.current) {
      shouldReset = true;
    }

    if (shouldReset) {
      setSelectedIndex(0);
    }

    prevFilterRef.current = filter;
    prevActiveCommandRef.current = activeCommand; 
    prevParameterIndexRef.current = parameterIndex;
  }, [filter, activeCommand, parameterIndex, displayMode]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Consolidate items to display and their type for keyboard navigation
  const displayItems = displayMode === 'mainCommands' ? filteredMainCommands : filteredParameterOptions;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!inputElement || document.activeElement !== inputElement) return; 
      // 如果是自由文本参数提示模式，并且按下了回车，则直接关闭面板，让外部处理提交
      if (displayMode === 'parameters' && currentParameterDefinition?.isFreeText && e.key === 'Enter') {
        onClose(); 
        return; // 不阻止默认行为，也不停止冒泡，让外部表单的 Enter 处理
      }

      if (!displayItems.length && e.key !== 'Escape') return;

      if (e.key === 'Escape') {
        e.preventDefault(); 
        e.stopPropagation(); 
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => {
          const nextIndex = (prev + 1) % (displayItems.length || 1);
          return nextIndex;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => {
          const nextIndex = (prev - 1 + (displayItems.length || 1)) % (displayItems.length || 1); 
          return nextIndex;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation(); 
        const selectedItem = displayItems[selectedIndex];
        if (selectedItem) {
          if (displayMode === 'mainCommands') {
            const cmd = selectedItem as Command;
            onSelect(cmd.actionPrefix, false, !cmd.parameters || cmd.parameters.length === 0);
          } else if (displayMode === 'parameters' && activeCommand) {
            const paramOpt = selectedItem as CommandParameterOption;
            const nextParameterIndex = parameterIndex + 1;
            const hasMoreParameters = activeCommand.parameters ? nextParameterIndex < activeCommand.parameters.length : false;
            onSelect(paramOpt.value + (hasMoreParameters ? ' ' : ''), true, !hasMoreParameters);
            if (hasMoreParameters) {
              setParameterIndex(nextParameterIndex);
              setSelectedIndex(0); // Reset selection for next param
            } else {
              // onClose(); // Command completed
            }
          }
        }
      }
    };
    
    inputElement?.addEventListener('keydown', handleKeyDown as EventListener);
    return () => {
      inputElement?.removeEventListener('keydown', handleKeyDown as EventListener);
    };
  }, [inputElement, displayItems, selectedIndex, onClose, onSelect, displayMode, activeCommand, parameterIndex]);
  
  useEffect(() => {
    setSelectedIndex(0); 
  }, [mainCommandFilter, activeCommand, parameterIndex]); // 当主命令的筛选条件、激活命令或参数索引变化时重置选择

  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView?.({ block: 'nearest' });
    }
  }, [selectedIndex, displayItems]); 

  // Determine what to render
  let content = null;
  if (displayMode === 'mainCommands') {
    if (!filteredMainCommands.length && mainCommandFilter) {
      content = <div className="command-item-empty">未找到命令: &apos;{mainCommandFilter}&apos;</div>;
    } else if (filteredMainCommands.length > 0) {
      content = (
        <ul>
          {filteredMainCommands.map((cmd, index) => (
            <li
              key={cmd.id}
              ref={index === selectedIndex ? selectedItemRef : null} 
              className={`command-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => onSelect(cmd.actionPrefix, false, !cmd.parameters || cmd.parameters.length === 0)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="command-item-name">
                <strong>{cmd.displayName}</strong>
                <span className="command-item-usage">({cmd.name} {cmd.usage})</span>
              </div>
              <div className="command-item-description">{cmd.description}</div>
            </li>
          ))}
        </ul>
      );
    }
  } else if (displayMode === 'parameters' && activeCommand) {
    if (currentParameterDefinition?.isFreeText) {
      content = <div className="command-free-text-prompt">请输入: {currentParameterDefinition.placeholder || currentParameterDefinition.displayName || currentParameterDefinition.name}</div>;
    } else if (!filteredParameterOptions.length && paramFilter) {
      content = <div className="command-item-empty">未找到参数: &apos;{paramFilter}&apos; for {currentParameterDefinition?.displayName || currentParameterDefinition?.name}</div>;
    } else if (filteredParameterOptions.length > 0) {
      content = (
        <ul>
          {filteredParameterOptions.map((opt, index) => (
            <li
              key={opt.value}
              ref={index === selectedIndex ? selectedItemRef : null} 
              className={`command-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => {
                const nextParameterIndex = parameterIndex + 1;
                const hasMoreParameters = activeCommand.parameters ? nextParameterIndex < activeCommand.parameters.length : false;
                onSelect(opt.value + (hasMoreParameters ? ' ' : ''), true, !hasMoreParameters);
                if (hasMoreParameters) setParameterIndex(nextParameterIndex); 
                // else onClose();
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="command-item-name">
                <strong>{opt.displayValue || opt.value}</strong>
              </div>
              {opt.description && <div className="command-item-description">{opt.description}</div>}
            </li>
          ))}
        </ul>
      );
    }
  }

  if (content === null && currentInputValue.startsWith('/')) {
  }
  if (!content && displayMode === 'mainCommands' && !mainCommandFilter) {
      // 初始输入 '/' 时，显示所有主命令
      content = (
        <ul>
          {commands.map((cmd, index) => (
            <li
              key={cmd.id}
              ref={index === selectedIndex ? selectedItemRef : null} 
              className={`command-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => onSelect(cmd.actionPrefix, false, !cmd.parameters || cmd.parameters.length === 0)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="command-item-name">
                <strong>{cmd.displayName}</strong>
                <span className="command-item-usage">({cmd.name} {cmd.usage})</span>
              </div>
              <div className="command-item-description">{cmd.description}</div>
            </li>
          ))}
        </ul>
      );
  }
  
  const getPaletteStyle = (): React.CSSProperties => {
    if (inputElement) {
      const rect = inputElement.getBoundingClientRect();
      return {
        position: 'fixed', 
        bottom: `${window.innerHeight - rect.top}px`, 
        left: `${rect.left}px`,
        width: `${Math.max(300, rect.width)}px`, // 面板最小宽度300px，或与输入框同宽
        maxHeight: '300px',
        overflowY: 'auto',
      };
    }
    return {}; 
  };
  
  return (
    <div ref={paletteRef} className="command-palette" style={getPaletteStyle()}>
      {content}
    </div>
  );
}; 