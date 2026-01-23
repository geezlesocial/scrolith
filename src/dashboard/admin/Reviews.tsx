import React, { useEffect, useState } from 'react';
import { ReviewsService, Review, ReviewStatus } from '../../services/reviews';
import Skeleton from '../shared/Skeleton';

const statusOptions: Array<{ key: ReviewStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'published', label: 'Published' },
  { key: 'hidden', label: 'Hidden' },
  { key: 'removed', label: 'Removed' },
  { key: 'flagged', label: 'Flagged' }
];

export default function AdminReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | 'all'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ReviewsService.adminList(
        statusFilter === 'all' ? undefined : { status: statusFilter }
      );
      setReviews(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load reviews');
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const updateStatus = async (reviewId: string, status: ReviewStatus) => {
    setProcessingId(reviewId);
    try {
      await ReviewsService.adminUpdateStatus(reviewId, status);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to update review');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return <Skeleton rows={8} />;

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700">{error}</p>
        <button
          onClick={load}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reviews Moderation</h2>
          <p className="text-sm text-gray-500">Approve, hide, or remove reviews.</p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 rounded-lg border text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {statusOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setStatusFilter(opt.key)}
            className={`px-3 py-2 rounded-xl text-sm font-bold border ${
              statusFilter === opt.key
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {reviews.length === 0 ? (
        <div className="bg-white border rounded-xl p-10 text-center text-gray-500">
          No reviews found for this filter.
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-6 py-4">Reviewer</th>
                <th className="px-6 py-4">Rating</th>
                <th className="px-6 py-4">Comment</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reviews.map((review) => (
                <tr key={review.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{review.author?.name || 'User'}</div>
                    <div className="text-xs text-gray-500">{review.orderId || review.gigId || 'Review'}</div>
                  </td>
                  <td className="px-6 py-4 font-bold">{review.rating} / 5</td>
                  <td className="px-6 py-4 text-gray-600">
                    <div className="font-semibold text-gray-900">{review.title}</div>
                    <div className="text-sm">{review.comment}</div>
                  </td>
                  <td className="px-6 py-4 capitalize">{review.status}</td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => updateStatus(review.id, 'published')}
                      disabled={processingId === review.id}
                      className="px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-50"
                    >
                      Publish
                    </button>
                    <button
                      onClick={() => updateStatus(review.id, 'hidden')}
                      disabled={processingId === review.id}
                      className="px-3 py-2 rounded-lg border text-xs font-bold hover:bg-gray-50 disabled:opacity-50"
                    >
                      Hide
                    </button>
                    <button
                      onClick={() => updateStatus(review.id, 'removed')}
                      disabled={processingId === review.id}
                      className="px-3 py-2 rounded-lg border text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
