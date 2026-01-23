import React, { useState, useEffect } from 'react';
import { TrendingUp, Calendar, Award, MessageCircle, Zap, Users, Briefcase, Star, Filter, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { CMSService } from '../services/cms';

const CommunityHome = () => {
  const [trendingTopics, setTrendingTopics] = useState<any[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [topContributors, setTopContributors] = useState<any[]>([]);
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Add small delays to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        const topics = await CMSService.getTrendingTopics();
        
        await new Promise(resolve => setTimeout(resolve, 200));
        const events = await CMSService.getUpcomingEvents();
        
        await new Promise(resolve => setTimeout(resolve, 200));
        const contributors = await CMSService.getTopContributors();
        
        await new Promise(resolve => setTimeout(resolve, 200));
        const discussions = await CMSService.getDiscussions();
        
        await new Promise(resolve => setTimeout(resolve, 200));
        const ads = await CMSService.getAds();

        setTrendingTopics(topics);
        setUpcomingEvents(events);
        setTopContributors(contributors);
        setDiscussions(discussions);
        setAds(ads);
      } catch (error) {
        console.error('Error loading community data:', error);
        // Set fallback data
        setTrendingTopics([
          { id: '1', title: 'Getting Started', count: 120 },
          { id: '2', title: 'Best Practices', count: 85 },
          { id: '3', title: 'Troubleshooting', count: 60 }
        ]);
        setUpcomingEvents([
          { id: '1', title: 'Weekly Q&A Session', date: 'Tomorrow 3PM EST' },
          { id: '2', title: 'Monthly Meetup', date: 'Jan 15, 2024' }
        ]);
        setTopContributors([
          { id: '1', name: 'John Doe', reputation: 2450 },
          { id: '2', name: 'Jane Smith', reputation: 1890 },
          { id: '3', name: 'Bob Johnson', reputation: 1560 }
        ]);
        setDiscussions([
          { id: '1', title: 'How to optimize your profile?', author: 'Alice', replies: 24, lastReply: '2 hours ago' },
          { id: '2', title: 'Best project management tools?', author: 'Mike', replies: 18, lastReply: '4 hours ago' }
        ]);
        setAds([
          { id: '1', title: 'Premium Membership', description: 'Get exclusive benefits and priority support', imageUrl: '/ad-placeholder.jpg', ctaText: 'Learn More', ctaUrl: '/premium' }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading Community...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">Geezle Community</h1>
            <p className="text-xl text-blue-100 max-w-2xl mx-auto">
              Connect with fellow freelancers, share knowledge, and grow together
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Trending Topics */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center mb-4">
                <TrendingUp className="w-5 h-5 text-blue-600 mr-2" />
                <h2 className="text-lg font-bold">Trending Topics</h2>
              </div>
              <div className="space-y-3">
                {trendingTopics.map((topic) => (
                  <Link key={topic.id} to={`/community/topic/${topic.id}`} className="block p-3 hover:bg-gray-50 rounded-lg transition-colors">
                    <div className="font-medium">{topic.title}</div>
                    <div className="text-sm text-gray-500">{topic.count} posts</div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Upcoming Events */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center mb-4">
                <Calendar className="w-5 h-5 text-green-600 mr-2" />
                <h2 className="text-lg font-bold">Upcoming Events</h2>
              </div>
              <div className="space-y-3">
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="font-medium">{event.title}</div>
                    <div className="text-sm text-gray-500">{event.date}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Contributors */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center mb-4">
                <Award className="w-5 h-5 text-yellow-600 mr-2" />
                <h2 className="text-lg font-bold">Top Contributors</h2>
              </div>
              <div className="space-y-3">
                {topContributors.map((contributor) => (
                  <div key={contributor.id} className="flex items-center p-2 hover:bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                      <span className="font-bold">{contributor.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{contributor.name}</div>
                      <div className="text-sm text-gray-500">{contributor.reputation} rep</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Search Bar */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center">
                <Search className="w-5 h-5 text-gray-400 mr-3" />
                <input
                  type="text"
                  placeholder="Search discussions, topics, or people..."
                  className="w-full p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button className="ml-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  <Filter className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Discussions List */}
            <div className="bg-white rounded-xl shadow-sm">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-bold">Latest Discussions</h2>
              </div>
              <div className="divide-y divide-gray-200">
                {discussions.map((discussion) => (
                  <Link key={discussion.id} to={`/community/discussion/${discussion.id}`} className="block p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-gray-900">{discussion.title}</h3>
                        <div className="flex items-center text-sm text-gray-500 mt-1">
                          <span>by {discussion.author}</span>
                          <span className="mx-2">•</span>
                          <span>{discussion.lastReply}</span>
                        </div>
                      </div>
                      <div className="flex items-center text-sm text-gray-500">
                        <MessageCircle className="w-4 h-4 mr-1" />
                        {discussion.replies}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-bold mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <Link to="/community/new-topic" className="block w-full text-center bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700">
                  Start Discussion
                </Link>
                <Link to="/community/events" className="block w-full text-center bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700">
                  Join Event
                </Link>
                <Link to="/community/resources" className="block w-full text-center bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700">
                  Knowledge Hub
                </Link>
              </div>
            </div>

            {/* Ads/Sponsored */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-bold mb-4">Sponsored</h2>
              <div className="space-y-4">
                {ads.map((ad) => (
                  <div key={ad.id} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900">{ad.title}</h3>
                    <p className="text-sm text-gray-600 mt-2">{ad.description}</p>
                    <button className="mt-3 text-sm text-blue-600 hover:text-blue-800">
                      {ad.ctaText}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-bold mb-4">Community Stats</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">10k+</div>
                  <div className="text-sm text-gray-500">Members</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">50k+</div>
                  <div className="text-sm text-gray-500">Discussions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">2k+</div>
                  <div className="text-sm text-gray-500">Topics</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">500+</div>
                  <div className="text-sm text-gray-500">Events</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityHome;