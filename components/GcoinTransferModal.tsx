import React, { useState } from 'react';

export default function GcoinTransferModal({ onClose }: { onClose?: () => void }) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  const send = async () => {
    setStatus('Sending...');
    try {
      const res = await fetch('/api/gcoin/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dev-role': 'freelancer' },
        body: JSON.stringify({ toRecipientId: recipient, amount })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.message || 'Transfer failed');
      setStatus('Transfer completed');
    } catch (e: any) {
      setStatus(String(e.message || e));
    }
  };

  return (
    <div className="gcoin-transfer-modal">
      <h4>Send Gcoin</h4>
      <label>Recipient ID</label>
      <input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
      <label>Amount</label>
      <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
      <div>
        <button onClick={send}>Send</button>
        <button onClick={() => onClose && onClose()}>Close</button>
      </div>
      {status && <div className="status">{status}</div>}
    </div>
  );
}
