import React, { useEffect, useMemo, useState } from 'react';
import { ReviewsService, Review } from '../../services/reviews';
import { useUser } from '../../context/UserContext';
import Skeleton from '../shared/Skeleton';

const ratingBuckets = [5, 4, 3, 2, 1];

export default function FreelancerReviews() {
  const { user } = useUser();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await ReviewsService.listForUser(user.id);
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
  }, [user?.id]);

  const summary = useMemo(() => {
    if (!reviews.length) {
      return { average: 0, total: 0, counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    }
    const counts = reviews.reduce(
      (acc, review) => {
        const rating = review.rating || 0;
        if (rating >= 1 && rating <= 5) acc[rating] += 1;
        return acc;
      },
      { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>
    );
    const total = reviews.length;
    const average = reviews.reduce((sum, r) => sum + r.rating, 0) / total;
    return { average, total, counts };
  }, [reviews]);

  if (loading) return <Skeleton rows={4} />;

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
          <h2 className="text-2xl font-bold text-gray-900">Reviews</h2>
          <p className="text-sm text-gray-500">Published reviews from your clients.</p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 rounded-lg border text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <div className="text-sm text-gray-500">Average Rating</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">{summary.average.toFixed(2)}</div>
          <div className="text-xs text-gray-500 mt-1">{summary.total} total reviews</div>
        </div>
        <div className="md:col-span-2 bg-white p-6 rounded-xl border shadow-sm space-y-2">
          {ratingBuckets.map((rating) => (
            <div key={rating} className="flex items-center gap-3 text-sm">
              <div className="w-10 text-gray-700 font-bold">{rating} star</div>
              <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-2 bg-indigo-500"
                  style={{
                    width: summary.total
                      ? `${Math.round((summary.counts[rating] / summary.total) * 100)}%`
                      : '0%'
                  }}
                />
              </div>
              <div className="w-10 text-right text-gray-500">{summary.counts[rating]}</div>
            </div>
          ))}
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="bg-white border rounded-xl p-10 text-center text-gray-500">
          <p className="font-bold text-gray-900 mb-1">No reviews yet</p>
          <p className="text-sm">Complete more orders to receive reviews.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review.id} className="bg-white border rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold text-gray-900">{review.author?.name || 'Client'}</div>
                <div className="text-sm text-gray-500">{new Date(review.createdAt || '').toLocaleDateString()}</div>
              </div>
              <div className="text-sm text-gray-700 mb-2">Rating: {review.rating} / 5</div>
              {review.title && <div className="font-semibold text-gray-900 mb-1">{review.title}</div>}
              {review.comment && <div className="text-gray-600 text-sm">{review.comment}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
