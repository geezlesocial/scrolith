declare module '@/context/NotificationContext' {
  export type Notification = any;
  export function useNotification(): {
    notifications: Notification[];
    toasts: Notification[];
    addNotification: (...args: any[]) => void;
    markAsRead: (id: string) => void;
    clearNotifications: () => void;
    refreshNotifications: () => Promise<void>;
    showNotification: (type: string, title: string, message: string, actionUrl?: string) => void;
  };
  export const NotificationProvider: any;
}

declare module '@/context/CurrencyContext' {
  export function useCurrency(): {
    format: (v: number) => string;
    formatPrice?: (v: number | string | null | undefined) => string;
    currency: string;
  };
}
