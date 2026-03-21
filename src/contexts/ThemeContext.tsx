import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/app-client';
import { useAuth } from '@/contexts/AuthContext';

export type Theme = 'day' | 'night' | 'blu';

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** @deprecated Use setTheme instead */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const VALID_THEMES: Theme[] = ['day', 'night', 'blu'];
const isValidTheme = (v: string | null): v is Theme => VALID_THEMES.includes(v as Theme);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('app-theme');
    return isValidTheme(saved) ? saved : 'night';
  });
  const [cloudLoaded, setCloudLoaded] = useState(false);

  // Load theme from cloud when user changes
  const loadThemeFromCloud = useCallback(async () => {
    if (!user) { setCloudLoaded(true); return; }
    try {
      const { data } = await supabase
        .from('user_preferences')
        .select('theme')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.theme && isValidTheme(data.theme)) {
        setThemeState(data.theme);
        localStorage.setItem('app-theme', data.theme);
      }
    } catch (err) {
      console.error('Error loading theme from cloud:', err);
    } finally {
      setCloudLoaded(true);
    }
  }, [user]);

  useEffect(() => { loadThemeFromCloud(); }, [loadThemeFromCloud]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'blu');
    if (theme === 'night') root.classList.add('dark');
    if (theme === 'blu') root.classList.add('blu');
    localStorage.setItem('app-theme', theme);

    // Determine if this theme has a dark background
    const isDark = theme === 'night' || theme === 'blu';

    // theme-color: tells the WebView/browser what color to use for the status bar chrome
    const colorMap: Record<Theme, string> = { day: '#fafafa', night: '#0a0a0a', blu: '#000080' };
    const themeColor = colorMap[theme];
    const themeColorMeta = document.querySelector('meta[name="theme-color"]') || document.createElement('meta');
    themeColorMeta.setAttribute('name', 'theme-color');
    themeColorMeta.removeAttribute('media');
    themeColorMeta.setAttribute('content', themeColor);
    if (!themeColorMeta.parentNode) document.head.appendChild(themeColorMeta);

    // Keep html background in sync so safe-area behind status bar always matches theme
    root.style.background = themeColor;

    // apple-mobile-web-app-status-bar-style: controls icon color in the status bar.
    // 'black-translucent' = white/light icons (for dark backgrounds)
    // 'default'           = dark/black icons (for light backgrounds)
    // Many WKWebView wrappers (e.g. Despia) read this meta to set UIStatusBarStyle natively.
    const statusBarStyle = isDark ? 'black-translucent' : 'default';
    const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
      || document.createElement('meta');
    statusBarMeta.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
    statusBarMeta.setAttribute('content', statusBarStyle);
    if (!statusBarMeta.parentNode) document.head.appendChild(statusBarMeta);

    // color-scheme: second signal used by some WebView wrappers and browsers
    // to decide whether status bar icons should be light or dark
    const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]')
      || document.createElement('meta');
    colorSchemeMeta.setAttribute('name', 'color-scheme');
    colorSchemeMeta.setAttribute('content', isDark ? 'dark' : 'light');
    if (!colorSchemeMeta.parentNode) document.head.appendChild(colorSchemeMeta);
    // Also set on the root element so CSS color-scheme inheritance works
    root.style.colorScheme = isDark ? 'dark' : 'light';

    // Sync to cloud
    if (user && cloudLoaded) {
      supabase
        .from('user_preferences')
        .upsert([{ user_id: user.id, theme }], { onConflict: 'user_id' })
        .then(({ error }) => { if (error) console.error('Error saving theme to cloud:', error); });
    }
  }, [theme, user, cloudLoaded]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = () => setThemeState(prev => prev === 'day' ? 'night' : 'day');

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
