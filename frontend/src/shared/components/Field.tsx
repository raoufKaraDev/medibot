import type { ReactNode } from 'react';

import { useTheme } from '@/shared/context/ThemeContext';

export interface FieldProps {
  label: string;
  required?: boolean;
  children: ReactNode;
}

export const Field = ({ label, required, children }: FieldProps) => {
  const { dark } = useTheme();
  return (
    <div>
      <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
};
