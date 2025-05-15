import { useState, useEffect } from 'react';

export type ThemeType = 'default' | 'eye-care' | 'cyberpunk';

const THEME_KEY = 'chat_theme';
const THEME_CLASS_MAP: Record<ThemeType, string | null> = {
  'default': null,
  'eye-care': 'eye-care-mode',
  'cyberpunk': 'cyberpunk-mode',
};

export function useTheme(): [ThemeType, (theme: ThemeType) => void] {
  const [currentTheme, setCurrentTheme] = useState<ThemeType>('default');

  useEffect(() => {
    // 初始化主题
    const savedTheme = localStorage.getItem(THEME_KEY) as ThemeType | null;
    if (savedTheme && Object.keys(THEME_CLASS_MAP).includes(savedTheme)) {
      setCurrentTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    // 清理所有主题 class
    Object.values(THEME_CLASS_MAP).forEach(cls => {
      if (cls) document.documentElement.classList.remove(cls);
    });
    // 添加当前主题 class
    const themeClass = THEME_CLASS_MAP[currentTheme];
    if (themeClass) {
      document.documentElement.classList.add(themeClass);
    }
    localStorage.setItem(THEME_KEY, currentTheme);
  }, [currentTheme]);

  return [currentTheme, setCurrentTheme];
} 