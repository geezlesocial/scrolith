import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmModalProps {
  isOpen?: boolean;
  open?: boolean;
  title: string;
  message?: string;
  description?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
  children?: React.ReactNode;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  open,
  title,
  message,
  description,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  children
}) => {
  const visible = typeof isOpen === 'boolean' ? isOpen : Boolean(open);
  if (!visible) return null;

  const variantClasses = {
    danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    warning: 'bg-orange-600 hover:bg-orange-700 focus:ring-orange-500',
    info: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6">
          <div className="flex items-start">
            <div className={`flex-shrink-0 mx-auto flex items-center justify-center h-12 w-12 rounded-full ${
              variant === 'danger' ? 'bg-red-100' : variant === 'warning' ? 'bg-orange-100' : 'bg-blue-100'
            }`}>
              <AlertTriangle className={`h-6 w-6 ${
                variant === 'danger' ? 'text-red-600' : variant === 'warning' ? 'text-orange-600' : 'text-blue-600'
              }`} />
            </div>
          </div>
          <div className="mt-4 text-center">
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            {(message || description) && (
              <div className="mt-2">
                <p className="text-sm text-gray-500">{message || description}</p>
              </div>
            )}
            {children && <div className="mt-4 text-left">{children}</div>}
          </div>
        </div>
        <div className="bg-gray-50 px-6 py-4 rounded-b-xl flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]}`}
          >
            {loading ? (
              <span className="flex items-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
