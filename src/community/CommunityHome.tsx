
import React, { useEffect, useState } from 'react';
import { CommunityService } from '../services/community';
import { AdService } from '../services/ads';
import { ForumThread, CommunityEvent, ContributorProfile, AdCampaign } from '../types';
import { TrendingUp, Calendar, Award, MessageCircle, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import InteractionBar from '../components/InteractionBar';
import AdCard from '../components/AdCard';
import { useUser } from '../context/UserContext';

const CommunityHome = () => {
    const { user } = useUser();
    const [threads, setThreads] = useState<ForumThread[]>([]);
    const [events, setEvents] = useState<CommunityEvent[]>([]);
    const [contributors, setContributors] = useState<ContributorProfile[]>([]);
    const [ads, setAds] = useState<AdCampaign[]>([]);

    useEffect(() => {
        const loadData = async () => {
            const [t, e, c, a] = await Promise.all([
                CommunityService.getThreads(),
                CommunityService.getEvents(),
                CommunityService.getTopContributors(),
                AdService.getAds(user?.role) // Targeted ads
            ]);
            setThreads(t);
            setEvents(e);
            setContributors(c);
            setAds(a);
        };
        loadData();
    }, [user]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Feed */}
            <div className="lg:col-span-2 space-y-8">
                {/* Welcome / AI Insight */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-700 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
                    <div className="relative z-10">
                        <h1 className="text-3xl font-bold mb-2">Welcome to the Community</h1>
                        <p className="text-indigo-100 mb-6 max-w-xl">
                            Connect, learn, and grow with thousands of professionals. 
                            <br/><span className="text-sm opacity-90 mt-2 inline-flex items-center bg-white/20 px-2 py-1 rounded border border-white/10">
                                <Zap className="w-3 h-3 mr-1 text-yellow-300"/> AI Suggestion: Check out the "SaaS Founders" club based on your profile.
                            </span>
                        </p>
                        <div className="flex gap-3">
                            <Link to="/community/forum" className="bg-white text-indigo-700 px-6 py-2 rounded-lg font-bold hover:bg-gray-100 transition shadow-md">
                                Join Discussions
                            </Link>
                            <Link to="/community/clubs" className="bg-indigo-800 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-900 transition shadow-md border border-indigo-700">
                                Find Clubs
                            </Link>
                        </div>
                    </div>
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                        <MessageCircle className="w-64 h-64" />
                    </div>
                </div>

                {/* Trending Discussions */}
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-gray-900 flex items-center">
                            <TrendingUp className="w-5 h-5 mr-2 text-red-500" /> Trending Discussions
                        </h2>
                        <Link to="/community/forum" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">View All</Link>
                    </div>
                    <div className="space-y-4">
                        {threads.map((thread, index) => (
                            <React.Fragment key={thread.id}>
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:border-indigo-200 transition-colors">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full mb-2 inline-block border border-indigo-100">
                                                {thread.categoryName}
                                            </span>
                                            <h3 className="text-lg font-semibold text-gray-900 mb-1 hover:text-indigo-600 cursor-pointer transition">
                                                {thread.title}
                                            </h3>
                                            <p className="text-sm text-gray-500 line-clamp-2 mb-2">{thread.content}</p>
                                            <div className="flex items-center text-xs text-gray-400 space-x-3 mb-2">
                                                <span className="flex items-center"><img src={thread.userAvatar} className="w-4 h-4 rounded-full mr-1"/> {thread.userName}</span>
                                                <span>• {new Date(thread.createdAt).toLocaleDateString()}</span>
                                                {thread.isPinned && <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold">Pinned</span>}
                                            </div>
                                            
                                            {/* Interaction Bar */}
                                            <InteractionBar 
                                                type="thread" 
                                                id={thread.id} 
                                                initialCounts={thread.interactions}
                                                initialState={thread.userState}
                                            />
                                        </div>
                                    </div>
                                </div>
                                {/* Inject Ad every 3 posts */}
                                {ads.length > 0 && (index + 1) % 3 === 0 && (
                                    <AdCard ad={ads[Math.floor(Math.random() * ads.length)]} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-8">
                {/* Ad in Sidebar */}
                {ads.find(a => a.placement === 'sidebar') && (
                    <AdCard ad={ads.find(a => a.placement === 'sidebar')!} />
                )}

                {/* Upcoming Events */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                        <Calendar className="w-5 h-5 mr-2 text-blue-600" /> Upcoming Events
                    </h3>
                    <div className="space-y-4">
                        {events.map(event => (
                            <div key={event.id} className="flex gap-4 group cursor-pointer">
                                <div className="w-16 h-16 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden relative">
                                    <img src={event.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm text-gray-900 line-clamp-1 group-hover:text-blue-600 transition">{event.title}</h4>
                                    <p className="text-xs text-gray-500 mt-1">{new Date(event.startTime).toLocaleDateString()}</p>
                                    <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded mt-1 inline-block uppercase font-bold">{event.type}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Link to="/community/events" className="block mt-4 text-center text-sm font-bold text-blue-600 hover:underline">See All Events</Link>
                </div>

                {/* Top Contributors */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                        <Award className="w-5 h-5 mr-2 text-yellow-500" /> Top Contributors
                    </h3>
                    <div className="space-y-4">
                        {contributors.map((user, idx) => (
                            <div key={user.userId} className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <span className={`text-sm font-bold mr-3 w-5 h-5 flex items-center justify-center rounded-full ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : 'text-gray-400'}`}>
                                        {idx + 1}
                                    </span>
                                    <img src={user.avatar} className="w-8 h-8 rounded-full border border-gray-200 mr-3" />
                                    <div>
                                        <div className="text-sm font-bold text-gray-900">{user.userName}</div>
                                        <div className="text-[10px] text-gray-500">{user.reputation}</div>
                                    </div>
                                </div>
                                <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-600">{user.points} pts</span>
                            </div>
                        ))}
                    </div>
                </div>

                 {/* AI Learning */}
                 <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 relative overflow-hidden">
                    <div className="relative z-10">
                        <h3 className="font-bold text-indigo-900 mb-2 flex items-center">
                            <Zap className="w-4 h-4 mr-2" /> AI Learning Path
                        </h3>
                        <p className="text-sm text-indigo-700 mb-4">Based on your activity, we recommend learning <strong>"Advanced React Patterns"</strong>.</p>
                        <button className="w-full bg-white text-indigo-600 font-bold text-xs py-2 rounded border border-indigo-200 hover:bg-indigo-50 transition shadow-sm">
                            View Course
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CommunityHome;
