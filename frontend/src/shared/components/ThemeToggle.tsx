import { Moon, Sun } from 'lucide-react';

import { useTheme } from '@/shared/context/ThemeContext';

export const ThemeToggle = () => {
  const { dark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={dark ? 'Mode clair' : 'Mode sombre'}
      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border ${
        dark
          ? 'bg-gray-800 border-gray-700 text-yellow-400 hover:bg-gray-700'
          : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
};
