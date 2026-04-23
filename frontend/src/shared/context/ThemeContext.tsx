import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export const ThemeCtx = createContext<{ dark: boolean; toggle: () => void }>({
  dark: false,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => {
    if (typeof localStorage === 'undefined') {
      return typeof document !== 'undefined'
        ? document.documentElement.getAttribute('data-theme') === 'dark'
        : false;
    }
    const saved = localStorage.getItem('medibot-theme');
    if (saved === 'dark' || saved === 'light') {
      return saved === 'dark';
    }
    return typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-theme') === 'dark'
      : false;
  });

  useEffect(() => {
    const t = dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('medibot-theme', t);
  }, [dark]);

  const toggle = useCallback(() => setDark((d) => !d), []);

  return <ThemeCtx.Provider value={{ dark, toggle }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
