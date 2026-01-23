import React, { useEffect, useState } from 'react';
import { NotificationService } from '../../services/notifications';
import { MessageService } from '../../services/messages';

type Props = {
  type: 'messages' | 'notifications';
};

export default function UnreadCounter({ type }: Props) {
  const [count, setCount] = useState(0);

  const load = async () => {
    try {
      if (type === 'messages') {
        const convos = await MessageService.getConversations();
        const unread = convos.filter((c: any) => (c.unreadCount ?? c.unread_count ?? 0) > 0).length;
        setCount(unread);
      } else {
        const unread = await NotificationService.getUnread();
        setCount(unread.length);
      }
    } catch {
      setCount(0);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, []);

  if (count === 0) return null;

  return (
    <span className="ml-auto bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
      {count}
    </span>
  );
}
