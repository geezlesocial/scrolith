
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Twitter, Linkedin, Instagram, Facebook, Youtube, Globe, Mail } from 'lucide-react';
import { CMSService } from '../services/cms';
import { FooterConfig } from '../types';
import { useContent } from '../context/ContentContext';

const DynamicFooter = () => {
  const [config, setConfig] = useState<FooterConfig | null>(null);
  const { settings } = useContent();

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const data = await CMSService.getFooterConfig();
        setConfig(data);
      } catch (err) {
        console.error("Failed to load footer config", err);
      }
    };
    loadConfig();
  }, []);

  const getIcon = (name: string) => {
    switch (name.toLowerCase()) {
      case 'twitter': return <Twitter className="w-5 h-5" />;
      case 'linkedin': return <Linkedin className="w-5 h-5" />;
      case 'instagram': return <Instagram className="w-5 h-5" />;
      case 'facebook': return <Facebook className="w-5 h-5" />;
      case 'youtube': return <Youtube className="w-5 h-5" />;
      default: return <Globe className="w-5 h-5" />;
    }
  };

  if (!config) return null;

  // Priority: Footer Config > Global Settings
  const displayLogo = config.logoUrl || settings?.logoUrl;

  return (
    <footer className="bg-gray-900 text-white pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand Column */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center space-x-2">
              {displayLogo ? (
                   <img src={displayLogo} alt="Logo" className="h-8 w-auto object-contain brightness-0 invert" />
              ) : (
                   <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-lg text-white">G</div>
              )}
              <span className="text-xl font-bold hidden">Scrolith</span> 
            </Link>
            <p className="text-gray-400 text-sm leading-relaxed">
              {config.description}
            </p>
            <div className="flex space-x-4 pt-4">
              {config.socials.filter(s => s.enabled).map((social, idx) => (
                <a 
                  key={idx}
                  href={social.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  {getIcon(social.icon || social.platform)}
                </a>
              ))}
            </div>
          </div>

          {/* Dynamic Link Columns */}
          {config.columns.map((col, idx) => (
            <div key={idx}>
              <h3 className="text-lg font-semibold mb-4">{col.title}</h3>
              <ul className="space-y-2">
                {col.links.map((link, linkIdx) => (
                  <li key={linkIdx}>
                    {link.type === 'external' ? (
                        <a href={link.url} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-white transition-colors text-sm">{link.label}</a>
                    ) : (
                        <Link 
                          to={link.url} 
                          className="text-gray-400 hover:text-white transition-colors text-sm"
                        >
                          {link.label}
                        </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact Column */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Contact</h3>
            <ul className="space-y-3">
              <li className="flex items-center text-gray-400 text-sm">
                <Mail className="w-4 h-4 mr-2" />
                <a href={`mailto:${config.contact.adminEmail}`} className="hover:text-white">
                  {config.contact.adminEmail}
                </a>
              </li>
              <li className="text-gray-400 text-sm">
                 <span className="block text-xs text-gray-500 mb-1">Support</span>
                 <a href={`mailto:${config.contact.supportEmail}`} className="hover:text-white">
                  {config.contact.supportEmail}
                 </a>
              </li>
              <li>
                <Link to={config.contact.ticketRoute || '/support'} className="inline-block mt-2 bg-blue-600 text-white text-xs px-3 py-1.5 rounded font-medium hover:bg-blue-700 transition-colors">
                  Open Ticket
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm text-gray-500">
            {config.copyright}
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0 text-sm text-gray-500">
            <Link to="/p/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/p/terms" className="hover:text-white">Terms</Link>
            <Link to="/affiliate-program" className="hover:text-white">Become an Affiliate</Link>
            <Link to="/sitemap" className="hover:text-white">Sitemap</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default DynamicFooter;
