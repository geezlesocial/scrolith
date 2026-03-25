import React, { useEffect, useMemo, useState } from 'react';
import { CommunityService } from '../services/community';
import { CommunityClub, UserRole } from '../types';
import { Users, Lock, Globe, Plus, Trash2 } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useUser } from '../context/UserContext';

const Clubs = () => {
    const [clubs, setClubs] = useState<CommunityClub[]>([]);
    const [loading, setLoading] = useState(true);
    const { showNotification } = useNotification();
    const { user } = useUser();
    const isAdmin = user?.role === UserRole.ADMIN;

    useEffect(() => {
        void loadClubs();
    }, []);

    const joinedCount = useMemo(() => clubs.filter((club) => club.isJoined).length, [clubs]);

    const loadClubs = async () => {
        try {
            setLoading(true);
            const data = await CommunityService.getClubs();
            setClubs(data);
        } catch (error: any) {
            showNotification('error', 'Clubs', error?.message || 'Unable to load community clubs right now.');
        } finally {
            setLoading(false);
        }
    };

    const handleMembershipToggle = async (club: CommunityClub) => {
        try {
            if (club.isJoined) {
                await CommunityService.leaveClub(club.id);
                setClubs((prev) =>
                    prev.map((entry) =>
                        entry.id === club.id
                            ? { ...entry, isJoined: false, is_joined: false, memberCount: Math.max(0, Number(entry.memberCount || 0) - 1), member_count: Math.max(0, Number(entry.memberCount || 0) - 1) }
                            : entry
                    )
                );
                showNotification('success', 'Membership updated', `You left ${club.name}.`);
                return;
            }

            await CommunityService.joinClub(club.id);
            setClubs((prev) =>
                prev.map((entry) =>
                    entry.id === club.id
                        ? { ...entry, isJoined: true, is_joined: true, memberCount: Number(entry.memberCount || 0) + 1, member_count: Number(entry.memberCount || 0) + 1 }
                        : entry
                )
            );
            showNotification('success', 'Joined', `You are now a member of ${club.name}.`);
        } catch (error: any) {
            showNotification('error', 'Membership update failed', error?.message || 'Unable to update membership right now.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this club?')) return;
        try {
            await CommunityService.deleteClub(id);
            setClubs((prev) => prev.filter((club) => club.id !== id));
            showNotification('success', 'Deleted', 'Club removed.');
        } catch (error: any) {
            showNotification('error', 'Delete failed', error?.message || 'Unable to delete this club right now.');
        }
    };

    const handleRequestClub = () => {
        showNotification('info', 'Club requests', 'Club request approval can be managed from the admin community controls.');
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Communities</p>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Community Clubs</h1>
                        <p className="mt-1 max-w-2xl text-sm text-gray-500">
                            Build trusted circles around interests, local markets, and professional goals. Join communities that compound your reputation.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-3">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                        <div className="text-xs uppercase tracking-wide text-gray-500">Active clubs</div>
                        <div className="mt-1 text-xl font-bold text-gray-900">{clubs.length}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                        <div className="text-xs uppercase tracking-wide text-gray-500">Joined</div>
                        <div className="mt-1 text-xl font-bold text-gray-900">{joinedCount}</div>
                    </div>
                    <button
                        onClick={handleRequestClub}
                        className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                    >
                        <Plus className="mr-2 h-4 w-4" /> Request Club
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                            <div className="h-36 animate-pulse bg-gray-200" />
                            <div className="space-y-3 p-5">
                                <div className="h-5 w-2/3 animate-pulse rounded bg-gray-200" />
                                <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
                                <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100" />
                                <div className="h-10 w-full animate-pulse rounded-xl bg-gray-100" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : clubs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center shadow-sm">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                        <Users className="h-7 w-7" />
                    </div>
                    <h2 className="mt-4 text-lg font-semibold text-gray-900">No community clubs yet</h2>
                    <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500">
                        Clubs will appear here as they are created. Once available, members can join, leave, and build topic-based reputation in real time.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {clubs.map((club) => {
                        const memberCount = Number(club.memberCount ?? club.member_count ?? 0);
                        const coverImage = club.coverImage || club.cover_image || '';
                        const visibility = club.visibility === 'private' ? 'private' : 'public';
                        return (
                            <div
                                key={club.id}
                                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
                            >
                                <div className="relative h-36 overflow-hidden">
                                    {coverImage ? (
                                        <img src={coverImage} alt={club.name} className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="h-full w-full bg-[radial-gradient(circle_at_top_left,_#bfdbfe,_#1d4ed8_55%,_#0f172a)]" />
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
                                    <div className="absolute right-3 top-3 flex items-center rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                                        {visibility === 'private' ? <Lock className="mr-1 h-3 w-3" /> : <Globe className="mr-1 h-3 w-3" />}
                                        <span className="capitalize">{visibility}</span>
                                    </div>
                                    {isAdmin && (
                                        <button
                                            onClick={() => handleDelete(club.id)}
                                            className="absolute left-3 top-3 z-10 rounded-lg bg-red-600 p-2 text-white opacity-0 shadow-md transition-opacity hover:bg-red-700 group-hover:opacity-100"
                                            title="Admin: Delete club"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>

                                <div className="flex flex-1 flex-col p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">{club.name}</h3>
                                            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                                                Hosted by {club.ownerName || 'Community member'}
                                            </p>
                                        </div>
                                        {club.isJoined && (
                                            <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                                                Joined
                                            </span>
                                        )}
                                    </div>

                                    <p className="mt-3 flex-1 text-sm leading-6 text-gray-600">{club.description || 'No description added yet.'}</p>

                                    <div className="mt-5 flex items-center justify-between gap-4 border-t border-gray-100 pt-4">
                                        <div className="text-sm font-medium text-gray-500">
                                            <div className="flex items-center">
                                                <Users className="mr-1.5 h-4 w-4 text-gray-400" />
                                                {memberCount.toLocaleString()} members
                                            </div>
                                            {club.joinedAt && (
                                                <div className="mt-1 text-xs text-gray-400">
                                                    Joined {new Date(club.joinedAt).toLocaleDateString()}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleMembershipToggle(club)}
                                            className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                                                club.isJoined
                                                    ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                                    : 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                                            }`}
                                        >
                                            {club.isJoined ? 'Leave club' : visibility === 'private' ? 'Join private club' : 'Join club'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Clubs;
