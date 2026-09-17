import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  // 1. Initialize state with 3 options: 'light', 'dark', or 'system'
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('anirescue_theme') || 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    
    // 2. Logic to apply the correct class based on state and OS preference
    const applyTheme = (currentTheme) => {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

      if (currentTheme === 'dark' || (currentTheme === 'system' && systemPrefersDark)) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme(theme);
    localStorage.setItem('anirescue_theme', theme);

    // 3. Listen for live OS changes if the user is using the 'system' setting
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      if (theme === 'system') applyTheme('system');
    };
    
    mediaQuery.addEventListener('change', handleSystemChange);
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, [theme]);

  // 4. Cycle through the 3 modes
  const cycleTheme = () => {
    setTheme((prevTheme) => {
      if (prevTheme === 'light') return 'dark';
      if (prevTheme === 'dark') return 'system';
      return 'light';
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);