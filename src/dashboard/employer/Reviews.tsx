import React, { useEffect, useState } from 'react';
import { ReviewsService, PendingReview, Review } from '../../services/reviews';
import { useNotification } from '../../context/NotificationContext';
import Skeleton from '../shared/Skeleton';

type DraftReview = {
  rating: number;
  title: string;
  comment: string;
};

export default function EmployerReviews() {
  const { showNotification } = useNotification();
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftReview>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pendingList, reviewList] = await Promise.all([
        ReviewsService.listPending(),
        ReviewsService.listMine()
      ]);
      setPending(pendingList);
      setMyReviews(reviewList);
    } catch (err: any) {
      setError(err?.message || 'Failed to load reviews');
      setPending([]);
      setMyReviews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateDraft = (orderId: string, changes: Partial<DraftReview>) => {
    setDrafts((prev) => ({
      ...prev,
      [orderId]: {
        rating: prev[orderId]?.rating || 5,
        title: prev[orderId]?.title || '',
        comment: prev[orderId]?.comment || '',
        ...changes
      }
    }));
  };

  const submitReview = async (orderId: string) => {
    const draft = drafts[orderId];
    if (!draft || !draft.rating) {
      showNotification('alert', 'Missing Rating', 'Please select a rating.');
      return;
    }

    setSubmittingId(orderId);
    try {
      await ReviewsService.create({
        orderId,
        rating: draft.rating,
        title: draft.title || undefined,
        comment: draft.comment || undefined
      });
      showNotification('success', 'Review Submitted', 'Your review was submitted successfully.');
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      await load();
    } catch (err: any) {
      showNotification('error', 'Submission Failed', err?.message || 'Failed to submit review');
    } finally {
      setSubmittingId(null);
    }
  };

  if (loading) return <Skeleton rows={6} />;

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
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Reviews</h2>
        <p className="text-sm text-gray-500">Submit reviews for completed orders and manage your reviews.</p>
      </div>

      <section className="space-y-4">
        <h3 className="text-lg font-bold text-gray-900">Pending Reviews</h3>
        {pending.length === 0 ? (
          <div className="bg-white border rounded-xl p-6 text-sm text-gray-500">
            No pending reviews right now.
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((item) => {
              const draft = drafts[item.orderId] || { rating: 5, title: '', comment: '' };
              return (
                <div key={item.orderId} className="bg-white border rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-gray-900">{item.gigTitle || 'Order'}</div>
                      <div className="text-xs text-gray-500">Order ID: {item.orderId}</div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : 'Completed'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Rating:</span>
                    <select
                      value={draft.rating}
                      onChange={(e) => updateDraft(item.orderId, { rating: Number(e.target.value) })}
                      className="border rounded-lg px-2 py-1 text-sm"
                    >
                      {[5, 4, 3, 2, 1].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <input
                    type="text"
                    placeholder="Title (optional)"
                    value={draft.title}
                    onChange={(e) => updateDraft(item.orderId, { title: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                  <textarea
                    placeholder="Share your experience..."
                    value={draft.comment}
                    onChange={(e) => updateDraft(item.orderId, { comment: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm min-h-[90px]"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() => submitReview(item.orderId)}
                      disabled={submittingId === item.orderId}
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {submittingId === item.orderId ? 'Submitting...' : 'Submit Review'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-bold text-gray-900">My Reviews</h3>
        {myReviews.length === 0 ? (
          <div className="bg-white border rounded-xl p-6 text-sm text-gray-500">
            You have not submitted any reviews yet.
          </div>
        ) : (
          <div className="space-y-4">
            {myReviews.map((review) => (
              <div key={review.id} className="bg-white border rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-gray-900">Rating: {review.rating} / 5</div>
                  <div className="text-xs text-gray-500">
                    {review.createdAt ? new Date(review.createdAt).toLocaleDateString() : ''}
                  </div>
                </div>
                {review.title && <div className="font-semibold text-gray-900 mb-1">{review.title}</div>}
                {review.comment && <div className="text-gray-600 text-sm">{review.comment}</div>}
                <div className="text-xs text-gray-500 mt-2">Status: {review.status}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
