import { isLoginApprovalNotification, openLoginApprovalNotification } from './notificationRouting';

export const routeMessageLoginApproval = (payload: any): boolean => {
  if (!isLoginApprovalNotification(payload)) return false;
  return openLoginApprovalNotification(payload);
};

export const handleMessageReceiptRealtimeEvent = (
  payload: any,
  onReceiptNotification: (payload: any) => void
) => {
  onReceiptNotification(payload);
  return routeMessageLoginApproval(payload);
};
