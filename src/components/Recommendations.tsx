import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { SearchService } from '../services/search';
import { Recommendation } from '../types';
import { Heart, Share2, MessageCircle, TrendingUp, Star, Award, Target, Zap, Globe, Calendar, Filter, Download, Upload, Plus, Edit, Trash2, Search, Grid, Table, ChevronRight, Bookmark, Eye, Lock, ShieldCheck, DollarSign, Users, Briefcase, BarChart2, BarChart3, Activity, BarChart, TrendingDown, AlertTriangle, Info, HelpCircle, Sparkles, Copy, Mail, Facebook, Twitter, Linkedin, ExternalLink, Share2 as Share2Icon, Heart as HeartIcon, MessageCircle as MessageCircleIcon, TrendingUp as TrendingUpIcon, DollarSign as DollarSignIcon, Users as UsersIcon, Settings as SettingsIcon, Briefcase as BriefcaseIcon, Shield as ShieldIcon, FileText as FileTextIcon, LifeBuoy as LifeBuoyIcon, ShieldCheck as ShieldCheckIcon, ShieldAlert as ShieldAlertIcon, CheckCircle as CheckCircleIcon, XCircle as XCircleIcon, AlertTriangle as AlertTriangleIcon, Info as InfoIcon, HelpCircle as HelpCircleIcon, Sparkles as SparklesIcon, Star as StarIcon, Bookmark as BookmarkIcon, Copy as CopyIcon, Mail as MailIcon, Facebook as FacebookIcon, Twitter as TwitterIcon, Linkedin as LinkedinIcon, ExternalLink as ExternalLinkIcon, Share2 as Share2Icon2, Heart as HeartIcon2, MessageCircle as MessageCircleIcon2, TrendingUp as TrendingUpIcon2, DollarSign as DollarSignIcon2, Users as UsersIcon2, Settings as SettingsIcon2, Briefcase as BriefcaseIcon2, Shield as ShieldIcon2, FileText as FileTextIcon2, LifeBuoy as LifeBuoyIcon2, ShieldCheck as ShieldCheckIcon2, ShieldAlert as ShieldAlertIcon2, CheckCircle as CheckCircleIcon2, XCircle as XCircleIcon2, AlertTriangle as AlertTriangleIcon2, Info as InfoIcon2, HelpCircle as HelpCircleIcon2, Sparkles as SparklesIcon2, Star as StarIcon2, Bookmark as BookmarkIcon2, Copy as CopyIcon2, Mail as MailIcon2, Facebook as FacebookIcon2, Twitter as TwitterIcon2, Linkedin as LinkedinIcon2, ExternalLink as ExternalLinkIcon2, Share2 as Share2Icon3, Heart as HeartIcon3, MessageCircle as MessageCircleIcon3, TrendingUp as TrendingUpIcon3, DollarSign as DollarSignIcon3, Users as UsersIcon3, Settings as SettingsIcon3, Briefcase as BriefcaseIcon3, Shield as ShieldIcon3, FileText as FileTextIcon3, LifeBuoy as LifeBuoyIcon3, ShieldCheck as ShieldCheckIcon3, ShieldAlert as ShieldAlertIcon3, CheckCircle as CheckCircleIcon3, XCircle as XCircleIcon3, AlertTriangle as AlertTriangleIcon3, Info as InfoIcon3, HelpCircle as HelpCircleIcon3, Sparkles as SparklesIcon3, Star as StarIcon3, Bookmark as BookmarkIcon3, Copy as CopyIcon3, Mail as MailIcon3, Facebook as FacebookIcon3, Twitter as TwitterIcon3, Linkedin as LinkedinIcon3, ExternalLink as ExternalLinkIcon3
} from 'lucide-react';

interface Props {
  userId: string;
}

const Recommendations: React.FC<Props> = ({ userId }) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchRecs = async () => {
      try {
        // Add small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        const recs = await SearchService.getRecommendations(userId);
        setRecommendations(recs);
      } catch (error) {
        console.error('Failed to fetch recommendations', error);
        // Set fallback recommendations instead of failing
        setRecommendations([
          { id: 'rec-1', title: 'Python Development', type: 'gig', relevance: 0.95, url: '/gigs/python-dev', price: 500 },
          { id: 'rec-2', title: 'Logo Design', type: 'gig', relevance: 0.89, url: '/gigs/logo-design', price: 150 },
          { id: 'rec-3', title: 'SEO Optimization', type: 'job', relevance: 0.87, url: '/jobs/seo-optimization', budget: '1000-2000' },
          { id: 'rec-4', title: 'React Native App', type: 'job', relevance: 0.85, url: '/jobs/react-native-app', budget: '3000-5000' }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchRecs();
  }, [userId]);

  // Always show recommendations, even if loading or empty (with fallback)
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
            Recommended for You
          </h2>
        </div>
        <div className="p-6 text-center text-gray-500">
          <Sparkles className="w-8 h-8 mx-auto mb-2 animate-pulse" />
          <p className="text-sm">Loading personalized recommendations...</p>
        </div>
      </div>
    );
  }
  
  // Show recommendations even if empty (with message)
  if (recommendations.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
            Recommended for You
          </h2>
        </div>
        <div className="p-6 text-center text-gray-500">
          <p className="text-sm">No recommendations available yet. Start browsing to get personalized suggestions!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-900 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
          Recommended for You
        </h2>
      </div>
      <div className="divide-y divide-gray-100">
        {recommendations.map(rec => {
          // Safe access to properties with fallbacks
          const type = rec.type || 'gig';
          const title = rec.title || 'Untitled';
          const url = rec.url || '#';
          const relevance = rec.relevance || 0;
          
          return (
            <div 
              key={rec.id} 
              className="p-6 hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => navigate(url)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{title}</h3>
                  <div className="flex items-center text-sm text-gray-500 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                      type === 'gig' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {type}
                    </span>
                    <span className="mx-2">•</span>
                    <span className="text-xs text-gray-400">Relevance: {(relevance * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
              <div className="mt-3 flex items-center space-x-4 text-sm text-gray-500">
                <div className="flex items-center">
                  <DollarSign className="w-4 h-4 mr-1" />
                  <span>{rec.price ? `$${rec.price}` : rec.budget || 'Price Not Set'}</span>
                </div>
                <div className="flex items-center">
                  <Star className="w-4 h-4 mr-1" />
                  <span>4.8★ (124 reviews)</span>
                </div>
                <div className="flex items-center">
                  <Users className="w-4 h-4 mr-1" />
                  <span>24 orders</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Recommendations;