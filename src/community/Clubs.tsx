
import React, { useState, useEffect } from 'react';
import { CommunityService } from '../services/community';
import { CommunityClub, UserRole } from '../types';
import { Users, Lock, Globe, Plus, ArrowRight, Trash2 } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useUser } from '../context/UserContext';

const Clubs = () => {
    const [clubs, setClubs] = useState<CommunityClub[]>([]);
    const { showNotification } = useNotification();
    const { user } = useUser();
    const isAdmin = user?.role === UserRole.ADMIN;

    useEffect(() => {
        loadClubs();
    }, []);

    const loadClubs = async () => {
        const data = await CommunityService.getClubs();
        setClubs(data);
    };

    const handleJoin = async (club: CommunityClub) => {
        if (club.isJoined) return;
        await CommunityService.joinClub(club.id);
        setClubs(prev => prev.map(c => c.id === club.id ? { ...c, isJoined: true, memberCount: c.memberCount + 1 } : c));
        showNotification('success', 'Joined', `You are now a member of ${club.name}`);
    };

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this club?")) {
            await CommunityService.deleteClub(id);
            showNotification('success', 'Deleted', 'Club removed.');
            loadClubs();
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Community Clubs</h1>
                    <p className="text-gray-500">Join specialized groups to network and learn.</p>
                </div>
                <button className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 flex items-center shadow-sm transition-colors">
                    <Plus className="w-4 h-4 mr-2" /> Request Club
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {clubs.map(club => (
                    <div key={club.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-all group flex flex-col h-full relative">
                        <div className="h-32 bg-gray-200 relative">
                            <img src={club.coverImage} className="w-full h-full object-cover" />
                            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-black/60 to-transparent"></div>
                            <div className="absolute top-3 right-3 bg-black/40 backdrop-blur text-white text-xs px-2 py-1 rounded flex items-center border border-white/20">
                                {club.visibility === 'private' ? <Lock className="w-3 h-3 mr-1" /> : <Globe className="w-3 h-3 mr-1" />}
                                <span className="capitalize">{club.visibility}</span>
                            </div>
                        </div>
                        
                        {/* Admin Control */}
                        {isAdmin && (
                            <button 
                                onClick={() => handleDelete(club.id)}
                                className="absolute top-2 left-2 z-10 p-1.5 bg-red-600 text-white rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                                title="Admin: Delete Club"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}

                        <div className="p-5 flex-1 flex flex-col">
                            <h3 className="font-bold text-lg text-gray-900 mb-2">{club.name}</h3>
                            <p className="text-gray-500 text-sm mb-4 line-clamp-2 flex-1">{club.description}</p>
                            
                            <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-100">
                                <div className="text-xs text-gray-500 flex items-center font-medium">
                                    <Users className="w-4 h-4 mr-1.5 text-gray-400" /> {club.memberCount.toLocaleString()} members
                                </div>
                                <button 
                                    onClick={() => handleJoin(club)}
                                    disabled={club.isJoined}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                        club.isJoined 
                                        ? 'bg-green-50 text-green-700 cursor-default border border-green-100' 
                                        : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                                    }`}
                                >
                                    {club.isJoined ? 'Joined' : 'Join Club'}
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Clubs;
