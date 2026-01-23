import { Request, Response } from 'express';

// Minimal overview endpoint for freelancer dashboard.
// In production this should aggregate real data from DB services.
export const getOverview = async (req: Request, res: Response) => {
  try {
    // Return a safe default payload. Frontend expects this shape.
    const payload = {
      activeOrders: 0,
      revisionOrders: 0,
      earningsThisMonth: 0,
      walletBalance: 0,
      gigViews: 0,
      gigClicks: 0,
      rating: 0,
      reviews: 0,
      unreadMessages: 0,
      unreadNotifications: 0,
    };

    return res.json({ success: true, data: payload });
  } catch (err: any) {
    console.error('freelancer overview error', err);
    return res.status(500).json({ success: false, error: 'Failed to load overview' });
  }
};
