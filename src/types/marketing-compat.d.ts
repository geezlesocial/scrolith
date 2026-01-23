declare module "@/services/marketing" {
  export type MarketingCampaign = any;
  export const MarketingService: {
    getCampaigns?: () => Promise<MarketingCampaign[]>;
    saveCampaign?: (campaign: MarketingCampaign) => Promise<MarketingCampaign>;
    deleteCampaign?: (id: string) => Promise<void>;
    simulateSendCampaign?: (id: string) => Promise<void>;
    // Backwards-compatible alias
    sendCampaign?: (id: string) => Promise<void>;
    [key: string]: any;
  };
  export function sendCampaign(id: string): Promise<void>;
}
