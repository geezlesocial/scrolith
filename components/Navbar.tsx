// C:\Projects\Scrolith\src\components\Navbar.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Bell, MessageSquare, Heart, User, LogOut, Briefcase, PlusCircle, Globe, ChevronDown, Sparkles, Users, Settings, HelpCircle, LayoutDashboard, Menu, X, Star, Bookmark } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useContent } from '../context/ContentContext';
import { useMessages } from '../context/MessageContext';
import { useNotification } from '../context/NotificationContext';
import { useCurrency } from '../context/CurrencyContext';
import { UserRole, HeaderConfig, ActivityConfig } from '../types';
import { CMSService } from '../services/cms';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useUser();
  const { settings } = useContent();
  const { unreadCount } = useMessages();
  const { notifications, markAsRead } = useNotification();
  const { currency, setCurrency, availableCurrencies } = useCurrency();
  
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig | null>(null);
  const [activityConfig, setActivityConfig] = useState<ActivityConfig | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessagesDropdown, setShowMessagesDropdown] = useState(false);
  const [showHelpDropdown, setShowHelpDropdown] = useState(false);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [loading, setLoading] = useState(true);

  const notifRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const currencyRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    
    const loadConfigs = async () => {
        try {
            const header = await CMSService.getHeaderConfig();
            const activity = await CMSService.getActivityConfig();
            
            if (mounted) {
                setHeaderConfig(header);
                setActivityConfig(activity);
            }
        } catch (error) {
            console.error('Failed to load navbar configs:', error);
            // Set fallback configs
            setHeaderConfig({
                id: 'default',
                homeUrl: '/',
                variant: 'light',
                searchEnabled: true,
                searchMode: 'keyword',
                logoUrl: settings?.logoUrl || '',
                faviconUrl: settings?.faviconUrl || '',
                navigation: [
                    { id: 'nav-1', label: 'Find Talent', url: '/browse', visibility: [UserRole.GUEST, UserRole.EMPLOYER, UserRole.ADMIN] },
                    { id: 'nav-2', label: 'Find Work', url: '/browse-jobs', visibility: [UserRole.GUEST, UserRole.FREELANCER, UserRole.ADMIN] },
                    { id: 'nav-3', label: 'Community', url: '/community', visibility: [UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN] },
                    { id: 'nav-4', label: 'Blog', url: '/blog', visibility: [UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN] }
                ],
                actions: { notifications: true, messages: true, orders: true, lists: true, switchSelling: true, profile: true },
                profileMenu: [
                    { id: 'pm-1', label: 'Dashboard', url: '/dashboard', visibility: [UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN] },
                    { id: 'pm-2', label: 'My Profile', url: '/profile/edit', visibility: [UserRole.FREELANCER] },
                    { id: 'pm-3', label: 'Settings', url: '/settings', visibility: [UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN] }
                ]
            });
            setActivityConfig({
                icons: [
                    { id: 'notif', type: 'notifications', label: 'Notifications', isEnabled: true, showLabel: false, sortOrder: 1, roles: [UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN] },
                    { id: 'msg', type: 'messages', label: 'Messages', isEnabled: true, showLabel: false, sortOrder: 2, roles: [UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN] },
                    { id: 'fav', type: 'favorites', label: 'Favorites', isEnabled: true, showLabel: false, sortOrder: 3, roles: [UserRole.FREELANCER, UserRole.EMPLOYER] },
                    { id: 'help', type: 'help', label: 'Help', isEnabled: true, showLabel: false, sortOrder: 4, roles: [UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN] }
                ],
                helpMenu: [],
                design: { iconStyle: 'outline', iconSize: 20, badgeColor: '#EF4444', showBadges: true }
            });
        } finally {
            if (mounted) setLoading(false);
        }
    };
    loadConfigs();

    return () => {
        mounted = false;
    };
  }, [settings]);

  // Close dropdowns on outside click
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (notifRef.current && !notifRef.current.contains(event.target as Node)) setShowNotifications(false);
          if (msgRef.current && !msgRef.current.contains(event.target as Node)) setShowMessagesDropdown(false);
          if (helpRef.current && !helpRef.current.contains(event.target as Node)) setShowHelpDropdown(false);
          if (currencyRef.current && !currencyRef.current.contains(event.target as Node)) setShowCurrencyDropdown(false);
          if (profileRef.current && !profileRef.current.contains(event.target as Node)) setShowProfileDropdown(false);
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleNotificationClick = (id: string, actionUrl?: string) => {
      markAsRead(id);
      setShowNotifications(false);
      if (actionUrl) navigate(actionUrl);
  };

  const userRole = user?.role || UserRole.GUEST;

  const renderNavItem = (item: any) => {
      if (!item?.visibility?.includes(userRole)) return null;

      return (
          <Link 
            key={item.id} 
            to={item.url}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              location.pathname === item.url 
                ? 'text-blue-600 bg-blue-50' 
                : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
              {item.label}
          </Link>
      );
  };

  const getDynamicIconComponent = (type: string, size: number, style: 'outline'|'filled') => {
      const className = `w-[${size}px] h-[${size}px] ${style === 'filled' ? 'fill-current' : ''}`;
      switch(type) {
          case 'notifications': return <Bell size={size} className={className} />;
          case 'messages': return <MessageSquare size={size} className={className} />;
          case 'favorites': return <Heart size={size} className={className} />;
          case 'help': return <HelpCircle size={size} className={className} />;
          default: return <Star size={size} className={className} />;
      }
  };

  if (loading || !headerConfig) {
    return (
      <nav className={`bg-white border-b border-gray-200 sticky top-0 z-40`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="hidden md:flex items-center space-x-2">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-8 w-24 bg-gray-200 rounded animate-pulse"></div>
              ))}
            </div>
            <div className="flex items-center space-x-2">
              <div className="h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className={`bg-white border-b border-gray-200 sticky top-0 z-40`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          
          {/* Left: Logo */}
          <div className="flex items-center">
            <Link to={headerConfig?.homeUrl || '/'} className="flex-shrink-0 flex items-center mr-8">
              {(headerConfig?.logoUrl || settings?.logoUrl) ? (
                  <img 
                    src={headerConfig?.logoUrl || settings?.logoUrl} 
                    alt="Logo" 
                    className="h-8 w-auto object-contain" 
                  />
              ) : (
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-lg text-white">G</div>
              )}
              <span className="ml-2 text-xl font-bold text-gray-900 hidden sm:block">
                {settings?.siteName || 'Scrolith'}
              </span>
            </Link>
          </div>

          {/* Center: Navigation Links */}
          <div className="hidden md:flex md:items-center md:space-x-8">
            {headerConfig?.navigation?.map(renderNavItem) || []}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center space-x-2 md:space-x-4">
            
            {/* Currency Switcher */}
            <div className="relative" ref={currencyRef}>
                <button 
                    onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
                    className="text-gray-500 hover:text-gray-900 font-medium text-sm flex items-center px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                >
                    {currency.code} <ChevronDown className="w-3 h-3 ml-1" />
                </button>
                {showCurrencyDropdown && (
                    <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 max-h-64 overflow-y-auto">
                        {availableCurrencies.filter(c => c.isActive).map(c => (
                            <button
                                key={c.code}
                                onClick={() => {
                                    setCurrency(c.code);
                                    setShowCurrencyDropdown(false);
                                }}
                                className={`block w-full text-left px-4 py-2 text-xs hover:bg-gray-50 flex justify-between items-center ${currency.code === c.code ? 'font-bold text-blue-600 bg-blue-50' : 'text-gray-700'}`}
                            >
                                <span>{c.code}</span>
                                <span className="text-gray-400">{c.symbol}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {isAuthenticated && activityConfig ? (
              <>
                {/* Dynamic Activity Icons */}
                <div className="flex items-center space-x-1 sm:space-x-2">
                    {activityConfig?.icons
                        ?.filter(icon => icon.isEnabled && icon.roles.includes(userRole))
                        ?.sort((a, b) => a.sortOrder - b.sortOrder)
                        ?.map(icon => {
                            if (icon.type === 'notifications') {
                                return (
                                    <div key={icon.id} ref={notifRef} className="relative">
                                        <button 
                                            onClick={() => setShowNotifications(!showNotifications)}
                                            className="text-gray-500 hover:text-gray-900 p-2 rounded-full hover:bg-gray-100 relative flex items-center"
                                            title={icon.label}
                                        >
                                            {getDynamicIconComponent('notifications', activityConfig.design.iconSize, activityConfig.design.iconStyle)}
                                            {activityConfig.design.showBadges && notifications.filter(n => !n.isRead).length > 0 && (
                                                <span 
                                                    className="absolute top-1 right-1 h-4 min-w-[16px] px-1 rounded-full text-white text-[10px] flex items-center justify-center font-bold"
                                                    style={{ backgroundColor: activityConfig.design.badgeColor }}
                                                >
                                                    {notifications.filter(n => !n.isRead).length}
                                                </span>
                                            )}
                                            {icon.showLabel && <span className="ml-2 text-sm font-medium hidden lg:block">{icon.label}</span>}
                                        </button>

                                        {showNotifications && (
                                            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
                                                <div className="px-4 py-3 border-b border-gray-50 bg-gray-50 flex justify-between items-center">
                                                    <h3 className="font-bold text-sm text-gray-700">Notifications</h3>
                                                    <span className="text-xs text-gray-500">{notifications.filter(n => !n.isRead).length} new</span>
                                                </div>
                                                <div className="max-h-96 overflow-y-auto">
                                                    {notifications.length === 0 ? (
                                                        <div className="p-6 text-center text-gray-400 text-sm">No new notifications</div>
                                                    ) : (
                                                        notifications.map(notif => (
                                                            <div 
                                                                key={notif.id}
                                                                onClick={() => handleNotificationClick(notif.id, notif.actionUrl)}
                                                                className={`p-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors relative ${!notif.isRead ? 'bg-blue-50/30' : ''}`}
                                                            >
                                                                <div className="flex justify-between items-start mb-1">
                                                                    <h4 className={`text-sm ${!notif.isRead ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{notif.title}</h4>
                                                                    <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">{new Date(notif.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                                </div>
                                                                <p className="text-xs text-gray-500 line-clamp-2">{notif.message}</p>
                                                                {!notif.isRead && (
                                                                    <span className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></span>
                                                                )}
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            }
                            
                            if (icon.type === 'messages') {
                                return (
                                    <div key={icon.id} ref={msgRef}>
                                        <button 
                                            onClick={() => setShowMessagesDropdown(!showMessagesDropdown)}
                                            className="text-gray-500 hover:text-gray-900 p-2 rounded-full hover:bg-gray-100 relative flex items-center"
                                            title={icon.label}
                                        >
                                            {getDynamicIconComponent('messages', activityConfig.design.iconSize, activityConfig.design.iconStyle)}
                                            {activityConfig.design.showBadges && unreadCount > 0 && (
                                                <span 
                                                    className="absolute top-1 right-1 h-4 min-w-[16px] px-1 rounded-full text-white text-[10px] flex items-center justify-center font-bold"
                                                    style={{ backgroundColor: activityConfig.design.badgeColor }}
                                                >
                                                    {unreadCount}
                                                </span>
                                            )}
                                        </button>
                                        
                                        {showMessagesDropdown && (
                                            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
                                                <div className="px-4 py-3 border-b border-gray-50 bg-gray-50 flex justify-between items-center">
                                                    <h3 className="font-bold text-sm text-gray-700">Messages</h3>
                                                    <Link to="/messages" className="text-xs text-blue-600 hover:underline">View Inbox</Link>
                                                </div>
                                                <div className="p-4 text-center text-sm text-gray-500">
                                                    {unreadCount > 0 ? (
                                                        <p>You have {unreadCount} unread messages. Go to inbox to reply.</p>
                                                    ) : (
                                                        <p>No new messages.</p>
                                                    )}
                                                    <Link to="/messages" className="block mt-3 w-full bg-blue-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-blue-700">Open Messenger</Link>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            }
                            
                            if (icon.type === 'favorites') {
                                return (
                                    <Link 
                                        key={icon.id}
                                        to="/favorites"
                                        className="text-gray-500 hover:text-gray-900 p-2 rounded-full hover:bg-gray-100 flex items-center"
                                        title={icon.label}
                                    >
                                        {getDynamicIconComponent('favorites', activityConfig.design.iconSize, activityConfig.design.iconStyle)}
                                        {icon.showLabel && <span className="ml-2 text-sm font-medium hidden lg:block">{icon.label}</span>}
                                    </Link>
                                );
                            }
                            
                            if (icon.type === 'help') {
                                return (
                                    <div key={icon.id} ref={helpRef}>
                                        <button 
                                            onClick={() => setShowHelpDropdown(!showHelpDropdown)}
                                            className="text-gray-500 hover:text-gray-900 p-2 rounded-full hover:bg-gray-100 flex items-center"
                                            title={icon.label}
                                        >
                                            {getDynamicIconComponent('help', activityConfig.design.iconSize, activityConfig.design.iconStyle)}
                                        </button>
                                        {showHelpDropdown && (
                                            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
                                                <div className="py-1">
                                                    {activityConfig.helpMenu
                                                        ?.filter(link => link.isEnabled)
                                                        ?.map(link => (
                                                            <Link 
                                                                key={link.id}
                                                                to={link.url}
                                                                target={link.target}
                                                                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600"
                                                                onClick={() => setShowHelpDropdown(false)}
                                                            >
                                                                {link.label}
                                                            </Link>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            }
                            
                            return null;
                        })}
                </div>
                
                {/* Profile Dropdown */}
                <div className="relative ml-3" ref={profileRef}>
                    <button
                        onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                        className="flex items-center space-x-2 focus:outline-none"
                    >
                        <img
                            className="h-8 w-8 rounded-full object-cover border border-gray-200"
                            src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.name || 'User'}`}
                            alt=""
                        />
                        <span className="hidden lg:block text-sm font-medium text-gray-700">{user?.name}</span>
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                    </button>

                    {showProfileDropdown && (
                        <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-xl shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
                            <div className="py-1">
                                {/* Dynamic Profile Menu Items */}
                                {headerConfig?.profileMenu
                                    ?.filter(item => item.visibility.includes(userRole))
                                    ?.map(item => (
                                        <Link
                                            key={item.id}
                                            to={item.url}
                                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600"
                                            onClick={() => setShowProfileDropdown(false)}
                                        >
                                            {item.label}
                                        </Link>
                                ))}
                                <button
                                    onClick={handleLogout}
                                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                    Sign out
                                </button>
                            </div>
                        </div>
                    )}
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-2">
                <Link to="/auth/login" className="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium">Log in</Link>
                <Link to="/auth/signup" className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">Sign up</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
