import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Printer, RefreshCcw, Save } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

type RecordFilters = {
  conversationId: string;
  action: string;
  actorId: string;
  dateFrom: string;
  dateTo: string;
  search: string;
};

const PAGE_LIMIT = 50;

const MessageRecords: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savingRetention, setSavingRetention] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [retentionMonths, setRetentionMonths] = useState(72);
  const [retentionUpdatedAt, setRetentionUpdatedAt] = useState<string | null>(null);
  const [filters, setFilters] = useState<RecordFilters>({
    conversationId: '',
    action: '',
    actorId: '',
    dateFrom: '',
    dateTo: '',
    search: ''
  });

  const queryParams = useMemo(
    () => ({
      page,
      limit: PAGE_LIMIT,
      conversationId: filters.conversationId || undefined,
      action: filters.action || undefined,
      actorId: filters.actorId || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      search: filters.search || undefined
    }),
    [page, filters]
  );

  const loadRecords = async () => {
    setLoading(true);
    try {
      const data = await AdminService.getMessageRecords(queryParams);
      setRecords(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total || 0));
      setHasMore(Boolean(data?.hasMore));
    } catch (error: any) {
      showNotification('alert', 'Message Records', error?.message || 'Failed to load message records.');
    } finally {
      setLoading(false);
    }
  };

  const loadRetention = async () => {
    try {
      const policy = await AdminService.getMessageRetentionPolicy();
      setRetentionMonths(Number(policy?.retentionMonths || 72));
      setRetentionUpdatedAt(policy?.updatedAt || null);
    } catch {
      setRetentionMonths(72);
      setRetentionUpdatedAt(null);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, [queryParams]);

  useEffect(() => {
    void loadRetention();
  }, []);

  const onExport = async (format: 'csv' | 'json') => {
    setExporting(true);
    try {
      const blob = await AdminService.exportMessageRecords({
        ...queryParams,
        format
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `message-records-${Date.now()}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showNotification('success', 'Message Records', `Exported ${format.toUpperCase()} successfully.`);
    } catch (error: any) {
      showNotification('alert', 'Message Records', error?.message || `Failed to export ${format.toUpperCase()}.`);
    } finally {
      setExporting(false);
    }
  };

  const onSaveRetention = async () => {
    setSavingRetention(true);
    try {
      const months = Math.max(6, Math.min(240, Number(retentionMonths || 72)));
      const updated = await AdminService.updateMessageRetentionPolicy(months);
      setRetentionMonths(Number(updated?.retentionMonths || months));
      setRetentionUpdatedAt(new Date().toISOString());
      showNotification('success', 'Message Records', 'Retention policy updated.');
    } catch (error: any) {
      showNotification('alert', 'Message Records', error?.message || 'Failed to update retention policy.');
    } finally {
      setSavingRetention(false);
    }
  };

  const onResetFilters = () => {
    setFilters({
      conversationId: '',
      action: '',
      actorId: '',
      dateFrom: '',
      dateTo: '',
      search: ''
    });
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Message Records</h2>
          <p className="text-sm text-gray-500">
            Admin section: <span className="font-semibold">Staff Management {'>'} Message Records</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 inline-flex items-center gap-2"
            onClick={() => void loadRecords()}
          >
            <RefreshCcw className="w-4 h-4" /> Refresh
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 inline-flex items-center gap-2"
            onClick={() => onExport('csv')}
            disabled={exporting}
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 inline-flex items-center gap-2"
            onClick={() => onExport('json')}
            disabled={exporting}
          >
            <FileText className="w-4 h-4" /> JSON
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 inline-flex items-center gap-2"
            onClick={() => window.print()}
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <input
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Conversation ID"
            value={filters.conversationId}
            onChange={(event) => setFilters((prev) => ({ ...prev, conversationId: event.target.value }))}
          />
          <input
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Actor user ID"
            value={filters.actorId}
            onChange={(event) => setFilters((prev) => ({ ...prev, actorId: event.target.value }))}
          />
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={filters.action}
            onChange={(event) => setFilters((prev) => ({ ...prev, action: event.target.value }))}
          >
            <option value="">All actions</option>
            <option value="CREATED">CREATED</option>
            <option value="REPLIED">REPLIED</option>
            <option value="EDITED">EDITED</option>
            <option value="DELETED">DELETED</option>
            <option value="COPIED">COPIED</option>
          </select>
          <input
            type="date"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={filters.dateFrom}
            onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))}
          />
          <input
            type="date"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={filters.dateTo}
            onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value }))}
          />
          <input
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Search text"
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
            onClick={onResetFilters}
          >
            Reset
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
            onClick={() => setPage(1)}
          >
            Apply
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Retention policy</h3>
          <div className="text-xs text-gray-500">
            Last updated: {retentionUpdatedAt ? new Date(retentionUpdatedAt).toLocaleString() : 'Never'}
          </div>
        </div>
        <div className="mt-3 flex flex-col md:flex-row gap-3 md:items-center">
          <input
            type="number"
            min={6}
            max={240}
            className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={retentionMonths}
            onChange={(event) => setRetentionMonths(Number(event.target.value || 72))}
          />
          <div className="text-sm text-gray-600">months (6 to 240)</div>
          <button
            type="button"
            className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-black inline-flex items-center gap-2"
            onClick={onSaveRetention}
            disabled={savingRetention}
          >
            <Save className="w-4 h-4" /> Save retention
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-left px-4 py-3">Actor</th>
                <th className="text-left px-4 py-3">Conversation</th>
                <th className="text-left px-4 py-3">Before</th>
                <th className="text-left px-4 py-3">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-500" colSpan={6}>
                    Loading message records...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-500" colSpan={6}>
                    No message records found for current filters.
                  </td>
                </tr>
              ) : (
                records.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-xs font-medium">
                        {row.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div className="font-medium">{row.actorUser?.name || row.actorUser?.email || '-'}</div>
                      <div className="text-xs text-gray-500">{row.actorUser?.id || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div className="font-mono text-xs">{row.conversationId}</div>
                      <div className="text-xs text-gray-500">{row.messageId || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      <div className="line-clamp-3 break-words">{row.beforeText || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-800 max-w-xs">
                      <div className="line-clamp-3 break-words">{row.afterText || '-'}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-sm">
          <div className="text-gray-600">
            Page {page} of {totalPages} ({total} records)
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded border border-gray-300 text-gray-700 disabled:opacity-50"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
            >
              Prev
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded border border-gray-300 text-gray-700 disabled:opacity-50"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={!hasMore}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageRecords;

