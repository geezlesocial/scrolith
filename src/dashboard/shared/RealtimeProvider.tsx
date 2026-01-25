import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "../../context/UserContext";
import { useSocket } from "../../context/SocketContext";
import { NotificationsService } from "../../services/notifications";
import { MessagingService } from "../../services/messaging";
import { OrdersService } from "../../services/orders";
import { ContractsService } from "../../services/contracts";
import { WalletService } from "../../services/wallet";

type RealtimeContextValue = {
  socketConnected: boolean;
};

const RealtimeContext = createContext<RealtimeContextValue>({ socketConnected: false });
export const useRealtime = () => useContext(RealtimeContext);

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useUser();
  const { socket } = useSocket();

  const [socketConnected, setSocketConnected] = useState(false);
  const pollTimer = useRef<number | null>(null);

  const startPolling = () => {
    if (pollTimer.current) return;
    pollTimer.current = window.setInterval(async () => {
      // Poll only minimal "unread + status" endpoints to reduce load
      await Promise.allSettled([
        NotificationsService.getUnreadCount?.(),
        MessagingService.getUnreadCount?.(),
        OrdersService.getMyOrderSummary?.(),
        ContractsService.getMyContractSummary?.(),
        WalletService.getWallet?.(),
      ]);
    }, 45000); // 45 seconds
  };

  const stopPolling = () => {
    if (!pollTimer.current) return;
    window.clearInterval(pollTimer.current);
    pollTimer.current = null;
  };

  useEffect(() => {
    if (!isAuthenticated || !user || !socket) return;

    const onConnect = () => {
      setSocketConnected(true);
      stopPolling();
      socket.emit("auth:join", { userId: user.id, role: user.role });
    };

    const onDisconnect = () => {
      setSocketConnected(false);
      startPolling();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    // Listen to server events (UI components will refetch on demand)
    socket.on("notifications:new", () => NotificationsService.invalidateCache?.());
    socket.on("messages:new", () => MessagingService.invalidateCache?.());
    socket.on("orders:updated", () => OrdersService.invalidateCache?.());
    socket.on("contracts:updated", () => ContractsService.invalidateCache?.());
    socket.on("wallet:updated", () => WalletService.getWallet?.());
    socket.on("gigs:status_updated", () => {});
    socket.on("jobs:status_updated", () => {});

    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("notifications:new");
      socket.off("messages:new");
      socket.off("orders:updated");
      socket.off("contracts:updated");
      socket.off("wallet:updated");
      socket.off("gigs:status_updated");
      socket.off("jobs:status_updated");
      stopPolling();
    };
  }, [socket, isAuthenticated, user?.id, user?.role]);

  const value = useMemo(() => ({ socketConnected }), [socketConnected]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};