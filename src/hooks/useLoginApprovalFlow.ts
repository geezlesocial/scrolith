import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '../types';

export type LoginApprovalState = {
  id: string;
  approvalToken: string;
  expiresAt?: string | null;
};

type UseLoginApprovalFlowOptions = {
  onApproved: (user: User) => void;
};

export const useLoginApprovalFlow = ({ onApproved }: UseLoginApprovalFlowOptions) => {
  const [approval, setApproval] = useState<LoginApprovalState | null>(null);
  const [terminalMessage, setTerminalMessage] = useState('');
  const [isExchanging, setIsExchanging] = useState(false);
  const mountedRef = useRef(true);
  const statusInFlightRef = useRef(false);
  const exchangeInFlightRef = useRef(false);
  const onApprovedRef = useRef(onApproved);

  useEffect(() => {
    onApprovedRef.current = onApproved;
  }, [onApproved]);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const start = useCallback((next: LoginApprovalState) => {
    if (!next?.id || !next.approvalToken) return;
    statusInFlightRef.current = false;
    exchangeInFlightRef.current = false;
    setTerminalMessage('');
    setIsExchanging(false);
    setApproval({ id: String(next.id), approvalToken: String(next.approvalToken), expiresAt: next.expiresAt ?? null });
  }, []);

  const cancel = useCallback(() => {
    statusInFlightRef.current = false;
    exchangeInFlightRef.current = false;
    setIsExchanging(false);
    setApproval(null);
    setTerminalMessage('');
  }, []);

  useEffect(() => {
    if (!approval) return undefined;
    let stopped = false;

    const poll = async () => {
      if (stopped || statusInFlightRef.current || exchangeInFlightRef.current) return;
      statusInFlightRef.current = true;
      try {
        const { DeviceSecurityService, traceDeviceSecurity } = await import('../services/deviceSecurity');
        traceDeviceSecurity('approval_poll_started', { approvalStateInitialized: true, statusPollingStarted: true });
        const result = await DeviceSecurityService.getApprovalStatus(approval.id, approval.approvalToken);
        if (stopped) return;
        const status = String(result?.status || 'PENDING').toUpperCase();
        if (status === 'PENDING') return;

        if (status === 'APPROVED') {
          exchangeInFlightRef.current = true;
          setIsExchanging(true);
          const { AuthService } = await import('../services/authService');
          const exchanged = await AuthService.exchangeApprovedLogin(approval.id, approval.approvalToken);
          if (stopped || !mountedRef.current) return;
          if (exchanged.success && exchanged.user) {
            setApproval(null);
            onApprovedRef.current(exchanged.user as User);
            return;
          }
          setApproval(null);
          setTerminalMessage(exchanged.error || 'Unable to complete approved login.');
          return;
        }

        setApproval(null);
        setTerminalMessage(
          status === 'REJECTED'
            ? 'This login was rejected from your trusted session.'
            : status === 'EXPIRED'
              ? 'This login approval expired. Please sign in again.'
              : 'This login approval is no longer valid. Please sign in again.'
        );
      } catch (error: any) {
        if (!stopped && mountedRef.current) {
          setApproval(null);
          setTerminalMessage(error?.response?.data?.error || error?.message || 'Unable to check login approval.');
        }
      } finally {
        statusInFlightRef.current = false;
        if (!stopped && mountedRef.current) {
          exchangeInFlightRef.current = false;
          setIsExchanging(false);
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      statusInFlightRef.current = false;
    };
  }, [approval]);

  return { approval, start, cancel, terminalMessage, isExchanging };
};
