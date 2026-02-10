
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, MessageSquare, User as UserIcon, LogOut, Briefcase, PlusCircle, Globe, Check, Heart, Package, ChevronDown, Sparkles, Users, Settings, HelpCircle, LayoutDashboard, Menu, X, Star, Bookmark } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useMessages } from '../context/MessageContext';
import { useContent } from '../context/ContentContext';
import { useCurrency } from '../context/CurrencyContext';
import { useNotification } from '../context/NotificationContext';
import { UserRole, HeaderConfig, NavItem, ActivityConfig, NavIconConfig } from '../types';
import { CMSService } from '../services/cms';

const Navbar = () => {
  const { user, isAuthenticated, logout } = useUser();
  const { settings } = useContent();
  const { unreadCount } = useMessages();
  const { notifications, markAsRead } = useNotification();
  const { currency, setCurrency, availableCurrencies } = useCurrency(); // Using context for dynamic list
  const navigate = useNavigate();
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessagesDropdown, setShowMessagesDropdown] = useState(false);
  const [showHelpDropdown, setShowHelpDropdown] = useState(false);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig | null>(null);
  const [activityConfig, setActivityConfig] = useState<ActivityConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const notifRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const currencyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      const loadConfig = async () => {
          try {
              const [header, activity] = await Promise.all([
                  CMSService.getHeaderConfig(),
                  CMSService.getActivityConfig()
              ]);
              setHeaderConfig(header);
              setActivityConfig(activity);
          } catch (e) {
              console.error("Failed to load navbar config", e);
          } finally {
              setLoading(false);
          }
      };
      loadConfig();
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (notifRef.current && !notifRef.current.contains(event.target as Node)) setShowNotifications(false);
          if (msgRef.current && !msgRef.current.contains(event.target as Node)) setShowMessagesDropdown(false);
          if (helpRef.current && !helpRef.current.contains(event.target as Node)) setShowHelpDropdown(false);
          if (currencyRef.current && !currencyRef.current.contains(event.target as Node)) setShowCurrencyDropdown(false);
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

  const isClient = user?.role === UserRole.EMPLOYER;
  const userRole = user?.role || UserRole.GUEST;

  // Icons map for dynamic rendering if needed
  const IconMap: any = {
      UserIcon, Briefcase, PlusCircle, LayoutDashboard, Users, Settings, HelpCircle, Sparkles
  };

  // Helper to resolve dynamic paths based on role
  const getResolvedPath = (item: NavItem) => {
      if (item.label === 'Dashboard') {
          return user?.role === UserRole.EMPLOYER ? '/client/dashboard' : '/freelancer/dashboard';
      }
      if (item.label === 'Account Settings') {
          return user?.role === UserRole.EMPLOYER ? '/client/dashboard?tab=settings' : '/freelancer/dashboard?tab=settings';
      }
      return item.url;
  };

  const renderNavItem = (item: any) => {
      // Check visibility
      if (!item.visibility.includes(userRole)) return null;

      const Icon = item.icon ? IconMap[item.icon] : null;

      if (item.url) {
          return (
              <Link 
                key={item.id} 
                to={getResolvedPath(item)}
                className="text-gray-500 hover:text-gray-900 text-sm font-medium flex items-center"
              >
                  {Icon && <Icon className="w-4 h-4 mr-1" />}
                  {item.label}
              </Link>
          );
      }
      return null;
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

  if (loading && !headerConfig) return <div className="h-16 bg-white border-b border-gray-200"></div>;
  if (!headerConfig) return null;

  // Priority: Header Config > Global Settings
  const displayLogo = headerConfig.logoUrl || settings?.logoUrl;

  return (
    <nav className={`bg-${headerConfig.variant === 'dark' ? 'gray-900' : 'white'} border-b border-gray-200 sticky top-0 z-40 transition-colors`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          
          {/* Left: Logo */}
          <div className="flex items-center">
            <Link to={headerConfig.homeUrl || '/'} className="flex-shrink-0 flex items-center mr-8">
              {displayLogo ? (
                  <img src={displayLogo} alt="Logo" className="h-8 w-auto object-contain" />
              ) : (
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-lg text-white">G</div>
              )}
            </Link>
          </div>

          {/* Right Navigation */}
          <div className="flex items-center space-x-2 md:space-x-4">
            
            {/* Dynamic Navigation Links */}
            <div className="hidden md:flex space-x-6 mr-4 items-center">
                {headerConfig.navigation.map(renderNavItem)}
            </div>

            {/* Currency Switcher (Visible to all) */}
            <div className="relative mr-2" ref={currencyRef}>
                <button 
                    className="text-gray-500 hover:text-gray-900 font-medium text-sm flex items-center px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                    onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
                >
                    {currency.code} <ChevronDown className="w-3 h-3 ml-1" />
                </button>
                {showCurrencyDropdown && (
                    <div className="absolute top-full right-0 mt-2 w-40 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 max-h-64 overflow-y-auto animate-fade-in-up">
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
                {/* Dynamic Icons from ActivityConfig */}
                <div className="flex items-center space-x-1 sm:space-x-2">
                    {activityConfig.icons
                        .filter(icon => icon.isEnabled && icon.roles.includes(userRole))
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map(icon => (
                            <div key={icon.id} className="relative">
                                {/* HELP ICON */}
                                {icon.type === 'help' && (
                                    <div ref={helpRef}>
                                        <button 
                                            onClick={() => setShowHelpDropdown(!showHelpDropdown)}
                                            className="text-gray-500 hover:text-gray-900 p-2 rounded-full hover:bg-gray-100 relative flex items-center"
                                            title={icon.label}
                                        >
                                            {getDynamicIconComponent('help', activityConfig.design.iconSize, activityConfig.design.iconStyle)}
                                            {icon.showLabel && <span className="ml-2 text-sm font-medium hidden lg:block">{icon.label}</span>}
                                        </button>
                                        {showHelpDropdown && (
                                            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fade-in-up">
                                                <div className="py-1">
                                                    {activityConfig.helpMenu
                                                        .filter(link => link.isEnabled)
                                                        .map(link => (
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
                                )}

                                {/* FAVORITES ICON */}
                                {icon.type === 'favorites' && (
                                    <Link 
                                        to="/favorites"
                                        className="text-gray-500 hover:text-gray-900 p-2 rounded-full hover:bg-gray-100 flex items-center"
                                        title={icon.label}
                                    >
                                        {getDynamicIconComponent('favorites', activityConfig.design.iconSize, activityConfig.design.iconStyle)}
                                        {icon.showLabel && <span className="ml-2 text-sm font-medium hidden lg:block">{icon.label}</span>}
                                    </Link>
                                )}

                                {/* MESSAGES ICON */}
                                {icon.type === 'messages' && (
                                    <div ref={msgRef}>
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
                                            {icon.showLabel && <span className="ml-2 text-sm font-medium hidden lg:block">{icon.label}</span>}
                                        </button>
                                        
                                        {showMessagesDropdown && (
                                            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fade-in-up">
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
                                )}

                                {/* NOTIFICATIONS ICON */}
                                {icon.type === 'notifications' && (
                                    <div ref={notifRef}>
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
                                            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fade-in-up">
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
                                )}
                            </div>
                    ))}
                </div>
                
                {/* Profile Dropdown */}
                {headerConfig.actions.profile && (
                    <div className="relative ml-3 group">
                        <button className="flex items-center space-x-2 focus:outline-none pl-2 border-l border-gray-200">
                            <img className="h-8 w-8 rounded-full object-cover border border-gray-200" src={user?.avatar || "https://ui-avatars.com/api/?name=User"} alt="" />
                            {isClient && <span className="text-xs font-medium text-gray-700 hidden lg:block">{user.name}</span>}
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                        </button>
                        
                        {/* Mega Menu Dropdown */}
                        <div className="absolute right-0 z-50 mt-2 w-72 origin-top-right rounded-xl bg-white shadow-xl ring-1 ring-black ring-opacity-5 focus:outline-none hidden group-hover:block hover:block transform transition-all duration-200 animate-fade-in-up">
                            <div className="py-2">
                                {/* Profile Header */}
                                <div className="px-4 py-3 border-b border-gray-100 flex items-center space-x-3 bg-gray-50">
                                    <img className="h-10 w-10 rounded-full object-cover" src={user?.avatar || "https://ui-avatars.com/api/?name=User"} alt="" />
                                    <div className="overflow-hidden">
                                        <p className="text-sm font-bold text-gray-900 truncate">{user.name}</p>
                                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                                    </div>
                                </div>

                                {/* Dynamic Profile Menu Items */}
                                <div className="py-2">
                                    {headerConfig.profileMenu.map(item => {
                                        if (!item.visibility.includes(userRole)) return null;
                                        return (
                                            <Link key={item.id} to={getResolvedPath(item)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center">
                                                {item.label}
                                            </Link>
                                        );
                                    })}
                                </div>

                                {/* Footer & Preferences */}
                                <div className="border-t border-gray-100 py-2">
                                    <div className="px-4 py-2 flex justify-between items-center text-sm text-gray-600">
                                        <span className="flex items-center"><Globe className="w-3 h-3 mr-2"/> English</span>
                                        {/* No duplicate currency switcher here if top bar has it, keeping it clean */}
                                    </div>
                                    <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center">
                                        <LogOut className="w-4 h-4 mr-3"/> Sign out
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
              </>
            ) : (
              <div className="flex items-center space-x-2">
                <Link to="/auth/login" className="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium">Sign In</Link>
                <Link to="/auth/signup" className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">Join</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
