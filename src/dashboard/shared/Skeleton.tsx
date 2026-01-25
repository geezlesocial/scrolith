import React from 'react';

interface SkeletonProps {
  type: 'text' | 'card' | 'table' | 'table-row' | 'list' | 'avatar';
  lines?: number;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  type,
  lines = 1,
  className = ''
}) => {
  const baseClasses = 'animate-pulse bg-gray-200 rounded';

  switch (type) {
    case 'text':
      return (
        <div className={`${baseClasses} h-4 ${className}`}>
          {lines > 1 && (
            <div className="space-y-2">
              {Array.from({ length: lines }).map((_, index) => (
                <div key={index} className={`${baseClasses} h-4 ${index === lines - 1 ? 'w-3/4' : 'w-full'}`} />
              ))}
            </div>
          )}
        </div>
      );

    case 'card':
      return (
        <div className={`${baseClasses} h-32 ${className}`} />
      );

    case 'avatar':
      return (
        <div className={`${baseClasses} h-10 w-10 rounded-full ${className}`} />
      );

    case 'table':
      return (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className={`${baseClasses} h-12 ${className}`} />
          ))}
        </div>
      );

    case 'table-row':
      return (
        <div className={`${baseClasses} h-12 ${className}`} />
      );

    case 'list':
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center space-x-3">
              <div className="flex-1 space-y-2">
                <div className={`${baseClasses} h-4 w-3/4`} />
                <div className={`${baseClasses} h-4 w-1/2`} />
              </div>
            </div>
          ))}
        </div>
      );

    default:
      return <div className={`${baseClasses} h-4 ${className}`} />;
  }
};