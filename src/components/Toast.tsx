import React from 'react';
import { X } from 'lucide-react';
import { Notification } from '../types';

interface ToastProps {
  notification: Notification;
  onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ notification, onClose }) => {
  const dismissed = notification.dismissed ?? false;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`max-w-sm w-full bg-white shadow-lg rounded-md ring-1 ring-black ring-opacity-5 overflow-hidden transition transform duration-300 ease-in-out flex items-start gap-3 p-3 ${dismissed ? 'translate-x-6 opacity-0' : 'translate-x-0 opacity-100'}`}
    >
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">{notification.title}</div>
          <button onClick={() => onClose(notification.id)} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-1 text-sm text-gray-600">{notification.message}</div>
      </div>
    </div>
  );
};

export default Toast;
