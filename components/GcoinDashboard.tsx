import React, { useEffect, useState } from 'react';

type Wallet = { userId: string; recipientId: string; balance: number };

export default function GcoinDashboard() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch('/api/gcoin/wallets/dev-user-id-123', { headers: { 'x-dev-role': 'freelancer' } })
      .then((r) => r.json())
      .then((j) => setWallet(j.data))
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch('/api/gcoin/transactions', { headers: { 'x-dev-role': 'freelancer' } })
      .then((r) => r.json())
      .then((j) => setTransactions(j.data || []))
      .catch(console.error);
  }, []);

  return (
    <div className="gcoin-dashboard">
      <h3>Gcoin Dashboard</h3>
      {loading && <div>Loading...</div>}
      {wallet && (
        <div>
          <p><strong>Balance:</strong> {wallet.balance}</p>
          <p><strong>Recipient ID:</strong> {wallet.recipientId}</p>
        </div>
      )}

      <h4>Recent Transactions</h4>
      <ul>
        {transactions.map((t) => (
          <li key={t.id}>{t.type} {t.amount} — {new Date(t.createdAt).toLocaleString()}</li>
        ))}
      </ul>
    </div>
  );
}
