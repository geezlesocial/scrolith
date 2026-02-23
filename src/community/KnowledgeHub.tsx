import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CalendarDays, Search, Tag } from 'lucide-react';
import { CommunityService } from '../services/community';

type KnowledgeItem = {
  id: string;
  title: string;
  summary: string;
  author: string;
  createdAt: string;
  replies: number;
  tags: string[];
};

const toIso = (value: unknown) => {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString();
};

const KnowledgeHub = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [query, setQuery] = useState('');
  const [topics, setTopics] = useState<Array<{ id: string; label: string; count: number; slug: string }>>([]);
  const [events, setEvents] = useState<Array<{ id: string; title: string; startTime: string; attendees: number }>>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError('');

        const [threads, trending, upcomingEvents] = await Promise.all([
          CommunityService.getThreads({ limit: 40 }),
          CommunityService.getTrendingTags(20, 30),
          CommunityService.getEvents()
        ]);

        if (cancelled) return;

        const normalizedItems = (Array.isArray(threads) ? threads : []).map((thread: any) => ({
          id: String(thread?.id || ''),
          title: String(thread?.title || 'Untitled discussion'),
          summary: String(thread?.content || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 220),
          author: String(thread?.userName || thread?.user_name || 'Community member'),
          createdAt: toIso(thread?.createdAt || thread?.created_at),
          replies: Number(thread?.repliesCount ?? thread?.replies_count ?? thread?.interactions?.comments ?? 0),
          tags: Array.isArray(thread?.tags)
            ? thread.tags.map((tag: unknown) => String(tag || '').trim()).filter(Boolean)
            : []
        }));

        const normalizedTopics = (Array.isArray(trending) ? trending : []).map((topic: any, index: number) => {
          const slug = String(topic?.slug || topic?.tag || topic?.name || '').trim();
          const label = String(topic?.label || topic?.name || slug || `Topic ${index + 1}`)
            .split('-')
            .filter(Boolean)
            .map((segment: string) => segment.charAt(0).toUpperCase() + segment.slice(1))
            .join(' ');
          return {
            id: String(topic?.id || slug || `topic-${index + 1}`),
            label,
            slug,
            count: Number(topic?.posts ?? topic?.postCount ?? topic?.postsCount ?? topic?.count ?? 0)
          };
        });

        const normalizedEvents = (Array.isArray(upcomingEvents) ? upcomingEvents : [])
          .slice(0, 6)
          .map((event: any) => ({
            id: String(event?.id || ''),
            title: String(event?.title || 'Community event'),
            startTime: toIso(event?.startTime || event?.start_time),
            attendees: Number(event?.attendees ?? event?.attendeeCount ?? event?.attendee_count ?? 0)
          }));

        setItems(normalizedItems.filter((item) => item.id));
        setTopics(normalizedTopics);
        setEvents(normalizedEvents.filter((event) => event.id));
      } catch (loadError: any) {
        if (cancelled) return;
        console.error('Knowledge hub load error:', loadError);
        setError(loadError?.message || 'Failed to load knowledge hub');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const onRealtimeRefresh = () => {
      load().catch((refreshError) => {
        console.error('Knowledge hub realtime refresh failed:', refreshError);
      });
    };

    load();
    window.addEventListener('community:thread_created', onRealtimeRefresh as EventListener);
    window.addEventListener('community:thread_deleted', onRealtimeRefresh as EventListener);
    window.addEventListener('community:event_created', onRealtimeRefresh as EventListener);
    window.addEventListener('community:event_updated', onRealtimeRefresh as EventListener);
    window.addEventListener('community:event_deleted', onRealtimeRefresh as EventListener);
    window.addEventListener('community:event_registered', onRealtimeRefresh as EventListener);
    window.addEventListener('community:event_unregistered', onRealtimeRefresh as EventListener);
    window.addEventListener('community:stats_updated', onRealtimeRefresh as EventListener);

    const poll = window.setInterval(onRealtimeRefresh, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.removeEventListener('community:thread_created', onRealtimeRefresh as EventListener);
      window.removeEventListener('community:thread_deleted', onRealtimeRefresh as EventListener);
      window.removeEventListener('community:event_created', onRealtimeRefresh as EventListener);
      window.removeEventListener('community:event_updated', onRealtimeRefresh as EventListener);
      window.removeEventListener('community:event_deleted', onRealtimeRefresh as EventListener);
      window.removeEventListener('community:event_registered', onRealtimeRefresh as EventListener);
      window.removeEventListener('community:event_unregistered', onRealtimeRefresh as EventListener);
      window.removeEventListener('community:stats_updated', onRealtimeRefresh as EventListener);
    };
  }, []);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      const haystack = `${item.title} ${item.summary} ${item.author} ${item.tags.join(' ')}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [items, query]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-500">Knowledge Hub</div>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">Professional Resources & Discussions</h1>
            <p className="mt-1 text-sm text-gray-600">
              Discover verified community discussions, practical guides, and upcoming events in real time.
            </p>
          </div>
          <Link
            to="/community/forum?create=1"
            className="inline-flex items-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Start Discussion
          </Link>
        </div>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search guides, discussions, and topics..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-700 outline-none transition focus:border-indigo-300 focus:bg-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Community Knowledge Library</h2>
              <div className="text-xs text-gray-500">{filteredItems.length} entries</div>
            </div>
            <div className="divide-y divide-gray-100">
              {loading ? (
                <div className="px-5 py-10 text-center text-sm text-gray-500">Loading resources...</div>
              ) : error ? (
                <div className="px-5 py-10 text-center text-sm text-red-600">{error}</div>
              ) : filteredItems.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-500">No resources match your search yet.</div>
              ) : (
                filteredItems.map((item) => (
                  <Link key={item.id} to={`/community/thread/${item.id}`} className="block px-5 py-4 transition hover:bg-gray-50">
                    <div className="flex items-start gap-3">
                      <BookOpen className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-500" />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold text-gray-900">{item.title}</h3>
                        <p className="mt-1 line-clamp-2 text-sm text-gray-600">{item.summary || 'Open discussion for details.'}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          <span>By {item.author}</span>
                          <span>|</span>
                          <span>{item.replies} replies</span>
                          {item.createdAt ? (
                            <>
                              <span>|</span>
                              <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                            </>
                          ) : null}
                        </div>
                        {item.tags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.tags.slice(0, 5).map((tag) => (
                              <span key={`${item.id}-${tag}`} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Tag className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-semibold text-gray-900">Trending Topics</h3>
            </div>
            <div className="space-y-2">
              {topics.length === 0 ? (
                <div className="text-xs text-gray-500">No trending topics yet.</div>
              ) : (
                topics.slice(0, 10).map((topic) => (
                  <Link
                    key={topic.id}
                    to={topic.slug ? `/community/forum?topic=${encodeURIComponent(topic.slug)}` : '/community/forum'}
                    className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm text-gray-700 transition hover:border-indigo-200 hover:bg-indigo-50"
                  >
                    <span className="truncate">{topic.label}</span>
                    <span className="ml-2 text-xs text-gray-500">{topic.count}</span>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-gray-900">Upcoming Events</h3>
            </div>
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="text-xs text-gray-500">No upcoming events yet.</div>
              ) : (
                events.map((event) => (
                  <div key={event.id} className="rounded-lg border border-gray-100 px-3 py-2">
                    <p className="text-sm font-medium text-gray-900">{event.title}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {event.startTime ? new Date(event.startTime).toLocaleString() : 'Upcoming'} | {event.attendees} attendees
                    </p>
                  </div>
                ))
              )}
            </div>
            <Link
              to="/community/events"
              className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Join Event
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeHub;
