
import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, MessageSquare, Users, BookOpen, Calendar, Search, Bell, ShieldCheck, ChevronDown, Hash, HelpCircle, Trophy, User } from 'lucide-react';
import { useUser } from '../context/UserContext';

const CommunityLayout = () => {
    const location = useLocation();
    const activePath = location.pathname;
    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const { user } = useUser();

    const navItems = [
        { label: 'Home', path: '/community', icon: Home },
        { label: 'Forum', path: '/community/forum', icon: MessageSquare },
        { label: 'Chat', path: '/community/chat', icon: Hash },
        { label: 'Clubs', path: '/community/clubs', icon: Users },
        { label: 'Events', path: '/community/events', icon: Calendar },
        { label: 'Leaderboard', path: '/community/leaderboard', icon: Trophy },
    ];

    const moreItems = [
        { label: 'Contributors', path: '/community/leaderboard', icon: Users },
        { label: 'Content', path: '/community/content', icon: BookOpen },
        { label: 'Help', path: '/support', icon: HelpCircle },
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Community Header */}
            <div className="bg-white border-b border-gray-200 sticky top-16 z-30 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center">
                            <Link to="/community" className="font-bold text-xl text-indigo-600 mr-8 tracking-tight hidden md:block hover:opacity-80">
                                Geezle Community
                            </Link>
                            <nav className="flex space-x-1 overflow-x-auto no-scrollbar">
                                {navItems.map((item) => (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        className={`px-3 py-2 rounded-md text-sm font-medium flex items-center transition-colors whitespace-nowrap ${
                                            activePath === item.path 
                                            ? 'bg-indigo-50 text-indigo-700' 
                                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                        }`}
                                    >
                                        <item.icon className={`w-4 h-4 mr-2 ${activePath === item.path ? 'text-indigo-600' : 'text-gray-400'}`} />
                                        <span className="hidden sm:inline">{item.label}</span>
                                    </Link>
                                ))}
                                
                                {/* More Dropdown */}
                                <div className="relative">
                                    <button 
                                        onClick={() => setIsMoreOpen(!isMoreOpen)}
                                        className="px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-50 flex items-center"
                                    >
                                        More <ChevronDown className="w-4 h-4 ml-1" />
                                    </button>
                                    
                                    {isMoreOpen && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setIsMoreOpen(false)}></div>
                                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 ring-1 ring-black ring-opacity-5 z-20">
                                                {moreItems.map((item) => (
                                                    <Link
                                                        key={item.label}
                                                        to={item.path}
                                                        onClick={() => setIsMoreOpen(false)}
                                                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                                                    >
                                                        <item.icon className="w-4 h-4 mr-3 text-gray-400" />
                                                        {item.label}
                                                    </Link>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </nav>
                        </div>
                        <div className="flex items-center space-x-4">
                            {user?.gcoinBalance !== undefined && (
                                <div className="hidden lg:flex items-center px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full border border-yellow-200 text-xs font-bold">
                                    <span className="mr-1">🪙</span> {user.gcoinBalance} Gcoins
                                </div>
                            )}
                            <div className="relative hidden lg:block">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                <input 
                                    type="text" 
                                    placeholder="Search topics..." 
                                    className="pl-9 pr-4 py-2 border border-gray-300 rounded-full text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-48 bg-gray-50 focus:bg-white transition-all"
                                />
                            </div>
                            <button className="text-gray-500 hover:text-indigo-600 relative p-1 rounded-full hover:bg-gray-100 transition">
                                <Bell className="w-5 h-5" />
                                <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Safety Banner */}
            <div className="bg-yellow-50 border-b border-yellow-100">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-start sm:items-center">
                    <ShieldCheck className="w-5 h-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                    <p className="text-sm text-yellow-800">
                        <strong>⚠️ Security Notice:</strong> Do not share sensitive personal information (Passwords, bank details, government IDs). AI Moderation is active in all chats.
                    </p>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <Outlet />
            </div>
        </div>
    );
};

export default CommunityLayout;
