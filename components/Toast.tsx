import React, { memo, useEffect, useState } from 'react';
import { ToastNotification } from '../types';

interface ToastProps {
    toast: ToastNotification;
    onClose: () => void;
}

const Toast: React.FC<ToastProps> = memo(({ toast, onClose }) => {
    const [isVisible, setIsVisible] = useState(false);
    
    useEffect(() => {
        // Trigger entrance animation
        const enterTimer = setTimeout(() => setIsVisible(true), 10);
        
        // Auto-dismiss
        const exitTimer = setTimeout(() => {
            setIsVisible(false);
            setTimeout(onClose, 300); // Wait for exit animation
        }, toast.duration);
        
        return () => {
            clearTimeout(enterTimer);
            clearTimeout(exitTimer);
        };
    }, [toast.duration, onClose]);
    
    const bgColor = {
        info: 'bg-blue-500',
        success: 'bg-emerald-500',
        warning: 'bg-amber-500',
        error: 'bg-red-500'
    }[toast.type];
    
    const icon = {
        info: 'fa-info-circle',
        success: 'fa-check-circle',
        warning: 'fa-exclamation-triangle',
        error: 'fa-exclamation-circle'
    }[toast.type];
    
    return (
        <div 
            className={`fixed top-5 right-5 z-50 max-w-sm w-full transform transition-transform duration-300 ease-in-out ${
                isVisible ? 'translate-x-0' : 'translate-x-[150%]'
            }`}
        >
            <div className={`${bgColor} text-white p-4 rounded-lg shadow-lg flex items-center gap-3`}>
                <i className={`fas ${icon} text-lg`}></i>
                <div className="flex-1">
                    <p className="text-sm font-medium">{toast.message}</p>
                </div>
                <button 
                    onClick={() => {
                        setIsVisible(false);
                        setTimeout(onClose, 300);
                    }}
                    className="text-white hover:text-gray-200 transition-colors"
                >
                    <i className="fas fa-times"></i>
                </button>
            </div>
        </div>
    );
});

export default Toast;