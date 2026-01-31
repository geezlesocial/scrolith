import React, { useState } from 'react';
import SendGcoinModal from './SendGcoinModal';

const DonateButton = ({ recipientIdentifier, postId }: { recipientIdentifier?: string; postId?: string }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1 rounded bg-yellow-400 text-xs font-bold text-white hover:opacity-95"
      >
        Donate
      </button>
      <SendGcoinModal isOpen={open} onClose={() => setOpen(false)} prefillRecipientId={recipientIdentifier} donatePostId={postId} />
    </>
  );
};

export default DonateButton;
