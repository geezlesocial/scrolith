import React, { useEffect, useMemo, useState } from 'react';
import { LifeBuoy, Plus, Send } from 'lucide-react';
import { SupportService } from '../../services/support';
import { SupportTicket, TicketCategory } from '../../types';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { useContent } from '../../context/ContentContext';
import { executeRecaptcha } from '../../services/recaptcha';

const SupportCenter = () => {
  const { user } = useUser();
  const { settings } = useContent();
  const { showNotification } = useNotification();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [creating, setCreating] = useState(false);

  const [newTicket, setNewTicket] = useState({
    full_name: user?.name || '',
    email: user?.email || '',
    mobile: '',
    subject: '',
    category: '',
    message: ''
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, mine] = await Promise.all([
        SupportService.getCategories(),
        SupportService.getMyTickets()
      ]);
      setCategories(cats || []);
      setTickets(mine || []);
      if (!selected && mine && mine.length > 0) {
        setSelected(mine[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const handleCategoryUpdate = (event: StorageEvent) => {
      if (event.key === 'support_categories_updated') {
        load();
      }
    };
    window.addEventListener('storage', handleCategoryUpdate);
    return () => {
      window.removeEventListener('storage', handleCategoryUpdate);
    };
  }, []);

  const canSubmit = useMemo(() => {
    return Boolean(newTicket.subject && newTicket.message && newTicket.category && newTicket.email && newTicket.full_name);
  }, [newTicket]);

  const submitTicket = async () => {
    if (!canSubmit) return;
    setCreating(true);
    try {
      const recaptchaConfig = (settings as any)?.integrations?.recaptcha || {};
      const legacySiteKey = (settings as any)?.recaptcha_site_key || (settings as any)?.recaptchaSiteKey || '';
      const recaptchaEnabled = Boolean(recaptchaConfig?.enabled) || Boolean(legacySiteKey);
      const siteKey = String(recaptchaConfig?.siteKey || legacySiteKey || '').trim();
      const version = (recaptchaConfig?.version || 'v3') as 'v2' | 'v3';
      let recaptchaToken: string | undefined;

      if (recaptchaEnabled) {
        if (version !== 'v3') {
          showNotification('error', 'reCAPTCHA Error', 'reCAPTCHA v3 is required for support tickets.');
          setCreating(false);
          return;
        }
        recaptchaToken = await executeRecaptcha(siteKey, 'support_ticket');
      }

      const created = await SupportService.createTicketAuth({ ...newTicket, recaptchaToken });
      showNotification('success', 'Ticket Created', 'Your support ticket has been submitted.');
      setTickets((prev) => [created, ...prev]);
      setSelected(created);
      setNewTicket({
        full_name: user?.name || '',
        email: user?.email || '',
        mobile: '',
        subject: '',
        category: '',
        message: ''
      });
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Unable to create ticket.';
      showNotification('error', 'Ticket Failed', message);
    } finally {
      setCreating(false);
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    try {
      const created = await SupportService.replyToTicket(selected.id, { message: reply.trim() });
      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === selected.id
            ? { ...ticket, replies: [...ticket.replies, created], updated_at: new Date().toISOString() }
            : ticket
        )
      );
      setSelected((prev) =>
        prev
          ? { ...prev, replies: [...prev.replies, created], updated_at: new Date().toISOString() }
          : prev
      );
      setReply('');
    } catch (err: any) {
      showNotification('error', 'Reply Failed', err?.message || 'Unable to send reply.');
    }
  };

  if (loading) {
    return <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />;
  }

  if (error) {
    return <div className="p-6 bg-white rounded-xl border border-red-100 text-red-700">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center">
            <LifeBuoy className="w-6 h-6 mr-2 text-blue-600" /> Support Center
          </h2>
          <p className="text-sm text-gray-500">Create tickets and follow up with support.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h3 className="font-bold text-gray-900">My Tickets</h3>
            <button onClick={load} className="text-xs font-bold text-blue-600">Refresh</button>
          </div>
          {tickets.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">No tickets yet.</div>
          ) : (
            <div className="divide-y">
              {tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => setSelected(ticket)}
                  className={`w-full text-left px-5 py-4 hover:bg-gray-50 ${
                    selected?.id === ticket.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-bold text-gray-900 truncate">{ticket.subject}</div>
                    <div className="text-[10px] text-gray-500">
                      {new Date(ticket.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{ticket.status}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h3 className="font-bold text-gray-900 flex items-center">
              <Plus className="w-4 h-4 mr-2" /> New Ticket
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-600">Full Name</label>
                <input
                  className="mt-1 w-full border rounded-xl p-3 text-sm"
                  value={newTicket.full_name}
                  onChange={(e) => setNewTicket({ ...newTicket, full_name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600">Email</label>
                <input
                  className="mt-1 w-full border rounded-xl p-3 text-sm"
                  value={newTicket.email}
                  onChange={(e) => setNewTicket({ ...newTicket, email: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600">Category</label>
                <select
                  className="mt-1 w-full border rounded-xl p-3 text-sm"
                  value={newTicket.category}
                  onChange={(e) => setNewTicket({ ...newTicket, category: e.target.value })}
                >
                  <option value="">Select</option>
                  {categories.filter((c) => c.is_active).map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600">Phone (optional)</label>
                <input
                  className="mt-1 w-full border rounded-xl p-3 text-sm"
                  value={newTicket.mobile}
                  onChange={(e) => setNewTicket({ ...newTicket, mobile: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600">Subject</label>
              <input
                className="mt-1 w-full border rounded-xl p-3 text-sm"
                value={newTicket.subject}
                onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600">Message</label>
              <textarea
                className="mt-1 w-full border rounded-xl p-3 text-sm min-h-[120px]"
                value={newTicket.message}
                onChange={(e) => setNewTicket({ ...newTicket, message: e.target.value })}
              />
            </div>
            <button
              onClick={submitTicket}
              disabled={!canSubmit || creating}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50"
            >
              <Send className="w-4 h-4 mr-2" /> {creating ? 'Submitting...' : 'Submit Ticket'}
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b">
              <h3 className="font-bold text-gray-900">Ticket Conversation</h3>
            </div>
            {!selected ? (
              <div className="p-6 text-sm text-gray-500">Select a ticket to view conversation.</div>
            ) : (
              <div className="p-6 space-y-4">
                <div className="text-sm text-gray-700">{selected.message}</div>
                <div className="space-y-3">
                  {selected.replies.map((r) => (
                    <div key={r.id} className="bg-gray-50 border rounded-xl p-3 text-sm">
                      <div className="text-xs text-gray-500 mb-1">{r.sender_name}</div>
                      <div className="text-gray-800">{r.message}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded-xl p-3 text-sm"
                    placeholder="Write a reply..."
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                  <button
                    onClick={sendReply}
                    className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportCenter;
