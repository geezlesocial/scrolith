import React, { useEffect, useState } from "react";
import { ordersApi, Order, OrderStatus } from "../../services/orders";
import { StatusBadge } from "../shared/StatusBadge";
import { Table } from "../shared/Table";
import { useNotification } from "../../context/NotificationContext";
import FilePickerModal from "../shared/FilePickerModal";
import ConfirmModal from "../shared/ConfirmModal";

const Orders: React.FC = () => {
  const { showNotification } = useNotification();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');

  // Modal states
  const [deliverOrderId, setDeliverOrderId] = useState<string | null>(null);
  const [deliverFiles, setDeliverFiles] = useState<string[]>([]);
  const [deliverNote, setDeliverNote] = useState('');
  const [delivering, setDelivering] = useState(false);

  const [requestInfoId, setRequestInfoId] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [requesting, setRequesting] = useState(false);

  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [revisionMessage, setRevisionMessage] = useState('');
  const [revisionChanges, setRevisionChanges] = useState('');
  const [proposingRevision, setProposingRevision] = useState(false);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const params: any = { role: 'freelancer' };
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      const response = await ordersApi.getOrders(params);
      setOrders(response.orders);
    } catch (error: any) {
      showNotification('error', 'Load Error', 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  const handleDeliverOrder = async () => {
    if (!deliverOrderId || deliverFiles.length === 0) return;

    setDelivering(true);
    try {
      await ordersApi.deliverOrder(deliverOrderId, {
        files: deliverFiles,
        note: deliverNote,
      });
      showNotification('success', 'Order Delivered', 'Your work has been delivered successfully');
      setDeliverOrderId(null);
      setDeliverFiles([]);
      setDeliverNote('');
      await loadOrders();
    } catch (error: any) {
      showNotification('error', 'Delivery Failed', error.message || 'Failed to deliver order');
    } finally {
      setDelivering(false);
    }
  };

  const handleRequestInfo = async () => {
    if (!requestInfoId || !requestMessage.trim()) return;

    setRequesting(true);
    try {
      await ordersApi.requestInfo(requestInfoId, requestMessage);
      showNotification('success', 'Info Requested', 'Your request has been sent to the client');
      setRequestInfoId(null);
      setRequestMessage('');
      await loadOrders();
    } catch (error: any) {
      showNotification('error', 'Request Failed', error.message || 'Failed to send request');
    } finally {
      setRequesting(false);
    }
  };

  const handleProposeRevision = async () => {
    if (!revisionId || !revisionMessage.trim()) return;

    setProposingRevision(true);
    try {
      await ordersApi.proposeRevision(revisionId, {
        message: revisionMessage,
        proposedChanges: revisionChanges,
      });
      showNotification('success', 'Revision Proposed', 'Your revision proposal has been sent');
      setRevisionId(null);
      setRevisionMessage('');
      setRevisionChanges('');
      await loadOrders();
    } catch (error: any) {
      showNotification('error', 'Proposal Failed', error.message || 'Failed to propose revision');
    } finally {
      setProposingRevision(false);
    }
  };

  const columns = [
    {
      key: 'gigTitle',
      header: 'Gig',
      render: (value: string) => (
        <div className="font-medium text-gray-900 truncate max-w-xs" title={value}>
          {value}
        </div>
      ),
    },
    {
      key: 'buyerName',
      header: 'Client',
      render: (value: string) => (
        <div className="font-medium text-gray-700">{value}</div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (value: number) => (
        <div className="font-bold text-green-600">${value.toFixed(2)}</div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (status: OrderStatus) => <StatusBadge status={status} type="order" />,
    },
    {
      key: 'createdAt',
      header: 'Ordered',
      render: (value: string) => (
        <div className="text-sm text-gray-500">
          {new Date(value).toLocaleDateString()}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, order: Order) => (
        <div className="flex gap-2">
          {order.status === 'active' && (
            <>
              <button
                onClick={() => setDeliverOrderId(order.id)}
                className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
              >
                Deliver
              </button>
              <button
                onClick={() => setRequestInfoId(order.id)}
                className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Request Info
              </button>
            </>
          )}
          {order.status === 'revision_requested' && (
            <button
              onClick={() => setRevisionId(order.id)}
              className="px-3 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700"
            >
              Propose Revision
            </button>
          )}
          {order.status === 'delivered' && (
            <span className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded">
              Awaiting Approval
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Orders</h2>
        <p className="text-sm text-gray-500">Manage your active orders and delivery workflow</p>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 items-center">
        <span className="text-xs text-gray-500 font-bold">Filter:</span>
        {(['all', 'active', 'delivered', 'revision_requested', 'completed', 'cancelled'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-2 rounded-xl text-sm font-bold border ${
              statusFilter === status
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {status === 'all' ? 'All' : status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Orders Table */}
      <Table
        columns={columns}
        data={orders}
        loading={loading}
        emptyMessage="No orders found. Orders will appear here once clients purchase your gigs."
      />

      {/* Deliver Order Modal */}
      <ConfirmModal
        open={!!deliverOrderId}
        title="Deliver Work"
        confirmLabel="Deliver"
        onCancel={() => {
          setDeliverOrderId(null);
          setDeliverFiles([]);
          setDeliverNote('');
        }}
        onConfirm={handleDeliverOrder}
        loading={delivering}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Files to Deliver
            </label>
            <FilePickerModal
              open={false} // We'll trigger this from a button
              onClose={() => {}}
              onSelect={(files) => setDeliverFiles(files.map(f => f.id))}
              multiple
              role="freelancer"
              visibility="private"
            />
            <button
              type="button"
              onClick={() => {
                // This would normally open the FilePickerModal
                // For now, we'll simulate file selection
                setDeliverFiles(['file_1', 'file_2']);
              }}
              className="mt-2 px-3 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
            >
              Select Files
            </button>
            {deliverFiles.length > 0 && (
              <div className="mt-2 text-sm text-gray-600">
                {deliverFiles.length} file(s) selected
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Delivery Note (Optional)
            </label>
            <textarea
              className="w-full border border-gray-300 rounded-md p-3 text-sm"
              rows={3}
              placeholder="Add a note about your delivery..."
              value={deliverNote}
              onChange={(e) => setDeliverNote(e.target.value)}
            />
          </div>
        </div>
      </ConfirmModal>

      {/* Request Info Modal */}
      <ConfirmModal
        open={!!requestInfoId}
        title="Request More Information"
        confirmLabel="Send Request"
        onCancel={() => {
          setRequestInfoId(null);
          setRequestMessage('');
        }}
        onConfirm={handleRequestInfo}
        loading={requesting}
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Message to Client
          </label>
          <textarea
            className="w-full border border-gray-300 rounded-md p-3 text-sm"
            rows={3}
            placeholder="What additional information do you need?"
            value={requestMessage}
            onChange={(e) => setRequestMessage(e.target.value)}
            required
          />
        </div>
      </ConfirmModal>

      {/* Propose Revision Modal */}
      <ConfirmModal
        open={!!revisionId}
        title="Propose Revision"
        confirmLabel="Send Proposal"
        onCancel={() => {
          setRevisionId(null);
          setRevisionMessage('');
          setRevisionChanges('');
        }}
        onConfirm={handleProposeRevision}
        loading={proposingRevision}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Revision Message
            </label>
            <textarea
              className="w-full border border-gray-300 rounded-md p-3 text-sm"
              rows={3}
              placeholder="Explain what you'd like to revise..."
              value={revisionMessage}
              onChange={(e) => setRevisionMessage(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Proposed Changes (Optional)
            </label>
            <textarea
              className="w-full border border-gray-300 rounded-md p-3 text-sm"
              rows={2}
              placeholder="Detail the specific changes you'd make..."
              value={revisionChanges}
              onChange={(e) => setRevisionChanges(e.target.value)}
            />
          </div>
        </div>
      </ConfirmModal>
    </div>
  );
};

export default Orders;