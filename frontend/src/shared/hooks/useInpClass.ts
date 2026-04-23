import { useTheme } from '@/shared/context/ThemeContext';

export function useInpClass() {
  const { dark } = useTheme();
  return `w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 transition-all ${
    dark
      ? 'bg-gray-800 border-gray-600 text-white focus:border-teal-400 focus:ring-teal-900 placeholder-gray-500'
      : 'bg-white border-gray-200 text-gray-900 focus:border-teal-400 focus:ring-teal-100'
  }`;
}
