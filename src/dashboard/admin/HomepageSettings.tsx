import React, { useEffect, useMemo, useState, useRef } from "react";
import { CMSService } from "../../services/cms";
import { AdminService } from "../../services/admin";
import { SearchService } from "../../services/search";
import { AIService } from "../../services/ai/ai.service";
import PreloaderManagement from "./PreloaderManagement";

import type {
  HomepageSection,
  HomepageAnalytics,
  HomepageSectionType,
  HeaderConfig,
  FooterConfig,
  NavItem,
  UploadedFile,
  HomeSlide,
  TrendingConfig,
  ListingCategory,
  HeroSearchConfig,
} from "../../types";
import { UserRole } from "../../types";

import { useNotification } from "../../context/NotificationContext";
import { useContent } from "../../context/ContentContext";
import { useSocket } from "../../context/SocketContext";

import {
  Eye,
  Save,
  ChevronUp,
  ChevronDown,
  ToggleLeft,
  ToggleRight,
  Edit2,
  Plus,
  Trash2,
  Image as ImageIcon,
  BarChart2,
  Layers,
  Settings,
  Search as SearchIcon,
  Check,
  Menu,
  Columns,
  X,
  GalleryHorizontal,
  Sparkles,
  TrendingUp,
  Cpu,
  Globe,
  Loader2,
  Smartphone,
  Monitor,
  Tablet,
  Layout as LayoutIcon,
} from "lucide-react";

import FilePickerModal from "../shared/FilePickerModal";

// Apply favicon helper: updates <link rel="icon"> and <link rel="shortcut icon"> with cache-bust
function applyFaviconToDocument(url?: string | null) {
  try {
    if (!url) return;
    const busted = url + (url.includes("?") ? "&v=" : "?v=") + Date.now();
    const setLink = (rel: string) => {
      let el = document.querySelector(`link[rel='${rel}']`) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement('link');
        el.rel = rel;
        document.head.appendChild(el);
      }
      el.href = busted;
    };
    setLink('icon');
    setLink('shortcut icon');
  } catch (e) {
    // non-fatal
    // eslint-disable-next-line no-console
    console.warn('Failed to apply favicon to document', e);
  }
}

// -------------------------
// Small helpers
// -------------------------
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function ensureArray<T>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}

function normalizeRole(role: any): UserRole | string {
  if (!role) return UserRole.GUEST;
  const normalized = String(role).toLowerCase().trim();
  if (normalized === "public") return UserRole.GUEST;
  if (normalized === "client") return UserRole.EMPLOYER;
  if (normalized === "all" || normalized === "*") return "all";
  return normalized as UserRole;
}

function normalizeRoleList(value: any): UserRole[] {
  if (Array.isArray(value)) return value.map(normalizeRole) as UserRole[];
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(normalizeRole) as UserRole[];
  }
  return [];
}

function normalizeHeroConfig(raw: any): HeroSearchConfig {
  const quickTags = ensureArray(raw?.quickTags ?? raw?.quick_tags).map((t: any) => ({
    id: t.id || `qt-${uid()}`,
    label: t.label || "",
    url: t.url || "/browse",
    bgColor: t.bgColor || t.bg_color || t.color || "",
  }));

  const trustedBrandsRaw = raw?.trustedBrands ?? raw?.trusted_brands ?? {};
  const valuePropRaw = raw?.valueProp ?? raw?.value_prop ?? {};

  return {
    ...(raw || {}),
    id: raw?.id || `hero-${uid()}`,
    headline: raw?.headline ?? raw?.heading ?? "",
    subheadline: raw?.subheadline ?? "",
    aiBadgeLabel: raw?.aiBadgeLabel ?? raw?.ai_badge_label ?? "",
    aiBadgeDescription: raw?.aiBadgeDescription ?? raw?.ai_badge_description ?? "",
    searchPlaceholder: raw?.searchPlaceholder ?? raw?.search_placeholder ?? "",
    searchButtonLabel: raw?.searchButtonLabel ?? raw?.search_button_label ?? "",
    searchButtonAriaLabel: raw?.searchButtonAriaLabel ?? raw?.search_button_aria_label ?? "",
    searchResultsUrl: raw?.searchResultsUrl ?? raw?.search_results_url ?? "",
    searchSize: raw?.searchSize ?? raw?.search_size ?? "large",
    quickTags,
    trustedBrands: {
      enabled: Boolean(trustedBrandsRaw?.enabled ?? trustedBrandsRaw?.is_enabled ?? false),
      title: trustedBrandsRaw?.title ?? "",
      logos: ensureArray(trustedBrandsRaw?.logos).map((l: any) => ({
        id: l.id || `logo-${uid()}`,
        src: l.src || "",
        alt: l.alt || "Brand",
        url: l.url || "",
        clickable: Boolean(l.clickable ?? false),
      })),
    },
    valueProp: {
      enabled: Boolean(valuePropRaw?.enabled ?? false),
      heading: valuePropRaw?.heading ?? "",
      primaryCta: valuePropRaw?.primaryCta ?? { label: "", url: "" },
      secondaryCta: valuePropRaw?.secondaryCta ?? { label: "", url: "" },
      badges: ensureArray(valuePropRaw?.badges).map((b: any) => ({
        id: b.id || `badge-${uid()}`,
        label: b.label || "",
        icon: b.icon || "",
      })),
    },
  };
}

function normalizeFooterConfig(raw: any): FooterConfig {
  const source = raw || {};
  const columns = ensureArray<any>(source.columns).map((col: any) => ({
    id: col.id || `footer-col-${uid()}`,
    title: col.title || "",
    links: ensureArray<any>(col.links).map((link: any) => ({
      id: link.id || `footer-link-${uid()}`,
      label: link.label || "",
      url: link.url || "",
      visibility: normalizeRoleList(
        link.visibility ?? link.roles ?? link.target_roles ?? link.visible_to ?? link.visibleTo
      ),
      type: link.type || "internal",
    })),
  }));

  const contactSource = source.contact ?? {};
  const socials = ensureArray<any>(source.socials ?? source.social_links ?? source.socialLinks).map((social: any) => ({
    id: social.id || `footer-social-${uid()}`,
    platform: social.platform || "",
    url: social.url || "",
    enabled: social.enabled !== false,
    icon: social.icon || "",
  }));
  const socialLabelTitle =
    source.social_label_title ?? source.socialLabelTitle ?? source.socialTitle ?? source.social_title ?? "";

  return {
    id: source.id || `footer-${uid()}`,
    description: source.description || "",
    copyright: source.copyright || "",
    columns,
    contact: {
      admin_email: contactSource.admin_email ?? contactSource.adminEmail ?? "",
      support_email: contactSource.support_email ?? contactSource.supportEmail ?? "",
      ticket_route: contactSource.ticket_route ?? contactSource.ticketRoute ?? "",
    },
    socials,
    logo_url: source.logo_url ?? source.logoUrl ?? "",
    social_label_title: socialLabelTitle,
  };
}

function normalizeTrendingConfig(raw: any): TrendingConfig {
  return {
    id: raw?.id || `trending-${uid()}`,
    enabled: raw?.enabled !== undefined ? raw.enabled : false,
    title: raw?.title ?? "",
    category_ids: raw?.category_ids || raw?.categoryIds || [],
    scroll_behavior: raw?.scroll_behavior || raw?.scrollBehavior || "manual",
    auto_slide_interval: raw?.auto_slide_interval ?? raw?.autoSlideInterval ?? 5000,
    visibility: normalizeRoleList(raw?.visibility ?? raw?.visible_to ?? raw?.visibleTo ?? []),
    // additional optional field used by strip (safe)
    ...(raw?.show_icons !== undefined ? { show_icons: raw.show_icons } : {}),
  };
}

function normalizeHeaderConfig(raw: any) {
  if (!raw) return raw;
  const cloned = { ...(raw || {}) } as any;

  // Navigation
  cloned.navigation = ensureArray<any>(cloned.navigation).map((n: any) => ({
    ...(n || {}),
    id: n?.id || `nav-${uid()}`,
    visibility: normalizeRoleList(n?.visibility ?? n?.roles ?? n?.target_roles ?? n?.visible_to ?? n?.visibleTo ?? []),
  }));

  // Profile menus / userMenu
  const profile = ensureArray<any>(cloned.profileMenu ?? cloned.profile_menu ?? cloned.userMenu ?? cloned.user_menu);
  cloned.profileMenu = profile.map((p: any) => ({
    ...(p || {}),
    id: p?.id || `profile-${uid()}`,
    visibility: normalizeRoleList(p?.visibility ?? p?.roles ?? p?.visible_to ?? []),
  }));
  cloned.profile_menu = cloned.profileMenu;
  cloned.userMenu = cloned.profileMenu;

  // Guest dropdowns
  const mapDropdown = (d: any) => {
    const dd = d || {};
    const items = ensureArray<any>(dd.items).map((it: any) => ({
      ...(it || {}),
      id: it?.id || `gd-${uid()}`,
      visibility: normalizeRoleList(it?.visibility ?? it?.roles ?? it?.visible_to ?? []),
    }));
    return {
      ...(dd || {}),
      id: dd?.id || `dd-${uid()}`,
      visibility: normalizeRoleList(dd?.visibility ?? dd?.visible_to ?? []),
      items,
    };
  };

  cloned.guestPrimaryDropdown = mapDropdown(cloned.guestPrimaryDropdown ?? cloned.guest_primary_dropdown);
  cloned.guest_primary_dropdown = cloned.guestPrimaryDropdown;
  cloned.guestExploreDropdown = mapDropdown(cloned.guestExploreDropdown ?? cloned.guest_explore_dropdown);
  cloned.guest_explore_dropdown = cloned.guestExploreDropdown;

  // Guest CTAs
  cloned.guestCtas = ensureArray<any>(cloned.guestCtas ?? cloned.guest_ctas ?? cloned.guestActions).map((c: any) => ({
    ...(c || {}),
    id: c?.id || `cta-${uid()}`,
    visibility: normalizeRoleList(c?.visibility ?? c?.roles ?? c?.visible_to ?? []),
  }));
  cloned.guest_ctas = cloned.guestCtas;

  // Role switch
  const rs = cloned.roleSwitch ?? cloned.role_switch ?? {};
  cloned.roleSwitch = { ...(rs || {}), visibility: normalizeRoleList(rs?.visibility ?? rs?.visible_to ?? []) };
  cloned.role_switch = cloned.roleSwitch;

  return cloned;
}

// -------------------------
// Root
// -------------------------
const HomepageSettings = () => {
  const [activeTab, setActiveTab] = useState<
    "header" | "trending" | "slider" | "sections" | "footer" | "ai" | "engagement" | "preloader" | "analytics"
  >("header");

  return (
    <div className="homepage-settings-admin space-y-6">
      <div className="homepage-settings-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Homepage Settings</h2>
          <p className="text-sm text-gray-500">Manage layout, personalization, and performance.</p>
        </div>
        <div className="homepage-settings-actions flex flex-wrap gap-2">
          <button
            onClick={() => window.open("/", "_blank")}
            className="flex w-full items-center justify-center px-4 py-2 border rounded-lg hover:bg-gray-50 text-gray-700 transition-colors sm:w-auto"
          >
            <Eye className="w-4 h-4 mr-2" /> Live Preview
          </button>
        </div>
      </div>

      <div className="homepage-settings-tabs flex w-full space-x-1 bg-gray-100 p-1 rounded-lg overflow-x-auto">
        <TabButton id="header" label="Header & Hero" icon={Menu} activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton id="trending" label="Trending Categories" icon={TrendingUp} activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton id="slider" label="Home Slider (Media)" icon={GalleryHorizontal} activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton id="sections" label="Sections Manager" icon={Layers} activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton id="footer" label="Footer Builder" icon={Columns} activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton id="ai" label="AI Optimization" icon={Cpu} activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton id="engagement" label="Reactions & Feed" icon={Settings} activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton id="preloader" label="Preloader" icon={Loader2} activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton id="analytics" label="Analytics" icon={BarChart2} activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>

      <div className="animate-fade-in">
        {activeTab === "header" && <HeaderBuilder />}
        {activeTab === "trending" && <TrendingManager />}
        {activeTab === "slider" && <SliderManager />}
        {activeTab === "sections" && <LayoutManager />}
        {activeTab === "footer" && <FooterBuilder />}
        {activeTab === "ai" && <AIOptimization />}
        {activeTab === "engagement" && <ReactionsEngagementManager />}
        {activeTab === "preloader" && <PreloaderManagement />}
        {activeTab === "analytics" && <AnalyticsView />}
      </div>
    </div>
  );
};

const TabButton = ({ id, label, icon: Icon, activeTab, setActiveTab }: any) => (
  <button
    data-testid={`tab-${id}`}
    onClick={() => setActiveTab(id)}
    className={`shrink-0 px-4 py-2 text-sm font-medium rounded-md flex items-center transition-all whitespace-nowrap ${
      activeTab === id ? "bg-white shadow text-blue-600" : "text-gray-600 hover:bg-gray-200"
    }`}
  >
    <Icon className="w-4 h-4 mr-2" /> {label}
  </button>
); // -------------------------
// Reactions & Member Home Layout Controls
// -------------------------
const ReactionsEngagementManager = () => {
  const { settings, updateSettings } = useContent();
  const { showNotification } = useNotification();
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<any>({
    reactions: {
      enabled: true,
      postsEnabled: true,
      commentsEnabled: true,
      messagesEnabled: true,
      showReactors: true,
      rateLimitPerMinute: 40,
      allowed: [
        { key: "like", label: "Like", emoji: "👍", enabled: true },
        { key: "love", label: "Love", emoji: "❤️", enabled: true },
        { key: "good", label: "Good", emoji: "✅", enabled: true },
        { key: "happy", label: "Happy", emoji: "😄", enabled: true },
      ],
    },
    memberHome: {
      widgets: {
        trendingEnabled: true,
        storiesEnabled: true,
        suggestionsEnabled: true,
        pagesRecommendationsEnabled: true,
        categoriesFilterEnabled: true,
        postComposerEnabled: true,
        recentMessagesEnabled: true,
        profileViewersEnabled: true,
        rightSidebarAdsEnabled: false,
      },
      feed: {
        defaultTab: "latest",
        defaultSort: "latest",
        defaultScope: "discover",
        enableTrendingTab: true,
        postDensity: "comfortable",
        showReactionCounts: true,
        showCommentsPreviewCount: true,
      },
      ads: {
        enabled: false,
        rightSidebarTopEnabled: true,
        rightSidebarMiddleEnabled: true,
        inlineFrequency: 6,
      }
    },
    mobileHomeLayout: {
      bottomTabs: {
        home: true,
        network: true,
        post: true,
        notifications: true,
        jobs: true,
        messages: false,
      },
      feed: {
        showPromoted: true,
        promotedFrequency: 6,
        showSuggestedPeople: true,
        showSuggestedPages: true,
        showTrendingTags: true,
        showRecommendedGigsJobs: false,
      },
      postComposer: {
        topics: [],
        locations: []
      },
      postCard: {
        reactionsEnabled: true,
        commentsEnabled: true,
        repostsEnabled: true,
        sendEnabled: true,
        linkPreviewEnabled: true,
        mediaPreviewEnabled: true,
        mentionsEnabled: true,
        hashtagsEnabled: true,
      },
      search: {
        enabled: true,
        categories: ['posts', 'people', 'pages', 'jobs', 'gigs'],
      },
    },
    gigExperience: {
      enabled: true,
      chatBarEnabled: true,
      inlineChatEnabled: true,
      shareModalEnabled: true,
      allowGuestOpenChat: true,
      showSellerMeta: true,
      quickPrompts: [
        'Hey, can you help me with this gig?',
        'Can you provide your timeline and budget estimate?',
        'Can you customize this package for my requirements?'
      ]
    },
    notifications: {
      enableMentionNotifications: true,
      enableFollowedPostNotifications: true,
      enableFollowNotifications: true,
      enableCommentNotifications: true,
      enableReactionNotifications: true,
      enableRepostNotifications: true,
      enableJobApplicationNotifications: true,
      enableProposalOpenedNotifications: true,
      enableProposalReplyNotifications: true,
      enableTopApplicantNotifications: true,
      enableInterviewScheduledNotifications: true,
      enableJobLifecycleEmails: true,
    },
    profileDemographics: {
      enabled: true,
      genderFieldEnabled: true,
      dateOfBirthEnabled: true,
      showBirthMonthDayPublicDefault: true,
      genderOptions: [
        { key: 'male', label: 'Male', active: true },
        { key: 'female', label: 'Female', active: true }
      ]
    },
    messagingControls: {
      enableMoveToOther: true,
      enableLabelAsJobs: true,
      enableMarkUnread: true,
      enableStar: true,
      enableMute: true,
      enableArchive: true,
      enableReportBlock: true,
      enableDeleteConversation: true,
      enableManageMessageSettings: true
    }
  });

  useEffect(() => {
    const source: any = settings || {};
    const reactions = source.reactions || {};
    const memberHome = source.memberHome || {};
    const mobileHomeLayout = source.mobileHomeLayout || source.mobile_home_layout || {};
    const gigExperience = source.gigExperience || {};
    const notifications = source.notifications || {};
    const profileDemographics = source.profileDemographics || {};
    const messagingControls = source.messagingControls || {};
    const widgets = memberHome.widgets || {};
    const feed = memberHome.feed || {};
    const ads = memberHome.ads || {};
    const mobileBottomTabs = mobileHomeLayout.bottomTabs || mobileHomeLayout.bottom_tabs || {};
    const mobileFeed = mobileHomeLayout.feed || {};
    const mobilePostCard = mobileHomeLayout.postCard || mobileHomeLayout.post_card || {};
    const mobileSearch = mobileHomeLayout.search || {};
    const mobileSearchCategories =
      Array.isArray(mobileSearch.categories) && mobileSearch.categories.length
        ? mobileSearch.categories
        : undefined;
    const allowed = Array.isArray(reactions.allowed) && reactions.allowed.length
      ? reactions.allowed
      : config.reactions.allowed;

    setConfig((prev: any) => ({
      ...prev,
      reactions: {
        ...prev.reactions,
        ...reactions,
        allowed
      },
      memberHome: {
        widgets: {
          ...prev.memberHome.widgets,
          ...widgets
        },
        feed: {
          ...prev.memberHome.feed,
          ...feed
        },
        ads: {
          ...prev.memberHome.ads,
          ...ads
        }
      },
      mobileHomeLayout: {
        ...prev.mobileHomeLayout,
        ...mobileHomeLayout,
        bottomTabs: {
          ...prev.mobileHomeLayout.bottomTabs,
          ...mobileBottomTabs
        },
        feed: {
          ...prev.mobileHomeLayout.feed,
          ...mobileFeed
        },
        postCard: {
          ...prev.mobileHomeLayout.postCard,
          ...mobilePostCard
        },
        search: {
          ...prev.mobileHomeLayout.search,
          ...mobileSearch,
          categories: mobileSearchCategories || prev.mobileHomeLayout.search.categories
        }
      },
      gigExperience: {
        ...prev.gigExperience,
        ...gigExperience,
        quickPrompts:
          Array.isArray(gigExperience.quickPrompts) && gigExperience.quickPrompts.length
            ? gigExperience.quickPrompts
            : prev.gigExperience.quickPrompts
      },
      notifications: {
        ...prev.notifications,
        ...notifications
      },
      profileDemographics: {
        ...prev.profileDemographics,
        ...profileDemographics,
        genderOptions:
          Array.isArray(profileDemographics.genderOptions) && profileDemographics.genderOptions.length
            ? profileDemographics.genderOptions
            : prev.profileDemographics.genderOptions
      },
      messagingControls: {
        ...prev.messagingControls,
        ...messagingControls
      }
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      const merged: any = {
        ...(settings as any),
        reactions: config.reactions,
        memberHome: {
          ...((settings as any)?.memberHome || {}),
          ...config.memberHome,
          widgets: { ...((settings as any)?.memberHome?.widgets || {}), ...config.memberHome.widgets },
          feed: { ...((settings as any)?.memberHome?.feed || {}), ...config.memberHome.feed },
          ads: { ...((settings as any)?.memberHome?.ads || {}), ...config.memberHome.ads },
        },
        mobileHomeLayout: {
          ...((settings as any)?.mobileHomeLayout || {}),
          ...config.mobileHomeLayout,
          bottomTabs: {
            ...((settings as any)?.mobileHomeLayout?.bottomTabs || {}),
            ...(config.mobileHomeLayout?.bottomTabs || {})
          },
          feed: {
            ...((settings as any)?.mobileHomeLayout?.feed || {}),
            ...(config.mobileHomeLayout?.feed || {})
          },
          postCard: {
            ...((settings as any)?.mobileHomeLayout?.postCard || {}),
            ...(config.mobileHomeLayout?.postCard || {})
          },
          search: {
            ...((settings as any)?.mobileHomeLayout?.search || {}),
            ...(config.mobileHomeLayout?.search || {})
          }
        },
        gigExperience: {
          ...((settings as any)?.gigExperience || {}),
          ...config.gigExperience,
          quickPrompts: Array.isArray(config.gigExperience?.quickPrompts)
            ? config.gigExperience.quickPrompts.filter((item: any) => typeof item === 'string' && item.trim() !== '')
            : []
        },
        notifications: {
          ...((settings as any)?.notifications || {}),
          ...config.notifications
        },
        profileDemographics: {
          ...((settings as any)?.profileDemographics || {}),
          ...config.profileDemographics,
          genderOptions: config.profileDemographics.genderOptions
        },
        messagingControls: {
          ...((settings as any)?.messagingControls || {}),
          ...config.messagingControls
        }
      };

      if (updateSettings) {
        await updateSettings(merged as any);
      } else {
        await AdminService.savePlatformSettings(merged as any);
      }
      showNotification("success", "Saved", "Reactions, feed, and notification settings updated.");
    } catch (error: any) {
      showNotification("error", "Save failed", error?.message || "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const updateAllowed = (index: number, field: "key" | "label" | "emoji", value: string) => {
    setConfig((prev: any) => {
      const allowed = [...(prev.reactions.allowed || [])];
      allowed[index] = { ...(allowed[index] || {}), [field]: value };
      return { ...prev, reactions: { ...prev.reactions, allowed } };
    });
  };

  const removeAllowed = (index: number) => {
    setConfig((prev: any) => ({
      ...prev,
      reactions: {
        ...prev.reactions,
        allowed: (prev.reactions.allowed || []).filter((_: any, i: number) => i !== index),
      },
    }));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">Reactions & Engagement</h3>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Enable reactions
            <input
              type="checkbox"
              checked={Boolean(config.reactions.enabled)}
              onChange={(e) => setConfig((p: any) => ({ ...p, reactions: { ...p.reactions, enabled: e.target.checked } }))}
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Show who reacted
            <input
              type="checkbox"
              checked={Boolean(config.reactions.showReactors)}
              onChange={(e) => setConfig((p: any) => ({ ...p, reactions: { ...p.reactions, showReactors: e.target.checked } }))}
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Posts reactions
            <input
              type="checkbox"
              checked={Boolean(config.reactions.postsEnabled)}
              onChange={(e) => setConfig((p: any) => ({ ...p, reactions: { ...p.reactions, postsEnabled: e.target.checked } }))}
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Comments reactions
            <input
              type="checkbox"
              checked={Boolean(config.reactions.commentsEnabled)}
              onChange={(e) => setConfig((p: any) => ({ ...p, reactions: { ...p.reactions, commentsEnabled: e.target.checked } }))}
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Messages reactions
            <input
              type="checkbox"
              checked={Boolean(config.reactions.messagesEnabled)}
              onChange={(e) => setConfig((p: any) => ({ ...p, reactions: { ...p.reactions, messagesEnabled: e.target.checked } }))}
            />
          </label>
          <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <div className="mb-1 text-xs font-semibold text-gray-500">Rate limit per minute</div>
            <input
              type="number"
              min={1}
              className="w-full rounded border border-gray-200 px-2 py-1"
              value={config.reactions.rateLimitPerMinute}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  reactions: { ...p.reactions, rateLimitPerMinute: Number(e.target.value || 1) },
                }))
              }
            />
          </label>
        </div>

        <div className="mt-6">
          <div className="mb-2 text-sm font-semibold text-gray-700">Allowed reactions</div>
          <div className="space-y-2">
            {(config.reactions.allowed || []).map((item: any, index: number) => (
              <div key={`reaction-${index}`} className="grid gap-2 rounded-lg border border-gray-200 p-2 md:grid-cols-[90px_1fr_1fr_auto]">
                <input
                  value={item.emoji || ""}
                  onChange={(e) => updateAllowed(index, "emoji", e.target.value)}
                  className="rounded border border-gray-200 px-2 py-1 text-sm"
                  placeholder="Emoji"
                />
                <input
                  value={item.key || ""}
                  onChange={(e) => updateAllowed(index, "key", e.target.value.toLowerCase())}
                  className="rounded border border-gray-200 px-2 py-1 text-sm"
                  placeholder="Key"
                />
                <input
                  value={item.label || ""}
                  onChange={(e) => updateAllowed(index, "label", e.target.value)}
                  className="rounded border border-gray-200 px-2 py-1 text-sm"
                  placeholder="Label"
                />
                <button
                  type="button"
                  onClick={() => removeAllowed(index)}
                  className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setConfig((p: any) => ({
                ...p,
                reactions: {
                  ...p.reactions,
                  allowed: [...(p.reactions.allowed || []), { key: "", label: "", emoji: "", enabled: true }],
                },
              }))
            }
            className="mt-3 rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Add Reaction
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-bold text-gray-900">Member Home Layout</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Trending widget
            <input
              type="checkbox"
              checked={Boolean(config.memberHome.widgets.trendingEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, widgets: { ...p.memberHome.widgets, trendingEnabled: e.target.checked } },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Stories widget
            <input
              type="checkbox"
              checked={Boolean(config.memberHome.widgets.storiesEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, widgets: { ...p.memberHome.widgets, storiesEnabled: e.target.checked } },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Suggestions widget
            <input
              type="checkbox"
              checked={Boolean(config.memberHome.widgets.suggestionsEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, widgets: { ...p.memberHome.widgets, suggestionsEnabled: e.target.checked } },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Pages recommendations widget
            <input
              type="checkbox"
              checked={Boolean(config.memberHome.widgets.pagesRecommendationsEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, widgets: { ...p.memberHome.widgets, pagesRecommendationsEnabled: e.target.checked } },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Categories filter
            <input
              type="checkbox"
              checked={Boolean(config.memberHome.widgets.categoriesFilterEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, widgets: { ...p.memberHome.widgets, categoriesFilterEnabled: e.target.checked } },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Post composer
            <input
              type="checkbox"
              checked={Boolean(config.memberHome.widgets.postComposerEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, widgets: { ...p.memberHome.widgets, postComposerEnabled: e.target.checked } },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Recent messages widget
            <input
              type="checkbox"
              checked={Boolean(config.memberHome.widgets.recentMessagesEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, widgets: { ...p.memberHome.widgets, recentMessagesEnabled: e.target.checked } },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Profile viewers widget
            <input
              type="checkbox"
              checked={Boolean(config.memberHome.widgets.profileViewersEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, widgets: { ...p.memberHome.widgets, profileViewersEnabled: e.target.checked } },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Right sidebar ads
            <input
              type="checkbox"
              checked={Boolean(config.memberHome.widgets.rightSidebarAdsEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, widgets: { ...p.memberHome.widgets, rightSidebarAdsEnabled: e.target.checked } },
                }))
              }
            />
          </label>
          <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <div className="mb-1 text-xs font-semibold text-gray-500">Default feed tab</div>
            <select
              className="w-full rounded border border-gray-200 px-2 py-1"
              value={config.memberHome.feed.defaultTab}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, feed: { ...p.memberHome.feed, defaultTab: e.target.value } },
                }))
              }
            >
              <option value="latest">Latest</option>
              <option value="following">Following</option>
              <option value="trending">Trending</option>
            </select>
          </label>
          <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <div className="mb-1 text-xs font-semibold text-gray-500">Default sort</div>
            <select
              className="w-full rounded border border-gray-200 px-2 py-1"
              value={config.memberHome.feed.defaultSort}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, feed: { ...p.memberHome.feed, defaultSort: e.target.value } },
                }))
              }
            >
              <option value="latest">Latest</option>
              <option value="popular">Popular</option>
              <option value="following">Following First</option>
            </select>
          </label>
          <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <div className="mb-1 text-xs font-semibold text-gray-500">Default scope</div>
            <select
              className="w-full rounded border border-gray-200 px-2 py-1"
              value={config.memberHome.feed.defaultScope}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, feed: { ...p.memberHome.feed, defaultScope: e.target.value } },
                }))
              }
            >
              <option value="discover">Public + Following</option>
              <option value="following">Following First</option>
            </select>
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Enable Trending tab
            <input
              type="checkbox"
              checked={Boolean(config.memberHome.feed.enableTrendingTab)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, feed: { ...p.memberHome.feed, enableTrendingTab: e.target.checked } },
                }))
              }
            />
          </label>
          <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <div className="mb-1 text-xs font-semibold text-gray-500">Post density</div>
            <select
              className="w-full rounded border border-gray-200 px-2 py-1"
              value={config.memberHome.feed.postDensity}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, feed: { ...p.memberHome.feed, postDensity: e.target.value } },
                }))
              }
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Show reaction counts
            <input
              type="checkbox"
              checked={Boolean(config.memberHome.feed.showReactionCounts)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, feed: { ...p.memberHome.feed, showReactionCounts: e.target.checked } },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Show comments preview count
            <input
              type="checkbox"
              checked={Boolean(config.memberHome.feed.showCommentsPreviewCount)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, feed: { ...p.memberHome.feed, showCommentsPreviewCount: e.target.checked } },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Enable ads on member home
            <input
              type="checkbox"
              checked={Boolean(config.memberHome.ads.enabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, ads: { ...p.memberHome.ads, enabled: e.target.checked } },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Sidebar ad position: top
            <input
              type="checkbox"
              checked={Boolean(config.memberHome.ads.rightSidebarTopEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, ads: { ...p.memberHome.ads, rightSidebarTopEnabled: e.target.checked } },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Sidebar ad position: middle
            <input
              type="checkbox"
              checked={Boolean(config.memberHome.ads.rightSidebarMiddleEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: { ...p.memberHome, ads: { ...p.memberHome.ads, rightSidebarMiddleEnabled: e.target.checked } },
                }))
              }
            />
          </label>
          <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <div className="mb-1 text-xs font-semibold text-gray-500">Inline feed ad frequency</div>
            <input
              type="number"
              min={0}
              className="w-full rounded border border-gray-200 px-2 py-1"
              value={config.memberHome.ads.inlineFrequency}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  memberHome: {
                    ...p.memberHome,
                    ads: { ...p.memberHome.ads, inlineFrequency: Number(e.target.value || 0) },
                  },
                }))
              }
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-gray-700" />
          <h3 className="text-base font-bold text-gray-900">Mobile Home Layout (Web + App)</h3>
        </div>
        <p className="text-xs text-gray-500">
          Controls the LinkedIn-style mobile shell at <span className="font-semibold">/m/home</span>. Changes apply instantly for
          logged-in users.
        </p>

        <div className="mt-5 space-y-6">
          <div>
            <div className="mb-2 text-sm font-semibold text-gray-800">Bottom Tabs</div>
            <div className="grid gap-4 md:grid-cols-2">
              {(['home', 'network', 'post', 'notifications', 'jobs', 'messages'] as const).map((key) => (
                <label key={key} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  {key === 'home'
                    ? 'Home'
                    : key === 'network'
                      ? 'My Network'
                      : key === 'post'
                        ? 'Post (+)'
                        : key === 'notifications'
                          ? 'Notifications'
                          : key === 'jobs'
                            ? 'Jobs'
                            : 'Messages'}
                  <input
                    type="checkbox"
                    checked={Boolean(config.mobileHomeLayout?.bottomTabs?.[key])}
                    onChange={(e) =>
                      setConfig((p: any) => ({
                        ...p,
                        mobileHomeLayout: {
                          ...p.mobileHomeLayout,
                          bottomTabs: { ...p.mobileHomeLayout.bottomTabs, [key]: e.target.checked }
                        }
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold text-gray-800">Feed Composition</div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                Show promoted posts (ads)
                <input
                  type="checkbox"
                  checked={Boolean(config.mobileHomeLayout?.feed?.showPromoted)}
                  onChange={(e) =>
                    setConfig((p: any) => ({
                      ...p,
                      mobileHomeLayout: { ...p.mobileHomeLayout, feed: { ...p.mobileHomeLayout.feed, showPromoted: e.target.checked } }
                    }))
                  }
                />
              </label>
              <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <div className="mb-1 text-xs font-semibold text-gray-500">Promoted frequency (every N posts)</div>
                <input
                  type="number"
                  min={2}
                  max={20}
                  className="w-full rounded border border-gray-200 px-2 py-1"
                  value={Number(config.mobileHomeLayout?.feed?.promotedFrequency ?? 6)}
                  onChange={(e) =>
                    setConfig((p: any) => ({
                      ...p,
                      mobileHomeLayout: {
                        ...p.mobileHomeLayout,
                        feed: { ...p.mobileHomeLayout.feed, promotedFrequency: Number(e.target.value || 6) }
                      }
                    }))
                  }
                />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                Suggested people cards
                <input
                  type="checkbox"
                  checked={Boolean(config.mobileHomeLayout?.feed?.showSuggestedPeople)}
                  onChange={(e) =>
                    setConfig((p: any) => ({
                      ...p,
                      mobileHomeLayout: {
                        ...p.mobileHomeLayout,
                        feed: { ...p.mobileHomeLayout.feed, showSuggestedPeople: e.target.checked }
                      }
                    }))
                  }
                />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                Suggested pages cards
                <input
                  type="checkbox"
                  checked={Boolean(config.mobileHomeLayout?.feed?.showSuggestedPages)}
                  onChange={(e) =>
                    setConfig((p: any) => ({
                      ...p,
                      mobileHomeLayout: {
                        ...p.mobileHomeLayout,
                        feed: { ...p.mobileHomeLayout.feed, showSuggestedPages: e.target.checked }
                      }
                    }))
                  }
                />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                Trending tags block
                <input
                  type="checkbox"
                  checked={Boolean(config.mobileHomeLayout?.feed?.showTrendingTags)}
                  onChange={(e) =>
                    setConfig((p: any) => ({
                      ...p,
                      mobileHomeLayout: {
                        ...p.mobileHomeLayout,
                        feed: { ...p.mobileHomeLayout.feed, showTrendingTags: e.target.checked }
                      }
                    }))
                  }
                />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                Recommended gigs/jobs block
                <input
                  type="checkbox"
                  checked={Boolean(config.mobileHomeLayout?.feed?.showRecommendedGigsJobs)}
                  onChange={(e) =>
                    setConfig((p: any) => ({
                      ...p,
                      mobileHomeLayout: {
                        ...p.mobileHomeLayout,
                        feed: { ...p.mobileHomeLayout.feed, showRecommendedGigsJobs: e.target.checked }
                      }
                    }))
                  }
                />
              </label>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold text-gray-800">Post Card Features</div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                ['reactionsEnabled', 'Reactions enabled'],
                ['commentsEnabled', 'Comments enabled'],
                ['repostsEnabled', 'Reposts enabled'],
                ['sendEnabled', 'Send / Share enabled'],
                ['linkPreviewEnabled', 'Link preview enabled'],
                ['mediaPreviewEnabled', 'Media preview enabled'],
                ['mentionsEnabled', 'Mentions enabled'],
                ['hashtagsEnabled', 'Hashtags enabled']
              ].map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  {label}
                  <input
                    type="checkbox"
                    checked={Boolean((config.mobileHomeLayout?.postCard || {})[key])}
                    onChange={(e) =>
                      setConfig((p: any) => ({
                        ...p,
                        mobileHomeLayout: {
                          ...p.mobileHomeLayout,
                          postCard: { ...p.mobileHomeLayout.postCard, [key]: e.target.checked }
                        }
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold text-gray-800">Post Composer Lists (Topics / Locations)</div>
            <p className="mb-3 text-xs text-gray-500">
              These power the Topic and Location pickers in the create-post UI (mobile + desktop). Use comma-separated values.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                <div className="mb-1 text-xs font-semibold text-gray-600">Topics</div>
                <textarea
                  value={
                    Array.isArray((config.mobileHomeLayout?.postComposer || config.mobileHomeLayout?.post_composer || {})?.topics)
                      ? (config.mobileHomeLayout?.postComposer || config.mobileHomeLayout?.post_composer || {})?.topics?.join(', ')
                      : ''
                  }
                  onChange={(e) => {
                    const list = String(e.target.value || '')
                      .split(',')
                      .map((v) => v.trim())
                      .filter(Boolean)
                      .slice(0, 1000);
                    setConfig((p: any) => ({
                      ...p,
                      mobileHomeLayout: {
                        ...p.mobileHomeLayout,
                        postComposer: {
                          ...(p.mobileHomeLayout?.postComposer || p.mobileHomeLayout?.post_composer || {}),
                          topics: list
                        }
                      }
                    }));
                  }}
                  className="mt-1 w-full rounded border border-gray-200 px-2 py-2 text-sm"
                  rows={4}
                />
              </label>

              <label className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                <div className="mb-1 text-xs font-semibold text-gray-600">Locations (region, country, city)</div>
                <textarea
                  value={
                    Array.isArray((config.mobileHomeLayout?.postComposer || config.mobileHomeLayout?.post_composer || {})?.locations)
                      ? (config.mobileHomeLayout?.postComposer || config.mobileHomeLayout?.post_composer || {})?.locations?.join(', ')
                      : ''
                  }
                  onChange={(e) => {
                    const list = String(e.target.value || '')
                      .split(',')
                      .map((v) => v.trim())
                      .filter(Boolean)
                      .slice(0, 1000);
                    setConfig((p: any) => ({
                      ...p,
                      mobileHomeLayout: {
                        ...p.mobileHomeLayout,
                        postComposer: {
                          ...(p.mobileHomeLayout?.postComposer || p.mobileHomeLayout?.post_composer || {}),
                          locations: list
                        }
                      }
                    }));
                  }}
                  className="mt-1 w-full rounded border border-gray-200 px-2 py-2 text-sm"
                  rows={4}
                />
              </label>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold text-gray-800">Search</div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                Search enabled
                <input
                  type="checkbox"
                  checked={Boolean(config.mobileHomeLayout?.search?.enabled)}
                  onChange={(e) =>
                    setConfig((p: any) => ({
                      ...p,
                      mobileHomeLayout: {
                        ...p.mobileHomeLayout,
                        search: { ...p.mobileHomeLayout.search, enabled: e.target.checked }
                      }
                    }))
                  }
                />
              </label>
            </div>

            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 text-xs font-semibold text-gray-600">Search categories</div>
              <div className="grid gap-2 md:grid-cols-2">
                {(['posts', 'people', 'pages', 'jobs', 'gigs'] as const).map((cat) => {
                  const list = Array.isArray(config.mobileHomeLayout?.search?.categories) ? config.mobileHomeLayout.search.categories : [];
                  const checked = list.includes(cat);
                  return (
                    <label key={cat} className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm">
                      {cat.toUpperCase()}
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setConfig((p: any) => {
                            const current = Array.isArray(p.mobileHomeLayout?.search?.categories) ? p.mobileHomeLayout.search.categories : [];
                            const next = e.target.checked
                              ? Array.from(new Set([...current, cat]))
                              : current.filter((x: string) => x !== cat);
                            return {
                              ...p,
                              mobileHomeLayout: {
                                ...p.mobileHomeLayout,
                                search: { ...p.mobileHomeLayout.search, categories: next }
                              }
                            };
                          })
                        }
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-bold text-gray-900">Gig Experience Controls</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Enable gig experience enhancements
            <input
              type="checkbox"
              checked={Boolean(config.gigExperience.enabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  gigExperience: { ...p.gigExperience, enabled: e.target.checked },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Floating chat bar
            <input
              type="checkbox"
              checked={Boolean(config.gigExperience.chatBarEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  gigExperience: { ...p.gigExperience, chatBarEnabled: e.target.checked },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Inline chat drawer
            <input
              type="checkbox"
              checked={Boolean(config.gigExperience.inlineChatEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  gigExperience: { ...p.gigExperience, inlineChatEnabled: e.target.checked },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Share modal
            <input
              type="checkbox"
              checked={Boolean(config.gigExperience.shareModalEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  gigExperience: { ...p.gigExperience, shareModalEnabled: e.target.checked },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Allow guests to open chat
            <input
              type="checkbox"
              checked={Boolean(config.gigExperience.allowGuestOpenChat)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  gigExperience: { ...p.gigExperience, allowGuestOpenChat: e.target.checked },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Show seller status/response time
            <input
              type="checkbox"
              checked={Boolean(config.gigExperience.showSellerMeta)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  gigExperience: { ...p.gigExperience, showSellerMeta: e.target.checked },
                }))
              }
            />
          </label>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold text-gray-700">Quick prompts for gig chat</div>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <input
                key={`gig-prompt-${index}`}
                value={config.gigExperience.quickPrompts?.[index] || ''}
                onChange={(e) =>
                  setConfig((p: any) => {
                    const nextPrompts = [...(p.gigExperience.quickPrompts || [])];
                    nextPrompts[index] = e.target.value;
                    return {
                      ...p,
                      gigExperience: {
                        ...p.gigExperience,
                        quickPrompts: nextPrompts
                      }
                    };
                  })
                }
                className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
                placeholder={`Prompt ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-bold text-gray-900">Job Application Notifications</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            New application alerts
            <input
              type="checkbox"
              checked={Boolean(config.notifications.enableJobApplicationNotifications)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  notifications: { ...p.notifications, enableJobApplicationNotifications: e.target.checked },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Applicant viewed alerts
            <input
              type="checkbox"
              checked={Boolean(config.notifications.enableProposalOpenedNotifications)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  notifications: { ...p.notifications, enableProposalOpenedNotifications: e.target.checked },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Application reply alerts
            <input
              type="checkbox"
              checked={Boolean(config.notifications.enableProposalReplyNotifications)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  notifications: { ...p.notifications, enableProposalReplyNotifications: e.target.checked },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Top applicant alerts
            <input
              type="checkbox"
              checked={Boolean(config.notifications.enableTopApplicantNotifications)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  notifications: { ...p.notifications, enableTopApplicantNotifications: e.target.checked },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Interview scheduled alerts
            <input
              type="checkbox"
              checked={Boolean(config.notifications.enableInterviewScheduledNotifications)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  notifications: { ...p.notifications, enableInterviewScheduledNotifications: e.target.checked },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Send lifecycle emails
            <input
              type="checkbox"
              checked={Boolean(config.notifications.enableJobLifecycleEmails)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  notifications: { ...p.notifications, enableJobLifecycleEmails: e.target.checked },
                }))
              }
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-base font-bold text-gray-900">Profile Demographics Controls</h3>
          <p className="mb-4 text-xs text-gray-500">
            Admin section: <span className="font-semibold">Homepage Settings {"->"} Reactions & Feed {"->"} Profile Demographics Controls</span>
          </p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Enable demographics fields
            <input
              type="checkbox"
              checked={Boolean(config.profileDemographics.enabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  profileDemographics: { ...p.profileDemographics, enabled: e.target.checked }
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Enable Sex/Gender field
            <input
              type="checkbox"
              checked={Boolean(config.profileDemographics.genderFieldEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  profileDemographics: { ...p.profileDemographics, genderFieldEnabled: e.target.checked }
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Enable Date of Birth field
            <input
              type="checkbox"
              checked={Boolean(config.profileDemographics.dateOfBirthEnabled)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  profileDemographics: { ...p.profileDemographics, dateOfBirthEnabled: e.target.checked }
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            Public month/day default
            <input
              type="checkbox"
              checked={Boolean(config.profileDemographics.showBirthMonthDayPublicDefault)}
              onChange={(e) =>
                setConfig((p: any) => ({
                  ...p,
                  profileDemographics: { ...p.profileDemographics, showBirthMonthDayPublicDefault: e.target.checked }
                }))
              }
            />
          </label>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold text-gray-700">Gender options</div>
          <div className="space-y-2">
            {(config.profileDemographics.genderOptions || []).map((option: any, index: number) => (
              <div key={`gender-option-${index}`} className="grid gap-2 rounded-lg border border-gray-200 p-2 md:grid-cols-[1fr_1fr_auto_auto]">
                <input
                  value={option.key || ''}
                  onChange={(e) =>
                    setConfig((p: any) => {
                      const next = [...(p.profileDemographics.genderOptions || [])];
                      next[index] = { ...next[index], key: e.target.value.toLowerCase() };
                      return { ...p, profileDemographics: { ...p.profileDemographics, genderOptions: next } };
                    })
                  }
                  className="rounded border border-gray-200 px-2 py-1 text-sm"
                  placeholder="key"
                />
                <input
                  value={option.label || ''}
                  onChange={(e) =>
                    setConfig((p: any) => {
                      const next = [...(p.profileDemographics.genderOptions || [])];
                      next[index] = { ...next[index], label: e.target.value };
                      return { ...p, profileDemographics: { ...p.profileDemographics, genderOptions: next } };
                    })
                  }
                  className="rounded border border-gray-200 px-2 py-1 text-sm"
                  placeholder="label"
                />
                <label className="flex items-center justify-center gap-2 rounded border border-gray-200 px-2 py-1 text-xs">
                  Active
                  <input
                    type="checkbox"
                    checked={option.active !== false}
                    onChange={(e) =>
                      setConfig((p: any) => {
                        const next = [...(p.profileDemographics.genderOptions || [])];
                        next[index] = { ...next[index], active: e.target.checked };
                        return { ...p, profileDemographics: { ...p.profileDemographics, genderOptions: next } };
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setConfig((p: any) => ({
                      ...p,
                      profileDemographics: {
                        ...p.profileDemographics,
                        genderOptions: (p.profileDemographics.genderOptions || []).filter((_: any, i: number) => i !== index)
                      }
                    }))
                  }
                  className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setConfig((p: any) => ({
                ...p,
                profileDemographics: {
                  ...p.profileDemographics,
                  genderOptions: [...(p.profileDemographics.genderOptions || []), { key: '', label: '', active: true }]
                }
              }))
            }
            className="mt-3 rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Add option
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-base font-bold text-gray-900">Messaging Conversation Controls</h3>
          <p className="mb-4 text-xs text-gray-500">
            Admin section: <span className="font-semibold">Homepage Settings {"->"} Reactions & Feed {"->"} Messaging Conversation Controls</span>
          </p>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ['enableMoveToOther', 'Move to Other'],
            ['enableLabelAsJobs', 'Label as Jobs'],
            ['enableMarkUnread', 'Mark as unread'],
            ['enableStar', 'Star / Remove Star'],
            ['enableMute', 'Mute'],
            ['enableArchive', 'Archive'],
            ['enableReportBlock', 'Report / Block'],
            ['enableDeleteConversation', 'Delete conversation'],
            ['enableManageMessageSettings', 'Manage message settings']
          ].map(([key, label]) => (
            <label key={key} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
              {label}
              <input
                type="checkbox"
                checked={Boolean(config.messagingControls[key as keyof typeof config.messagingControls])}
                onChange={(e) =>
                  setConfig((p: any) => ({
                    ...p,
                    messagingControls: { ...p.messagingControls, [key]: e.target.checked }
                  }))
                }
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

// -------------------------
// 1) Header & Hero Builder
// -------------------------
const HeaderBuilder = () => {
  const { showNotification } = useNotification();
  const { mergeHeaderConfig } = useContent();
  const { socket } = useSocket();

  const [config, setConfig] = useState<HeaderConfig | null>(null);
  const [heroConfig, setHeroConfig] = useState<HeroSearchConfig | null>(null);

  const [subTab, setSubTab] = useState<"nav" | "hero">("nav");
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);

  const [targetLogo, setTargetLogo] = useState<
    "main" | "favicon" | { type: "brand"; index: number } | { type: "badge"; index: number }
  >("main");

  const [isSaving, setIsSaving] = useState(false);
  const autoSaveTimer = useRef<number | null>(null);
  const lastSaved = useRef<string>('');
  const hasLoaded = useRef(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    (async () => {
      try {
        const header = await CMSService.getHeaderConfig();
        const hero = await CMSService.getHeroSearchConfig();
        setConfig(normalizeHeaderConfig(header) as unknown as HeaderConfig);
        setHeroConfig(normalizeHeroConfig(hero));
        lastSaved.current = JSON.stringify(header || {});
        hasLoaded.current = true;
        setAutoSaveStatus('idle');
      } catch (e) {
        console.error(e);
        showNotification("error", "Error", "Failed to load header/hero configuration");
      }
    })();
  }, []);

  useEffect(() => {
    if (!config || !hasLoaded.current) return;
    if (subTab !== "nav") return;
    const next = JSON.stringify(config || {});
    if (next === lastSaved.current) return;
    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus('saving');
    autoSaveTimer.current = window.setTimeout(async () => {
      try {
        await CMSService.saveHeaderConfig(config);
        // Immediately apply favicon so admin sees changes without waiting for client re-fetch
        try {
          const candidate = (config as any)?.favicon_url || (config as any)?.faviconUrl;
          applyFaviconToDocument(candidate);
          // Merge header into global settings so other components pick up new assets
          try {
            if (mergeHeaderConfig) mergeHeaderConfig(config as any);
            try {
              socket?.emit?.('cms:header_updated', { source: 'admin', timestamp: Date.now() });
            } catch (e) {
              /* ignore */
            }
          } catch (e) {
            /* ignore */
          }
        } catch (e) {
          /* ignore */
        }
        lastSaved.current = JSON.stringify(config || {});
        setAutoSaveStatus('saved');
        window.setTimeout(() => setAutoSaveStatus('idle'), 1200);
      } catch (e: any) {
        console.error("Auto-save failed:", e);
        showNotification("error", "Auto-save failed", e?.message || "Unable to save header config.");
        setAutoSaveStatus('error');
        window.setTimeout(() => setAutoSaveStatus('idle'), 2000);
      }
    }, 800);
    return () => {
      if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    };
  }, [config, subTab]);

  const handleSave = async () => {
    if (!config || !heroConfig) {
      showNotification("error", "Error", "Configuration not loaded");
      return;
    }

    setIsSaving(true);
    try {
      // Save heroConfig with both camelCase + snake_case compatibility (backend may expect either)
      const payloadHero: any = {
        ...heroConfig,
        ai_badge_label: (heroConfig as any).aiBadgeLabel,
        ai_badge_description: (heroConfig as any).aiBadgeDescription,
        search_placeholder: heroConfig.searchPlaceholder,
        search_size: heroConfig.searchSize,
        search_button_label: (heroConfig as any).searchButtonLabel,
        search_button_aria_label: (heroConfig as any).searchButtonAriaLabel,
        search_results_url: (heroConfig as any).searchResultsUrl,
        quick_tags: heroConfig.quickTags,
        trusted_brands: heroConfig.trustedBrands,
        value_prop: heroConfig.valueProp,
      };

      await Promise.all([CMSService.saveHeaderConfig(config), CMSService.saveHeroSearchConfig(payloadHero)]);

      const [updatedHeader, updatedHero] = await Promise.all([
        CMSService.getHeaderConfig(),
        CMSService.getHeroSearchConfig(),
      ]);

      setConfig(updatedHeader as unknown as HeaderConfig);
      setHeroConfig(normalizeHeroConfig(updatedHero));

      // Apply favicon immediately after save and merge header into global settings
      try {
        const headerAny: any = updatedHeader || {};
        const faviconCandidate = headerAny?.favicon_url || headerAny?.faviconUrl;
        applyFaviconToDocument(faviconCandidate);
        if (mergeHeaderConfig) await mergeHeaderConfig(headerAny);
      } catch (e) {
        // non-fatal
      }

      showNotification("success", "Saved", "Configuration saved successfully! Changes are now live.");
      try {
        socket?.emit?.('cms:header_updated', { source: 'admin', timestamp: Date.now() });
      } catch (e) {
        /* non-fatal */
      }
    } catch (error: any) {
      console.error("Save failed:", error);
      showNotification("error", "Error", `Failed to save: ${error?.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelect = (file: UploadedFile) => {
    if (!config || !heroConfig) return;

    if (typeof targetLogo === "object") {
      if (targetLogo.type === "brand") {
        const logos = [...ensureArray(heroConfig.trustedBrands?.logos)];
        logos[targetLogo.index] = { ...((logos[targetLogo.index] as any) || {}), src: file.url };
        setHeroConfig({ ...heroConfig, trustedBrands: { ...heroConfig.trustedBrands, logos } as any });
      } else if (targetLogo.type === "badge") {
        const badges = [...ensureArray(heroConfig.valueProp?.badges)];
        badges[targetLogo.index] = { ...((badges[targetLogo.index] as any) || {}), icon: file.url };
        setHeroConfig({ ...heroConfig, valueProp: { ...heroConfig.valueProp, badges } as any });
      }
    } else {
      if (targetLogo === "main") setConfig({ ...config, logo_url: file.url } as any);
      if (targetLogo === "favicon") setConfig({ ...config, favicon_url: file.url } as any);
    }

    setIsFilePickerOpen(false);
  };

  // NAV helpers
  const toggleNavRole = (navId: string, role: UserRole) => {
    if (!config) return;
    const nav = ensureArray<NavItem>((config as any).navigation);

    const updated = nav.map((n: any) => {
      if (n.id !== navId) return n;
      const vis = ensureArray<UserRole>(n.visibility);
      const next = vis.includes(role) ? vis.filter((r) => r !== role) : [...vis, role];
      return { ...n, visibility: next };
    });

    setConfig({ ...(config as any), navigation: updated } as any);
  };

  const addNavItem = () => {
    if (!config) return;
    const nav = ensureArray<NavItem>((config as any).navigation);

    const newItem: NavItem = {
      id: `nav-${uid()}`,
      label: "",
      url: "",
      visibility: []
    };

    setConfig((prev) => (prev ? { ...prev, navigation: [...ensureArray<NavItem>((prev as unknown as any).navigation), newItem] } : prev));
  };

  const removeNavItem = (id: string) => {
    if (!config) return;
    const nav = ensureArray<NavItem>((config as any).navigation);
    setConfig((prev) => (prev ? { ...prev, navigation: ensureArray<NavItem>((prev as unknown as any).navigation).filter((n) => n.id !== id) } : prev));
  };

  const updateNavItem = (id: string, field: keyof NavItem, value: any) => {
    if (!config) return;
    const nav = ensureArray<NavItem>((config as any).navigation);

    const updated = nav.map((n: any) => (n.id === id ? { ...n, [field]: value } : n));
    setConfig((prev) => (prev ? { ...prev, navigation: updated } : prev));
  };

  // PROFILE MENU helpers
  const getProfileMenu = () =>
    ensureArray<NavItem>((config as unknown as Record<string, unknown>).profileMenu ?? (config as unknown as Record<string, unknown>).profile_menu ?? (config as unknown as Record<string, unknown>).userMenu);

  const updateProfileMenu = (next: NavItem[]) => {
    setConfig((prev) => (prev ? { ...prev, profileMenu: next, profile_menu: next, userMenu: next } : prev));
  };

  const toggleProfileRole = (itemId: string, role: UserRole) => {
    const menu = getProfileMenu();
    const updated = menu.map((item: any) => {
      if (item.id !== itemId) return item;
      const vis = ensureArray<UserRole>(item.visibility);
      const next = vis.includes(role) ? vis.filter((r) => r !== role) : [...vis, role];
      return { ...item, visibility: next };
    });
    updateProfileMenu(updated as any);
  };

  const addProfileItem = () => {
    const menu = getProfileMenu();
    updateProfileMenu([
      ...menu,
      {
        id: `pm-${uid()}`,
        label: "",
        url: "",
        group: "primary",
        type: "link",
        visibility: [] as any,
      } as any,
    ]);
  };

  const updateProfileItem = (id: string, field: keyof NavItem, value: any) => {
    const menu = getProfileMenu();
    const updated = menu.map((item: any) => (item.id === id ? { ...item, [field]: value } : item));
    updateProfileMenu(updated as any);
  };

  const removeProfileItem = (id: string) => {
    const menu = getProfileMenu();
    updateProfileMenu(menu.filter((item: any) => item.id !== id) as any);
  };

  const updateProfileGroupLabels = (field: "primary" | "business_tools" | "utilities", value: string) => {
    if (!config) return;
    const current = (config as any).profileMenuGroupLabels ?? (config as any).profile_menu_group_labels ?? {};
    const next = { ...current, [field]: value };
    setConfig({ ...(config as any), profileMenuGroupLabels: next, profile_menu_group_labels: next } as any);
  };

  const roleSwitchConfig = config
    ? ((config as any).roleSwitch ?? (config as any).role_switch ?? {})
    : {};

  // GUEST HEADER helpers
  const getDropdown = (key: "guestPrimaryDropdown" | "guestExploreDropdown") => {
    if (!config) return { id: `dd-${uid()}`, label: "", items: [], visibility: [] };
    const snakeKey = key === "guestPrimaryDropdown" ? "guest_primary_dropdown" : "guest_explore_dropdown";
    return (
      (config as any)[key] ||
      (config as any)[snakeKey] || { id: `${key}-${uid()}`, label: "", items: [], visibility: [] }
    );
  };

  const updateDropdown = (key: "guestPrimaryDropdown" | "guestExploreDropdown", next: any) => {
    if (!config) return;
    const snakeKey = key === "guestPrimaryDropdown" ? "guest_primary_dropdown" : "guest_explore_dropdown";
    setConfig({ ...(config as any), [key]: next, [snakeKey]: next } as any);
  };

  const toggleDropdownRole = (key: "guestPrimaryDropdown" | "guestExploreDropdown", role: UserRole) => {
    const dropdown = getDropdown(key);
    const vis = ensureArray<UserRole>(dropdown.visibility);
    const next = vis.includes(role) ? vis.filter((r) => r !== role) : [...vis, role];
    updateDropdown(key, { ...dropdown, visibility: next });
  };

  const addDropdownItem = (key: "guestPrimaryDropdown" | "guestExploreDropdown") => {
    const dropdown = getDropdown(key);
    const items = ensureArray<NavItem>((dropdown as any).items);
    updateDropdown(key, {
      ...dropdown,
      items: [
        ...items,
        {
          id: `gd-${uid()}`,
          label: "",
          description: "",
          url: "",
          visibility: [] as any,
        },
      ],
    });
  };

  const updateDropdownItem = (
    key: "guestPrimaryDropdown" | "guestExploreDropdown",
    itemId: string,
    field: keyof NavItem,
    value: any
  ) => {
    const dropdown = getDropdown(key);
    const items = ensureArray<NavItem>((dropdown as any).items).map((item: any) =>
      item.id === itemId ? { ...item, [field]: value } : item
    );
    updateDropdown(key, { ...dropdown, items });
  };

  const toggleDropdownItemRole = (
    key: "guestPrimaryDropdown" | "guestExploreDropdown",
    itemId: string,
    role: UserRole
  ) => {
    const dropdown = getDropdown(key);
    const items = ensureArray<NavItem>((dropdown as any).items).map((item: any) => {
      if (item.id !== itemId) return item;
      const vis = ensureArray<UserRole>(item.visibility);
      const next = vis.includes(role) ? vis.filter((r) => r !== role) : [...vis, role];
      return { ...item, visibility: next };
    });
    updateDropdown(key, { ...dropdown, items });
  };

  const removeDropdownItem = (key: "guestPrimaryDropdown" | "guestExploreDropdown", itemId: string) => {
    const dropdown = getDropdown(key);
    const items = ensureArray<NavItem>((dropdown as any).items).filter((item: any) => item.id !== itemId);
    updateDropdown(key, { ...dropdown, items });
  };

  const getGuestCtas = () =>
    ensureArray<NavItem>((config as any).guestCtas ?? (config as any).guest_ctas ?? (config as any).guestActions);

  const updateGuestCtas = (next: NavItem[]) => {
    if (!config) return;
    setConfig({ ...(config as any), guestCtas: next, guest_ctas: next, guestActions: next } as any);
  };

  const addGuestCta = () => {
    const ctas = getGuestCtas();
    updateGuestCtas([
      ...ctas,
      { id: `cta-${uid()}`, label: "", url: "", visibility: [] as any } as any,
    ]);
  };

  const updateGuestCta = (id: string, field: keyof NavItem, value: any) => {
    const ctas = getGuestCtas();
    updateGuestCtas(ctas.map((cta: any) => (cta.id === id ? { ...cta, [field]: value } : cta)) as any);
  };

  const toggleGuestCtaRole = (id: string, role: UserRole) => {
    const ctas = getGuestCtas();
    const updated = ctas.map((cta: any) => {
      if (cta.id !== id) return cta;
      const vis = ensureArray<UserRole>(cta.visibility);
      const next = vis.includes(role) ? vis.filter((r) => r !== role) : [...vis, role];
      return { ...cta, visibility: next };
    });
    updateGuestCtas(updated as any);
  };

  const removeGuestCta = (id: string) => {
    const ctas = getGuestCtas();
    updateGuestCtas(ctas.filter((cta: any) => cta.id !== id) as any);
  };

  // HERO helpers (Quick Category Buttons)
  const addQuickTag = () => {
    if (!heroConfig) return;
    const tags = ensureArray<any>(heroConfig.quickTags);
    setHeroConfig({
      ...heroConfig,
      quickTags: [...tags, { id: `qt-${uid()}`, label: "", url: "", bgColor: "#F3F4F6" }],
    } as any);
  };

  const updateQuickTag = (index: number, field: "label" | "url" | "bgColor", value: string) => {
    if (!heroConfig) return;
    const tags = [...ensureArray<any>(heroConfig.quickTags)];
    if (!tags[index]) return;
    tags[index] = { ...tags[index], [field]: value };
    setHeroConfig({ ...heroConfig, quickTags: tags } as any);
  };

  const removeQuickTag = (index: number) => {
    if (!heroConfig) return;
    const tags = ensureArray<any>(heroConfig.quickTags).filter((_: any, i: number) => i !== index);
    setHeroConfig({ ...heroConfig, quickTags: tags } as any);
  };

  if (!config || !heroConfig) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" />
          <p className="text-gray-500">Loading configuration...</p>
        </div>
      </div>
    );
  }

  // Normalize size preset options for the UI (must match Navbar)
  const sizeValue = String((heroConfig as any).searchSize || "large");
  const sizeNormalized = sizeValue === "xl" ? "extra-large" : sizeValue === "extraLarge" ? "extra-large" : sizeValue;

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-gray-200 pb-2 mb-4">
        <button
          data-testid="subtab-nav"
          onClick={() => setSubTab("nav")}
          className={`pb-2 text-sm font-medium flex items-center ${
            subTab === "nav" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"
          }`}
        >
          <LayoutIcon className="w-4 h-4 mr-2" /> Navigation Bar
        </button>
        <button
          data-testid="subtab-hero"
          onClick={() => setSubTab("hero")}
          className={`pb-2 text-sm font-medium flex items-center ${
            subTab === "hero" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"
          }`}
        >
          <Globe className="w-4 h-4 mr-2" /> Slider Search Builder
        </button>
      </div>

      {subTab === "nav" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                <ImageIcon className="w-4 h-4 mr-2" /> Visual Identity
              </h3>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Header Logo</p>
                    <p className="text-xs text-gray-500">Overrides global logo if set</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-32 bg-gray-50 rounded border border-dashed flex items-center justify-center overflow-hidden">
                      {(config as any).logo_url ? (
                        <img src={(config as any).logo_url} className="h-full object-contain" alt="Logo" />
                      ) : (
                        <span className="text-[10px] text-gray-400">Default</span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setTargetLogo("main");
                        setIsFilePickerOpen(true);
                      }}
                      className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200"
                    >
                      Change
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Favicon</p>
                    <p className="text-xs text-gray-500">Small icon for browser tabs</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 bg-gray-50 rounded border border-dashed flex items-center justify-center overflow-hidden">
                      {(config as any).favicon_url ? (
                        <img src={(config as any).favicon_url} className="h-full object-contain" alt="Favicon" />
                      ) : (
                        <span className="text-[8px] text-gray-400">F</span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setTargetLogo("favicon");
                        setIsFilePickerOpen(true);
                      }}
                      className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200"
                    >
                      Change
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                <SearchIcon className="w-4 h-4 mr-2" /> Search Behavior
              </h3>

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700">Enable Header Search</span>
                <button
                  onClick={() => setConfig({ ...(config as any), searchEnabled: !(config as any).searchEnabled } as any)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    (config as any).searchEnabled ? "bg-blue-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      (config as any).searchEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Search Mode</label>
                <select
                  className="w-full border rounded p-2"
                  value={(config as any).searchMode || "keyword"}
                  onChange={(e) => setConfig({ ...(config as any), searchMode: e.target.value } as any)}
                >
                  <option value="keyword">Keyword</option>
                  <option value="semantic">Semantic</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-xs text-gray-600">Navigation Bar auto‑save status</div>
            {autoSaveStatus === 'saving' && <div className="text-xs font-semibold text-blue-600">Saving…</div>}
            {autoSaveStatus === 'saved' && <div className="text-xs font-semibold text-green-600">Saved ✔</div>}
            {autoSaveStatus === 'error' && <div className="text-xs font-semibold text-red-600">Save failed</div>}
            {autoSaveStatus === 'idle' && <div className="text-xs font-semibold text-gray-500">Up to date</div>}
          </div>

          {/* Right-column quick favicon upload (convenience) */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <h4 className="text-sm font-semibold text-gray-800 mb-2">Quick Favicon Upload</h4>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 bg-gray-50 rounded border border-dashed flex items-center justify-center overflow-hidden">
                  {(config as any).favicon_url ? (
                    <img src={(config as any).favicon_url} className="h-full object-contain" alt="Favicon" />
                  ) : (
                    <span className="text-[8px] text-gray-400">F</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">Upload and apply favicon</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setTargetLogo("favicon");
                    setIsFilePickerOpen(true);
                  }}
                  className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200"
                >
                  Upload (modal)
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-900">Navigation Items</h3>
              <button
                data-testid="nav-add-item"
                onClick={addNavItem}
                className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 flex items-center"
              >
                <Plus className="w-3 h-3 mr-1" /> Add Item
              </button>
            </div>

            <div className="space-y-2">
              {ensureArray<any>((config as any).navigation).map((nav: any) => (
                <div
                  key={nav.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200 gap-4"
                >
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input
                      data-testid={`nav-label-${nav.id}`}
                      className="border rounded px-2 py-1 text-sm"
                      value={nav.label || ""}
                      onChange={(e) => updateNavItem(nav.id, "label", e.target.value)}
                      placeholder="Label"
                    />
                    <input
                      data-testid={`nav-url-${nav.id}`}
                      className="border rounded px-2 py-1 text-sm text-gray-500"
                      value={nav.url || ""}
                      onChange={(e) => updateNavItem(nav.id, "url", e.target.value)}
                      placeholder="/url"
                    />
                  </div>

                  <div className="flex gap-1">
                    {[UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN].map((role: any) => (
                      <button
                        key={`${nav.id}-${role}`}
                        data-testid={`nav-role-${nav.id}-${String(role)}`}
                        onClick={() => toggleNavRole(nav.id, role)}
                        className={`text-[10px] px-2 py-1 rounded uppercase border ${
                          ensureArray<any>(nav.visibility).includes(role)
                            ? "bg-blue-100 text-blue-700 border-blue-200 font-bold"
                            : "bg-white text-gray-400 border-gray-200"
                        }`}
                        title={`Visible to ${role}`}
                      >
                        {String(role).charAt(0)}
                      </button>
                    ))}
                  </div>

                  <button onClick={() => removeNavItem(nav.id)} className="text-gray-400 hover:text-red-500 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-bold text-gray-900 mb-4">Header Actions</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { key: "messages", label: "Messages" },
                { key: "notifications", label: "Notifications" },
                { key: "lists", label: "Favorite List" },
                { key: "orders", label: "Orders" },
                { key: "switchSelling", label: "Role Switch" },
                { key: "profile", label: "Profile Menu" },
              ].map((action) => (
                <label key={action.key} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={Boolean((config as any)?.actions?.[action.key] ?? true)}
                    onChange={(e) =>
                      setConfig({
                        ...(config as any),
                        actions: {
                          ...(config as any).actions,
                          [action.key]: e.target.checked,
                        },
                      } as any)
                    }
                    className="rounded text-blue-600"
                  />
                  {action.label}
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-900">Profile Menu Builder</h3>
              <button
                data-testid="profile-add-item"
                onClick={addProfileItem}
                className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded font-bold hover:bg-blue-100"
              >
                + Add Item
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {["primary", "business_tools", "utilities"].map((groupKey) => (
                <div key={groupKey}>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                    {groupKey.replace("_", " ")} Label
                  </label>
                  <input
                    className="w-full border rounded p-2 text-sm"
                    value={
                      ((config as any).profileMenuGroupLabels ??
                        (config as any).profile_menu_group_labels ??
                        {})[groupKey] || ""
                    }
                    onChange={(e) => updateProfileGroupLabels(groupKey as any, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {getProfileMenu().map((item: any) => (
                <div
                  key={item.id}
                  className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2"
                >
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input
                      data-testid={`profile-label-${item.id}`}
                      className="border rounded px-2 py-1 text-sm"
                      value={item.label || ""}
                      onChange={(e) => updateProfileItem(item.id, "label", e.target.value)}
                      placeholder="Label"
                    />
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      value={item.group || "primary"}
                      onChange={(e) => updateProfileItem(item.id, "group", e.target.value)}
                    >
                      <option value="primary">Primary</option>
                      <option value="business_tools">Business Tools</option>
                      <option value="utilities">Utilities</option>
                    </select>
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      value={item.type || "link"}
                      onChange={(e) => updateProfileItem(item.id, "type", e.target.value)}
                    >
                      <option value="link">Link</option>
                      <option value="currency_switcher">Currency Switcher</option>
                      <option value="sign_out">Sign Out</option>
                    </select>
                    <input
                      data-testid={`profile-url-${item.id}`}
                      className="border rounded px-2 py-1 text-sm text-gray-600"
                      value={item.url || ""}
                      onChange={(e) => updateProfileItem(item.id, "url", e.target.value)}
                      placeholder="/url"
                      disabled={item.type && item.type !== "link"}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN].map((role: any) => (
                      <button
                        key={`${item.id}-${role}`}
                        data-testid={`profile-role-${item.id}-${String(role)}`}
                        onClick={() => toggleProfileRole(item.id, role)}
                        className={`text-[10px] px-2 py-1 rounded uppercase border ${
                          ensureArray<any>(item.visibility).includes(role)
                            ? "bg-blue-100 text-blue-700 border-blue-200 font-bold"
                            : "bg-white text-gray-400 border-gray-200"
                        }`}
                      >
                        {String(role).charAt(0)}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => removeProfileItem(item.id)}
                    className="text-xs text-red-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {getProfileMenu().length === 0 && (
                <p className="text-sm text-gray-500">No profile menu items yet.</p>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
            <h3 className="font-bold text-gray-900">Role Switch Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                data-testid="role-switch-buyer-label"
                className="border rounded p-2"
                value={roleSwitchConfig.buyer_label ?? roleSwitchConfig.buyerLabel ?? ""}
                onChange={(e) =>
                  setConfig({
                    ...(config as any),
                    roleSwitch: {
                      ...roleSwitchConfig,
                      buyer_label: e.target.value,
                    },
                  } as any)
                }
                placeholder="Buyer switch label"
              />
              <input
                data-testid="role-switch-buyer-url"
                className="border rounded p-2 text-gray-600"
                value={roleSwitchConfig.buyer_url ?? roleSwitchConfig.buyerUrl ?? ""}
                onChange={(e) =>
                  setConfig({
                    ...(config as any),
                    roleSwitch: {
                      ...roleSwitchConfig,
                      buyer_url: e.target.value,
                    },
                  } as any)
                }
                placeholder="Buyer switch URL"
              />
              <input
                data-testid="role-switch-seller-label"
                className="border rounded p-2"
                value={roleSwitchConfig.seller_label ?? roleSwitchConfig.sellerLabel ?? ""}
                onChange={(e) =>
                  setConfig({
                    ...(config as any),
                    roleSwitch: {
                      ...roleSwitchConfig,
                      seller_label: e.target.value,
                    },
                  } as any)
                }
                placeholder="Seller switch label"
              />
              <input
                data-testid="role-switch-seller-url"
                className="border rounded p-2 text-gray-600"
                value={roleSwitchConfig.seller_url ?? roleSwitchConfig.sellerUrl ?? ""}
                onChange={(e) =>
                  setConfig({
                    ...(config as any),
                    roleSwitch: {
                      ...roleSwitchConfig,
                      seller_url: e.target.value,
                    },
                  } as any)
                }
                placeholder="Seller switch URL"
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6">
            <h3 className="font-bold text-gray-900">Guest Header Experience</h3>

            {(["guestPrimaryDropdown", "guestExploreDropdown"] as const).map((dropdownKey) => {
              const dropdown = getDropdown(dropdownKey);
              const label = dropdownKey === "guestPrimaryDropdown" ? "Primary Dropdown" : "Explore Dropdown";
              return (
                <div key={dropdownKey} className="border border-gray-100 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-800">{label}</h4>
                    <button
                      data-testid={`guest-add-item-${dropdownKey}`}
                      onClick={() => addDropdownItem(dropdownKey)}
                      className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded font-bold hover:bg-blue-100"
                    >
                      + Add Item
                    </button>
                  </div>

                  <input
                    data-testid={`guest-dropdown-label-${dropdownKey}`}
                    className="w-full border rounded p-2"
                    value={dropdown.label || ""}
                    onChange={(e) => updateDropdown(dropdownKey, { ...dropdown, label: e.target.value })}
                    placeholder="Dropdown Label"
                  />

                  <div className="flex flex-wrap gap-2">
                    {[UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN].map((role: any) => (
                      <button
                        key={`${dropdownKey}-${role}`}
                        data-testid={`guest-dropdown-role-${dropdownKey}-${String(role)}`}
                        onClick={() => toggleDropdownRole(dropdownKey, role)}
                        className={`text-[10px] px-2 py-1 rounded uppercase border ${
                          ensureArray<any>(dropdown.visibility).includes(role)
                            ? "bg-blue-100 text-blue-700 border-blue-200 font-bold"
                            : "bg-white text-gray-400 border-gray-200"
                        }`}
                      >
                        {String(role).charAt(0)}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {ensureArray<any>(dropdown.items).map((item: any) => (
                      <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                        <input
                          data-testid={`guest-dropdown-item-label-${item.id}`}
                          className="border rounded px-2 py-2 text-sm md:col-span-4"
                          value={item.label || ""}
                          onChange={(e) => updateDropdownItem(dropdownKey, item.id, "label", e.target.value)}
                          placeholder="Label"
                        />
                        <input
                          data-testid={`guest-dropdown-item-desc-${item.id}`}
                          className="border rounded px-2 py-2 text-sm text-gray-600 md:col-span-4"
                          value={item.description || ""}
                          onChange={(e) => updateDropdownItem(dropdownKey, item.id, "description", e.target.value)}
                          placeholder="Tagline / Description"
                        />
                        <input
                          data-testid={`guest-dropdown-item-url-${item.id}`}
                          className="border rounded px-2 py-2 text-sm text-gray-600 md:col-span-3"
                          value={item.url || ""}
                          onChange={(e) => updateDropdownItem(dropdownKey, item.id, "url", e.target.value)}
                          placeholder="/url"
                        />
                        <div className="flex gap-1 md:col-span-2">
                          {[UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER].map((role: any) => (
                            <button
                              key={`${item.id}-${role}`}
                              data-testid={`guest-dropdown-item-role-${item.id}-${String(role)}`}
                              onClick={() => toggleDropdownItemRole(dropdownKey, item.id, role)}
                              className={`text-[10px] px-2 py-1 rounded uppercase border ${
                                ensureArray<any>(item.visibility).includes(role)
                                  ? "bg-blue-100 text-blue-700 border-blue-200 font-bold"
                                  : "bg-white text-gray-400 border-gray-200"
                              }`}
                            >
                              {String(role).charAt(0)}
                            </button>
                          ))}
                        </div>
                        <button
                          data-testid={`guest-dropdown-item-remove-${item.id}`}
                          onClick={() => removeDropdownItem(dropdownKey, item.id)}
                          className="text-red-400 hover:text-red-600 p-2 md:col-span-1 justify-self-end"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {ensureArray<any>(dropdown.items).length === 0 && (
                      <p className="text-sm text-gray-500">No items yet.</p>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="border border-gray-100 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-800">Guest CTAs</h4>
                <button
                  data-testid="guest-add-cta"
                  onClick={addGuestCta}
                  className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded font-bold hover:bg-blue-100"
                >
                  + Add CTA
                </button>
              </div>

              <div className="space-y-2">
                {getGuestCtas().map((cta: any) => (
                  <div key={cta.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <input
                      data-testid={`guest-cta-label-${cta.id}`}
                      className="border rounded px-2 py-2 text-sm md:col-span-4"
                      value={cta.label || ""}
                      onChange={(e) => updateGuestCta(cta.id, "label", e.target.value)}
                      placeholder="Label"
                    />
                    <input
                      data-testid={`guest-cta-url-${cta.id}`}
                      className="border rounded px-2 py-2 text-sm text-gray-600 md:col-span-5"
                      value={cta.url || ""}
                      onChange={(e) => updateGuestCta(cta.id, "url", e.target.value)}
                      placeholder="/url"
                    />
                    <div className="flex gap-1 md:col-span-2">
                      {[UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER].map((role: any) => (
                        <button
                          key={`${cta.id}-${role}`}
                          data-testid={`guest-cta-role-${cta.id}-${String(role)}`}
                          onClick={() => toggleGuestCtaRole(cta.id, role)}
                          className={`text-[10px] px-2 py-1 rounded uppercase border ${
                            ensureArray<any>(cta.visibility).includes(role)
                              ? "bg-blue-100 text-blue-700 border-blue-200 font-bold"
                              : "bg-white text-gray-400 border-gray-200"
                          }`}
                        >
                          {String(role).charAt(0)}
                        </button>
                      ))}
                    </div>
                    <button
                      data-testid={`guest-cta-remove-${cta.id}`}
                      onClick={() => removeGuestCta(cta.id)}
                      className="text-red-400 hover:text-red-600 p-2 md:col-span-1 justify-self-end"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {getGuestCtas().length === 0 && (
                  <p className="text-sm text-gray-500">No CTAs yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {subTab === "hero" && (
        <div className="space-y-6 animate-fade-in">
          {/* Editable heading above search */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-bold text-gray-900 mb-4">Slider Search Builder</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Heading Text (Editable)</label>
                <input
                  className="w-full border rounded p-2"
                  value={(heroConfig as any).headline || ""}
                  onChange={(e) => setHeroConfig({ ...(heroConfig as any), headline: e.target.value } as any)}
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  This is the main heading displayed above the slider search bar.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">AI Badge Label</label>
                <input
                  className="w-full border rounded p-2"
                  value={(heroConfig as any).aiBadgeLabel || ""}
                  onChange={(e) => setHeroConfig({ ...(heroConfig as any), aiBadgeLabel: e.target.value } as any)}
                  placeholder="AI Powered"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">AI Badge Description</label>
                <input
                  className="w-full border rounded p-2"
                  value={(heroConfig as any).aiBadgeDescription || ""}
                  onChange={(e) =>
                    setHeroConfig({ ...(heroConfig as any), aiBadgeDescription: e.target.value } as any)
                  }
                  placeholder="Semantic search and smart recommendations"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Search Placeholder</label>
                <input
                  className="w-full border rounded p-2"
                  value={(heroConfig as any).searchPlaceholder || ""}
                  onChange={(e) => setHeroConfig({ ...(heroConfig as any), searchPlaceholder: e.target.value } as any)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Search Button Label</label>
                <input
                  className="w-full border rounded p-2"
                  value={(heroConfig as any).searchButtonLabel || ""}
                  onChange={(e) => setHeroConfig({ ...(heroConfig as any), searchButtonLabel: e.target.value } as any)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Search Button ARIA Label</label>
                <input
                  className="w-full border rounded p-2"
                  value={(heroConfig as any).searchButtonAriaLabel || ""}
                  onChange={(e) =>
                    setHeroConfig({ ...(heroConfig as any), searchButtonAriaLabel: e.target.value } as any)
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Search Results URL</label>
                <input
                  className="w-full border rounded p-2"
                  value={(heroConfig as any).searchResultsUrl || ""}
                  onChange={(e) => setHeroConfig({ ...(heroConfig as any), searchResultsUrl: e.target.value } as any)}
                  placeholder="/search"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Search Size Preset</label>
                <select
                  className="w-full border rounded p-2"
                  value={sizeNormalized}
                  onChange={(e) =>
                    setHeroConfig({
                      ...(heroConfig as any),
                      searchSize: e.target.value,
                    } as any)
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="large">Large</option>
                  <option value="extra-large">Extra Large</option>
                </select>
              </div>
            </div>
          </div>

          {/* Quick Category Buttons */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-900">Quick Category Buttons (Pills)</h3>
              <button
                onClick={addQuickTag}
                className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded font-bold hover:bg-blue-100"
              >
                + Add Button
              </button>
            </div>

            <div className="space-y-2">
              {ensureArray<any>((heroConfig as any).quickTags).map((tag: any, idx: number) => (
                <div key={tag.id || idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                  <input
                    className="border rounded px-2 py-2 text-sm md:col-span-3"
                    value={tag.label || ""}
                    onChange={(e) => updateQuickTag(idx, "label", e.target.value)}
                    placeholder="Label (e.g. Python)"
                  />
                  <input
                    className="border rounded px-2 py-2 text-sm text-gray-600 md:col-span-6"
                    value={tag.url || ""}
                    onChange={(e) => updateQuickTag(idx, "url", e.target.value)}
                    placeholder="URL (e.g. /browse?category=python)"
                  />
                  <input
                    className="border rounded px-2 py-2 text-sm md:col-span-2"
                    value={tag.bgColor || ""}
                    onChange={(e) => updateQuickTag(idx, "bgColor", e.target.value)}
                    placeholder="#F3F4F6"
                    title="Background color (CSS color)"
                  />
                  <button
                    onClick={() => removeQuickTag(idx)}
                    className="text-red-400 hover:text-red-600 p-2 md:col-span-1 justify-self-end"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {ensureArray<any>((heroConfig as any).quickTags).length === 0 && (
                <p className="text-sm text-gray-500">No buttons yet. Click "Add Button".</p>
              )}
            </div>
          </div>

          {/* Trusted Brands */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-bold text-gray-900 mb-4">Trusted By Section</h3>

            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={Boolean((heroConfig as any).trustedBrands?.enabled)}
                onChange={(e) =>
                  setHeroConfig({
                    ...(heroConfig as any),
                    trustedBrands: { ...(heroConfig as any).trustedBrands, enabled: e.target.checked },
                  } as any)
                }
              />
              <span className="text-sm">Enable section</span>
            </div>

            <div className="space-y-3">
              <input
                className="w-full border rounded p-2"
                value={(heroConfig as any).trustedBrands?.title || ""}
                onChange={(e) =>
                  setHeroConfig({
                    ...(heroConfig as any),
                    trustedBrands: { ...(heroConfig as any).trustedBrands, title: e.target.value },
                  } as any)
                }
                placeholder="Trusted by leading companies worldwide"
              />

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {ensureArray<any>((heroConfig as any).trustedBrands?.logos).map((logo: any, idx: number) => (
                  <div
                    key={logo.id || idx}
                    className="border rounded-lg p-2 text-center relative group cursor-pointer"
                    onClick={() => {
                      setTargetLogo({ type: "brand", index: idx });
                      setIsFilePickerOpen(true);
                    }}
                  >
                    {logo.src ? (
                      <img src={logo.src} className="h-8 mx-auto object-contain" alt={logo.alt || "Brand"} />
                    ) : (
                      <div className="h-8 flex items-center justify-center text-gray-400 text-xs">Logo {idx + 1}</div>
                    )}
                    <div className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-bold transition-opacity">
                      Change
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => {
                    const logos = ensureArray<any>((heroConfig as any).trustedBrands?.logos);
                    setHeroConfig({
                      ...(heroConfig as any),
                      trustedBrands: {
                        ...(heroConfig as any).trustedBrands,
                        logos: [...logos, { id: `logo-${uid()}`, src: "", alt: `Brand ${logos.length + 1}` }],
                      },
                    } as any);
                  }}
                  className="border-2 border-dashed rounded-lg p-2 text-gray-400 hover:border-blue-500 hover:text-blue-500 text-sm"
                >
                  + Add Logo
                </button>
              </div>
            </div>
          </div>

          {/* Value Prop + Badges */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-bold text-gray-900 mb-4">Value Proposition Section</h3>

            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={Boolean((heroConfig as any).valueProp?.enabled)}
                onChange={(e) =>
                  setHeroConfig({
                    ...(heroConfig as any),
                    valueProp: { ...(heroConfig as any).valueProp, enabled: e.target.checked },
                  } as any)
                }
              />
              <span className="text-sm">Enable section</span>
            </div>

            <div className="space-y-3">
              <input
                className="w-full border rounded p-2"
                value={(heroConfig as any).valueProp?.heading || ""}
                onChange={(e) =>
                  setHeroConfig({
                    ...(heroConfig as any),
                    valueProp: { ...(heroConfig as any).valueProp, heading: e.target.value },
                  } as any)
                }
                placeholder="Connect with top talent, manage projects, and pay securely - all in one place."
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  className="border rounded p-2"
                  value={(heroConfig as any).valueProp?.primaryCta?.label || ""}
                  onChange={(e) =>
                    setHeroConfig({
                      ...(heroConfig as any),
                      valueProp: {
                        ...(heroConfig as any).valueProp,
                        primaryCta: { ...(heroConfig as any).valueProp?.primaryCta, label: e.target.value },
                      },
                    } as any)
                  }
                  placeholder="Primary CTA Label (Find Talent)"
                />
                <input
                  className="border rounded p-2 text-gray-600"
                  value={(heroConfig as any).valueProp?.primaryCta?.url || ""}
                  onChange={(e) =>
                    setHeroConfig({
                      ...(heroConfig as any),
                      valueProp: {
                        ...(heroConfig as any).valueProp,
                        primaryCta: { ...(heroConfig as any).valueProp?.primaryCta, url: e.target.value },
                      },
                    } as any)
                  }
                  placeholder="Primary CTA URL (/browse)"
                />

                <input
                  className="border rounded p-2"
                  value={(heroConfig as any).valueProp?.secondaryCta?.label || ""}
                  onChange={(e) =>
                    setHeroConfig({
                      ...(heroConfig as any),
                      valueProp: {
                        ...(heroConfig as any).valueProp,
                        secondaryCta: { ...(heroConfig as any).valueProp?.secondaryCta, label: e.target.value },
                      },
                    } as any)
                  }
                  placeholder="Secondary CTA Label (Post a Job)"
                />
                <input
                  className="border rounded p-2 text-gray-600"
                  value={(heroConfig as any).valueProp?.secondaryCta?.url || ""}
                  onChange={(e) =>
                    setHeroConfig({
                      ...(heroConfig as any),
                      valueProp: {
                        ...(heroConfig as any).valueProp,
                        secondaryCta: { ...(heroConfig as any).valueProp?.secondaryCta, url: e.target.value },
                      },
                    } as any)
                  }
                  placeholder="Secondary CTA URL (/create-job)"
                />
              </div>

              <div className="flex justify-between items-center pt-2">
                <h4 className="text-sm font-bold text-gray-700">Trust Badges</h4>
                <button
                  onClick={() => {
                    const badges = ensureArray<any>((heroConfig as any).valueProp?.badges);
                    setHeroConfig({
                      ...(heroConfig as any),
                      valueProp: {
                        ...(heroConfig as any).valueProp,
                        badges: [...badges, { id: `badge-${uid()}`, label: "New Badge", icon: "" }],
                      },
                    } as any);
                  }}
                  className="text-xs bg-green-50 text-green-600 px-3 py-1 rounded font-bold hover:bg-green-100"
                >
                  + Add Badge
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {ensureArray<any>((heroConfig as any).valueProp?.badges).map((b: any, idx: number) => (
                  <div key={b.id || idx} className="border rounded-lg p-3 bg-gray-50 relative group">
                    <button
                      onClick={() => {
                        const badges = ensureArray<any>((heroConfig as any).valueProp?.badges).filter(
                          (_: any, i: number) => i !== idx
                        );
                        setHeroConfig({
                          ...(heroConfig as any),
                          valueProp: { ...(heroConfig as any).valueProp, badges },
                        } as any);
                      }}
                      className="absolute top-2 right-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    <div
                      className="mb-3 text-center cursor-pointer"
                      onClick={() => {
                        setTargetLogo({ type: "badge", index: idx });
                        setIsFilePickerOpen(true);
                      }}
                    >
                      {b.icon ? (
                        <img src={b.icon} className="h-10 w-10 mx-auto object-contain mb-2" alt={b.label} />
                      ) : (
                        <div className="h-10 w-10 mx-auto bg-white border rounded flex items-center justify-center text-gray-400 mb-2">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                      )}
                      <div className="text-[11px] text-gray-500">Click icon to change</div>
                    </div>

                    <input
                      className="w-full text-sm border rounded p-2"
                      value={b.label || ""}
                      onChange={(e) => {
                        const badges = [...ensureArray<any>((heroConfig as any).valueProp?.badges)];
                        badges[idx] = { ...badges[idx], label: e.target.value };
                        setHeroConfig({
                          ...(heroConfig as any),
                          valueProp: { ...(heroConfig as any).valueProp, badges },
                        } as any);
                      }}
                      placeholder="Badge label"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          data-testid="header-save-config"
          onClick={handleSave}
          disabled={isSaving}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-lg flex items-center disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" /> Save Configuration
            </>
          )}
        </button>
      </div>

      <FilePickerModal
        isOpen={isFilePickerOpen}
        onClose={() => setIsFilePickerOpen(false)}
        onSelect={handleFileSelect}
        acceptedTypes="image/*"
        title="Select Image"
        role="admin"
      />
    </div>
  );
};
// -------------------------
// 2) Trending Manager
// -------------------------
const TrendingManager = () => {
  const [config, setConfig] = useState<TrendingConfig | null>(null);
  const [allCategories, setAllCategories] = useState<ListingCategory[]>([]);
  const [catSearch, setCatSearch] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { showNotification } = useNotification();
  const { socket } = useSocket();

  useEffect(() => {
    (async () => {
      try {
        // Fetch trending config and admin categories separately so we can log
        // which admin category call (if any) fails.
        const c = await CMSService.getTrendingConfig().catch((err) => {
          console.error('[TrendingManager] CMSService.getTrendingConfig failed', err);
          return null;
        });

        let gigs = [];
        let jobs = [];
        try {
          gigs = await AdminService.getGigCategories();
        } catch (err) {
          console.error('[TrendingManager] AdminService.getGigCategories failed', err);
        }

        try {
          jobs = await AdminService.getJobCategories();
        } catch (err) {
          console.error('[TrendingManager] AdminService.getJobCategories failed', err);
        }

        const merged = [...(ensureArray(gigs) as any), ...(ensureArray(jobs) as any)];
        setConfig(normalizeTrendingConfig(c));
        setAllCategories(merged);

        if (!merged || merged.length === 0) {
          // no-op: admin categories not loaded (could fallback to public categories)
        }
      } catch (e) {
        console.error(e);
        showNotification("error", "Error", "Failed to load trending data");
        setConfig(
          normalizeTrendingConfig({
            enabled: false,
            title: "",
            category_ids: [],
            scroll_behavior: "manual",
            auto_slide_interval: 5000,
            visibility: [],
            show_icons: false,
          })
        );
        setAllCategories([]);
      }
    })();
  }, []);

  // E2E accessor removed - no persistent debug hooks in production code

  const filteredCategories = useMemo(() => {
    const q = catSearch.toLowerCase().trim();
    if (!q) return allCategories;
    return allCategories.filter((c) => (c?.name || "").toLowerCase().includes(q));
  }, [allCategories, catSearch]);

  const toggleCategory = (catId: string) => {
    if (!config) return;
    const current = ensureArray<string>((config as any).category_ids);
    const next = current.includes(catId) ? current.filter((id) => id !== catId) : [...current, catId];
    setConfig({ ...(config as any), category_ids: next } as any);
  };

  const toggleVisibility = (role: UserRole) => {
    if (!config) return;
    const current = ensureArray<UserRole>((config as any).visibility);
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
    setConfig({ ...(config as any), visibility: next } as any);
  };

  const handleAutoFill = async () => {
    if (!config) return;

    setIsAnalyzing(true);
    try {
      const trends = await SearchService.getTrendingSearches();
      const keywords = ensureArray<any>(trends).map((t) => t.keyword).filter(Boolean);

      if (keywords.length === 0) {
        showNotification("info", "No Data", "Not enough search data to generate trends.");
        return;
      }

      const categoriesSimple = allCategories.map((c: any) => ({ id: c.id, name: c.name }));
      const result = await AIService.matchTrendsToCategories({ trends: keywords, categories: categoriesSimple });

      const current = ensureArray<string>((config as any).category_ids);
      const next = Array.from(new Set([...current, ...ensureArray<string>(result?.categoryIds)]));

      setConfig({ ...(config as any), category_ids: next } as any);
      showNotification(
        "success",
        "AI Updated",
        `Added ${ensureArray(result?.categoryIds).length} categories based on trends.`
      );
    } catch (e) {
      console.error(e);
      showNotification("alert", "Error", "AI analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
      try {
        // Convert admin-only category IDs to stable slugs when saving so
        // the public site (which uses public category API) can map them.
        const payload = { ...(config as any) } as any;
        try {
          const currentIds = ensureArray<string>((config as any).category_ids);
          payload.category_ids = currentIds.map((id) => {
            const match = allCategories.find((c) => String(c.id) === String(id) || String((c as any)._id) === String(id));
            // Prefer slug when available, otherwise fall back to id so backend keeps something stable
            return (match && (match.slug || match.id)) ?? String(id);
          });
        } catch (e) {
          // If anything goes wrong transforming IDs, fall back to sending raw config
          payload.category_ids = (config as any).category_ids || [];
        }

        // Diagnostic log: capture payload and relevant state before sending
        try {
          // eslint-disable-next-line no-console
          console.log("[Trending Save Debug] payload_pre_save:", {
            id: payload.id,
            enabled: payload.enabled,
            title: payload.title,
            category_ids: payload.category_ids,
            visibility: payload.visibility,
            allCategoriesCount: allCategories.length,
          });
        } catch (e) {
          /* ignore logging failures */
        }

        // If admin selected categories, treat that as intent to show the strip.
        try {
          const ids = Array.isArray(payload.category_ids) ? payload.category_ids.filter(Boolean) : [];
          if (ids.length > 0) payload.enabled = true;
        } catch (e) {
          /* ignore */
        }

        await CMSService.saveTrendingConfig(payload);

      const updated = await CMSService.getTrendingConfig();
      setConfig(normalizeTrendingConfig(updated));

      showNotification("success", "Saved", "Trending categories updated! Changes are now live.");
      try {
        socket?.emit?.('cms:trending_config_updated', { source: 'admin', timestamp: Date.now() });
      } catch (e) {
        /* non-fatal */
      }
    } catch (e: any) {
      console.error(e);
      showNotification("error", "Error", `Failed to save trending config: ${e?.message || "Unknown error"}`);
    }
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" />
          <p className="text-gray-500">Loading trending configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h3 className="font-bold text-gray-900">Trending Categories Strip</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean((config as any).enabled)}
              onChange={(e) => setConfig({ ...(config as any), enabled: e.target.checked } as any)}
              className="mr-2 rounded text-blue-600"
            />
            Enable Strip
          </label>
          <button
            data-testid="trending-save-config"
            onClick={handleSave}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Strip Title</label>
            <input
              className="w-full border-gray-300 rounded-lg p-2"
              value={(config as any).title || ""}
              onChange={(e) => setConfig({ ...(config as any), title: e.target.value } as any)}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean((config as any).show_icons)}
              onChange={(e) => setConfig({ ...(config as any), show_icons: e.target.checked } as any)}
            />
            <span className="text-sm text-gray-700">Show Category Icons (if available)</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Behavior</label>
            <select
              className="w-full border-gray-300 rounded-lg p-2"
              value={(config as any).scroll_behavior || "manual"}
              onChange={(e) => setConfig({ ...(config as any), scroll_behavior: e.target.value } as any)}
            >
              <option value="manual">Manual Scroll (Arrows)</option>
              <option value="auto">Auto Slide</option>
            </select>
          </div>

          {(config as any).scroll_behavior === "auto" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Interval (ms)</label>
              <input
                type="number"
                className="w-full border-gray-300 rounded-lg p-2"
                value={(config as any).auto_slide_interval || 3000}
                onChange={(e) =>
                  setConfig({ ...(config as any), auto_slide_interval: parseInt(e.target.value) || 3000 } as any)
                }
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Visible To</label>
            <div className="flex gap-2">
              {[UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER].map((r: any) => (
                <button
                  data-testid={`trending-role-${String(r).toLowerCase()}`}
                  key={`${(config as any).id}-${r}`}
                  onClick={() => toggleVisibility(r)}
                  className={`px-3 py-1 rounded text-xs border capitalize ${
                    ensureArray<any>((config as any).visibility).includes(r)
                      ? "bg-blue-100 text-blue-700 border-blue-200"
                      : "bg-white text-gray-500 border-gray-200"
                  }`}
                >
                  {String(r)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col h-[400px]">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h4 className="font-bold text-gray-900 text-sm">Select Categories</h4>
              <p className="text-xs text-gray-500">
                Selected: {ensureArray<string>((config as any).category_ids).length}
              </p>
            </div>
            <button
              onClick={handleAutoFill}
              disabled={isAnalyzing}
              className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-md hover:bg-purple-700 transition flex items-center disabled:opacity-70"
            >
              {isAnalyzing ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Sparkles className="w-3 h-3 mr-1" />
              )}
              Auto-Fill from Trends
            </button>
          </div>

          <div className="mb-2 relative">
            <SearchIcon className="w-4 h-4 absolute left-2 top-2 text-gray-400" />
            <input
              type="text"
              placeholder="Filter categories..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg"
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
            />
          </div>

          <div className="overflow-y-auto space-y-2 flex-1 pr-1">
            {filteredCategories.map((cat: any) => (
              <div
                key={`category-${cat.id}`}
                data-testid={`trending-category-${cat.id}`}
                onClick={() => toggleCategory(cat.id)}
                className={`flex items-center justify-between p-2 rounded cursor-pointer border hover:bg-blue-50/50 ${
                  ensureArray<string>((config as any).category_ids).includes(cat.id)
                    ? "bg-blue-50 border-blue-200"
                    : "bg-white border-gray-200"
                }`}
              >
                <span className="text-sm font-medium">{cat.name}</span>
                {ensureArray<string>((config as any).category_ids).includes(cat.id) && (
                  <Check className="w-4 h-4 text-blue-600" />
                )}
              </div>
            ))}

            {filteredCategories.length === 0 && (
              <p className="text-center text-xs text-gray-400 py-4">
                {allCategories.length === 0 ? "No categories available" : "No categories match your search"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
// -------------------------
// 3) Slider Manager (kept simple)
// -------------------------
const SliderManager = () => {
  const { showNotification } = useNotification();

  const [slides, setSlides] = useState<HomeSlide[]>([]);
  const [editingSlide, setEditingSlide] = useState<Partial<HomeSlide> | null>(null);
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);

  const normalizeColorValue = (value: unknown) => {
    const color = String(value || "").trim();
    return /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(color) ? color : "#000000";
  };

  useEffect(() => {
    (async () => {
      const data = await CMSService.getHomeSlides();
      setSlides(ensureArray(data));
    })();
  }, []);

  const reload = async () => {
    const data = await CMSService.getHomeSlides();
    setSlides(ensureArray(data));
  };

  const handleCreate = () => {
    const color = "#000000";
    setEditingSlide({
      id: `slide-${uid()}`,
      mediaType: "image" as any,
      mediaUrl: "",
      isActive: true,
      sortOrder: slides.length + 1,
      roleVisibility: [UserRole.GUEST, UserRole.EMPLOYER] as any,
      backgroundColor: color,
      background_color: color as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);
  };

  const handleFileSelect = (file: UploadedFile) => {
    if (!editingSlide) return;
    setEditingSlide({
      ...editingSlide,
      mediaUrl: file.url,
      fileId: file.id,
      mediaType: file.type?.startsWith("video") ? ("video" as any) : ("image" as any),
    } as any);
    setIsFilePickerOpen(false);
  };

  const handleSave = async () => {
    const mediaUrl = (editingSlide as any)?.mediaUrl || (editingSlide as any)?.media_url || "";
    if (!mediaUrl) {
      showNotification("error", "Missing media", "Please select an image/video.");
      return;
    }

    const color = normalizeColorValue(
      (editingSlide as any)?.backgroundColor || (editingSlide as any)?.background_color
    );
    const payload = {
      ...editingSlide,
      mediaUrl,
      media_url: mediaUrl,
      backgroundColor: color,
      background_color: color,
    } as any;

    try {
      await CMSService.saveHomeSlide(payload);
      setEditingSlide(null);
      await reload();
      showNotification("success", "Saved", "Slide updated and is now live.");
    } catch (e: any) {
      console.error(e);
      showNotification("error", "Error", e?.message || "Failed to save slide");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this slide?")) return;
    try {
      await CMSService.deleteHomeSlide(id);
      await reload();
      showNotification("success", "Deleted", "Slide deleted and is now live.");
    } catch (e: any) {
      console.error(e);
      showNotification("error", "Error", e?.message || "Failed to delete slide");
    }
  };

  const moveSlide = async (index: number, dir: "up" | "down") => {
    if ((dir === "up" && index === 0) || (dir === "down" && index === slides.length - 1)) return;

    const newSlides = [...slides];
    const swap = dir === "up" ? index - 1 : index + 1;
    [newSlides[index], newSlides[swap]] = [newSlides[swap], newSlides[index]];
    newSlides.forEach((s: any, i: number) => (s.sortOrder = i + 1));

    try {
      await CMSService.updateHomeSlideOrder(newSlides as any);
      await reload();
      showNotification("success", "Updated", "Slide order updated and is now live.");
    } catch (e: any) {
      console.error(e);
      showNotification("error", "Error", e?.message || "Failed to update slide order");
      await reload();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h4 className="font-bold text-gray-900">Manage Slides</h4>
        <button onClick={handleCreate} className="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 w-full sm:w-auto">
          + Add Slide
        </button>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        {slides.map((slide: any, idx: number) => (
          <div key={slide.id} className="admin-slide-row flex flex-col gap-3 p-4 border-b last:border-0 hover:bg-gray-50 sm:flex-row sm:items-center">
            <div className="admin-slide-order-controls flex flex-row sm:flex-col gap-1 sm:mr-4">
              <button onClick={() => moveSlide(idx, "up")} className="text-gray-400 hover:text-blue-600">
                <ChevronUp className="w-4 h-4" />
              </button>
              <button onClick={() => moveSlide(idx, "down")} className="text-gray-400 hover:text-blue-600">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            <img
              src={slide.mediaUrl || slide.media_url || ""}
              className="admin-slide-thumbnail w-full h-36 sm:w-24 sm:h-16 object-cover rounded bg-gray-200 sm:mr-4"
            />

            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{slide.title || "Untitled"}</div>
              <div className="text-xs text-gray-500 break-all">{slide.redirectUrl || slide.redirect_url || ""}</div>
            </div>

            <div className="admin-slide-actions flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  const color = normalizeColorValue((slide as any).backgroundColor || (slide as any).background_color);
                  const mediaUrl = (slide as any).mediaUrl || (slide as any).media_url || "";
                  setEditingSlide({
                    ...(slide as any),
                    mediaUrl,
                    media_url: mediaUrl,
                    backgroundColor: color,
                    background_color: color
                  } as any);
                }}
                className="p-2 bg-white border rounded text-blue-600 hover:bg-blue-50"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(slide.id)}
                className="p-2 bg-white border rounded text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {slides.length === 0 && <div className="p-8 text-center text-gray-500">No slides yet. Click "Add Slide".</div>}
      </div>

      {/* Slide Editor Modal */}
      {editingSlide && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[92dvh] overflow-y-auto p-4 sm:p-6 shadow-2xl">
            <h3 className="font-bold text-lg mb-4">Edit Slide</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed p-4 rounded-lg text-center cursor-pointer hover:bg-gray-50"
                  onClick={() => setIsFilePickerOpen(true)}
                >
                  {editingSlide.mediaUrl ? (
                    <img src={editingSlide.mediaUrl as any} className="h-32 mx-auto object-contain" />
                  ) : (
                    <div className="py-8 text-gray-400">Select Image/Video</div>
                  )}
                </div>
                <input
                  className="w-full border rounded p-2"
                  placeholder="Title"
                  value={(editingSlide as any).title || ""}
                  onChange={(e) => setEditingSlide({ ...editingSlide, title: e.target.value } as any)}
                />
                <input
                  className="w-full border rounded p-2"
                  placeholder="Subtitle"
                  value={(editingSlide as any).subtitle || ""}
                  onChange={(e) => setEditingSlide({ ...editingSlide, subtitle: e.target.value } as any)}
                />
                <input
                  className="w-full border rounded p-2"
                  placeholder="Redirect URL"
                  value={(editingSlide as any).redirectUrl || ""}
                  onChange={(e) => setEditingSlide({ ...editingSlide, redirectUrl: e.target.value } as any)}
                />
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold mb-1">Background Color</label>
                  <input
                    type="color"
                    className="w-full h-10 p-0 border-0 rounded cursor-pointer"
                    value={normalizeColorValue((editingSlide as any).backgroundColor || (editingSlide as any).background_color)}
                    onChange={(e) => {
                      const color = normalizeColorValue(e.target.value);
                      setEditingSlide({ ...editingSlide, backgroundColor: color, background_color: color } as any);
                    }}
                  />
                </div>

                <div className="flex items-center pt-4">
                  <input
                    type="checkbox"
                    checked={(editingSlide as any).isActive !== false}
                    onChange={(e) => setEditingSlide({ ...editingSlide, isActive: e.target.checked } as any)}
                    className="mr-2"
                  />{" "}
                  Active
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button onClick={() => setEditingSlide(null)} className="px-4 py-2 border rounded w-full sm:w-auto">
                Cancel
              </button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded font-bold w-full sm:w-auto">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <FilePickerModal
        isOpen={isFilePickerOpen}
        onClose={() => setIsFilePickerOpen(false)}
        onSelect={handleFileSelect}
        acceptedTypes="image/*,video/*"
        role="admin"
      />
    </div>
  );
};
// -------------------------
// 4) Layout Manager (kept from your structure)
// -------------------------
const LayoutManager = () => {
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const { showNotification } = useNotification();
  const [editingSection, setEditingSection] = useState<HomepageSection | null>(null);
  const [newSectionType, setNewSectionType] = useState<HomepageSectionType>("cta");

  useEffect(() => {
    (async () => {
      const data = await CMSService.getHomepageSections();
      setSections(ensureArray(data));
    })();
  }, []);

  const loadSections = async () => {
    const data = await CMSService.getHomepageSections();
    setSections(ensureArray(data));
  };

  const toggleActive = async (id: string) => {
    const section: any = sections.find((s: any) => s.id === id);
    if (!section) return;

    const currentActive = section.isActive !== false && section.is_active !== false;
    const updated = { ...section, isActive: !currentActive, is_active: !currentActive };

    try {
      await CMSService.saveHomepageSection(updated);
      await loadSections();
      showNotification("success", "Updated", "Section status updated and is now live.");
    } catch (e) {
      console.error(e);
      showNotification("error", "Error", "Failed to update section status.");
      await loadSections();
    }
  };

  const moveSection = async (index: number, dir: "up" | "down") => {
    if ((dir === "up" && index === 0) || (dir === "down" && index === sections.length - 1)) return;

    const newSections: any[] = [...sections];
    const swap = dir === "up" ? index - 1 : index + 1;
    [newSections[index], newSections[swap]] = [newSections[swap], newSections[index]];
    newSections.forEach((s, i) => {
      s.position = i + 1;
      s.sortOrder = i + 1;
    });

    try {
      await CMSService.updateSectionOrder(newSections);
      await loadSections();
      showNotification("success", "Updated", "Section order updated and is now live.");
    } catch (e) {
      console.error(e);
      showNotification("error", "Error", "Failed to update section order.");
      await loadSections();
    }
  };

  const handleSaveEdit = async () => {
    if (!editingSection) return;
    try {
      await CMSService.saveHomepageSection(editingSection as any);
      setEditingSection(null);
      await loadSections();
      showNotification("success", "Saved", "Section updated and is now live.");
    } catch (e) {
      console.error(e);
      showNotification("error", "Error", "Failed to save section.");
    }
  };

  const getTargetRoles = (section: any) =>
    ensureArray<UserRole>(section?.targeting?.roles ?? section?.target_roles ?? section?.roles);

  const toggleTargetRole = (role: UserRole) => {
    if (!editingSection) return;
    const current = getTargetRoles(editingSection as any);
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
    setEditingSection({
      ...(editingSection as any),
      targeting: { ...((editingSection as any).targeting || {}), roles: next },
      target_roles: next,
      roles: next,
    } as any);
  };

  const updateEditingContent = (patch: Record<string, any>) => {
    if (!editingSection) return;
    const current = (editingSection as any).content || {};
    setEditingSection({ ...(editingSection as any), content: { ...current, ...patch } } as any);
  };

  const sectionTypes: HomepageSectionType[] = [
    "hero",
    "member_home",
    "trust",
    "categories",
    "how_it_works",
    "featured",
    "cta",
    "skill_matching",
    "trending_opps",
    "growth_dash",
    "gig_creation",
    "market_insights",
    "project_brief_generator",
    "top_pro_services",
    "trust_security",
    "popular_services",
    "promo_banners",
    "trust_value",
    "video_feature",
    "marketplace_tiles",
    "guides_grid",
    "made_on_Scrolith",
    "footer_cta_strip",
  ];

  const memberHomeContent = editingSection?.type === "member_home"
    ? ((editingSection as any).content || {})
    : {};
  const projectBriefContent = editingSection?.type === "project_brief_generator"
    ? ((editingSection as any).content || {})
    : {};
  const gigCreationContent = editingSection?.type === "gig_creation"
    ? ((editingSection as any).content || {})
    : {};

  const memberHomeToggles: { key: string; label: string }[] = [
    { key: "showSearch", label: "Search bar" },
    { key: "showStories", label: "Stories strip" },
    { key: "showComposer", label: "Post composer" },
    { key: "showSlider", label: "Highlights slider" },
    { key: "showMessages", label: "Messages preview" },
    { key: "showProfiles", label: "Recommended profiles" },
    { key: "showJobs", label: "Jobs panel" },
    { key: "showGigs", label: "Gigs panel" },
    { key: "showEmployers", label: "Employers panel" },
    { key: "showFreelancers", label: "Freelancers panel" },
    { key: "showDiscover", label: "Discover tab" },
    { key: "showFollowing", label: "Following tab" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-gray-900">Homepage Sections</h3>
        <div className="flex items-center gap-2">
          <select
            className="border rounded px-2 py-1 text-xs"
            value={newSectionType}
            onChange={(e) => setNewSectionType(e.target.value as HomepageSectionType)}
          >
            {sectionTypes.map((t) => (
              <option key={`new-${t}`} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            onClick={async () => {
              try {
                await CMSService.addHomepageSection(newSectionType as any);
                showNotification("success", "Added", "New section added. Edit it to customize.");
                await loadSections();
              } catch (e) {
                console.error(e);
                showNotification("error", "Error", "Failed to add section.");
              }
            }}
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
          >
            + Add Section
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        {sections.map((section: any, idx: number) => (
          <div
            key={section.id}
            className={`flex items-center p-4 border-b last:border-0 hover:bg-gray-50 ${
              section.isActive === false ? "opacity-50 bg-gray-50" : ""
            }`}
          >
            <div className="flex flex-col mr-4 text-gray-400">
              <button onClick={() => moveSection(idx, "up")} className="hover:text-blue-600">
                <ChevronUp className="w-4 h-4" />
              </button>
              <button onClick={() => moveSection(idx, "down")} className="hover:text-blue-600">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1">
              <div className="flex items-center">
                <span className="font-bold text-sm mr-2">{section.name || section.id}</span>
                <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded uppercase">
                  {section.type}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">ID: {section.id}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleActive(section.id)}
                className={`p-2 rounded ${
                  section.isActive !== false ? "text-green-600 bg-green-50" : "text-gray-400 bg-gray-100"
                }`}
                title="Toggle active"
              >
                {section.isActive !== false ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              </button>

              <button
                onClick={() => setEditingSection(section)}
                className="p-2 bg-white border rounded text-blue-600 hover:bg-blue-50"
              >
                <Edit2 className="w-4 h-4" />
              </button>

              <button
                onClick={async () => {
                  if (!confirm(`Delete section "${section.name || section.id}"? This cannot be undone.`)) return;
                  try {
                    await CMSService.deleteHomepageSection(section.id);
                    showNotification("success", "Deleted", "Section deleted and is now live.");
                    await loadSections();
                  } catch (e) {
                    console.error(e);
                    showNotification("error", "Error", "Failed to delete section.");
                  }
                }}
                className="p-2 bg-white border rounded text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingSection && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex justify-between mb-4">
              <h3 className="font-bold text-lg">Edit Section: {(editingSection as any).name}</h3>
              <button onClick={() => setEditingSection(null)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              <div>
                <label className="block text-xs font-bold mb-1">Name (Internal)</label>
                <input
                  className="w-full border rounded p-2"
                  value={(editingSection as any).name || ""}
                  onChange={(e) => setEditingSection({ ...(editingSection as any), name: e.target.value } as any)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Type</label>
                <select
                  className="w-full border rounded p-2"
                  value={(editingSection as any).type}
                  onChange={(e) => setEditingSection({ ...(editingSection as any), type: e.target.value } as any)}
                >
                  {sectionTypes.map((t) => (
                    <option key={`${(editingSection as any).id}-${t}`} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold mb-2">Visible To Roles</label>
                <div className="flex flex-wrap gap-2">
                  {[UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN].map((role: any) => {
                    const selected = getTargetRoles(editingSection as any).includes(role);
                    return (
                      <button
                        key={`${(editingSection as any).id}-${role}`}
                        onClick={() => toggleTargetRole(role)}
                        className={`text-[10px] px-2 py-1 rounded uppercase border ${
                          selected ? "bg-blue-100 text-blue-700 border-blue-200 font-bold" : "bg-white text-gray-400 border-gray-200"
                        }`}
                      >
                        {String(role).charAt(0)}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Leave empty to show all roles.</p>
              </div>

              {(editingSection as any).type === "member_home" && (
                <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                  <div className="text-[10px] font-bold uppercase text-gray-500">Member Home Settings</div>
                  <div className="grid gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Section Title</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={memberHomeContent.title || ""}
                        onChange={(e) => updateEditingContent({ title: e.target.value })}
                        placeholder="Grow your professional world"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Section Subtitle</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={memberHomeContent.subtitle || ""}
                        onChange={(e) => updateEditingContent({ subtitle: e.target.value })}
                        placeholder="Catch up on your network, opportunities, and community highlights."
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Search Placeholder</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={memberHomeContent.searchPlaceholder || ""}
                        onChange={(e) => updateEditingContent({ searchPlaceholder: e.target.value })}
                        placeholder="Search posts, jobs, gigs, people, or pages"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Search Hint</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={memberHomeContent.searchHint || ""}
                        onChange={(e) => updateEditingContent({ searchHint: e.target.value })}
                        placeholder="Search across posts, jobs, gigs, people, and pages."
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Topics (comma separated)</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={(memberHomeContent.topics || []).join(", ")}
                        onChange={(e) =>
                          updateEditingContent({
                            topics: e.target.value
                              .split(",")
                              .map((t: string) => t.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="Design, Marketing, Development"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Regions / Cities (comma separated)</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={(memberHomeContent.regions || []).join(", ")}
                        onChange={(e) =>
                          updateEditingContent({
                            regions: e.target.value
                              .split(",")
                              .map((t: string) => t.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="Lagos, Accra, Nairobi"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Composer Title</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={memberHomeContent.composerTitle || ""}
                        onChange={(e) => updateEditingContent({ composerTitle: e.target.value })}
                        placeholder="Share a quick update or idea with your network."
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Stories Title</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={memberHomeContent.storyTitle || ""}
                        onChange={(e) => updateEditingContent({ storyTitle: e.target.value })}
                        placeholder="Stories"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Feed Title</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={memberHomeContent.feedTitle || ""}
                        onChange={(e) => updateEditingContent({ feedTitle: e.target.value })}
                        placeholder="Home feed"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Profiles Title</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={memberHomeContent.profilesTitle || ""}
                        onChange={(e) => updateEditingContent({ profilesTitle: e.target.value })}
                        placeholder="Recommended profiles"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Jobs Title</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={memberHomeContent.jobsTitle || ""}
                        onChange={(e) => updateEditingContent({ jobsTitle: e.target.value })}
                        placeholder="Job recommendations"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Gigs Title</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={memberHomeContent.gigsTitle || ""}
                        onChange={(e) => updateEditingContent({ gigsTitle: e.target.value })}
                        placeholder="Gigs you can hire"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Employers Title</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={memberHomeContent.employersTitle || ""}
                        onChange={(e) => updateEditingContent({ employersTitle: e.target.value })}
                        placeholder="Employers to follow"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Freelancers Title</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={memberHomeContent.freelancersTitle || ""}
                        onChange={(e) => updateEditingContent({ freelancersTitle: e.target.value })}
                        placeholder="Freelancers to connect"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Messages Title</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={memberHomeContent.messagesTitle || ""}
                        onChange={(e) => updateEditingContent({ messagesTitle: e.target.value })}
                        placeholder="Recent messages"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Slider Title</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={memberHomeContent.sliderTitle || ""}
                        onChange={(e) => updateEditingContent({ sliderTitle: e.target.value })}
                        placeholder="Highlights"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-3">
                    <p className="text-[11px] font-semibold text-gray-700">Featured Quick Actions (Scrolitha)</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Featured Label</label>
                        <input
                          className="w-full border rounded p-2 text-sm"
                          value={memberHomeContent.featuredActionsTitle || ""}
                          onChange={(e) => updateEditingContent({ featuredActionsTitle: e.target.value })}
                          placeholder="Featured"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Project Brief Label</label>
                        <input
                          className="w-full border rounded p-2 text-sm"
                          value={memberHomeContent.projectBriefQuickActionTitle || ""}
                          onChange={(e) => updateEditingContent({ projectBriefQuickActionTitle: e.target.value })}
                          placeholder="Scrolitha Project Brief"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Project Brief Text</label>
                        <input
                          className="w-full border rounded p-2 text-sm"
                          value={memberHomeContent.projectBriefQuickActionSubtitle || ""}
                          onChange={(e) => updateEditingContent({ projectBriefQuickActionSubtitle: e.target.value })}
                          placeholder="Draft a professional project brief with AI"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Gig Creation Label</label>
                        <input
                          className="w-full border rounded p-2 text-sm"
                          value={memberHomeContent.gigCreationQuickActionTitle || ""}
                          onChange={(e) => updateEditingContent({ gigCreationQuickActionTitle: e.target.value })}
                          placeholder="Scrolitha Gig Creation"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Gig Creation Text</label>
                        <input
                          className="w-full border rounded p-2 text-sm"
                          value={memberHomeContent.gigCreationQuickActionSubtitle || ""}
                          onChange={(e) => updateEditingContent({ gigCreationQuickActionSubtitle: e.target.value })}
                          placeholder="Generate your gig setup with AI guidance"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-2">Visibility Toggles</label>
                    <div className="grid grid-cols-2 gap-2">
                      {memberHomeToggles.map((toggle) => {
                        const current = memberHomeContent[toggle.key];
                        return (
                          <label key={toggle.key} className="flex items-center gap-2 text-[11px] text-gray-600">
                            <input
                              type="checkbox"
                              checked={current !== false}
                              onChange={(e) => updateEditingContent({ [toggle.key]: e.target.checked })}
                            />
                            {toggle.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: "maxFeedItems", label: "Max feed" },
                      { key: "maxStories", label: "Max stories" },
                      { key: "maxMessages", label: "Max messages" },
                      { key: "maxSearchResults", label: "Max search" },
                      { key: "maxProfiles", label: "Max profiles" },
                      { key: "maxJobs", label: "Max jobs" },
                      { key: "maxGigs", label: "Max gigs" },
                    ].map((item) => (
                      <div key={item.key}>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">{item.label}</label>
                        <input
                          type="number"
                          min={1}
                          className="w-full border rounded p-2 text-sm"
                          value={memberHomeContent[item.key] ?? ""}
                          onChange={(e) => updateEditingContent({ [item.key]: Number(e.target.value || 0) })}
                          placeholder="8"
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Slider Items (JSON array)</label>
                    <textarea
                      className="w-full border rounded p-2 font-mono text-xs h-28"
                      value={JSON.stringify(memberHomeContent.sliderItems || [], null, 2)}
                      onChange={(e) => {
                        try {
                          updateEditingContent({ sliderItems: JSON.parse(e.target.value) });
                        } catch {
                          // ignore invalid json while typing
                        }
                      }}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Use uploaded file URLs for imageUrl or videoUrl. Leave empty to use Community sliders.</p>
                  </div>
                </div>
              )}

              {(editingSection as any).type === "project_brief_generator" && (
                <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                  <div className="text-[10px] font-bold uppercase text-gray-500">Scrolitha Project Brief Generator</div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Badge Label</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={projectBriefContent.badgeLabel ?? projectBriefContent.badge_label ?? ""}
                        onChange={(e) => updateEditingContent({ badgeLabel: e.target.value, badge_label: e.target.value })}
                        placeholder="Scrolitha AI Project Assistant"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Input Placeholder</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={projectBriefContent.inputPlaceholder ?? projectBriefContent.input_placeholder ?? ""}
                        onChange={(e) =>
                          updateEditingContent({ inputPlaceholder: e.target.value, input_placeholder: e.target.value })
                        }
                        placeholder="e.g. I need a modern logo for my coffee shop..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Section Title</label>
                    <input
                      className="w-full border rounded p-2 text-sm"
                      value={projectBriefContent.title || ""}
                      onChange={(e) => updateEditingContent({ title: e.target.value })}
                      placeholder="Not sure where to start?"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Section Subtitle</label>
                    <textarea
                      className="w-full border rounded p-2 text-sm h-20"
                      value={projectBriefContent.subtitle || ""}
                      onChange={(e) => updateEditingContent({ subtitle: e.target.value })}
                      placeholder="Describe your project in simple words. Scrolitha drafts a professional brief..."
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Primary Button (Logged-in)</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={projectBriefContent.buttonText ?? projectBriefContent.button_text ?? ""}
                        onChange={(e) => updateEditingContent({ buttonText: e.target.value, button_text: e.target.value })}
                        placeholder="Build Brief"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Primary Button (Guest)</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={projectBriefContent.guestButtonText ?? projectBriefContent.guest_button_text ?? ""}
                        onChange={(e) =>
                          updateEditingContent({
                            guestButtonText: e.target.value,
                            guest_button_text: e.target.value,
                          })
                        }
                        placeholder="Login to Build Brief"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Helper Text (Logged-in)</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={projectBriefContent.helperText ?? projectBriefContent.helper_text ?? ""}
                        onChange={(e) => updateEditingContent({ helperText: e.target.value, helper_text: e.target.value })}
                        placeholder="Takes ~5 seconds. Scrolitha will draft your project brief instantly."
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Helper Text (Guest)</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={projectBriefContent.guestHelperText ?? projectBriefContent.guest_helper_text ?? ""}
                        onChange={(e) =>
                          updateEditingContent({
                            guestHelperText: e.target.value,
                            guest_helper_text: e.target.value,
                          })
                        }
                        placeholder="Login or register to generate your brief and continue to posting."
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Login Button Label</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={projectBriefContent.loginButtonText ?? projectBriefContent.login_button_text ?? ""}
                        onChange={(e) =>
                          updateEditingContent({ loginButtonText: e.target.value, login_button_text: e.target.value })
                        }
                        placeholder="Login"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Register Button Label</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={projectBriefContent.registerButtonText ?? projectBriefContent.register_button_text ?? ""}
                        onChange={(e) =>
                          updateEditingContent({
                            registerButtonText: e.target.value,
                            register_button_text: e.target.value,
                          })
                        }
                        placeholder="Register"
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-gray-500">
                    Guests can type in the prompt, but completion is gated to Login/Register before brief generation.
                  </p>
                </div>
              )}

              {(editingSection as any).type === "gig_creation" && (
                <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                  <div className="text-[10px] font-bold uppercase text-gray-500">Scrolitha Gig Creation</div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Badge Label</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={gigCreationContent.badgeLabel ?? gigCreationContent.badge_label ?? ""}
                        onChange={(e) => updateEditingContent({ badgeLabel: e.target.value, badge_label: e.target.value })}
                        placeholder="Scrolitha Gig Assistant"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Primary Button (Logged-in)</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={gigCreationContent.buttonText ?? gigCreationContent.button_text ?? ""}
                        onChange={(e) => updateEditingContent({ buttonText: e.target.value, button_text: e.target.value })}
                        placeholder="Create Gig with AI"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Headline</label>
                    <input
                      className="w-full border rounded p-2 text-sm"
                      value={gigCreationContent.headline || ""}
                      onChange={(e) => updateEditingContent({ headline: e.target.value })}
                      placeholder="Create a Gig That Gets Hired"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Subheadline</label>
                    <textarea
                      className="w-full border rounded p-2 text-sm h-20"
                      value={gigCreationContent.subheadline || ""}
                      onChange={(e) => updateEditingContent({ subheadline: e.target.value })}
                      placeholder="Let Scrolitha help you craft your service offering..."
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Primary Button (Guest)</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={gigCreationContent.guestButtonText ?? gigCreationContent.guest_button_text ?? ""}
                        onChange={(e) =>
                          updateEditingContent({
                            guestButtonText: e.target.value,
                            guest_button_text: e.target.value,
                          })
                        }
                        placeholder="Login to Create Gig with AI"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Helper Text (Logged-in)</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={gigCreationContent.helperText ?? gigCreationContent.helper_text ?? ""}
                        onChange={(e) => updateEditingContent({ helperText: e.target.value, helper_text: e.target.value })}
                        placeholder="Scrolitha will guide you through gig setup and positioning."
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Helper Text (Guest)</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={gigCreationContent.guestHelperText ?? gigCreationContent.guest_helper_text ?? ""}
                        onChange={(e) =>
                          updateEditingContent({
                            guestHelperText: e.target.value,
                            guest_helper_text: e.target.value,
                          })
                        }
                        placeholder="Login or register to continue with Scrolitha gig creation."
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Login Button Label</label>
                        <input
                          className="w-full border rounded p-2 text-sm"
                          value={gigCreationContent.loginButtonText ?? gigCreationContent.login_button_text ?? ""}
                          onChange={(e) =>
                            updateEditingContent({
                              loginButtonText: e.target.value,
                              login_button_text: e.target.value,
                            })
                          }
                          placeholder="Login"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Register Button Label</label>
                        <input
                          className="w-full border rounded p-2 text-sm"
                          value={gigCreationContent.registerButtonText ?? gigCreationContent.register_button_text ?? ""}
                          onChange={(e) =>
                            updateEditingContent({
                              registerButtonText: e.target.value,
                              register_button_text: e.target.value,
                            })
                          }
                          placeholder="Register"
                        />
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-gray-500">
                    Guests must Login/Register before completing AI gig creation from this section.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold mb-1">Content (JSON)</label>
                <textarea
                  className="w-full border rounded p-2 font-mono text-xs h-48"
                  value={JSON.stringify((editingSection as any).content || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      setEditingSection({ ...(editingSection as any), content: JSON.parse(e.target.value) } as any);
                    } catch {
                      // ignore invalid json while typing
                    }
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Style (JSON)</label>
                <textarea
                  className="w-full border rounded p-2 font-mono text-xs h-32"
                  value={JSON.stringify((editingSection as any).style || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      setEditingSection({ ...(editingSection as any), style: JSON.parse(e.target.value) } as any);
                    } catch {
                      // ignore invalid json while typing
                    }
                  }}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setEditingSection(null)} className="px-4 py-2 border rounded">
                Cancel
              </button>
              <button onClick={handleSaveEdit} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
// -------------------------
// 5) Footer Builder
// -------------------------
const normalizeVisibilityRoute = (value: string) => {
  let normalized = String(value || "").trim();
  if (!normalized) return "";

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    try {
      normalized = new URL(normalized).pathname || "/";
    } catch {
      return "";
    }
  }

  if (normalized !== "*" && !normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  if (normalized.length > 1 && normalized.endsWith("/") && !normalized.endsWith("/*")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
};

const parseVisibilityRoutes = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((entry) => normalizeVisibilityRoute(String(entry || "")))
          .filter(Boolean)
      )
    );
  }

  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(/[\n,]/)
          .map((entry) => normalizeVisibilityRoute(entry))
          .filter(Boolean)
      )
    );
  }

  return [];
};

const formatVisibilityRoutes = (value: unknown): string => parseVisibilityRoutes(value).join("\n");

const FooterBuilder = () => {
  const { showNotification } = useNotification();
  const { settings } = useContent();
  const [config, setConfig] = useState<FooterConfig | null>(null);
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [footerHiddenRoutesInput, setFooterHiddenRoutesInput] = useState("");
  const [supportWidgetHiddenRoutesInput, setSupportWidgetHiddenRoutesInput] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await CMSService.getFooterConfig();
        setConfig(normalizeFooterConfig(data));
      } catch (e) {
        console.error(e);
        showNotification("error", "Error", "Failed to load footer configuration");
      }
    })();
  }, []);

  useEffect(() => {
    const uiVisibility =
      ((settings as any)?.uiVisibility || (settings as any)?.ui_visibility || {}) as Record<string, any>;
    const footerRoutes =
      uiVisibility.footerHiddenRoutes ??
      uiVisibility.footer_hidden_routes ??
      (settings as any)?.footerHiddenRoutes ??
      (settings as any)?.footer_hidden_routes ??
      [];
    const supportRoutes =
      uiVisibility.supportWidgetHiddenRoutes ??
      uiVisibility.support_widget_hidden_routes ??
      uiVisibility.chatWidgetHiddenRoutes ??
      uiVisibility.chat_widget_hidden_routes ??
      (settings as any)?.supportWidgetHiddenRoutes ??
      (settings as any)?.support_widget_hidden_routes ??
      [];

    setFooterHiddenRoutesInput(formatVisibilityRoutes(footerRoutes));
    setSupportWidgetHiddenRoutesInput(formatVisibilityRoutes(supportRoutes));
  }, [settings]);

  const reload = async () => {
    const data = await CMSService.getFooterConfig();
    setConfig(normalizeFooterConfig(data));
  };

  const handleFileSelect = (file: UploadedFile) => {
    if (!config) return;
    setConfig({ ...config, logo_url: file.url } as any);
    setIsFilePickerOpen(false);
  };

  const updateContact = (field: "admin_email" | "support_email" | "ticket_route", value: string) => {
    if (!config) return;
    const nextContact = { ...(config as any).contact, [field]: value };
    setConfig({ ...config, contact: nextContact } as any);
  };

  const addColumn = () => {
    if (!config) return;
    const columns = ensureArray<any>(config.columns);
    setConfig({
      ...config,
      columns: [...columns, { id: `footer-col-${uid()}`, title: "", links: [] }],
    } as any);
  };

  const moveColumn = (index: number, dir: "up" | "down") => {
    if (!config) return;
    const columns = [...ensureArray<any>(config.columns)];
    if ((dir === "up" && index === 0) || (dir === "down" && index === columns.length - 1)) return;
    const swap = dir === "up" ? index - 1 : index + 1;
    [columns[index], columns[swap]] = [columns[swap], columns[index]];
    setConfig({ ...config, columns } as any);
  };

  const updateColumnTitle = (id: string, value: string) => {
    if (!config) return;
    const columns = ensureArray<any>(config.columns).map((col: any) =>
      col.id === id ? { ...col, title: value } : col
    );
    setConfig({ ...config, columns } as any);
  };

  const removeColumn = (id: string) => {
    if (!config) return;
    const columns = ensureArray<any>(config.columns).filter((col: any) => col.id !== id);
    setConfig({ ...config, columns } as any);
  };

  const addLink = (columnId: string) => {
    if (!config) return;
    const columns = ensureArray<any>(config.columns).map((col: any) => {
      if (col.id !== columnId) return col;
      const links = ensureArray<any>(col.links);
      return {
        ...col,
        links: [...links, { id: `footer-link-${uid()}`, label: "", url: "", type: "internal", visibility: [] }],
      };
    });
    setConfig({ ...config, columns } as any);
  };

  const moveLink = (columnId: string, index: number, dir: "up" | "down") => {
    if (!config) return;
    const columns = ensureArray<any>(config.columns).map((col: any) => {
      if (col.id !== columnId) return col;
      const links = [...ensureArray<any>(col.links)];
      if ((dir === "up" && index === 0) || (dir === "down" && index === links.length - 1)) return col;
      const swap = dir === "up" ? index - 1 : index + 1;
      [links[index], links[swap]] = [links[swap], links[index]];
      return { ...col, links };
    });
    setConfig({ ...config, columns } as any);
  };

  const updateLink = (columnId: string, linkId: string, field: string, value: any) => {
    if (!config) return;
    const columns = ensureArray<any>(config.columns).map((col: any) => {
      if (col.id !== columnId) return col;
      const links = ensureArray<any>(col.links).map((link: any) =>
        link.id === linkId ? { ...link, [field]: value } : link
      );
      return { ...col, links };
    });
    setConfig({ ...config, columns } as any);
  };

  const toggleLinkRole = (columnId: string, linkId: string, role: UserRole) => {
    if (!config) return;
    const columns = ensureArray<any>(config.columns).map((col: any) => {
      if (col.id !== columnId) return col;
      const links = ensureArray<any>(col.links).map((link: any) => {
        if (link.id !== linkId) return link;
        const vis = normalizeRoleList(link.visibility);
        const next = vis.includes(role) ? vis.filter((r) => r !== role) : [...vis, role];
        return { ...link, visibility: next };
      });
      return { ...col, links };
    });
    setConfig({ ...config, columns } as any);
  };

  const removeLink = (columnId: string, linkId: string) => {
    if (!config) return;
    const columns = ensureArray<any>(config.columns).map((col: any) => {
      if (col.id !== columnId) return col;
      const links = ensureArray<any>(col.links).filter((link: any) => link.id !== linkId);
      return { ...col, links };
    });
    setConfig({ ...config, columns } as any);
  };

  const addSocial = () => {
    if (!config) return;
    const socials = ensureArray<any>(config.socials);
    setConfig({
      ...config,
      socials: [...socials, { id: `footer-social-${uid()}`, platform: "", url: "", icon: "", enabled: true }],
    } as any);
  };

  const updateSocial = (id: string, field: string, value: any) => {
    if (!config) return;
    const socials = ensureArray<any>(config.socials).map((social: any) =>
      social.id === id ? { ...social, [field]: value } : social
    );
    setConfig({ ...config, socials } as any);
  };

  const removeSocial = (id: string) => {
    if (!config) return;
    const socials = ensureArray<any>(config.socials).filter((social: any) => social.id !== id);
    setConfig({ ...config, socials } as any);
  };

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const platformSettings: any = { ...((settings as any) || {}) };
      delete platformSettings.system;
      const existingUiVisibility = (platformSettings.uiVisibility || platformSettings.ui_visibility || {}) as Record<string, any>;
      platformSettings.uiVisibility = {
        ...existingUiVisibility,
        footerHiddenRoutes: parseVisibilityRoutes(footerHiddenRoutesInput),
        supportWidgetHiddenRoutes: parseVisibilityRoutes(supportWidgetHiddenRoutesInput),
      };

      await CMSService.saveFooterConfig(config as any);
      await AdminService.savePlatformSettings(platformSettings);
      await reload();
      showNotification("success", "Saved", "Footer and visibility controls updated and live.");
    } catch (e: any) {
      console.error(e);
      showNotification("error", "Error", e?.message || "Failed to save footer settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" />
          <p className="text-gray-500">Loading footer configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-gray-900">Footer Builder</h3>
        <button
          onClick={handleSave}
          className="bg-blue-600 text-white px-4 py-2 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save Footer"}
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
        <h4 className="font-semibold text-gray-800">Branding & Copy</h4>

        <div className="flex items-center gap-4">
          <div
            className="border border-dashed rounded-lg p-3 w-24 h-24 flex items-center justify-center cursor-pointer hover:bg-gray-50"
            onClick={() => setIsFilePickerOpen(true)}
          >
            {(config as any).logo_url ? (
              <img src={(config as any).logo_url} className="max-h-full object-contain" alt="Footer logo" />
            ) : (
              <ImageIcon className="w-8 h-8 text-gray-400" />
            )}
          </div>
          <div className="flex-1 space-y-2">
            <input
              className="w-full border rounded p-2"
              value={config.description || ""}
              onChange={(e) => setConfig({ ...config, description: e.target.value } as any)}
              placeholder="Footer description"
            />
            <input
              className="w-full border rounded p-2"
              value={config.copyright || ""}
              onChange={(e) => setConfig({ ...config, copyright: e.target.value } as any)}
              placeholder="Footer copyright"
            />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
        <h4 className="font-semibold text-gray-800">Contact Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            className="border rounded p-2"
            value={(config as any).contact?.admin_email || ""}
            onChange={(e) => updateContact("admin_email", e.target.value)}
            placeholder="Admin email"
          />
          <input
            className="border rounded p-2"
            value={(config as any).contact?.support_email || ""}
            onChange={(e) => updateContact("support_email", e.target.value)}
            placeholder="Support email"
          />
          <input
            className="border rounded p-2"
            value={(config as any).contact?.ticket_route || ""}
            onChange={(e) => updateContact("ticket_route", e.target.value)}
            placeholder="/support"
          />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
        <h4 className="font-semibold text-gray-800">Visibility Controls By Route</h4>
        <p className="text-xs text-gray-500">
          Use one route per line. Supports exact paths (for example <code>/messages</code>) and wildcard prefixes
          (for example <code>/messages/*</code>).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Suppress Footer on routes</label>
            <textarea
              className="w-full border rounded p-2 font-mono text-xs h-32"
              value={footerHiddenRoutesInput}
              onChange={(e) => setFooterHiddenRoutesInput(e.target.value)}
              placeholder={"/messages\n/client/dashboard/*"}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Suppress Chat Widget on routes</label>
            <textarea
              className="w-full border rounded p-2 font-mono text-xs h-32"
              value={supportWidgetHiddenRoutesInput}
              onChange={(e) => setSupportWidgetHiddenRoutesInput(e.target.value)}
              placeholder={"/messages\n/community/chat/*"}
            />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="font-semibold text-gray-800">Footer Columns</h4>
          <button
            onClick={addColumn}
            className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded font-bold hover:bg-blue-100"
          >
            + Add Column
          </button>
        </div>

        {ensureArray<any>(config.columns).map((column: any, columnIndex: number) => (
          <div key={column.id} className="border border-gray-100 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => moveColumn(columnIndex, "up")}
                className="text-gray-400 hover:text-blue-600"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => moveColumn(columnIndex, "down")}
                className="text-gray-400 hover:text-blue-600"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <input
                className="flex-1 border rounded p-2"
                value={column.title || ""}
                onChange={(e) => updateColumnTitle(column.id, e.target.value)}
                placeholder="Column title"
              />
              <button
                onClick={() => removeColumn(column.id)}
                className="text-red-400 hover:text-red-600"
                title="Remove column"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {ensureArray<any>(column.links).map((link: any, linkIndex: number) => (
                <div key={link.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                  <div className="flex flex-col md:col-span-1 text-gray-400">
                    <button onClick={() => moveLink(column.id, linkIndex, "up")} className="hover:text-blue-600">
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button onClick={() => moveLink(column.id, linkIndex, "down")} className="hover:text-blue-600">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    className="border rounded px-2 py-2 text-sm md:col-span-3"
                    value={link.label || ""}
                    onChange={(e) => updateLink(column.id, link.id, "label", e.target.value)}
                    placeholder="Label"
                  />
                  <input
                    className="border rounded px-2 py-2 text-sm text-gray-600 md:col-span-5"
                    value={link.url || ""}
                    onChange={(e) => updateLink(column.id, link.id, "url", e.target.value)}
                    placeholder="/url"
                  />
                  <select
                    className="border rounded px-2 py-2 text-sm md:col-span-2"
                    value={link.type || "internal"}
                    onChange={(e) => updateLink(column.id, link.id, "type", e.target.value)}
                  >
                    <option value="internal">Internal</option>
                    <option value="external">External</option>
                  </select>
                  <button
                    onClick={() => removeLink(column.id, link.id)}
                    className="text-red-400 hover:text-red-600 p-2 md:col-span-1 justify-self-end"
                    title="Remove link"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="flex flex-wrap gap-2 md:col-span-12">
                    {[UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN].map((role: any) => {
                      const selected = normalizeRoleList(link.visibility).includes(role);
                      return (
                        <button
                          key={`${link.id}-${role}`}
                          onClick={() => toggleLinkRole(column.id, link.id, role)}
                          className={`text-[10px] px-2 py-1 rounded uppercase border ${
                            selected
                              ? "bg-blue-100 text-blue-700 border-blue-200 font-bold"
                              : "bg-white text-gray-400 border-gray-200"
                          }`}
                        >
                          {String(role).charAt(0)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {ensureArray<any>(column.links).length === 0 && (
                <p className="text-sm text-gray-500">No links yet.</p>
              )}
            </div>

            <button
              onClick={() => addLink(column.id)}
              className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded font-bold hover:bg-blue-100"
            >
              + Add Link
            </button>
          </div>
        ))}

        {ensureArray<any>(config.columns).length === 0 && (
          <p className="text-sm text-gray-500">No columns yet. Add a column to start.</p>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="font-semibold text-gray-800">Social Links</h4>
          <button
            onClick={addSocial}
            className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded font-bold hover:bg-blue-100"
          >
            + Add Social
          </button>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium text-gray-700">Social title heading</p>
            <p className="text-xs text-gray-500">Displayed above the social icons in the footer.</p>
          </div>
          <input
            className="w-full border rounded p-2 text-sm"
            value={config.social_label_title || ""}
            onChange={(e) => setConfig({ ...config, social_label_title: e.target.value } as any)}
            placeholder="e.g. Follow us"
          />
        </div>

        <div className="space-y-3">
          {ensureArray<any>(config.socials).map((social: any) => (
            <div key={social.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
              <input
                className="border rounded px-2 py-2 text-sm md:col-span-3"
                value={social.platform || ""}
                onChange={(e) => updateSocial(social.id, "platform", e.target.value)}
                placeholder="Platform"
              />
              <input
                className="border rounded px-2 py-2 text-sm md:col-span-5"
                value={social.url || ""}
                onChange={(e) => updateSocial(social.id, "url", e.target.value)}
                placeholder="https://"
              />
              <input
                className="border rounded px-2 py-2 text-sm md:col-span-3"
                value={social.icon || ""}
                onChange={(e) => updateSocial(social.id, "icon", e.target.value)}
                placeholder="Icon URL"
              />
              <button
                onClick={() => updateSocial(social.id, "enabled", !social.enabled)}
                className={`p-2 rounded md:col-span-1 ${
                  social.enabled !== false ? "text-green-600 bg-green-50" : "text-gray-400 bg-gray-100"
                }`}
                title="Toggle"
              >
                {social.enabled !== false ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button
                onClick={() => removeSocial(social.id)}
                className="text-red-400 hover:text-red-600 p-2 md:col-span-1 justify-self-end"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {ensureArray<any>(config.socials).length === 0 && (
            <p className="text-sm text-gray-500">No social links yet.</p>
          )}
        </div>
      </div>

      <FilePickerModal
        isOpen={isFilePickerOpen}
        onClose={() => setIsFilePickerOpen(false)}
        onSelect={handleFileSelect}
        acceptedTypes="image/*"
        role="admin"
      />
    </div>
  );
};

// -------------------------
// 6) AI Optimization (unchanged)
// -------------------------
const AIOptimization = () => (
  <div className="bg-white p-8 rounded-xl border border-gray-200 text-center">
    <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
      <Cpu className="w-8 h-8 text-indigo-600" />
    </div>
    <h3 className="text-lg font-bold text-gray-900">AI Layout Optimization</h3>
    <p className="text-gray-500 mb-6 max-w-md mx-auto">
      Let AI analyze user heatmaps and conversion data to automatically reorder homepage sections for maximum
      engagement.
    </p>
    <button className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700">
      Enable Auto-Optimize
    </button>
  </div>
);

// -------------------------
// 7) Analytics View (unchanged)
// -------------------------
const AnalyticsView = () => {
  const [stats, setStats] = useState<HomepageAnalytics | null>(null);

  useEffect(() => {
    CMSService.getHomepageAnalytics().then(setStats);
  }, []);

  if (!stats)
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" />
        <p className="text-gray-500">Loading analytics...</p>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-xs font-bold text-gray-500 uppercase">Page Views</div>
          <div className="text-2xl font-bold text-gray-900">{stats.views.toLocaleString()}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-xs font-bold text-gray-500 uppercase">CTA Clicks</div>
          <div className="text-2xl font-bold text-blue-600">{stats.ctaClicks.toLocaleString()}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-xs font-bold text-gray-500 uppercase">Bounce Rate</div>
          <div className="text-2xl font-bold text-red-500">{stats.bounceRate}%</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-xs font-bold text-gray-500 uppercase">Avg. Time</div>
          <div className="text-2xl font-bold text-green-600">{stats.avgTimeOnPage}s</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4">Device Breakdown</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Monitor className="w-4 h-4 mr-2 text-gray-500" /> Desktop
              </div>
              <div className="flex items-center w-2/3">
                <div className="h-2 bg-blue-600 rounded-full mr-2" style={{ width: `${stats.deviceBreakdown.desktop}%` }} />
                <span className="text-xs font-bold">{stats.deviceBreakdown.desktop}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Smartphone className="w-4 h-4 mr-2 text-gray-500" /> Mobile
              </div>
              <div className="flex items-center w-2/3">
                <div className="h-2 bg-green-500 rounded-full mr-2" style={{ width: `${stats.deviceBreakdown.mobile}%` }} />
                <span className="text-xs font-bold">{stats.deviceBreakdown.mobile}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Tablet className="w-4 h-4 mr-2 text-gray-500" /> Tablet
              </div>
              <div className="flex items-center w-2/3">
                <div className="h-2 bg-yellow-500 rounded-full mr-2" style={{ width: `${stats.deviceBreakdown.tablet}%` }} />
                <span className="text-xs font-bold">{stats.deviceBreakdown.tablet}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4">Top Sections</h3>
          <div className="space-y-3">
            {stats.sectionEngagement.map((sec, i) => (
              <div key={i} className="flex justify-between items-center border-b border-gray-100 pb-2 last:border-0">
                <span className="text-sm font-medium">{sec.name}</span>
                <div className="text-right">
                  <div className="text-xs font-bold text-gray-900">{sec.clicks} clicks</div>
                  <div className="text-[10px] text-gray-500">{sec.views} views</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomepageSettings;

