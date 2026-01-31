import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, Calendar, Award, MessageCircle, Zap, Users, Briefcase, Star, Filter, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { CMSService } from '../services/cms';
import DonateButton from '../components/DonateButton';
import { CommunityService } from '../services/community';
import { AdService } from '../services/ads';
import InteractionBar from '../components/InteractionBar';
import { useNotification } from '../context/NotificationContext';

const CommunityHome = () => {
  const [trendingTopics, setTrendingTopics] = useState<any[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [topContributors, setTopContributors] = useState<any[]>([]);
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [homepage, setHomepage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();
  const { showNotification } = useNotification();
  const impressionTracked = useRef<Set<string>>(new Set());
  const viewTracked = useRef<Set<string>>(new Set());

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
        const feedPosts = await CommunityService.getPosts({ limit: 20 });
        
        await new Promise(resolve => setTimeout(resolve, 200));
        const ads = await AdService.getAds(user?.role);

        await new Promise(resolve => setTimeout(resolve, 200));
        const homepageConfig = await CommunityService.getCommunityHomepage();

        setTrendingTopics(topics);
        setUpcomingEvents(events);
        setTopContributors(contributors);
        setDiscussions(discussions);
        setPosts(feedPosts);
        setAds(ads);
        setHomepage(homepageConfig);
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
        setAds([]);
        setPosts([]);
        setHomepage(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const onAdEvent = async () => {
      try {
        const newAds = await AdService.getAds(user?.role);
        setAds(newAds);
      } catch (e) { console.error('Failed to refresh ads on event', e); }
    };
    const onHomepageUpdate = async () => {
      try {
        const updated = await CommunityService.getCommunityHomepage();
        setHomepage(updated);
      } catch (e) { console.error('Failed to refresh homepage config', e); }
    };
    window.addEventListener('community:ad_status_updated', onAdEvent as EventListener);
    window.addEventListener('community:ad_created', onAdEvent as EventListener);
    window.addEventListener('community:homepage_updated', onHomepageUpdate as EventListener);
    return () => {
      window.removeEventListener('community:ad_status_updated', onAdEvent as EventListener);
      window.removeEventListener('community:ad_created', onAdEvent as EventListener);
      window.removeEventListener('community:homepage_updated', onHomepageUpdate as EventListener);
    };
  }, [user?.role]);

  useEffect(() => {
    if (!ads || ads.length === 0) return;
    ads.forEach((ad: any) => {
      if (!ad?.id || impressionTracked.current.has(ad.id)) return;
      impressionTracked.current.add(ad.id);
      AdService.recordImpression(ad.id).catch(() => {});
    });
  }, [ads]);

  useEffect(() => {
    if (!user || !posts || posts.length === 0) return;
    posts.forEach((post: any) => {
      if (!post?.id || viewTracked.current.has(post.id)) return;
      viewTracked.current.add(post.id);
      CommunityService.postView(post.id).catch(() => {});
    });
  }, [posts, user]);

  const promotePost = async (post: any) => {
    if (!user) {
      if (confirm('Log in to promote this post?')) window.location.href = '/auth/login';
      return;
    }
    const budgetStr = prompt('Enter ad budget (USD)', '10');
    if (!budgetStr) return;
    const budget = Number(budgetStr);
    if (!budget || budget <= 0) {
      showNotification('error', 'Invalid Budget', 'Enter a valid budget amount.');
      return;
    }
    const placement = prompt('Placement (feed, forum_listing, thread_detail, chat)', 'feed') || 'feed';
    try {
      await AdService.saveCampaign({
        id: '',
        title: post.title || 'Promoted Post',
        body: post.content || '',
        placement,
        targeting: {},
        mediaFileIds: post.attachments || [],
        budget,
        currency: 'USD',
        status: 'DRAFT'
      } as any);
      showNotification('success', 'Ad Draft Created', 'Proceed to My Ads to pay and submit for review.');
    } catch (e: any) {
      showNotification('error', 'Failed to Create Ad', e?.message || 'Unable to create ad draft.');
    }
  };

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

  const heroTitle = homepage?.hero?.title || 'Geezle Community';
  const heroSubtitle = homepage?.hero?.subtitle || 'Connect with fellow freelancers, share knowledge, and grow together';
  const heroBackgroundImage = homepage?.hero?.backgroundImage;
  const heroBackgroundColor = homepage?.hero?.backgroundColor || '#4f46e5';
  const bannerEnabled = homepage?.banner?.enabled !== false;
  const bannerText = homepage?.banner?.text || 'Security Notice: Do not share sensitive personal information (Passwords, bank details, government IDs). AI Moderation is active in all chats.';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div
        className="text-white py-16"
        style={{
          backgroundImage: heroBackgroundImage ? `url(${heroBackgroundImage})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: heroBackgroundColor
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">{heroTitle}</h1>
            <p className="text-xl text-blue-100 max-w-2xl mx-auto">
              {heroSubtitle}
            </p>
          </div>
        </div>
      </div>

      {bannerEnabled && (
        <div className="bg-yellow-50 border-b border-yellow-100">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-start sm:items-center">
            <div className="text-sm text-yellow-800">{bannerText}</div>
          </div>
        </div>
      )}

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
            {Array.isArray(homepage?.sliders) && homepage.sliders.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {homepage.sliders.map((slide: any) => (
                    <div key={slide.id} className="min-w-[260px] border rounded-lg overflow-hidden">
                      {slide.imageUrl && (
                        <img src={slide.imageUrl} alt={slide.title || 'Slide'} className="w-full h-32 object-cover" />
                      )}
                      {slide.videoUrl && (
                        <video src={slide.videoUrl} controls className="w-full h-32 object-cover" />
                      )}
                      <div className="p-3">
                        <div className="font-semibold text-sm">{slide.title}</div>
                        <div className="text-xs text-gray-500">{slide.subtitle}</div>
                        {slide.ctaUrl && (
                          <a href={slide.ctaUrl} className="text-xs text-blue-600 hover:text-blue-800">{slide.ctaLabel || 'Learn more'}</a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(homepage?.sections) && homepage.sections.length > 0 && (
              <div className="space-y-4">
                {homepage.sections.map((section: any) => (
                  <div key={section.id} className="bg-white rounded-xl shadow-sm p-4">
                    {section.title && <h3 className="text-lg font-semibold">{section.title}</h3>}
                    {section.body && <p className="text-sm text-gray-600 mt-2">{section.body}</p>}
                    {section.type === 'image' && section.imageUrl && (
                      <img src={section.imageUrl} alt={section.title || 'Section'} className="mt-3 rounded-lg w-full object-cover" />
                    )}
                    {section.type === 'video' && section.videoUrl && (
                      <video src={section.videoUrl} controls className="mt-3 rounded-lg w-full" />
                    )}
                  </div>
                ))}
              </div>
            )}
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

            {/* Community Feed */}
            <div className="bg-white rounded-xl shadow-sm">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-bold">Community Feed</h2>
                <Link to="/community/new-post" className="text-sm text-blue-600 hover:text-blue-800">Create Post</Link>
              </div>
              <div className="divide-y divide-gray-200">
                {posts.length === 0 && (
                  <div className="p-4 text-sm text-gray-500">No posts yet.</div>
                )}
                {posts.map((post) => (
                  <div key={post.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img className="w-8 h-8 rounded-full" src={post.authorAvatar} alt={post.authorName} />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{post.authorName}</div>
                          <div className="text-xs text-gray-500">{new Date(post.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                      <button onClick={() => promotePost(post)} className="text-xs px-2 py-1 border rounded text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                        Promote this post
                      </button>
                    </div>
                    {post.title && <h3 className="mt-3 font-semibold text-gray-900">{post.title}</h3>}
                    <p className="mt-2 text-sm text-gray-700">{post.content}</p>
                    <InteractionBar
                      type="post"
                      id={post.id}
                      initialCounts={{
                        likes: post.likesCount ?? post.interactions?.likes ?? 0,
                        comments: 0,
                        reposts: post.repostsCount ?? post.interactions?.reposts ?? 0,
                        shares: post.sharesCount ?? post.interactions?.shares ?? 0
                      }}
                      initialState={post.userState || { liked: false, reposted: false }}
                    />
                  </div>
                ))}
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
                <Link to="/community/gcoin" className="block w-full text-center bg-yellow-500 text-white py-2 px-4 rounded-lg hover:bg-yellow-600">
                  Gcoin Dashboard
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
                    <p className="text-sm text-gray-600 mt-2">{ad.description || ad.body}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <a
                        href={ad.ctaUrl || '#'}
                        className="text-sm text-blue-600 hover:text-blue-800"
                        onClick={() => AdService.recordClick(ad.id).catch(() => {})}
                      >
                        {ad.ctaText || 'Learn more'}
                      </a>
                      {/* If ad has creator/recipient info, show Donate button */}
                      { (ad.creatorId || ad.recipientId) && (
                        // @ts-ignore - loosely typed CMS ad object may include creatorId/recipientId
                        <DonateButton recipientIdentifier={ad.creatorId || ad.recipientId} />
                      ) }
                    </div>
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
