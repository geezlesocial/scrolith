import React from 'react';
import { useNotification } from '../context/NotificationContext';
import Toast from './Toast';

const ToastContainer: React.FC = () => {
  const { toasts, removeNotification } = useNotification();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col items-end gap-3">
      {toasts.map((n) => (
        <Toast key={n.id} notification={n} onClose={removeNotification} />
      ))}
    </div>
  );
};

export default ToastContainer;
