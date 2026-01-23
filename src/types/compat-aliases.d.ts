declare module '@/types' {
  interface HelpLink {
    isEnabled?: boolean;
    is_enabled?: boolean;
  }

  interface NavIconConfig {
    sortOrder?: number;
    sort_order?: number;
    isEnabled?: boolean;
    is_enabled?: boolean;
    showLabel?: boolean;
    show_label?: boolean;
    label?: string;
  }

  interface StaffMember {
    roleName?: string;
    role_name?: string;
    roleId?: any;
    role_id?: any;
  }

  interface TicketCategory {
    isActive?: boolean;
    is_active?: boolean;
  }

  interface CommunitySettings {
    allowGuestComments?: boolean;
    allow_guest_comments?: boolean;
    allowMediaUploads?: boolean;
    allow_media_uploads?: boolean;
    enableReposts?: boolean;
    enable_reposts?: boolean;
    allowExternalLinks?: boolean;
    allow_external_links?: boolean;
    autoModerateContent?: boolean;
    auto_moderate_content?: boolean;
    sentimentAnalysis?: boolean;
    sentiment_analysis?: boolean;
    requireLoginToView?: boolean;
    require_login_to_view?: boolean;
  }

  interface MarketingCampaign {
    targetAudience?: any;
    target_audience?: any;
  }

  interface Job {
    experience_level?: any;
    experienceLevel?: any;
  }

  interface GigExtra {
    additionalDays?: any;
    additional_days?: any;
  }

  interface TicketReply {
    senderName?: string;
    sender_name?: string;
  }

  interface WalletTransaction {
    reference?: string;
    reference_id?: string;
  }

  interface TimeEntry {
    contractId?: any;
    contract_id?: any;
  }

  interface ActivityRecord {
    date?: string;
  }

  interface User {
    username?: string;
    firstName?: string;
    first_name?: string;
  }

  interface SystemConfig {
    system?: any;
  }
}
