
import React, { useState, useEffect } from 'react';
import { CommunityService } from '../services/community';
import { CommunityEvent, UserRole } from '../types';
import { Calendar, Clock, MapPin, Video, CheckCircle, ExternalLink, Trash2 } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useUser } from '../context/UserContext';

const Events = () => {
    const [events, setEvents] = useState<CommunityEvent[]>([]);
    const { showNotification } = useNotification();
    const { user } = useUser();
    const isAdmin = user?.role === UserRole.ADMIN;

    useEffect(() => {
        loadEvents();
    }, []);

    const loadEvents = async () => {
        const data = await CommunityService.getEvents();
        setEvents(data);
    };

    const handleRegister = async (event: CommunityEvent) => {
        if (event.isRegistered) return;
        await CommunityService.registerEvent(event.id);
        setEvents(prev => prev.map(e => e.id === event.id ? { ...e, isRegistered: true, attendees: e.attendees + 1 } : e));
        showNotification('success', 'Registered', `You are booked for ${event.title}`);
    };

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to cancel and delete this event?")) {
            await CommunityService.deleteEvent(id);
            showNotification('success', 'Deleted', 'Event cancelled and removed.');
            loadEvents();
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">Upcoming Events</h1>
            
            <div className="space-y-4">
                {events.map(event => (
                    <div key={event.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-6 hover:border-indigo-200 transition-all group relative">
                        {/* Admin Control */}
                        {isAdmin && (
                            <button 
                                onClick={() => handleDelete(event.id)}
                                className="absolute top-4 right-4 z-10 p-1.5 bg-white border border-gray-200 text-gray-400 hover:text-red-600 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Admin: Delete Event"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}

                        <div className="w-full md:w-56 h-36 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden relative">
                             <img src={event.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                             <div className="absolute top-2 left-2 bg-white/90 backdrop-blur px-2 py-1 rounded text-xs font-bold text-gray-900 flex flex-col items-center shadow-sm">
                                 <span className="text-red-600">{new Date(event.startTime).toLocaleString('default', { month: 'short' }).toUpperCase()}</span>
                                 <span className="text-lg leading-none">{new Date(event.startTime).getDate()}</span>
                             </div>
                        </div>
                        <div className="flex-1">
                            <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                                <div>
                                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{event.type}</span>
                                    <h3 className="text-xl font-bold text-gray-900 mt-2 mb-1">{event.title}</h3>
                                    <p className="text-sm text-gray-500 mb-1">Hosted by {event.hostName}</p>
                                </div>
                                {event.isRegistered && (
                                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center border border-green-200">
                                        <CheckCircle className="w-3 h-3 mr-1" /> Registered
                                    </span>
                                )}
                            </div>
                            <p className="text-gray-600 mt-3 mb-4 text-sm line-clamp-2">{event.description}</p>
                            
                            <div className="flex flex-wrap gap-4 text-sm text-gray-500 mt-auto pt-3 border-t border-gray-100">
                                <div className="flex items-center">
                                    <Clock className="w-4 h-4 mr-1.5 text-gray-400" />
                                    {new Date(event.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </div>
                                <div className="flex items-center">
                                    <Video className="w-4 h-4 mr-1.5 text-gray-400" />
                                    Online Event
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col justify-center items-end min-w-[140px] border-l border-gray-100 pl-6 md:pl-0 md:border-l-0">
                            <div className="text-sm text-gray-500 mb-3 font-medium">{event.attendees} attending</div>
                            <button 
                                onClick={() => handleRegister(event)}
                                disabled={event.isRegistered}
                                className={`w-full py-2.5 px-4 rounded-lg font-bold transition-all shadow-sm ${
                                    event.isRegistered 
                                    ? 'bg-gray-100 text-gray-500 cursor-default border border-gray-200' 
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                }`}
                            >
                                {event.isRegistered ? 'Ticket Confirmed' : 'Register Now'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Events;
