
import React, { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';
import { UserService } from '../services/user';
import { UserProfile, PortfolioItem, Experience, Education, Certification, UploadedFile } from '../types';
import { useNotification } from '../context/NotificationContext';
import { 
    User, Briefcase, GraduationCap, Award, Layers, Video, Save, Plus, Trash2, 
    Upload, Link as LinkIcon, CheckCircle, ArrowLeft, Camera, Loader2 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import FilePickerModal from '../dashboard/shared/FilePickerModal';

interface EditProfileProps {
    isEmbedded?: boolean;
}

const EditProfile: React.FC<EditProfileProps> = ({ isEmbedded = false }) => {
    const { user, updateUser } = useUser();
    const navigate = useNavigate();
    const { showNotification } = useNotification();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'basic' | 'portfolio' | 'experience' | 'education' | 'skills'>('basic');
    const [isSaving, setIsSaving] = useState(false);
    const [displayName, setDisplayName] = useState('');
    
    // File Picker State
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<'avatar' | 'video' | 'portfolio' | null>(null);
    const [portfolioPickerOpen, setPortfolioPickerOpen] = useState(false);
    const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            if (!user?.id) {
                if (mounted) {
                    setProfile(null);
                    setLoading(false);
                }
                return;
            }

            setLoading(true);
            setDisplayName(user.name || '');
            setProfile({
                user_id: user.id,
                userId: user.id,
                title: '',
                bio: '',
                location: '',
                languages: [],
                skills: [],
                hourly_rate: 0,
                hourlyRate: 0,
                portfolio: [],
                experience: [],
                education: [],
                certifications: []
            });

            try {
                const data = await UserService.getMyProfile();
                if (mounted) setProfile(data);
            } catch (error: any) {
                if (mounted) {
                    showNotification('alert', 'Profile Load Failed', error?.message || 'Unable to load profile.');
                }
            } finally {
                if (mounted) setLoading(false);
            }
        };

        load();
        return () => {
            mounted = false;
        };
    }, [user?.id, showNotification]);

    const handleSave = async () => {
        if (!profile || !user) return;
        setIsSaving(true);
        try {
            const updated = await UserService.updateMyProfile(profile);
            setProfile(updated);
            if (displayName.trim() && displayName.trim() !== (user.name || '')) {
                await UserService.updateCredentials(user.id, { name: displayName.trim() });
                updateUser({ name: displayName.trim() });
            }
            showNotification('success', 'Profile Updated', 'Your changes have been saved successfully.');
        } catch (e: any) {
            showNotification('alert', 'Error', e?.message || 'Failed to save profile.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleFileSelect = async (file: UploadedFile) => {
        if (!profile || !user) return;

        if (pickerTarget === 'avatar') {
            updateUser({ avatar: file.url, profilePhotoFileId: file.id });
            setProfile(prev => prev ? {
                ...prev,
                avatarUrl: file.url,
                avatar_url: file.url,
                profilePhotoFileId: file.id,
                profile_photo_file_id: file.id
            } : prev);
            try {
                await UserService.updateCredentials(user.id, { avatar: file.url, profilePhotoFileId: file.id });
            } catch (error) {
                showNotification('alert', 'Error', 'Failed to update profile photo.');
            }
        } else if (pickerTarget === 'video') {
            setProfile(prev => prev ? {
                ...prev,
                introVideoUrl: file.url,
                intro_video_url: file.url
            } : null);
        }
        
        setIsFilePickerOpen(false);
        setPickerTarget(null);
    };

    const openPicker = (target: 'avatar' | 'video') => {
        setPickerTarget(target);
        setIsFilePickerOpen(true);
    };

    const addExperience = () => {
        const newExp: Experience = {
            id: Math.random().toString(36).substr(2, 9),
            title: '', company: '', start_date: '', end_date: '', current: false, description: ''
        };
        setProfile(prev => prev ? { ...prev, experience: [...prev.experience, newExp] } : null);
    };

    const updateExperience = (id: string, field: keyof Experience, value: any) => {
        setProfile(prev => prev ? {
            ...prev,
            experience: prev.experience.map(e => e.id === id ? { ...e, [field]: value } : e)
        } : null);
    };

    const removeExperience = (id: string) => {
        setProfile(prev => prev ? { ...prev, experience: prev.experience.filter(e => e.id !== id) } : null);
    };

    const addEducation = () => {
        setProfile(prev => prev ? { 
            ...prev, 
            education: [...prev.education, { id: Math.random().toString(36).substr(2, 9), school: '', degree: '', field_of_study: '', start_year: '', end_year: '' }] 
        } : null);
    };

    const updateEducation = (id: string, field: keyof Education, value: any) => {
        setProfile(prev => prev ? {
            ...prev,
            education: prev.education.map(e => e.id === id ? { ...e, [field]: value } : e)
        } : null);
    };

    const removeEducation = (id: string) => {
        setProfile(prev => prev ? { ...prev, education: prev.education.filter(e => e.id !== id) } : null);
    };

    const addPortfolioItem = () => {
        const newItem: PortfolioItem = {
            id: Math.random().toString(36).substr(2, 9),
            title: '',
            description: '',
            image_url: '',
            link: ''
        };
        setProfile(prev => prev ? { ...prev, portfolio: [...(prev.portfolio || []), newItem] } : null);
        setActivePortfolioId(newItem.id);
        setPortfolioPickerOpen(true);
    };

    const updatePortfolioItem = (id: string, field: keyof PortfolioItem, value: any) => {
        setProfile(prev => prev ? {
            ...prev,
            portfolio: (prev.portfolio || []).map(item => item.id === id ? { ...item, [field]: value } : item)
        } : null);
    };

    const removePortfolioItem = (id: string) => {
        setProfile(prev => prev ? { ...prev, portfolio: (prev.portfolio || []).filter(item => item.id !== id) } : null);
    };

    const openPortfolioPicker = (id: string) => {
        setActivePortfolioId(id);
        setPortfolioPickerOpen(true);
    };

    const handlePortfolioFileSelect = (file: UploadedFile) => {
        if (!activePortfolioId) return;
        updatePortfolioItem(activePortfolioId, 'image_url', file.url);
        setPortfolioPickerOpen(false);
        setActivePortfolioId(null);
    };

    return (
        <div className={`${isEmbedded ? '' : 'min-h-screen bg-gray-50 pb-20 pt-24 px-4'}`}>
            <div className={`${isEmbedded ? '' : 'max-w-5xl mx-auto'}`}>
                {/* Header - Conditional Rendering based on isEmbedded */}
                {!isEmbedded && (
                    <div className="flex justify-between items-center mb-8">
                        <div className="flex items-center">
                            <button onClick={() => navigate(-1)} className="mr-4 p-2 bg-white rounded-full shadow-sm hover:bg-gray-100 text-gray-600">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <h1 className="text-3xl font-bold text-gray-900">Edit Profile</h1>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => navigate(`/profile/${user?.id}`)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
                                View Public Profile
                            </button>
                            <button onClick={handleSave} disabled={isSaving || loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-lg flex items-center disabled:opacity-70">
                                {isSaving ? 'Saving...' : <>Save Changes <CheckCircle className="w-4 h-4 ml-2" /></>}
                            </button>
                        </div>
                    </div>
                )}
                
                {isEmbedded && (
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">My Profile</h2>
                        <button onClick={handleSave} disabled={isSaving || loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-sm flex items-center disabled:opacity-70">
                            {isSaving ? 'Saving...' : <>Save Changes <CheckCircle className="w-4 h-4 ml-2" /></>}
                        </button>
                    </div>
                )}

                {loading || !profile ? (
                    <div className="p-12 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-2" />
                        <p className="text-gray-500">Loading Profile...</p>
                    </div>
                ) : (
                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* Navigation */}
                        <div className="w-full lg:w-64 flex-shrink-0">
                            <nav className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden sticky top-24">
                                {[
                                    { id: 'basic', label: 'Basic Info', icon: User },
                                    { id: 'portfolio', label: 'Portfolio', icon: Layers },
                                    { id: 'experience', label: 'Experience', icon: Briefcase },
                                    { id: 'education', label: 'Education', icon: GraduationCap },
                                    { id: 'skills', label: 'Skills & Certs', icon: Award },
                                ].map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveTab(item.id as any)}
                                        className={`w-full flex items-center px-4 py-3 text-sm font-medium transition-colors border-l-4 ${
                                            activeTab === item.id 
                                            ? 'border-blue-600 bg-blue-50 text-blue-700' 
                                            : 'border-transparent text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        <item.icon className={`w-4 h-4 mr-3 ${activeTab === item.id ? 'text-blue-600' : 'text-gray-400'}`} />
                                        {item.label}
                                    </button>
                                ))}
                            </nav>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 space-y-6">
                            {/* BASIC INFO */}
                            {activeTab === 'basic' && (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6 animate-fade-in">
                                    <h3 className="text-lg font-bold text-gray-900 border-b pb-2">Basic Information</h3>
                                    
                                    <div className="flex items-center space-x-6">
                                        <div className="relative group w-24 h-24 rounded-full bg-gray-100 overflow-hidden border-2 border-gray-200 cursor-pointer" onClick={() => openPicker('avatar')}>
                                            <img src={user?.avatar || "https://via.placeholder.com/150"} alt="Profile" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <Camera className="w-6 h-6 text-white" />
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-900">Profile Photo</h4>
                                            <p className="text-xs text-gray-500 mb-2">Max file size 5MB. JPG, PNG.</p>
                                            <button onClick={() => openPicker('avatar')} className="text-sm text-blue-600 font-medium hover:underline">Change Photo</button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                            <input
                                                className="w-full border-gray-300 rounded-lg p-2"
                                                value={displayName}
                                                onChange={e => setDisplayName(e.target.value)}
                                                placeholder="Your name"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Professional Title</label>
                                            <input 
                                                className="w-full border-gray-300 rounded-lg p-2"
                                                value={profile.title}
                                                onChange={e => setProfile({...profile, title: e.target.value})}
                                                placeholder="e.g. Senior Full Stack Developer"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate ($)</label>
                                            <input 
                                                type="number"
                                                className="w-full border-gray-300 rounded-lg p-2"
                                                value={profile.hourlyRate}
                                                onChange={e => setProfile({...profile, hourlyRate: Number(e.target.value)})}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                                            <input 
                                                className="w-full border-gray-300 rounded-lg p-2"
                                                value={profile.location}
                                                onChange={e => setProfile({...profile, location: e.target.value})}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">About Me</label>
                                        <textarea 
                                            rows={5}
                                            className="w-full border-gray-300 rounded-lg p-3"
                                            value={profile.bio}
                                            onChange={e => setProfile({...profile, bio: e.target.value})}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Intro Video</label>
                                        {profile.introVideoUrl ? (
                                            <div className="relative aspect-video bg-black rounded-lg overflow-hidden w-full max-w-md">
                                                <video src={profile.introVideoUrl} controls className="w-full h-full" />
                                                <button 
                                                    onClick={() => setProfile({
                                                        ...profile,
                                                        introVideoUrl: undefined,
                                                        intro_video_url: undefined
                                                    })}
                                                    className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full shadow hover:bg-red-700"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div 
                                                onClick={() => openPicker('video')}
                                                className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 max-w-md transition-colors"
                                            >
                                                <Video className="w-8 h-8 text-gray-400 mb-2" />
                                                <span className="text-sm text-gray-500">Select Introduction Video</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* EXPERIENCE */}
                            {activeTab === 'experience' && (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6 animate-fade-in">
                                    <div className="flex justify-between items-center border-b pb-2">
                                        <h3 className="text-lg font-bold text-gray-900">Work Experience</h3>
                                        <button onClick={addExperience} className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded font-medium hover:bg-blue-100 flex items-center">
                                            <Plus className="w-3 h-3 mr-1" /> Add
                                        </button>
                                    </div>
                                    
                                    {profile.experience.map((exp, idx) => (
                                        <div key={exp.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200 relative group">
                                            <button onClick={() => removeExperience(exp.id)} className="absolute top-2 right-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <div className="grid grid-cols-2 gap-4 mb-3">
                                                <input placeholder="Job Title" className="border-gray-300 rounded text-sm font-bold p-2" value={exp.title} onChange={e => updateExperience(exp.id, 'title', e.target.value)} />
                                                <input placeholder="Company" className="border-gray-300 rounded text-sm p-2" value={exp.company} onChange={e => updateExperience(exp.id, 'company', e.target.value)} />
                                                <div className="flex gap-2">
                                                    <input type="text" placeholder="Start Date" className="border-gray-300 rounded text-xs w-full p-2" value={exp.start_date} onChange={e => updateExperience(exp.id, 'start_date', e.target.value)} />
                                                    <input type="text" placeholder="End Date" className="border-gray-300 rounded text-xs w-full p-2" value={exp.end_date} onChange={e => updateExperience(exp.id, 'end_date', e.target.value)} />
                                                </div>
                                            </div>
                                            <textarea placeholder="Description of role..." className="w-full border-gray-300 rounded text-sm h-20 p-2" value={exp.description} onChange={e => updateExperience(exp.id, 'description', e.target.value)} />
                                        </div>
                                    ))}
                                    {profile.experience.length === 0 && <p className="text-center text-gray-500 italic">No experience added yet.</p>}
                                </div>
                            )}

                            {/* EDUCATION */}
                            {activeTab === 'education' && (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6 animate-fade-in">
                                    <div className="flex justify-between items-center border-b pb-2">
                                        <h3 className="text-lg font-bold text-gray-900">Education</h3>
                                        <button onClick={addEducation} className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded font-medium hover:bg-blue-100 flex items-center">
                                            <Plus className="w-3 h-3 mr-1" /> Add
                                        </button>
                                    </div>
                                    {profile.education.map(edu => (
                                        <div key={edu.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200 relative group">
                                            <button onClick={() => removeEducation(edu.id)} className="absolute top-2 right-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <div className="grid grid-cols-2 gap-4">
                                                <input placeholder="School / University" className="border-gray-300 rounded text-sm font-bold p-2" value={edu.school} onChange={e => updateEducation(edu.id, 'school', e.target.value)} />
                                                <input placeholder="Degree" className="border-gray-300 rounded text-sm p-2" value={edu.degree} onChange={e => updateEducation(edu.id, 'degree', e.target.value)} />
                                                <input placeholder="Field of Study" className="border-gray-300 rounded text-sm p-2" value={edu.field_of_study} onChange={e => updateEducation(edu.id, 'field_of_study', e.target.value)} />
                                                <div className="flex gap-2">
                                                    <input placeholder="Start Year" className="border-gray-300 rounded text-xs w-full p-2" value={edu.start_year} onChange={e => updateEducation(edu.id, 'start_year', e.target.value)} />
                                                    <input placeholder="End Year" className="border-gray-300 rounded text-xs w-full p-2" value={edu.end_year} onChange={e => updateEducation(edu.id, 'end_year', e.target.value)} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* SKILLS */}
                            {activeTab === 'skills' && (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6 animate-fade-in">
                                    <h3 className="text-lg font-bold text-gray-900 border-b pb-2">Skills & Expertise</h3>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Skills (Comma separated)</label>
                                        <textarea 
                                            className="w-full border-gray-300 rounded-lg p-3"
                                            placeholder="React, Node.js, Design, Writing..."
                                            value={profile.skills.join(', ')}
                                            onChange={e => setProfile({...profile, skills: e.target.value.split(',').map(s => s.trim())})}
                                        />
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {profile.skills.filter(s => s).map((s, i) => (
                                                <span key={i} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-medium">{s}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* PORTFOLIO (Simplified for brevity but fully functional structure) */}
                            {activeTab === 'portfolio' && (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6 animate-fade-in">
                                    <div className="flex justify-between items-center border-b pb-2">
                                        <h3 className="text-lg font-bold text-gray-900">Portfolio</h3>
                                        <button onClick={addPortfolioItem} className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded font-medium hover:bg-blue-100 flex items-center">
                                            <Plus className="w-3 h-3 mr-1" /> Add Project
                                        </button>
                                    </div>
                                    {(profile.portfolio || []).length === 0 ? (
                                        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                                            <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                            <p className="text-gray-500">Showcase your best work here.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {(profile.portfolio || []).map((item) => (
                                                <div key={item.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <button
                                                            onClick={() => openPortfolioPicker(item.id)}
                                                            className="w-24 h-24 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center overflow-hidden"
                                                            type="button"
                                                        >
                                                            {item.image_url ? (
                                                                <img src={item.image_url} alt={item.title || 'Portfolio'} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Upload className="w-5 h-5 text-gray-400" />
                                                            )}
                                                        </button>
                                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            <input
                                                                className="border-gray-300 rounded text-sm p-2"
                                                                placeholder="Project title"
                                                                value={item.title}
                                                                onChange={(e) => updatePortfolioItem(item.id, 'title', e.target.value)}
                                                            />
                                                            <input
                                                                className="border-gray-300 rounded text-sm p-2"
                                                                placeholder="Project link (optional)"
                                                                value={item.link || ''}
                                                                onChange={(e) => updatePortfolioItem(item.id, 'link', e.target.value)}
                                                            />
                                                            <textarea
                                                                className="border-gray-300 rounded text-sm p-2 md:col-span-2"
                                                                placeholder="Short description"
                                                                rows={3}
                                                                value={item.description}
                                                                onChange={(e) => updatePortfolioItem(item.id, 'description', e.target.value)}
                                                            />
                                                        </div>
                                                        <button
                                                            onClick={() => removePortfolioItem(item.id)}
                                                            className="text-red-500 hover:text-red-600"
                                                            type="button"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            
            <FilePickerModal
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelect={handleFileSelect}
                acceptedTypes={pickerTarget === 'video' ? 'video/*' : 'image/*'}
                title={pickerTarget === 'video' ? 'Select Video' : 'Select Photo'}
            />
            <FilePickerModal
                isOpen={portfolioPickerOpen}
                onClose={() => setPortfolioPickerOpen(false)}
                onSelect={handlePortfolioFileSelect}
                acceptedTypes="image/*"
                title="Select Portfolio Image"
            />
        </div>
    );
};

export default EditProfile;
