import { createContext, useContext, useEffect } from 'react';

/** Retained for type compatibility with existing consumers. The app now has
 * a single unified warm palette — theme switching is a no-op. */
export type Theme = 'day' | 'night' | 'blu';

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** @deprecated no-op — the app has a single unified theme. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lock the app to the unified warm palette. Strip any legacy .dark/.blu
  // classes on mount and keep browser chrome (status bar, color-scheme) in sync.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'blu');
    localStorage.setItem('app-theme', 'day');

    const themeColor = '#faf8f3'; // matches --background (warm cream)

    const themeColorMeta = document.querySelector('meta[name="theme-color"]') || document.createElement('meta');
    themeColorMeta.setAttribute('name', 'theme-color');
    themeColorMeta.removeAttribute('media');
    themeColorMeta.setAttribute('content', themeColor);
    if (!themeColorMeta.parentNode) document.head.appendChild(themeColorMeta);

    root.style.background = themeColor;

    const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
      || document.createElement('meta');
    statusBarMeta.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
    statusBarMeta.setAttribute('content', 'default');
    if (!statusBarMeta.parentNode) document.head.appendChild(statusBarMeta);

    const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]')
      || document.createElement('meta');
    colorSchemeMeta.setAttribute('name', 'color-scheme');
    colorSchemeMeta.setAttribute('content', 'light');
    if (!colorSchemeMeta.parentNode) document.head.appendChild(colorSchemeMeta);
    root.style.colorScheme = 'light';
  }, []);

  const noop = () => {};

  return (
    <ThemeContext.Provider value={{ theme: 'day', setTheme: noop, toggleTheme: noop }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
