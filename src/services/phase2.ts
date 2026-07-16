import api from './api';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export type Phase2DiscoveryMode = 'for_you' | 'following' | 'hire' | 'sell' | 'learn' | 'local';

export type Phase2DiscoveryItem = {
  id: string;
  type: 'post' | 'job' | 'gig' | 'page' | 'person' | string;
  title: string;
  description?: string;
  url?: string;
  score?: number;
  why?: string[];
  tags?: string[];
  author?: any;
  page?: any;
  metrics?: Record<string, any>;
};

export type Phase2DiscoveryResponse = {
  mode: Phase2DiscoveryMode;
  query: string;
  generatedAt: string;
  counts: Record<string, number>;
  personalization: {
    viewerId?: string | null;
    followingUsers: number;
    followingPages: number;
    interestedSignals: number;
  };
  items: Phase2DiscoveryItem[];
};

export type Phase2TrustGraph = {
  user: any;
  graph: {
    followers: number;
    following: number;
    mutuals: number;
    pagesFollowed: number;
    pagesManaged: number;
    collaborationRooms: number;
    collaborators: number;
  };
  trust: {
    tier: string;
    score?: number | null;
    riskLevel?: string | null;
    isVerified: boolean;
    kycStatus?: string | null;
    lastComputedAt?: string | null;
  };
  nodes: Record<string, any[]>;
  edges: Array<{ type: string; from: string; to: string }>;
  generatedAt: string;
};

export type Phase2CollaborationRoom = {
  id: string;
  type: 'collaboration_room';
  title: string;
  topic?: string;
  participantCount: number;
  participants: any[];
  lastMessage?: any;
  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
};

export type Phase2WorkOsPlan = {
  goal: string;
  role: string;
  roomId?: string | null;
  generatedAt: string;
  operatingSystem: Record<string, any>;
  milestones: Array<{
    key: string;
    title: string;
    objective: string;
    tasks: string[];
  }>;
  discovery?: {
    query: string;
    mode: string;
    items: Phase2DiscoveryItem[];
  } | null;
  recommendedActions: Array<{ key: string; label: string; priority: number }>;
  context?: Record<string, any> | null;
};

export const Phase2Service = {
  getDiscoveryFeed(params?: { q?: string; mode?: Phase2DiscoveryMode; limit?: number }) {
    return api.get('/discovery/v2/feed', { params }).then(extractData<Phase2DiscoveryResponse>);
  },

  searchDiscovery(params: { q: string; mode?: Phase2DiscoveryMode; limit?: number }) {
    return api.get('/discovery/v2/search', { params }).then(extractData<Phase2DiscoveryResponse>);
  },

  getDiscoveryBriefing() {
    return api.get('/discovery/v2/briefing').then(extractData<any>);
  },

  getMyTrustGraph() {
    return api.get('/trust/graph/me').then(extractData<Phase2TrustGraph>);
  },

  getTrustGraph(userId: string) {
    return api.get(`/trust/graph/${encodeURIComponent(userId)}`).then(extractData<Phase2TrustGraph>);
  },

  buildWorkOsPlan(payload: { goal: string; roomId?: string | null; context?: Record<string, any> | null }) {
    return api.post('/scrolitha/work-os/plan', payload).then(extractData<Phase2WorkOsPlan>);
  },

  listCollaborationRooms(params?: { limit?: number }) {
    return api.get('/collaboration/rooms', { params }).then(extractData<Phase2CollaborationRoom[]>);
  },

  createCollaborationRoom(payload: {
    title: string;
    topic?: string;
    participantIds?: string[];
    sourceType?: string;
    sourceId?: string;
    metadata?: Record<string, any>;
  }) {
    return api.post('/collaboration/rooms', payload).then(extractData<Phase2CollaborationRoom>);
  },

  getCollaborationRoom(roomId: string) {
    return api.get(`/collaboration/rooms/${encodeURIComponent(roomId)}`).then(extractData<Phase2CollaborationRoom>);
  },

  recordCollaborationActivity(roomId: string, payload: { text: string; eventType?: string; metadata?: Record<string, any> }) {
    return api
      .post(`/collaboration/rooms/${encodeURIComponent(roomId)}/activity`, payload)
      .then(extractData<{ room: Phase2CollaborationRoom; activity: any }>);
  },

  updateRoomPresence(roomId: string, payload?: { status?: string; cursor?: any; section?: string | null }) {
    return api.post(`/collaboration/rooms/${encodeURIComponent(roomId)}/presence`, payload || {}).then(extractData<any>);
  }
};

export default Phase2Service;
