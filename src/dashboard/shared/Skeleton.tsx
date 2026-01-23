import React from 'react';

interface SkeletonProps {
  type?: 'overview' | 'table' | 'card' | 'list' | 'text' | 'image' | 'button';
  rows?: number;
  columns?: number;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ 
  type = 'text', 
  rows = 3, 
  columns = 4,
  className = '' 
}) => {
  const baseClasses = 'animate-pulse bg-gray-200 rounded';

  if (type === 'overview') {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className={`${baseClasses} h-4 w-24 mb-2`}></div>
              <div className={`${baseClasses} h-8 w-16`}></div>
            </div>
          ))}
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className={`${baseClasses} h-6 w-48 mb-4`}></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`${baseClasses} h-12 w-full`}></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}>
        <div className="p-4 border-b border-gray-200">
          <div className={`${baseClasses} h-4 w-32`}></div>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-6 py-4">
                  <div className={`${baseClasses} h-4 w-20`}></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Array.from({ length: rows }).map((_, rowIdx) => (
              <tr key={rowIdx}>
                {Array.from({ length: columns }).map((_, colIdx) => (
                  <td key={colIdx} className="px-6 py-4">
                    <div className={`${baseClasses} h-4 w-full`}></div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'card') {
    return (
      <div className={`bg-white p-6 rounded-xl shadow-sm border border-gray-200 ${className}`}>
        <div className={`${baseClasses} h-6 w-3/4 mb-4`}></div>
        <div className={`${baseClasses} h-4 w-full mb-2`}></div>
        <div className={`${baseClasses} h-4 w-5/6`}></div>
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className={`space-y-3 ${className}`}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={`${baseClasses} h-16 w-full`}></div>
        ))}
      </div>
    );
  }

  if (type === 'image') {
    return (
      <div className={`${baseClasses} w-full h-48 ${className}`}></div>
    );
  }

  if (type === 'button') {
    return (
      <div className={`${baseClasses} h-10 w-24 ${className}`}></div>
    );
  }

  // Default: text
  return (
    <div className={`${baseClasses} h-4 w-full ${className}`}></div>
  );
};

export default Skeleton;
