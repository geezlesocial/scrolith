import React from 'react';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (value: any, item: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface TableProps<T extends Record<string, any>> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  emptyMessage?: string;
  onSort?: (key: keyof T | string, direction: 'asc' | 'desc') => void;
  onRowClick?: (item: T) => void;
  className?: string;
}

export function Table<T extends Record<string, any>>({
  data,
  columns,
  loading = false,
  emptyMessage = 'No data available',
  onSort,
  onRowClick,
  className = ''
}: TableProps<T>) {
  const renderCellValue = (column: Column<T>, item: T) => (
    column.render
      ? column.render(item[column.key as keyof T], item)
      : item[column.key as keyof T] ?? '-'
  );

  const tableMinWidthPx = Math.max(columns.length * 140, 640);

  if (loading) {
    return <Skeleton type="table" rows={5} columns={columns.length} className={className} />;
  }

  if (data.length === 0) {
    return <EmptyState message={emptyMessage} className={className} />;
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}>
      <div className="min-[360px]:hidden space-y-3 p-3">
        {data.map((item, index) => (
          <article
            key={String((item as any).id ?? (item as any)._id ?? index)}
            className={`rounded-xl border border-gray-200 bg-white p-3 shadow-sm ${
              onRowClick ? 'cursor-pointer active:bg-gray-50' : ''
            }`}
            onClick={() => onRowClick?.(item)}
          >
            <div className="space-y-2">
              {columns.map((column) => (
                <div key={String(column.key)} className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {column.header}
                  </p>
                  <div className="mt-1 break-words text-sm text-gray-900">
                    {renderCellValue(column, item)}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="hidden min-[360px]:block overflow-x-auto">
        <table
          className={`w-full text-sm text-left ${className}`}
          style={{ minWidth: `${tableMinWidthPx}px` }}
        >
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className={`px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                  } ${column.className || ''}`}
                  onClick={() => column.sortable && onSort?.(column.key, 'asc')}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.header}</span>
                    {column.sortable && <span className="text-gray-400">^v</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {data.map((item, index) => (
              <tr
                key={String((item as any).id ?? (item as any)._id ?? index)}
                className={`${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors`}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((column) => (
                  <td key={String(column.key)} className={`px-6 py-4 whitespace-nowrap ${column.className || ''}`}>
                    {renderCellValue(column, item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

