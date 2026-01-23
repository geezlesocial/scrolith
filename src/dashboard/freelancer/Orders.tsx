import React, { useState, useEffect, useMemo } from 'react';
import { ordersApi, Order } from '../../services/orders';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import { Table } from '../shared/Table';
import { StatusBadge } from '../shared/StatusBadge';
import { Skeleton } from '../shared/Skeleton';
import EmptyState from '../shared/EmptyState';
import { ConfirmModal } from '../shared/ConfirmModal';
import {
  Package,
  Eye,
  MessageSquare,
  RefreshCw,
  FileText,
  Calendar,
  DollarSign,
  User,
  Loader2
} from 'lucide-react';

interface OrderWithActions extends Order {
  actions: React.ReactNode;
}

export const Orders: React.FC = () => {
  const { user } = useUser();
  const { showNotification } = useNotification();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'delivered' | 'cancelled'>('all');

  // Modal states
  const [showDeliverModal, setShowDeliverModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Form states
  const [deliverFiles, setDeliverFiles] = useState<string[]>([]);
  const [deliverNote, setDeliverNote] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [revisionMessage, setRevisionMessage] = useState('');
  const [revisionChanges, setRevisionChanges] = useState('');

  const loadOrders = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const params: any = { role: 'freelancer' };
      if (filter !== 'all') {
        params.status = filter;
      }

      const response = await ordersApi.getOrders(params);
      setOrders(response.orders || []);
    } catch (error: any) {
      console.error('Failed to load orders:', error);
      setError(error.message || 'Failed to load orders');
      showNotification('error', 'Load Error', error.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [user, filter]);

  const handleDeliverOrder = async (orderId: string, data: any) => {
    setModalLoading(true);
    try {
      await ordersApi.deliverOrder(orderId, data);
      showNotification('success', 'Success', 'Order delivered successfully');
      setShowDeliverModal(false);
      setDeliverFiles([]);
      setDeliverNote('');
      loadOrders(); // Refresh orders
    } catch (error: any) {
      showNotification('error', 'Error', error.message || 'Failed to deliver order');
    } finally {
      setModalLoading(false);
    }
  };

  const handleRequestInfo = async (orderId: string, message: string) => {
    setModalLoading(true);
    try {
      await ordersApi.requestInfo(orderId, message);
      showNotification('success', 'Success', 'Information request sent');
      setShowRequestModal(false);
      setRequestMessage('');
      loadOrders(); // Refresh orders
    } catch (error: any) {
      showNotification('error', 'Error', error.message || 'Failed to send request');
    } finally {
      setModalLoading(false);
    }
  };

  const handleProposeRevision = async (orderId: string, data: any) => {
    setModalLoading(true);
    try {
      await ordersApi.proposeRevision(orderId, data);
      showNotification('success', 'Success', 'Revision proposed successfully');
      setShowRevisionModal(false);
      setRevisionMessage('');
      setRevisionChanges('');
      loadOrders(); // Refresh orders
    } catch (error: any) {
      showNotification('error', 'Error', error.message || 'Failed to propose revision');
    } finally {
      setModalLoading(false);
    }
  };

  const ordersWithActions: OrderWithActions[] = useMemo(() =>
    orders.map(order => ({
      ...order,
      actions: (
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              setSelectedOrder(order);
              // Show order details modal or navigate to detail view
            }}
            className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="View Details"
          >
            <Eye className="w-4 h-4" />
          </button>

          {order.status?.toLowerCase() === 'active' && (
            <>
              <button
                onClick={() => {
                  setSelectedOrder(order);
                  setShowDeliverModal(true);
                }}
                className="p-1 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                title="Deliver Work"
              >
                <Package className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setSelectedOrder(order);
                  setShowRequestModal(true);
                }}
                className="p-1 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded"
                title="Request More Info"
              >
                <MessageSquare className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setSelectedOrder(order);
                  setShowRevisionModal(true);
                }}
                className="p-1 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded"
                title="Propose Revision"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )
    })), [orders]
  );

  const columns = [
    {
      key: 'gigTitle',
      header: 'Gig/Service',
      render: (value: string) => (
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-gray-400" />
          <span className="font-medium text-gray-900 truncate max-w-xs">{value}</span>
        </div>
      ),
    },
    {
      key: 'buyerName',
      header: 'Client',
      render: (value: string) => (
        <div className="flex items-center space-x-2">
          <User className="w-4 h-4 text-gray-400" />
          <span className="text-gray-700">{value}</span>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (value: number) => (
        <div className="flex items-center space-x-1">
          <DollarSign className="w-4 h-4 text-green-500" />
          <span className="font-semibold text-green-600">${value.toFixed(2)}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => <StatusBadge status={value} type="order" />,
    },
    {
      key: 'createdAt',
      header: 'Ordered',
      render: (value: string) => (
        <div className="flex items-center space-x-1 text-sm text-gray-500">
          <Calendar className="w-4 h-4" />
          <span>{new Date(value).toLocaleDateString()}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (value: React.ReactNode) => value,
    },
  ];

  if (error && !orders.length) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700">{error}</p>
        <button
          onClick={loadOrders}
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
          <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
          <p className="mt-1 text-gray-600">Manage your active and completed orders</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            onClick={loadOrders}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: 'All Orders', count: orders.length },
            { key: 'active', label: 'Active', count: orders.filter(o => o.status?.toLowerCase() === 'active').length },
            { key: 'completed', label: 'Completed', count: orders.filter(o => o.status?.toLowerCase() === 'completed').length },
            { key: 'delivered', label: 'Delivered', count: orders.filter(o => o.status?.toLowerCase() === 'delivered').length },
            { key: 'cancelled', label: 'Cancelled', count: orders.filter(o => o.status?.toLowerCase() === 'cancelled').length },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key as any)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === key
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6">
            <Skeleton type="table" />
          </div>
        </div>
      ) : ordersWithActions.length === 0 ? (
        <EmptyState
          title="No orders found"
          description={filter === 'all' ? "You haven't received any orders yet." : `No ${filter} orders found.`}
          icon={<Package className="w-12 h-12 text-gray-400" />}
        />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <Table
            columns={columns}
            data={ordersWithActions}
            className="min-w-full divide-y divide-gray-200"
          />
        </div>
      )}

      {/* Deliver Order Modal */}
      <ConfirmModal
        isOpen={showDeliverModal}
        title="Deliver Order"
        message="Upload files and add a note for the client"
        onConfirm={() => {
          if (selectedOrder && deliverFiles.length > 0) {
            handleDeliverOrder(selectedOrder.id, {
              files: deliverFiles,
              note: deliverNote,
            });
          }
        }}
        onCancel={() => {
          setShowDeliverModal(false);
          setDeliverFiles([]);
          setDeliverNote('');
        }}
        confirmLabel="Deliver Work"
        cancelLabel="Cancel"
        variant="info"
        loading={modalLoading}
      >
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Files to Deliver
            </label>
            <input
              type="text"
              placeholder="Enter file URLs (comma separated)"
              value={deliverFiles.join(', ')}
              onChange={(e) => setDeliverFiles(e.target.value.split(',').map(f => f.trim()).filter(f => f))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Note (Optional)
            </label>
            <textarea
              value={deliverNote}
              onChange={(e) => setDeliverNote(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Add any additional notes for the client..."
            />
          </div>
        </div>
      </ConfirmModal>

      {/* Request More Info Modal */}
      <ConfirmModal
        isOpen={showRequestModal}
        title="Request More Information"
        message="Send a message to request additional information from the client"
        onConfirm={() => {
          if (selectedOrder && requestMessage.trim()) {
            handleRequestInfo(selectedOrder.id, requestMessage);
          }
        }}
        onCancel={() => {
          setShowRequestModal(false);
          setRequestMessage('');
        }}
        confirmLabel="Send Request"
        cancelLabel="Cancel"
        variant="warning"
        loading={modalLoading}
      >
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Message
          </label>
          <textarea
            value={requestMessage}
            onChange={(e) => setRequestMessage(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Explain what additional information you need..."
            required
          />
        </div>
      </ConfirmModal>

      {/* Propose Revision Modal */}
      <ConfirmModal
        isOpen={showRevisionModal}
        title="Propose Revision"
        message="Suggest changes to the order requirements or timeline"
        onConfirm={() => {
          if (selectedOrder && revisionMessage.trim()) {
            handleProposeRevision(selectedOrder.id, {
              message: revisionMessage,
              proposedChanges: revisionChanges,
            });
          }
        }}
        onCancel={() => {
          setShowRevisionModal(false);
          setRevisionMessage('');
          setRevisionChanges('');
        }}
        confirmLabel="Propose Revision"
        cancelLabel="Cancel"
        variant="warning"
        loading={modalLoading}
      >
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Revision Message
            </label>
            <textarea
              value={revisionMessage}
              onChange={(e) => setRevisionMessage(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Explain the proposed changes..."
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Proposed Changes (Optional)
            </label>
            <textarea
              value={revisionChanges}
              onChange={(e) => setRevisionChanges(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Specific changes you're proposing..."
            />
          </div>
        </div>
      </ConfirmModal>
    </div>
  );
};

export default Orders;
