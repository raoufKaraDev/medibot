import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { useTheme } from '@/shared/context/ThemeContext';

export const tc = (light: string, dark: string, isDark: boolean) => (isDark ? dark : light);

export const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}
export const Modal = ({ title, onClose, children, width = 'max-w-lg' }: ModalProps) => {
  const { dark } = useTheme();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`rounded-2xl shadow-2xl w-full ${width} max-h-[90vh] overflow-y-auto ${
          dark ? 'bg-gray-900 border border-gray-700' : 'bg-white'
        }`}
      >
        <div className={`flex items-center justify-between px-6 py-4 border-b ${dark ? 'border-gray-700' : 'border-gray-100'}`}>
          <h3 className={`font-black text-lg ${dark ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              dark ? 'bg-gray-800 hover:bg-gray-700 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </motion.div>
    </div>
  );
};

interface FieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
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

export const useInpClass = () => {
  const { dark } = useTheme();
  return `w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 transition-all ${
    dark
      ? 'bg-gray-800 border-gray-600 text-white focus:border-teal-400 focus:ring-teal-900 placeholder-gray-500'
      : 'bg-white border-gray-200 text-gray-900 focus:border-teal-400 focus:ring-teal-100'
  }`;
};
