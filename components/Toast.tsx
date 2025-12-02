
import React, { useEffect } from 'react';
import type { ToastInfo } from '../types';

interface ToastProps extends ToastInfo {
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ title, message, type, onClose }) => {
  const typeStyles = {
    info: { border: 'border-blue-500', icon: 'fa-info-circle', iconColor: 'text-blue-500' },
    success: { border: 'border-green-500', icon: 'fa-check-circle', iconColor: 'text-green-500' },
    warning: { border: 'border-amber-500', icon: 'fa-exclamation-triangle', iconColor: 'text-amber-500' },
    error: { border: 'border-red-500', icon: 'fa-exclamation-circle', iconColor: 'text-red-500' },
  };

  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`bg-white dark:bg-slate-800 border-l-4 ${typeStyles[type].border} rounded-md shadow-lg p-4 flex gap-3 animate-toast-in`}>
      <div className={`text-xl ${typeStyles[type].iconColor}`}>
        <i className={`fa-solid ${typeStyles[type].icon}`}></i>
      </div>
      <div className="flex-1">
        <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{message}</p>
      </div>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
        <i className="fa-solid fa-times text-sm"></i>
      </button>
    </div>
  );
};
