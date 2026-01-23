import React from 'react';
import { FileText, Inbox, Package, Search } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  message?: string;
  icon?: 'file' | 'inbox' | 'package' | 'search' | React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  message = 'No data available',
  icon = 'inbox',
  action,
  className = ''
}) => {
  const icons = {
    file: FileText,
    inbox: Inbox,
    package: Package,
    search: Search
  };

  const iconNode =
    typeof icon === 'string'
      ? (() => {
          const IconComponent = icons[icon] || Inbox;
          return <IconComponent className="w-8 h-8 text-gray-400" />;
        })()
      : icon;

  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 ${className}`}>
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        {iconNode}
      </div>
      {title ? (
        <>
          <p className="text-gray-900 font-semibold text-center">{title}</p>
          {description && <p className="text-gray-500 text-center mt-2">{description}</p>}
        </>
      ) : (
        <p className="text-gray-500 text-center">{message}</p>
      )}
      {action && <div className="mt-4" />}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
