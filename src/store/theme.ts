import { atomWithStorage } from 'jotai/utils';
import {
  applyTheme,
  getManualTheme,
  getSystemTheme,
  type Theme,
} from '@/lib/theme';

const themeStorageKey = import.meta.env.PUBLIC_THEME_KEY || 'theme';
const configuredDefaultTheme = import.meta.env.PUBLIC_DEFAULT_THEME;
const defaultTheme: Theme | 'auto' = ['light', 'dark', 'auto'].includes(
  configuredDefaultTheme,
)
  ? (configuredDefaultTheme as Theme | 'auto')
  : 'auto';

export const themeAtom = atomWithStorage<Theme | 'auto'>(
  themeStorageKey,
  defaultTheme,
  {
    getItem: (key, initialValue) => {
      const savedTheme = localStorage.getItem(key);
      return (savedTheme && getManualTheme(savedTheme)) || initialValue;
    },
    setItem: (key, value) => {
      localStorage.setItem(key, value);
      applyTheme(getManualTheme(value) ?? getSystemTheme());
    },
    removeItem: (key) => localStorage.removeItem(key),
    subscribe: (key, callback, initialValue) => {
      if (
        typeof window === 'undefined' ||
        typeof window.addEventListener === 'undefined'
      ) {
        return () => {};
      }
      window.addEventListener('storage', (e) => {
        if (e.storageArea === localStorage && e.key === key) {
          const newValue = e.newValue;
          callback((newValue && getManualTheme(newValue)) || initialValue);
        }
      });
      return () => {};
    },
  },
  { getOnInit: true },
);
