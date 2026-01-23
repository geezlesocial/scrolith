import React, { useState, useEffect } from 'react';
import { walletApi, WalletInfo, TransactionsResponse } from '../../services/wallet';
import { withdrawalsApi, WithdrawalRequest, CreateWithdrawalData } from '../../services/withdrawals';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import { Table } from './Table';
import { StatusBadge } from './StatusBadge';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';
import { ConfirmModal } from './ConfirmModal';
import {
  DollarSign,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  Plus,
  TrendingUp,
  Wallet as WalletIcon,
  Loader2
} from 'lucide-react';

interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  status: string;
  createdAt: string;
  reference?: string;
}

interface WalletProps {
  role?: 'freelancer' | 'employer';
}

export const Wallet: React.FC<WalletProps> = ({ role = 'freelancer' }) => {
  const { user } = useUser();
  const { showNotification } = useNotification();

  // Data states
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('bank_transfer');
  const [withdrawNotes, setWithdrawNotes] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'withdrawals'>('overview');

  const loadWalletInfo = async () => {
    if (!user) return;
    try {
      const data = await walletApi.getWalletInfo();
      setWalletInfo(data);
    } catch (error: any) {
      console.error('Failed to load wallet info:', error);
      setError(error.message || 'Failed to load wallet info');
      showNotification('error', 'Load Error', error.message || 'Failed to load wallet info');
    }
  };

  const loadTransactions = async () => {
    setTransactionsLoading(true);
    try {
      const data = await walletApi.getTransactions({ limit: 20 });
      // Transform the response to match our Transaction interface
      const transformedTransactions: Transaction[] = (data.transactions || []).map(tx => ({
        id: tx.id,
        type: tx.type === 'credit' ? 'credit' : 'debit',
        amount: tx.amount,
        description: tx.description || tx.reference || 'Transaction',
        status: tx.status,
        createdAt: tx.createdAt,
        reference: tx.reference
      }));
      setTransactions(transformedTransactions);
    } catch (error: any) {
      console.error('Failed to load transactions:', error);
      showNotification('error', 'Load Error', error.message || 'Failed to load transactions');
    } finally {
      setTransactionsLoading(false);
    }
  };

  const loadWithdrawals = async () => {
    setWithdrawalsLoading(true);
    try {
      const data = await withdrawalsApi.getWithdrawals({ limit: 20 });
      setWithdrawals(data.withdrawals || []);
    } catch (error: any) {
      console.error('Failed to load withdrawals:', error);
      showNotification('error', 'Load Error', error.message || 'Failed to load withdrawals');
    } finally {
      setWithdrawalsLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        loadWalletInfo(),
        loadTransactions(),
        loadWithdrawals()
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleWithdrawalRequest = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      showNotification('error', 'Invalid Amount', 'Please enter a valid withdrawal amount');
      return;
    }

    if (walletInfo && amount > walletInfo.availableBalance) {
      showNotification('error', 'Insufficient Balance', 'Withdrawal amount exceeds available balance');
      return;
    }

    setModalLoading(true);
    try {
      const withdrawalData: CreateWithdrawalData = {
        amount,
        paymentMethodId: withdrawMethod,
        notes: withdrawNotes,
      };

      await withdrawalsApi.createWithdrawal(withdrawalData);
      showNotification('success', 'Withdrawal Requested', 'Your withdrawal request has been submitted');

      // Reset form and close modal
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      setWithdrawMethod('bank_transfer');
      setWithdrawNotes('');

      // Refresh data
      loadWalletInfo();
      loadWithdrawals();
    } catch (error: any) {
      showNotification('error', 'Withdrawal Failed', error.message || 'Failed to request withdrawal');
    } finally {
      setModalLoading(false);
    }
  };

  const transactionColumns = [
    {
      key: 'createdAt',
      header: 'Date',
      render: (value: string) => (
        <span className="text-sm text-gray-600">
          {new Date(value).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (value: string) => (
        <span className="font-medium text-gray-900">{value}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (value: string) => (
        <div className="flex items-center space-x-1">
          {value === 'credit' ? (
            <ArrowDownLeft className="w-4 h-4 text-green-500" />
          ) : (
            <ArrowUpRight className="w-4 h-4 text-red-500" />
          )}
          <span className={`text-sm font-medium ${
            value === 'credit' ? 'text-green-600' : 'text-red-600'
          }`}>
            {value === 'credit' ? 'Credit' : 'Debit'}
          </span>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (value: number, row: Transaction) => (
        <span className={`font-semibold ${
          row.type === 'credit' ? 'text-green-600' : 'text-red-600'
        }`}>
          {row.type === 'credit' ? '+' : '-'}${value.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => <StatusBadge status={value} type="transaction" />,
    },
  ];

  const withdrawalColumns = [
    {
      key: 'createdAt',
      header: 'Requested',
      render: (value: string) => (
        <span className="text-sm text-gray-600">
          {new Date(value).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (value: number) => (
        <span className="font-semibold text-gray-900">${value.toFixed(2)}</span>
      ),
    },
    {
      key: 'fee',
      header: 'Fee',
      render: (value: number) => (
        <span className="text-sm text-gray-600">${value.toFixed(2)}</span>
      ),
    },
    {
      key: 'netAmount',
      header: 'Net Amount',
      render: (value: number) => (
        <span className="font-medium text-green-600">${value.toFixed(2)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => <StatusBadge status={value} type="withdrawal" />,
    },
    {
      key: 'estimatedCompletion',
      header: 'Est. Completion',
      render: (value?: string) => (
        <span className="text-sm text-gray-600">
          {value ? new Date(value).toLocaleDateString() : 'N/A'}
        </span>
      ),
    },
  ];

  const tabs = [
    { id: 'overview', label: 'Overview', icon: WalletIcon },
    { id: 'transactions', label: 'Transactions', icon: TrendingUp },
    { id: 'withdrawals', label: 'Withdrawals', icon: Download },
  ];

  if (error && !walletInfo) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700">{error}</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wallet</h1>
          <p className="mt-1 text-gray-600">Manage your funds and transactions</p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <button
            onClick={() => setShowWithdrawModal(true)}
            disabled={!walletInfo || walletInfo.availableBalance <= 0}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4 mr-2" />
            Withdraw Funds
          </button>
          <button
            onClick={loadData}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Balance Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {loading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="bg-gray-50 rounded-xl p-6">
                      <Skeleton type="card" />
                    </div>
                  ))
                ) : walletInfo ? (
                  <>
                    <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-green-100 text-sm font-medium">Available Balance</p>
                          <p className="text-2xl font-bold mt-1">${walletInfo.availableBalance.toFixed(2)}</p>
                        </div>
                        <DollarSign className="w-8 h-8 text-green-200" />
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-blue-100 text-sm font-medium">Total Earnings</p>
                          <p className="text-2xl font-bold mt-1">${walletInfo.totalEarnings.toFixed(2)}</p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-blue-200" />
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-6 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-orange-100 text-sm font-medium">Pending Amount</p>
                          <p className="text-2xl font-bold mt-1">${walletInfo.pendingAmount.toFixed(2)}</p>
                        </div>
                        <Clock className="w-8 h-8 text-orange-200" />
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Recent Transactions Preview */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h3>
                {transactionsLoading ? (
                  <Skeleton type="list" />
                ) : transactions.length === 0 ? (
                  <EmptyState
                    title="No transactions yet"
                    description="Your transaction history will appear here"
                    icon={<TrendingUp className="w-8 h-8 text-gray-400" />}
                  />
                ) : (
                  <div className="space-y-3">
                    {transactions.slice(0, 5).map((transaction) => (
                      <div key={transaction.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          {transaction.type === 'credit' ? (
                            <ArrowDownLeft className="w-5 h-5 text-green-500" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5 text-red-500" />
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{transaction.description}</p>
                            <p className="text-sm text-gray-500">
                              {new Date(transaction.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold ${
                            transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {transaction.type === 'credit' ? '+' : '-'}${transaction.amount.toFixed(2)}
                          </p>
                          <StatusBadge status={transaction.status} type="transaction" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transactions Tab */}
          {activeTab === 'transactions' && (
            <div>
              {transactionsLoading ? (
                <Skeleton type="table" />
              ) : transactions.length === 0 ? (
                <EmptyState
                  title="No transactions found"
                  description="You haven't made any transactions yet"
                  icon={<TrendingUp className="w-12 h-12 text-gray-400" />}
                />
              ) : (
                <Table
                  columns={transactionColumns}
                  data={transactions}
                  className="min-w-full divide-y divide-gray-200"
                />
              )}
            </div>
          )}

          {/* Withdrawals Tab */}
          {activeTab === 'withdrawals' && (
            <div>
              {withdrawalsLoading ? (
                <Skeleton type="table" />
              ) : withdrawals.length === 0 ? (
                <EmptyState
                  title="No withdrawal requests"
                  description="Your withdrawal history will appear here"
                  icon={<Download className="w-12 h-12 text-gray-400" />}
                />
              ) : (
                <Table
                  columns={withdrawalColumns}
                  data={withdrawals}
                  className="min-w-full divide-y divide-gray-200"
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Withdrawal Modal */}
      <ConfirmModal
        isOpen={showWithdrawModal}
        title="Request Withdrawal"
        message="Withdraw funds from your wallet"
        onConfirm={handleWithdrawalRequest}
        onCancel={() => {
          setShowWithdrawModal(false);
          setWithdrawAmount('');
          setWithdrawMethod('bank_transfer');
          setWithdrawNotes('');
        }}
        confirmLabel="Request Withdrawal"
        cancelLabel="Cancel"
        variant="info"
        loading={modalLoading}
      >
        <div className="mt-4 space-y-4">
          {/* Current Balance */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Available Balance:</span>
              <span className="font-semibold text-gray-900">
                ${walletInfo?.availableBalance.toFixed(2) || '0.00'}
              </span>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Withdrawal Amount
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter amount"
                min="0"
                step="0.01"
                required
              />
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Method
            </label>
            <select
              value={withdrawMethod}
              onChange={(e) => setWithdrawMethod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="paypal">PayPal</option>
              <option value="stripe">Stripe</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={withdrawNotes}
              onChange={(e) => setWithdrawNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Any additional notes..."
            />
          </div>

          {/* Fee Information */}
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p className="font-medium">Withdrawal Fee: 2.5%</p>
                <p>Processing time: 3-5 business days</p>
              </div>
            </div>
          </div>
        </div>
      </ConfirmModal>
    </div>
  );
};

export default Wallet;