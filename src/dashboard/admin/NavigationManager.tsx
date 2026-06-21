
import React, { useState, useEffect } from 'react';
import { CMSService } from '../../services/cms';
import { ActivityConfig, NavIconConfig, HelpLink, UserRole } from '../../types';
import { useNotification } from '../../context/NotificationContext';
import { 
    Layout, Bell, MessageSquare, Heart, HelpCircle, Save, Plus, Trash2, 
    Move, ToggleLeft, ToggleRight, Palette, Link as LinkIcon, Check, Eye
} from 'lucide-react';

const TabButton = ({ id, label, icon: Icon, activeTab, setActiveTab }: any) => (
    <button
        onClick={() => setActiveTab(id)}
        className={`px-4 py-2 rounded-md text-sm font-medium flex items-center transition-all ${
            activeTab === id ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:bg-gray-100'
        }`}
    >
        <Icon className="w-4 h-4 mr-2" /> {label}
    </button>
);

const getIconComponent = (type: string, size: number = 20, className: string = '') => {
    const props = { size, className };
    switch(type) {
        case 'notifications': return <Bell {...props} />;
        case 'messages': return <MessageSquare {...props} />;
        case 'favorites': return <Heart {...props} />;
        case 'help': return <HelpCircle {...props} />;
        default: return <Layout {...props} />;
    }
};

const NavigationManager = () => {
    const [config, setConfig] = useState<ActivityConfig | null>(null);
    const [activeTab, setActiveTab] = useState<'icons' | 'help' | 'design'>('icons');
    const { showNotification } = useNotification();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        const data = await CMSService.getActivityConfig();
        setConfig(data);
        setLoading(false);
    };

    const handleSave = async () => {
        if (!config) return;
        await CMSService.saveActivityConfig(config);
        showNotification('success', 'Saved', 'Navigation settings updated.');
    };

    // --- Icon Helpers ---
    const updateIcon = (id: string, updates: Partial<NavIconConfig>) => {
        if (!config) return;
        const newIcons = config.icons.map(icon => icon.id === id ? { ...icon, ...updates } : icon);
        setConfig({ ...config, icons: newIcons.sort((a,b) => a.sortOrder - b.sortOrder) });
    };

    const toggleRole = (iconId: string, role: UserRole) => {
        if (!config) return;
        const icon = config.icons.find(i => i.id === iconId);
        if (!icon) return;
        
        const hasRole = icon.roles.includes(role);
        const newRoles = hasRole ? icon.roles.filter(r => r !== role) : [...icon.roles, role];
        updateIcon(iconId, { roles: newRoles });
    };

    // --- Help Menu Helpers ---
    const addHelpLink = () => {
        if (!config) return;
        const newLink: HelpLink = {
            id: `hl-${Date.now()}`,
            label: 'New Link',
            url: '/',
            target: '_self',
            isEnabled: true
        };
        setConfig({ ...config, helpMenu: [...config.helpMenu, newLink] });
    };

    const updateHelpLink = (id: string, updates: Partial<HelpLink>) => {
        if (!config) return;
        const newLinks = config.helpMenu.map(l => l.id === id ? { ...l, ...updates } : l);
        setConfig({ ...config, helpMenu: newLinks });
    };

    const deleteHelpLink = (id: string) => {
        if (!config) return;
        if(confirm('Delete this link?')) {
            setConfig({ ...config, helpMenu: config.helpMenu.filter(l => l.id !== id) });
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Navigation & Activity Manager</h2>
                    <p className="text-sm text-gray-500">Manage top-bar icons, visibility, and dropdown contents.</p>
                </div>
                <button onClick={handleSave} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center hover:bg-blue-700 shadow-sm disabled:opacity-50">
                    <Save className="w-4 h-4 mr-2" /> Save Changes
                </button>
            </div>

            <div className="bg-gray-100 p-1 rounded-lg w-fit flex space-x-1">
                <TabButton id="icons" label="Top Icons" icon={Layout} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="help" label="Help Menu" icon={LinkIcon} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="design" label="Design & Style" icon={Palette} activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {loading || !config ? (
                    <div className="p-8 text-center text-gray-500">Loading Configuration...</div>
                ) : (
                    <>
                        {/* ICONS TAB */}
                        {activeTab === 'icons' && (
                            <div className="p-6">
                                <div className="space-y-4">
                                    {config.icons.map((icon) => (
                                        <div key={icon.id} className={`border rounded-xl p-4 transition-all ${icon.isEnabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-75'}`}>
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${icon.isEnabled ? 'bg-blue-50 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>
                                                        {getIconComponent(icon.type, 20)}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-gray-900">{icon.label}</h4>
                                                        <span className="text-xs text-gray-500 uppercase">{icon.type}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-medium text-gray-500">Order:</span>
                                                        <input 
                                                            type="number" 
                                                            className="w-12 border rounded p-1 text-center text-sm"
                                                            value={icon.sortOrder}
                                                            onChange={(e) => updateIcon(icon.id, { sortOrder: parseInt(e.target.value) })}
                                                        />
                                                    </div>
                                                    <button 
                                                        onClick={() => updateIcon(icon.id, { isEnabled: !icon.isEnabled })}
                                                        className={`text-2xl transition-colors ${icon.isEnabled ? 'text-green-500' : 'text-gray-300'}`}
                                                    >
                                                        {icon.isEnabled ? <ToggleRight /> : <ToggleLeft />}
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            {icon.isEnabled && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-500 mb-2">Display Settings</label>
                                                        <div className="flex items-center gap-2">
                                                            <input 
                                                                type="text" 
                                                                className="border rounded px-2 py-1 text-sm" 
                                                                value={icon.label} 
                                                                onChange={(e) => updateIcon(icon.id, { label: e.target.value })}
                                                            />
                                                            <label className="flex items-center text-sm text-gray-600 cursor-pointer">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={icon.showLabel} 
                                                                    onChange={(e) => updateIcon(icon.id, { showLabel: e.target.checked })} 
                                                                    className="mr-2 rounded"
                                                                />
                                                                Show Label
                                                            </label>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-500 mb-2">Visible To</label>
                                                        <div className="flex gap-2">
                                                            {[UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN, UserRole.GUEST].map(role => (
                                                                <button
                                                                    key={role}
                                                                    onClick={() => toggleRole(icon.id, role)}
                                                                    className={`px-2 py-1 rounded text-xs border capitalize transition-colors ${
                                                                        icon.roles.includes(role) 
                                                                        ? 'bg-blue-50 border-blue-200 text-blue-700 font-bold' 
                                                                        : 'bg-white border-gray-200 text-gray-400'
                                                                    }`}
                                                                >
                                                                    {role}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* HELP MENU TAB */}
                        {activeTab === 'help' && (
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-gray-900">Help Dropdown Links</h3>
                                    <button onClick={addHelpLink} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-100 flex items-center">
                                        <Plus className="w-3 h-3 mr-1" /> Add Link
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {config.helpMenu.map((link, idx) => (
                                        <div key={link.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 group">
                                            <span className="text-gray-400 font-mono text-xs w-6">{idx + 1}</span>
                                            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <input 
                                                    className="border rounded px-2 py-1 text-sm" 
                                                    value={link.label} 
                                                    onChange={(e) => updateHelpLink(link.id, { label: e.target.value })}
                                                    placeholder="Label"
                                                />
                                                <input 
                                                    className="border rounded px-2 py-1 text-sm" 
                                                    value={link.url} 
                                                    onChange={(e) => updateHelpLink(link.id, { url: e.target.value })}
                                                    placeholder="/url"
                                                />
                                                <select
                                                    className="border rounded px-2 py-1 text-sm"
                                                    value={link.target}
                                                    onChange={(e) => updateHelpLink(link.id, { target: e.target.value as any })}
                                                >
                                                    <option value="_self">Same Tab</option>
                                                    <option value="_blank">New Tab</option>
                                                </select>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                 <button 
                                                    onClick={() => updateHelpLink(link.id, { isEnabled: !link.isEnabled })}
                                                    className={`text-xl ${link.isEnabled ? 'text-green-500' : 'text-gray-300'}`}
                                                >
                                                    {link.isEnabled ? <ToggleRight /> : <ToggleLeft />}
                                                </button>
                                                <button onClick={() => deleteHelpLink(link.id)} className="text-gray-400 hover:text-red-500 p-1">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {config.helpMenu.length === 0 && <p className="text-center text-gray-400 text-sm py-4">No links in help menu.</p>}
                                </div>
                            </div>
                        )}

                        {/* DESIGN TAB */}
                        {activeTab === 'design' && (
                            <div className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Icon Style</label>
                                            <div className="flex gap-4">
                                                <button 
                                                    onClick={() => setConfig({...config, design: { ...config.design, iconStyle: 'outline' }})}
                                                    className={`flex-1 py-3 px-4 rounded-lg border flex items-center justify-center ${config.design.iconStyle === 'outline' ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                                >
                                                    <Bell className="w-5 h-5 mr-2" /> Outline
                                                </button>
                                                <button 
                                                    onClick={() => setConfig({...config, design: { ...config.design, iconStyle: 'filled' }})}
                                                    className={`flex-1 py-3 px-4 rounded-lg border flex items-center justify-center ${config.design.iconStyle === 'filled' ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                                >
                                                    <Bell className="w-5 h-5 mr-2 fill-current" /> Filled
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Icon Size (px)</label>
                                            <input 
                                                type="range" 
                                                min="16" max="32" 
                                                value={config.design.iconSize}
                                                onChange={(e) => setConfig({...config, design: { ...config.design, iconSize: parseInt(e.target.value) }})}
                                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <div className="text-right text-xs text-gray-500 mt-1">{config.design.iconSize}px</div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Badge Color</label>
                                            <div className="flex gap-2">
                                                {['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#EC4899'].map(color => (
                                                    <button 
                                                        key={color}
                                                        onClick={() => setConfig({...config, design: { ...config.design, badgeColor: color }})}
                                                        className={`w-8 h-8 rounded-full border-2 ${config.design.badgeColor === color ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                                                        style={{ backgroundColor: color }}
                                                    />
                                                ))}
                                                <input 
                                                    type="color" 
                                                    value={config.design.badgeColor}
                                                    onChange={(e) => setConfig({...config, design: { ...config.design, badgeColor: e.target.value }})}
                                                    className="w-8 h-8 p-0 border-0 rounded-full overflow-hidden cursor-pointer"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Preview */}
                                    <div className="bg-gray-900 rounded-xl p-8 flex items-center justify-center">
                                        <div className="bg-white px-8 py-4 rounded shadow-lg flex items-center space-x-6">
                                            {['notifications', 'messages', 'favorites', 'help'].map((type, i) => (
                                                <div key={i} className="relative">
                                                    {getIconComponent(type, config.design.iconSize, `text-gray-600 ${config.design.iconStyle === 'filled' ? 'fill-current' : ''}`)}
                                                    {config.design.showBadges && i < 2 && (
                                                        <span 
                                                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] text-white flex items-center justify-center border border-white"
                                                            style={{ backgroundColor: config.design.badgeColor }}
                                                        >
                                                            {i + 1}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                            <div className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white shadow-sm"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default NavigationManager;
