
import React, { Suspense, useState, useEffect, useRef, useMemo } from 'react';
import { useUser } from '../context/UserContext';
import { useContent } from '../context/ContentContext';
import { UserService } from '../services/user';
import { SearchService } from '../services/search';
import { UserProfile, ProfessionalAvailability, ClientHiringStatus, PortfolioItem, Experience, Education, Certification, UploadedFile } from '../types';
import { useNotification } from '../context/NotificationContext';
import { 
    User, Briefcase, GraduationCap, Award, Layers, Video, Save, Plus, Trash2, 
    Upload, Link as LinkIcon, CheckCircle, ArrowLeft, Camera, Loader2, Building2, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import FilePickerModal from '../dashboard/shared/FilePickerModal';
import { FileService } from '../services/files';
import { Capacitor } from '@capacitor/core';
import { captureAndUpload } from '../mobile/uploads';
import { getPublicAppOrigin } from '../utils/siteUrl';
import { resolveAssetUrl } from '../utils/assetUrl';
import { resolvePostAttachmentMediaUrl } from '../utils/postAttachmentMedia';
import { resolveUserAvatarUrl } from '../utils/userAvatar';
import EnterpriseAvatar from '../components/common/EnterpriseAvatar';
import EnterpriseImage from '../components/common/EnterpriseImage';

const LocationPicker = React.lazy(() => import('../components/common/LocationPicker'));

interface EditProfileProps {
    isEmbedded?: boolean;
}

type CompanyPageSuggestion = {
    id: string;
    name: string;
    title?: string;
    username?: string;
    subtitle?: string;
    url?: string;
    avatarUrl?: string;
};

const EditProfile: React.FC<EditProfileProps> = ({ isEmbedded = false }) => {
    const { user, updateUser } = useUser();
    const { settings } = useContent();
    const navigate = useNavigate();
    const { showNotification } = useNotification();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'basic' | 'portfolio' | 'experience' | 'education' | 'skills' | 'availability' | 'hiring'>('basic');
    const [availabilityDraft, setAvailabilityDraft] = useState<ProfessionalAvailability>({
        status: 'INACTIVE', availabilityTypes: [], services: [], workPreference: 'FLEXIBLE',
        timing: 'FLEXIBLE', availableFrom: null, expiresAt: null, visibility: 'PUBLIC', isActive: false
    });
    const [hiringDraft, setHiringDraft] = useState<ClientHiringStatus>({
        status: 'INACTIVE', hiringTypes: [], focusAreas: [], timing: 'FLEXIBLE', visibility: 'PUBLIC', isActive: false, expiresAt: null
    });
    const [isSaving, setIsSaving] = useState(false);
    const [displayName, setDisplayName] = useState('');
    
    // File Picker State
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<'avatar' | 'video' | 'cover' | 'portfolio' | null>(null);
    const [portfolioPickerOpen, setPortfolioPickerOpen] = useState(false);
    const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
    const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [cameraTarget, setCameraTarget] = useState<'avatar' | 'cover'>('avatar');
    const [username, setUsername] = useState('');
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'saving' | 'error'>('idle');
    const [usernameMessage, setUsernameMessage] = useState('');
    const usernameCheckRef = useRef<number | null>(null);
    const lastSavedUsernameRef = useRef<string>('');
    const [introRecorderOpen, setIntroRecorderOpen] = useState(false);
    const [introRecorderStream, setIntroRecorderStream] = useState<MediaStream | null>(null);
    const introVideoRef = useRef<HTMLVideoElement | null>(null);
    const introRecorderRef = useRef<MediaRecorder | null>(null);
    const introChunksRef = useRef<Blob[]>([]);
    const [introRecording, setIntroRecording] = useState(false);
    const [introUploading, setIntroUploading] = useState(false);
    const [companyLookupExperienceId, setCompanyLookupExperienceId] = useState<string | null>(null);
    const [companyLookupQuery, setCompanyLookupQuery] = useState('');
    const [companyLookupResults, setCompanyLookupResults] = useState<CompanyPageSuggestion[]>([]);
    const [companyLookupLoading, setCompanyLookupLoading] = useState(false);
    const usernameRegex = /^[a-z0-9][a-z0-9._-]{2,29}$/;
    const publicBaseUrl = getPublicAppOrigin();
    const cleanBaseUrl = publicBaseUrl.replace(/\/$/, '');
    const profileDemographics = (settings as any)?.profileDemographics || {};
    const demographicsEnabled = profileDemographics?.enabled !== false;
    const genderEnabled = demographicsEnabled && profileDemographics?.genderFieldEnabled !== false;
    const dateOfBirthEnabled = demographicsEnabled && profileDemographics?.dateOfBirthEnabled !== false;
    const genderOptions = useMemo(() => {
        const fromSettings = Array.isArray(profileDemographics?.genderOptions)
            ? profileDemographics.genderOptions.filter((option: any) => option && option.active !== false)
            : [];
        if (fromSettings.length) {
            return fromSettings.map((option: any) => ({
                key: String(option.key || option.value || option.label || '').trim().toLowerCase(),
                label: String(option.label || option.key || option.value || '').trim()
            })).filter((option: any) => option.key && option.label);
        }
        return [
            { key: 'male', label: 'Male' },
            { key: 'female', label: 'Female' }
        ];
    }, [profileDemographics]);

    useEffect(() => {
        const query = companyLookupQuery.trim();
        if (!companyLookupExperienceId || query.length < 2) {
            setCompanyLookupResults([]);
            setCompanyLookupLoading(false);
            return;
        }

        let cancelled = false;
        setCompanyLookupLoading(true);
        const timer = window.setTimeout(async () => {
            try {
                const results = await SearchService.search(query, { type: 'pages', limit: 6 });
                if (cancelled) return;
                setCompanyLookupResults(
                    (Array.isArray(results) ? results : [])
                        .filter((entry: any) => String(entry?.id || '').trim())
                        .map((entry: any) => ({
                            id: String(entry.id),
                            name: String(entry.name || entry.title || '').trim(),
                            title: entry.title,
                            username: entry.username,
                            subtitle: entry.subtitle || entry.description,
                            url: entry.url,
                            avatarUrl: entry.avatarUrl || entry.image
                        }))
                        .filter((entry: CompanyPageSuggestion) => entry.name)
                );
            } catch (error) {
                if (!cancelled) setCompanyLookupResults([]);
            } finally {
                if (!cancelled) setCompanyLookupLoading(false);
            }
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [companyLookupExperienceId, companyLookupQuery]);

    const notifyProfileUpdate = (updatedProfile?: UserProfile | null, updatedUser?: { name?: string; avatar?: string; username?: string }) => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('profile:updated', { detail: { profile: updatedProfile, user: updatedUser } }));
    };

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
            setUsername(user.username || '');
            lastSavedUsernameRef.current = user.username || '';
            setProfile({
                user_id: user.id,
                userId: user.id,
                title: '',
                bio: '',
                location: '',
                formattedAddress: '',
                formatted_address: '',
                country: '',
                countryCode: '',
                country_code: '',
                state: '',
                city: '',
                region: '',
                postalCode: '',
                postal_code: '',
                latitude: null,
                longitude: null,
                placeId: '',
                place_id: '',
                locationSource: '',
                location_source: '',
                gender: '',
                date_of_birth: null,
                dateOfBirth: null,
                show_birth_month_day_public: true,
                showBirthMonthDayPublic: true,
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
                if (mounted) {
                    setProfile(data);
                    if (data.availability) setAvailabilityDraft(data.availability);
                    if (data.hiring) setHiringDraft(data.hiring);
                }
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

    useEffect(() => {
        if (!user) return;
        const currentUsername = (user.username || '').trim().toLowerCase();
        const candidate = username.trim().toLowerCase();

        if (usernameCheckRef.current) {
            window.clearTimeout(usernameCheckRef.current);
            usernameCheckRef.current = null;
        }

        if (!candidate) {
            setUsernameStatus('idle');
            setUsernameMessage('');
            return;
        }

        if (!usernameRegex.test(candidate)) {
            setUsernameStatus('invalid');
            setUsernameMessage('Username must be 3-30 characters and use letters, numbers, dot, dash, or underscore.');
            return;
        }

        if (candidate === currentUsername) {
            setUsernameStatus('idle');
            setUsernameMessage('');
            return;
        }

        setUsernameStatus('checking');
        setUsernameMessage('Checking availability...');
        usernameCheckRef.current = window.setTimeout(async () => {
            try {
                const result = await UserService.checkUsernameAvailability(candidate);
                if (!result.available) {
                    setUsernameStatus('taken');
                    setUsernameMessage('Username not available');
                    return;
                }
                setUsernameStatus('available');
                setUsernameMessage('Username is available');
                await saveUsername(candidate);
            } catch {
                setUsernameStatus('error');
                setUsernameMessage('Unable to verify username');
            }
        }, 500);

        return () => {
            if (usernameCheckRef.current) {
                window.clearTimeout(usernameCheckRef.current);
                usernameCheckRef.current = null;
            }
        };
    }, [username, user]);

    useEffect(() => {
        if (cameraVideoRef.current && cameraStream) {
            cameraVideoRef.current.srcObject = cameraStream;
        }
    }, [cameraStream]);

    useEffect(() => {
        if (introVideoRef.current && introRecorderStream) {
            introVideoRef.current.srcObject = introRecorderStream;
        }
    }, [introRecorderStream]);

    const handleSave = async () => {
        if (!profile || !user) return;
        setIsSaving(true);
        try {
            const updated = await UserService.updateMyProfile(profile);
            setProfile(updated);
            const nextName = displayName.trim();
            if (nextName && nextName !== (user.name || '')) {
                await UserService.updateCredentials(user.id, { name: nextName });
                updateUser({ name: nextName });
            }
            notifyProfileUpdate(updated, { name: nextName || user.name, username: lastSavedUsernameRef.current });
            showNotification('success', 'Profile Updated', 'Your changes have been saved successfully.');
        } catch (e: any) {
            showNotification('alert', 'Error', e?.message || 'Failed to save profile.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveAvailability = async () => {
        setIsSaving(true);
        try {
            const saved = await UserService.updateMyAvailability(availabilityDraft);
            setAvailabilityDraft(saved || availabilityDraft);
            setProfile((prev) => prev ? { ...prev, availability: saved, professionalAvailability: saved } : prev);
            showNotification('success', 'Availability Updated', 'Your professional availability settings have been saved.');
        } catch (e: any) {
            showNotification('alert', 'Error', e?.message || 'Failed to save availability.');
        } finally {
            setIsSaving(false);
        }
    };

    const canEditClientHiring = ['employer', 'client'].includes(String(user?.role || '').toLowerCase());

    const handleSaveClientHiring = async () => {
        setIsSaving(true);
        try {
            const saved = await UserService.updateMyClientHiringStatus(hiringDraft);
            if (saved) {
                setHiringDraft(saved);
                setProfile((prev) => prev ? { ...prev, hiring: saved, clientHiringStatus: saved } : prev);
            }
            showNotification('success', 'Hiring status updated', 'Your We Are Hiring settings have been saved.');
        } catch (e: any) {
            showNotification('alert', 'Error', e?.message || 'Failed to save hiring status.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleLocationChange = (next: Partial<UserProfile>) => {
        setProfile((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                ...next,
                location: String(next.location ?? next.formattedAddress ?? next.formatted_address ?? prev.location ?? ''),
            };
        });
    };

    const saveUsername = async (value: string) => {
        if (!user) return;
        if (!value || value === lastSavedUsernameRef.current) return;
        setUsernameStatus('saving');
        setUsernameMessage('Saving username...');
        try {
            await UserService.updateCredentials(user.id, { username: value });
            updateUser({ username: value });
            lastSavedUsernameRef.current = value;
            setUsernameStatus('available');
            setUsernameMessage('Username is available');
            notifyProfileUpdate(null, { username: value });
            showNotification('success', 'Username Updated', 'Your public profile URL has been updated.');
        } catch (error: any) {
            setUsernameStatus('error');
            setUsernameMessage(error?.response?.data?.error || 'Unable to save username');
            showNotification('alert', 'Username Error', error?.message || 'Unable to update username.');
        }
    };

    const resolveIdentityMediaUrl = (file: UploadedFile) => {
        const fileId = String(file.id || (file as any).fileId || '').trim();
        return (
            resolvePostAttachmentMediaUrl({
                url: file.url,
                fileId,
                id: fileId,
                storageKey: (file as any).storageKey || (file as any).storage_key
            }) ||
            resolveAssetUrl(String(file.url || '').trim()) ||
            (fileId ? resolveAssetUrl(`/api/files/content/${encodeURIComponent(fileId)}`) : '') ||
            String(file.url || '').trim()
        );
    };

    const applyProfilePhoto = async (file: UploadedFile) => {
        if (!profile || !user) return;
        const durableUrl = resolveIdentityMediaUrl(file);
        const fileId = String(file.id || (file as any).fileId || '').trim();
        updateUser({ avatar: durableUrl, profilePhotoFileId: fileId || undefined });
        setProfile(prev => prev ? {
            ...prev,
            avatarUrl: durableUrl,
            avatar_url: durableUrl,
            profilePhotoFileId: fileId,
            profile_photo_file_id: fileId
        } : prev);
        try {
            await UserService.updateCredentials(user.id, {
                avatar: durableUrl,
                profilePhotoFileId: fileId || undefined
            });
            notifyProfileUpdate(null, { avatar: durableUrl, profilePhotoFileId: fileId });
            showNotification('success', 'Profile', 'Profile photo updated.');
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to update profile photo.');
        }
    };

    const applyCoverPhoto = async (file: UploadedFile) => {
        if (!profile || !user) return;
        const durableUrl = resolveIdentityMediaUrl(file);
        const fileId = String(file.id || (file as any).fileId || '').trim();
        setProfile(prev => prev ? {
            ...prev,
            coverPhotoUrl: durableUrl,
            cover_photo_url: durableUrl,
            coverPhotoFileId: fileId,
            cover_photo_file_id: fileId
        } : prev);
        try {
            // Prefer durable content URL so <img> never depends on ephemeral hosts.
            const updated = await UserService.updateMyProfile({
                coverPhotoUrl: durableUrl,
                cover_photo_url: durableUrl,
                coverPhotoFileId: fileId || undefined,
                cover_photo_file_id: fileId || undefined
            });
            setProfile(updated);
            notifyProfileUpdate(updated);
            showNotification('success', 'Profile', 'Cover photo updated.');
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to update cover photo.');
        }
    };

    const handleFileSelect = async (file: UploadedFile) => {
        if (!profile || !user) return;

        if (pickerTarget === 'avatar') {
            await applyProfilePhoto(file);
        } else if (pickerTarget === 'cover') {
            await applyCoverPhoto(file);
        } else if (pickerTarget === 'video') {
            try {
                const updated = await UserService.updateMyProfile({ introVideoUrl: file.url, intro_video_url: file.url });
                setProfile(updated);
                notifyProfileUpdate(updated);
                showNotification('success', 'Profile', 'Intro video updated.');
            } catch (error) {
                setProfile(prev => prev ? {
                    ...prev,
                    introVideoUrl: file.url,
                    intro_video_url: file.url
                } : null);
                notifyProfileUpdate({ ...(profile as UserProfile), introVideoUrl: file.url, intro_video_url: file.url });
                showNotification('alert', 'Error', 'Failed to update intro video.');
            }
        }
        
        setIsFilePickerOpen(false);
        setPickerTarget(null);
    };

    const openPicker = (target: 'avatar' | 'video' | 'cover') => {
        setPickerTarget(target);
        setIsFilePickerOpen(true);
    };

    const stopCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
        }
        setCameraStream(null);
        setCameraOpen(false);
    };

    const startCamera = async (target: 'avatar' | 'cover' = 'avatar') => {
        if (!user) return;
        setCameraTarget(target);
        try {
            const isNative = Capacitor.isNativePlatform();
            if (isNative) {
                const uploaded = await captureAndUpload({
                    category: 'portfolio',
                    role: user.role,
                    visibility: 'public',
                    userId: user.id
                });
                if (target === 'cover') {
                    await applyCoverPhoto(uploaded);
                } else {
                    await applyProfilePhoto(uploaded);
                }
                showNotification('success', 'Profile', target === 'cover' ? 'Cover photo updated.' : 'Profile photo updated.');
                return;
            }
        } catch (error) {
            console.error(error);
            showNotification('error', 'Camera', 'Unable to access camera.');
            return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            showNotification('warning', 'Camera', 'Camera access is not available in this browser.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
            setCameraStream(stream);
            setCameraOpen(true);
        } catch (error) {
            console.error(error);
            showNotification('error', 'Camera', 'Unable to access camera.');
        }
    };

    const capturePhoto = async () => {
        const video = cameraVideoRef.current;
        const canvas = cameraCanvasRef.current;
        if (!video || !canvas || !user) return;
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 480;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, width, height);
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            try {
                const file = new File([blob], `profile-${Date.now()}.png`, { type: blob.type || 'image/png' });
                const uploaded = await FileService.uploadFile(file, 'portfolio', {
                    role: user.role,
                    visibility: 'public',
                    userId: user.id
                });
                if (cameraTarget === 'cover') {
                    await applyCoverPhoto(uploaded);
                } else {
                    await applyProfilePhoto(uploaded);
                }
                showNotification('success', 'Profile', cameraTarget === 'cover' ? 'Cover photo updated.' : 'Profile photo updated.');
            } catch (error) {
                console.error(error);
                showNotification('error', 'Camera', 'Capture upload failed.');
            } finally {
                stopCamera();
            }
        }, 'image/png');
    };

    const stopIntroCamera = () => {
        if (introRecorderStream) {
            introRecorderStream.getTracks().forEach((track) => track.stop());
        }
        setIntroRecorderStream(null);
        setIntroRecorderOpen(false);
        setIntroRecording(false);
        introChunksRef.current = [];
        introRecorderRef.current = null;
    };

    const startIntroCamera = async () => {
        if (!user) return;
        if (!navigator.mediaDevices?.getUserMedia) {
            showNotification('warning', 'Camera', 'Video recording is not available in this browser.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
            setIntroRecorderStream(stream);
            setIntroRecorderOpen(true);
        } catch (error) {
            console.error(error);
            showNotification('error', 'Camera', 'Unable to access camera for video.');
        }
    };

    const startIntroRecording = () => {
        if (!introRecorderStream || introRecording) return;
        try {
            const recorder = new MediaRecorder(introRecorderStream, { mimeType: 'video/webm' });
            introChunksRef.current = [];
            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    introChunksRef.current.push(event.data);
                }
            };
            recorder.onstop = async () => {
                try {
                    const blob = new Blob(introChunksRef.current, { type: recorder.mimeType || 'video/webm' });
                    const file = new File([blob], `intro-${Date.now()}.webm`, { type: blob.type });
                    setIntroUploading(true);
                    const uploaded = await FileService.uploadFile(file, 'portfolio', {
                        role: user?.role,
                        visibility: 'public',
                        userId: user?.id
                    });
                    const updated = await UserService.updateMyProfile({ introVideoUrl: uploaded.url, intro_video_url: uploaded.url });
                    setProfile(updated);
                    notifyProfileUpdate(updated);
                    showNotification('success', 'Profile', 'Intro video updated.');
                } catch (error) {
                    console.error(error);
                    showNotification('alert', 'Error', 'Failed to upload intro video.');
                } finally {
                    setIntroUploading(false);
                    stopIntroCamera();
                }
            };
            introRecorderRef.current = recorder;
            recorder.start();
            setIntroRecording(true);
        } catch (error) {
            console.error(error);
            showNotification('error', 'Camera', 'Unable to start recording.');
        }
    };

    const stopIntroRecording = () => {
        if (!introRecorderRef.current) return;
        try {
            introRecorderRef.current.stop();
        } catch (error) {
            console.error(error);
            stopIntroCamera();
        } finally {
            setIntroRecording(false);
        }
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

    const updateExperienceCompany = (id: string, value: string) => {
        updateExperience(id, 'company', value);
        setProfile(prev => prev ? {
            ...prev,
            experience: prev.experience.map(e => e.id === id ? {
                ...e,
                company: value,
                companyPageId: undefined,
                companyPageSlug: undefined,
                companyPageHandle: undefined,
                companyPageUrl: undefined,
                companyPageMatched: false
            } : e)
        } : null);
        setCompanyLookupExperienceId(id);
        setCompanyLookupQuery(value);
    };

    const selectExperienceCompanyPage = (id: string, page: CompanyPageSuggestion) => {
        const url = page.url || `/company/${encodeURIComponent(page.username || page.id)}`;
        setProfile(prev => prev ? {
            ...prev,
            experience: prev.experience.map(e => e.id === id ? {
                ...e,
                company: page.name,
                companyPageId: page.id,
                companyPageSlug: url.split('/company/')[1]?.split(/[?#]/)[0] || undefined,
                companyPageHandle: page.username || undefined,
                companyPageUrl: url,
                companyPageMatched: true
            } : e)
        } : null);
        setCompanyLookupExperienceId(null);
        setCompanyLookupQuery('');
        setCompanyLookupResults([]);
    };

    const clearExperienceCompanyPage = (id: string) => {
        setProfile(prev => prev ? {
            ...prev,
            experience: prev.experience.map(e => e.id === id ? {
                ...e,
                companyPageId: undefined,
                companyPageSlug: undefined,
                companyPageHandle: undefined,
                companyPageUrl: undefined,
                companyPageMatched: false
            } : e)
        } : null);
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
                            <button
                                onClick={() => {
                                    const handle = username || user?.username;
                                    navigate(handle ? `/u/${handle}` : `/profile/${user?.id}`);
                                }}
                                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                            >
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
                                    { id: 'availability', label: 'Available for Hire', icon: CheckCircle },
                                    ...(canEditClientHiring ? [{ id: 'hiring', label: 'We Are Hiring', icon: Briefcase }] : []),
                                ].map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveTab(item.id as unknown as typeof activeTab)}
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
                                    
                                    <div>
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <h4 className="font-bold text-gray-900">Cover Photo</h4>
                                                <p className="text-xs text-gray-500">Recommended 1600x640. JPG or PNG.</p>
                                            </div>
                                            {profile.coverPhotoUrl && (
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            const updated = await UserService.updateMyProfile({ coverPhotoUrl: '', cover_photo_url: '' });
                                                            setProfile(updated);
                                                            notifyProfileUpdate(updated);
                                                            showNotification('success', 'Profile', 'Cover photo removed.');
                                                        } catch (error) {
                                                            showNotification('alert', 'Error', 'Failed to remove cover photo.');
                                                        }
                                                    }}
                                                    className="text-xs text-red-600 hover:underline"
                                                >
                                                    Remove cover
                                                </button>
                                            )}
                                        </div>
                                        <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-slate-900">
                                            <div className="relative aspect-[5/2] w-full">
                                                {profile.coverPhotoUrl || (profile as any).coverPhotoFileId || (profile as any).cover_photo_file_id ? (
                                                    <EnterpriseImage
                                                        src={profile.coverPhotoUrl}
                                                        candidates={[
                                                            (profile as any).coverPhotoFileId,
                                                            (profile as any).cover_photo_file_id,
                                                            (profile as any).cover
                                                        ]}
                                                        alt="Cover"
                                                        width={1920}
                                                        height={768}
                                                        loading="eager"
                                                        rounded="rounded-none"
                                                        className="h-full w-full bg-transparent"
                                                    />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700">
                                                        <span className="text-xs font-semibold uppercase tracking-widest text-slate-200">Add cover photo</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap items-center gap-3">
                                            <button onClick={() => openPicker('cover')} className="text-sm text-blue-600 font-medium hover:underline">Choose Existing</button>
                                            <button onClick={() => startCamera('cover')} className="text-sm text-slate-700 font-medium hover:underline">Use Camera</button>
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-6">
                                        <div className="relative group w-24 h-24 rounded-full bg-gray-100 overflow-hidden border-2 border-gray-200 cursor-pointer" onClick={() => openPicker('avatar')}>
                                            <EnterpriseAvatar
                                                user={profile || user}
                                                src={
                                                    resolveUserAvatarUrl(user) ||
                                                    resolveUserAvatarUrl(profile) ||
                                                    resolveAssetUrl(String(user?.avatar || profile?.avatarUrl || '')) ||
                                                    undefined
                                                }
                                                name={user?.name || profile?.name || 'Profile'}
                                                size="xl"
                                                className="!h-full !w-full"
                                                alt="Profile"
                                            />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <Camera className="w-6 h-6 text-white" />
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-900">Profile Photo</h4>
                                            <p className="text-xs text-gray-500 mb-2">Max file size 5MB. JPG, PNG.</p>
                                            <div className="flex flex-wrap items-center gap-3">
                                                <button onClick={() => openPicker('avatar')} className="text-sm text-blue-600 font-medium hover:underline">Choose Existing</button>
                                                <button onClick={() => startCamera('avatar')} className="text-sm text-slate-700 font-medium hover:underline">Use Camera</button>
                                            </div>
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
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Public Profile & URL</label>
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                <div className="flex w-full overflow-hidden rounded-lg border border-gray-300 bg-white">
                                                    <span className="flex items-center bg-gray-50 px-3 text-xs font-semibold text-gray-500">
                                                        {cleanBaseUrl}/u/
                                                    </span>
                                                    <input
                                                        className="flex-1 px-3 py-2 text-sm outline-none"
                                                        value={username}
                                                        onChange={(e) => setUsername(e.target.value.toLowerCase())}
                                                        placeholder="your-username"
                                                    />
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {username ? (
                                                        <span className="break-all">Public URL: {cleanBaseUrl}/u/{username}</span>
                                                    ) : (
                                                        <span>Choose a unique username.</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-2 flex items-center gap-2 text-xs">
                                                {(usernameStatus === 'checking' || usernameStatus === 'saving') && (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                                                )}
                                                <span
                                                    className={`${
                                                        usernameStatus === 'available'
                                                            ? 'text-green-600'
                                                            : usernameStatus === 'checking' || usernameStatus === 'saving'
                                                            ? 'text-blue-600'
                                                            : usernameStatus === 'taken' || usernameStatus === 'invalid' || usernameStatus === 'error'
                                                            ? 'text-red-600'
                                                            : 'text-gray-500'
                                                    }`}
                                                >
                                                    {usernameStatus === 'idle'
                                                        ? 'Usernames are unique. Use 3-30 characters: letters, numbers, dot, dash, underscore.'
                                                        : usernameMessage}
                                                </span>
                                            </div>
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
                                            <Suspense fallback={<div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">Loading map...</div>}>
                                                <LocationPicker
                                                    value={profile}
                                                    onChange={handleLocationChange}
                                                    label="Location"
                                                    placeholder="Search your city, state, or country"
                                                />
                                            </Suspense>
                                        </div>
                                        {genderEnabled && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Sex / Gender</label>
                                                <select
                                                    className="w-full border-gray-300 rounded-lg p-2"
                                                    value={String(profile.gender || '').toLowerCase()}
                                                    onChange={e =>
                                                        setProfile({
                                                            ...profile,
                                                            gender: e.target.value,
                                                        })
                                                    }
                                                >
                                                    <option value="">Select</option>
                                                    {genderOptions.map((option) => (
                                                        <option key={option.key} value={option.key}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="mt-1 text-xs text-gray-500">
                                                    Section: <span className="font-semibold">Profile Settings {'>'} Basic Information</span>
                                                </p>
                                            </div>
                                        )}
                                        {dateOfBirthEnabled && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                                                <input
                                                    type="date"
                                                    className="w-full border-gray-300 rounded-lg p-2"
                                                    value={String(profile.dateOfBirth || profile.date_of_birth || '')}
                                                    onChange={(e) =>
                                                        setProfile({
                                                            ...profile,
                                                            dateOfBirth: e.target.value || null,
                                                            date_of_birth: e.target.value || null
                                                        })
                                                    }
                                                />
                                                <p className="mt-1 text-xs text-gray-500">
                                                    Only month and day are shown publicly.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    {dateOfBirthEnabled && (
                                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                            <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-gray-300"
                                                    checked={Boolean(
                                                        profile.showBirthMonthDayPublic ??
                                                        profile.show_birth_month_day_public ??
                                                        true
                                                    )}
                                                    onChange={(e) =>
                                                        setProfile({
                                                            ...profile,
                                                            showBirthMonthDayPublic: e.target.checked,
                                                            show_birth_month_day_public: e.target.checked
                                                        })
                                                    }
                                                />
                                                Show month/day on public profile
                                            </label>
                                        </div>
                                    )}

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
                                                    onClick={async () => {
                                                        try {
                                                            const updated = await UserService.updateMyProfile({ introVideoUrl: '', intro_video_url: '' });
                                                            setProfile(updated);
                                                            notifyProfileUpdate(updated);
                                                            showNotification('success', 'Profile', 'Intro video removed.');
                                                        } catch (error) {
                                                            showNotification('alert', 'Error', 'Failed to remove intro video.');
                                                        }
                                                    }}
                                                    className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full shadow hover:bg-red-700"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div 
                                                className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg max-w-md bg-gray-50/40"
                                            >
                                                <Video className="w-8 h-8 text-gray-400 mb-2" />
                                                <span className="text-sm text-gray-500">Upload or record a short intro video</span>
                                            </div>
                                        )}
                                        <div className="mt-3 flex flex-wrap items-center gap-3">
                                            <button
                                                onClick={() => openPicker('video')}
                                                className="text-sm text-blue-600 font-medium hover:underline"
                                            >
                                                Upload video
                                            </button>
                                            <button
                                                onClick={startIntroCamera}
                                                className="text-sm text-slate-700 font-medium hover:underline"
                                            >
                                                Record intro
                                            </button>
                                            {profile.introVideoUrl && (
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            const updated = await UserService.updateMyProfile({ introVideoUrl: '', intro_video_url: '' });
                                                            setProfile(updated);
                                                            notifyProfileUpdate(updated);
                                                            showNotification('success', 'Profile', 'Intro video removed.');
                                                        } catch (error) {
                                                            showNotification('alert', 'Error', 'Failed to remove intro video.');
                                                        }
                                                    }}
                                                    className="text-sm text-red-600 font-medium hover:underline"
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
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
                                    
                                    {profile.experience.map((exp) => (
                                        <div key={exp.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200 relative group">
                                            <button onClick={() => removeExperience(exp.id)} className="absolute top-2 right-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <div className="grid grid-cols-1 gap-4 mb-3 md:grid-cols-2">
                                                <div>
                                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Role</label>
                                                    <input placeholder="Job title" className="w-full rounded-lg border border-gray-300 p-2 text-sm font-bold" value={exp.title} onChange={e => updateExperience(exp.id, 'title', e.target.value)} />
                                                </div>
                                                <div className="relative">
                                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Company</label>
                                                    <div className="flex overflow-hidden rounded-lg border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-blue-100">
                                                        <span className="flex items-center px-2 text-gray-400">
                                                            <Building2 className="h-4 w-4" />
                                                        </span>
                                                        <input
                                                            placeholder="Company name or page"
                                                            className="min-w-0 flex-1 p-2 text-sm outline-none"
                                                            value={exp.company}
                                                            onFocus={() => {
                                                                setCompanyLookupExperienceId(exp.id);
                                                                setCompanyLookupQuery(exp.company || '');
                                                            }}
                                                            onBlur={() => {
                                                                window.setTimeout(() => {
                                                                    setCompanyLookupExperienceId(current => current === exp.id ? null : current);
                                                                }, 150);
                                                            }}
                                                            onChange={e => updateExperienceCompany(exp.id, e.target.value)}
                                                        />
                                                        {exp.companyPageMatched && (
                                                            <button
                                                                type="button"
                                                                onClick={() => clearExperienceCompanyPage(exp.id)}
                                                                className="px-2 text-gray-400 hover:text-gray-700"
                                                                title="Unlink company page"
                                                            >
                                                                <X className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                    {exp.companyPageMatched && exp.companyPageUrl && (
                                                        <p className="mt-1 text-xs font-medium text-green-700">
                                                            Linked to platform company page: {exp.companyPageUrl}
                                                        </p>
                                                    )}
                                                    {companyLookupExperienceId === exp.id && (companyLookupLoading || companyLookupResults.length > 0) && (
                                                        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                                                            {companyLookupLoading && (
                                                                <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                    Searching company pages...
                                                                </div>
                                                            )}
                                                            {!companyLookupLoading && companyLookupResults.map((page) => (
                                                                <button
                                                                    key={page.id}
                                                                    type="button"
                                                                    onMouseDown={(event) => event.preventDefault()}
                                                                    onClick={() => selectExperienceCompanyPage(exp.id, page)}
                                                                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-blue-50"
                                                                >
                                                                    {page.avatarUrl ? (
                                                                        <img src={page.avatarUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                                                                    ) : (
                                                                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                                                                            <Building2 className="h-4 w-4" />
                                                                        </span>
                                                                    )}
                                                                    <span className="min-w-0">
                                                                        <span className="block truncate text-sm font-semibold text-gray-900">{page.name}</span>
                                                                        <span className="block truncate text-xs text-gray-500">{page.subtitle || page.url || 'Company page'}</span>
                                                                    </span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Working from</label>
                                                    <input
                                                        type="date"
                                                        className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                                                        value={exp.start_date}
                                                        onChange={e => updateExperience(exp.id, 'start_date', e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <div className="mb-1 flex items-center justify-between gap-3">
                                                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Working to</label>
                                                        <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-600">
                                                            <input
                                                                type="checkbox"
                                                                className="rounded border-gray-300"
                                                                checked={Boolean(exp.current)}
                                                                onChange={e => {
                                                                    updateExperience(exp.id, 'current', e.target.checked);
                                                                    if (e.target.checked) updateExperience(exp.id, 'end_date', '');
                                                                }}
                                                            />
                                                            Currently working
                                                        </label>
                                                    </div>
                                                    <input
                                                        type="date"
                                                        className="w-full rounded-lg border border-gray-300 p-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                                                        value={exp.current ? '' : exp.end_date}
                                                        disabled={Boolean(exp.current)}
                                                        onChange={e => updateExperience(exp.id, 'end_date', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            <textarea placeholder="Description of role..." className="h-20 w-full rounded-lg border border-gray-300 p-2 text-sm" value={exp.description} onChange={e => updateExperience(exp.id, 'description', e.target.value)} />
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

                            {/* AVAILABILITY */}
                            {activeTab === 'availability' && (
                                <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm animate-fade-in">
                                    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">Available for Hire</h3>
                                            <p className="mt-1 text-sm text-gray-500">Let verified visitors know when you are open to professional work.</p>
                                        </div>
                                        <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-gray-700">
                                            <input type="checkbox" className="h-5 w-5 accent-blue-600" checked={availabilityDraft.isActive} onChange={(e) => setAvailabilityDraft((prev) => ({ ...prev, isActive: e.target.checked, status: e.target.checked ? 'ACTIVE' : 'INACTIVE' }))} />
                                            Accept new opportunities
                                        </label>
                                    </div>
                                    <fieldset>
                                        <legend className="mb-2 text-sm font-semibold text-gray-800">Work types</legend>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            {['FREELANCE', 'FULL_TIME', 'PART_TIME', 'CONTRACT', 'CONSULTING', 'COLLABORATION'].map((type) => (
                                                <label key={type} className="flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-700 hover:bg-gray-50">
                                                    <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={availabilityDraft.availabilityTypes.includes(type)} onChange={(e) => setAvailabilityDraft((prev) => ({ ...prev, availabilityTypes: e.target.checked ? [...prev.availabilityTypes, type] : prev.availabilityTypes.filter((item) => item !== type) }))} />
                                                    {type.replace('_', ' ').toLowerCase().replace(/(^| )\S/g, (letter) => letter.toUpperCase())}
                                                </label>
                                            ))}
                                        </div>
                                    </fieldset>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <label className="text-sm font-medium text-gray-700">Work preference
                                            <select className="mt-2 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3" value={availabilityDraft.workPreference} onChange={(e) => setAvailabilityDraft((prev) => ({ ...prev, workPreference: e.target.value as ProfessionalAvailability['workPreference'] }))}>
                                                <option value="FLEXIBLE">Flexible</option><option value="REMOTE">Remote</option><option value="HYBRID">Hybrid</option><option value="ONSITE">On-site</option>
                                            </select>
                                        </label>
                                        <label className="text-sm font-medium text-gray-700">Availability timing
                                            <select className="mt-2 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3" value={availabilityDraft.timing} onChange={(e) => setAvailabilityDraft((prev) => ({ ...prev, timing: e.target.value as ProfessionalAvailability['timing'] }))}>
                                                <option value="FLEXIBLE">Flexible</option><option value="AVAILABLE_NOW">Available now</option><option value="WITHIN_ONE_WEEK">Within one week</option><option value="WITHIN_ONE_MONTH">Within one month</option>
                                            </select>
                                        </label>
                                    </div>
                                    <label className="block text-sm font-medium text-gray-700">Services or focus areas
                                        <input className="mt-2 min-h-11 w-full rounded-lg border border-gray-300 px-3" placeholder="Design, consulting, engineering" value={availabilityDraft.services.join(', ')} onChange={(e) => setAvailabilityDraft((prev) => ({ ...prev, services: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) }))} />
                                    </label>
                                    <label className="flex min-h-11 items-center gap-3 text-sm text-gray-700">
                                        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={availabilityDraft.visibility === 'PUBLIC'} onChange={(e) => setAvailabilityDraft((prev) => ({ ...prev, visibility: e.target.checked ? 'PUBLIC' : 'HIDDEN' }))} />
                                        Show this status on my public profile
                                    </label>
                                    <div className="flex flex-wrap gap-3">
                                        <button type="button" onClick={handleSaveAvailability} disabled={isSaving} className="min-h-11 rounded-lg bg-blue-600 px-5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">Save availability</button>
                                        {availabilityDraft.isActive && <button type="button" onClick={async () => { const saved = await UserService.pauseMyAvailability(); if (saved) { setAvailabilityDraft(saved); setProfile((prev) => prev ? { ...prev, availability: saved, professionalAvailability: saved } : prev); } }} className="min-h-11 rounded-lg border border-gray-300 px-5 font-semibold text-gray-700 hover:bg-gray-50">Pause</button>}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'hiring' && canEditClientHiring && (
                                <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm animate-fade-in">
                                    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">We Are Hiring</h3>
                                            <p className="mt-1 text-sm text-gray-500">Let qualified professionals know when your team is hiring.</p>
                                        </div>
                                        <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-gray-700">
                                            <input type="checkbox" className="h-5 w-5 accent-blue-600" checked={hiringDraft.isActive} onChange={(e) => setHiringDraft((prev) => ({ ...prev, isActive: e.target.checked, status: e.target.checked ? 'ACTIVE' : 'INACTIVE' }))} />
                                            We are hiring
                                        </label>
                                    </div>
                                    <fieldset>
                                        <legend className="mb-2 text-sm font-semibold text-gray-800">Hiring for</legend>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            {['FREELANCE', 'FULL_TIME', 'PART_TIME', 'CONTRACT', 'CONSULTING', 'AGENCIES'].map((type) => (
                                                <label key={type} className="flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-700 hover:bg-gray-50">
                                                    <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={hiringDraft.hiringTypes.includes(type)} onChange={(e) => setHiringDraft((prev) => ({ ...prev, hiringTypes: e.target.checked ? [...prev.hiringTypes, type] : prev.hiringTypes.filter((item) => item !== type) }))} />
                                                    {type.replace('_', ' ').toLowerCase().replace(/(^| )\S/g, (letter) => letter.toUpperCase())}
                                                </label>
                                            ))}
                                        </div>
                                    </fieldset>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <label className="text-sm font-medium text-gray-700">Hiring timeline
                                            <select className="mt-2 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3" value={hiringDraft.timing} onChange={(e) => setHiringDraft((prev) => ({ ...prev, timing: e.target.value as ClientHiringStatus['timing'] }))}>
                                                <option value="FLEXIBLE">Flexible</option><option value="AVAILABLE_NOW">Hiring now</option><option value="WITHIN_ONE_WEEK">Within one week</option><option value="WITHIN_ONE_MONTH">Within one month</option>
                                            </select>
                                        </label>
                                        <label className="block text-sm font-medium text-gray-700">Focus areas
                                            <input className="mt-2 min-h-11 w-full rounded-lg border border-gray-300 px-3" placeholder="Product, engineering, operations" value={hiringDraft.focusAreas.join(', ')} onChange={(e) => setHiringDraft((prev) => ({ ...prev, focusAreas: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) }))} />
                                        </label>
                                    </div>
                                    <label className="flex min-h-11 items-center gap-3 text-sm text-gray-700">
                                        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={hiringDraft.visibility === 'PUBLIC'} onChange={(e) => setHiringDraft((prev) => ({ ...prev, visibility: e.target.checked ? 'PUBLIC' : 'HIDDEN' }))} />
                                        Show this status on my public profile and in discovery
                                    </label>
                                    <div className="flex flex-wrap gap-3">
                                        <button type="button" onClick={handleSaveClientHiring} disabled={isSaving} className="min-h-11 rounded-lg bg-blue-600 px-5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">Save hiring status</button>
                                        {hiringDraft.isActive && <button type="button" onClick={async () => { const saved = await UserService.pauseMyClientHiringStatus(); if (saved) { setHiringDraft(saved); setProfile((prev) => prev ? { ...prev, hiring: saved, clientHiringStatus: saved } : prev); } }} className="min-h-11 rounded-lg border border-gray-300 px-5 font-semibold text-gray-700 hover:bg-gray-50">Pause</button>}
                                    </div>
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
                allowCamera={pickerTarget === 'avatar' || pickerTarget === 'cover'}
                cameraCapture="user"
                filterType={pickerTarget === 'video' ? 'video' : 'image'}
                visibility="public"
            />
            <FilePickerModal
                isOpen={portfolioPickerOpen}
                onClose={() => setPortfolioPickerOpen(false)}
                onSelect={handlePortfolioFileSelect}
                acceptedTypes="image/*"
                title="Select Portfolio Image"
            />
            {cameraOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-900">Camera</h3>
                            <button onClick={stopCamera} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
                        </div>
                        <div className="mt-4 overflow-hidden rounded-xl bg-gray-900">
                            <video ref={cameraVideoRef} autoPlay playsInline className="h-72 w-full object-cover" />
                        </div>
                        <canvas ref={cameraCanvasRef} className="hidden" />
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button onClick={stopCamera} className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-600">
                                Cancel
                            </button>
                            <button onClick={capturePhoto} className="rounded-xl bg-gray-900 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white">
                                Capture Photo
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {introRecorderOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
                    <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">Record Intro Video</h3>
                                <p className="text-xs text-gray-500">Keep it short and clear. Audio will be recorded.</p>
                            </div>
                            <button onClick={stopIntroCamera} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
                        </div>
                        <div className="mt-4 overflow-hidden rounded-xl bg-gray-900">
                            <video ref={introVideoRef} autoPlay playsInline muted className="h-72 w-full object-cover" />
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                            <button
                                onClick={stopIntroCamera}
                                className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-600"
                                disabled={introUploading}
                            >
                                Cancel
                            </button>
                            {!introRecording ? (
                                <button
                                    onClick={startIntroRecording}
                                    className="rounded-xl bg-gray-900 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
                                    disabled={introUploading}
                                >
                                    Start Recording
                                </button>
                            ) : (
                                <button
                                    onClick={stopIntroRecording}
                                    className="rounded-xl bg-red-600 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
                                    disabled={introUploading}
                                >
                                    Stop & Upload
                                </button>
                            )}
                        </div>
                        {introUploading && (
                            <div className="mt-3 text-xs text-gray-500">Uploading intro video...</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default EditProfile;
