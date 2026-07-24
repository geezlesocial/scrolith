import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CommunityService } from '../services/community';
import { CommunityEvent, UserRole } from '../types';
import { CalendarDays, CheckCircle, Clock, MapPin, Plus, Trash2, Users } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useUser } from '../context/UserContext';

type EventFormState = {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  type: 'workshop' | 'meetup' | 'webinar';
  location: string;
  maxAttendees: string;
  image: string;
};

const INITIAL_FORM: EventFormState = {
  title: '',
  description: '',
  startTime: '',
  endTime: '',
  type: 'workshop',
  location: '',
  maxAttendees: '',
  image: ''
};

const resolveEventDate = (event: CommunityEvent) => {
  const raw = String(event.startTime || event.start_time || '');
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
};

const resolveEventEndDate = (event: CommunityEvent) => {
  const raw = String(event.endTime || event.end_time || '');
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
};

const Events = () => {
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<EventFormState>(INITIAL_FORM);
  const { showNotification } = useNotification();
  const { user } = useUser();
  const isAdmin = user?.role === UserRole.ADMIN;

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await CommunityService.getEvents();
      setEvents(Array.isArray(data) ? data : []);
    } catch (error: any) {
      showNotification('error', 'Events', error?.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    const refresh = () => {
      loadEvents().catch((error) => {
        console.error('Event refresh failed:', error);
      });
    };
    window.addEventListener('community:event_registered', refresh as EventListener);
    window.addEventListener('community:event_unregistered', refresh as EventListener);
    window.addEventListener('community:event_created', refresh as EventListener);
    window.addEventListener('community:event_updated', refresh as EventListener);
    window.addEventListener('community:event_deleted', refresh as EventListener);
    return () => {
      window.removeEventListener('community:event_registered', refresh as EventListener);
      window.removeEventListener('community:event_unregistered', refresh as EventListener);
      window.removeEventListener('community:event_created', refresh as EventListener);
      window.removeEventListener('community:event_updated', refresh as EventListener);
      window.removeEventListener('community:event_deleted', refresh as EventListener);
    };
  }, [loadEvents]);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const aTime = resolveEventDate(a)?.getTime() || 0;
      const bTime = resolveEventDate(b)?.getTime() || 0;
      return aTime - bTime;
    });
  }, [events]);

  const resetForm = () => {
    setForm(INITIAL_FORM);
  };

  const handleToggleRegistration = async (event: CommunityEvent) => {
    try {
      const isRegistered = Boolean(event.isRegistered ?? event.is_registered);
      if (isRegistered) {
        await CommunityService.unregisterEvent(event.id);
        showNotification('success', 'Event', `You left ${event.title}`);
      } else {
        await CommunityService.registerEvent(event.id);
        showNotification('success', 'Event', `You are registered for ${event.title}`);
      }
      await loadEvents();
    } catch (error: any) {
      showNotification('error', 'Event', error?.message || 'Unable to update registration');
    }
  };

  const handleDelete = async (id: string) => {
    const accepted = window.confirm('Delete this event? This action cannot be undone.');
    if (!accepted) return;
    try {
      await CommunityService.deleteEvent(id);
      showNotification('success', 'Event', 'Event deleted');
      await loadEvents();
    } catch (error: any) {
      showNotification('error', 'Event', error?.message || 'Failed to delete event');
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const start = new Date(form.startTime);
    const end = new Date(form.endTime);
    if (!form.title.trim() || !form.description.trim()) {
      showNotification('error', 'Event', 'Title and description are required');
      return;
    }
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      showNotification('error', 'Event', 'Please provide valid start and end times');
      return;
    }

    setSubmitting(true);
    try {
      await CommunityService.createEvent({
        title: form.title.trim(),
        description: form.description.trim(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        type: form.type,
        location: form.location.trim(),
        image: form.image.trim(),
        maxAttendees: form.maxAttendees.trim() ? Number(form.maxAttendees.trim()) : null
      });
      showNotification('success', 'Event', 'Event created');
      setShowCreateModal(false);
      resetForm();
      await loadEvents();
    } catch (error: any) {
      showNotification('error', 'Event', error?.message || 'Failed to create event');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative z-0 space-y-6" data-testid="community-events-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Upcoming Events</h1>
          <p className="mt-1 text-sm text-gray-600">
            Join live sessions, workshops, and community meetups in real time.
          </p>
        </div>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="relative z-10 inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            data-testid="community-create-event"
          >
            <Plus className="h-4 w-4" />
            Create Event
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading events...</div>
      ) : sortedEvents.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No upcoming events yet.
        </div>
      ) : (
        <div className="space-y-4">
          {sortedEvents.map((event) => {
            const start = resolveEventDate(event);
            const end = resolveEventEndDate(event);
            const isRegistered = Boolean(event.isRegistered ?? event.is_registered);
            return (
              <div
                key={event.id}
                className="group relative flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 md:flex-row"
              >
                {isAdmin ? (
                  <button
                    onClick={() => handleDelete(event.id)}
                    className="absolute right-4 top-4 rounded-md border border-gray-200 bg-white p-1.5 text-gray-400 hover:text-red-600"
                    title="Delete event"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}

                <div className="h-36 w-full flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 md:w-56">
                  {event.image ? (
                    <img src={event.image} alt={event.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-blue-500 text-white">
                      <CalendarDays className="h-8 w-8" />
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold uppercase text-indigo-600">
                        {String(event.type || 'workshop')}
                      </span>
                      <h3 className="mt-2 text-xl font-bold text-gray-900">{event.title}</h3>
                      <p className="text-sm text-gray-500">Hosted by {event.hostName || event.host_name || 'Community host'}</p>
                    </div>
                    {isRegistered ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Registered
                      </span>
                    ) : null}
                  </div>

                  <p className="line-clamp-2 text-sm text-gray-600">{event.description}</p>

                  <div className="mt-auto flex flex-wrap items-center gap-4 text-sm text-gray-500">
                    <div className="inline-flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-gray-400" />
                      {start ? start.toLocaleString() : 'TBD'}
                    </div>
                    <div className="inline-flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-gray-400" />
                      {Number(event.attendees || 0)} attending
                    </div>
                    {event.location ? (
                      <div className="inline-flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        {event.location}
                      </div>
                    ) : null}
                    {end ? <div className="text-xs text-gray-400">Ends {end.toLocaleString()}</div> : null}
                  </div>
                </div>

                <div className="flex min-w-[165px] items-center">
                  <button
                    onClick={() => handleToggleRegistration(event)}
                    className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                      isRegistered
                        ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {isRegistered ? 'Unregister' : 'Register Now'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Create Community Event</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                x
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Event title"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
                <select
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as EventFormState['type'] }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                >
                  <option value="workshop">Workshop</option>
                  <option value="meetup">Meetup</option>
                  <option value="webinar">Webinar</option>
                </select>
              </div>
              <textarea
                required
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Event description"
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="datetime-local"
                  required
                  value={form.startTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
                <input
                  type="datetime-local"
                  required
                  value={form.endTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  value={form.location}
                  onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                  placeholder="Location (optional)"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
                <input
                  type="number"
                  min={1}
                  value={form.maxAttendees}
                  onChange={(e) => setForm((prev) => ({ ...prev, maxAttendees: e.target.value }))}
                  placeholder="Max attendees (optional)"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <input
                value={form.image}
                onChange={(e) => setForm((prev) => ({ ...prev, image: e.target.value }))}
                placeholder="Image URL (optional)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Creating...' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Events;
