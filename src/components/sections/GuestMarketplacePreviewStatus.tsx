import React from 'react';
import { Link } from 'react-router-dom';

type GuestMarketplacePreviewStatusProps = {
  error: boolean;
  onRetry: () => void;
};

const GuestMarketplacePreviewStatus: React.FC<GuestMarketplacePreviewStatusProps> = ({ error, onRetry }) => (
  <div
    className="grid h-full min-h-[12rem] place-items-center rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 text-center"
    role="status"
    aria-live="polite"
  >
    {error ? (
      <div>
        <p className="text-sm font-semibold text-slate-800">Marketplace preview is temporarily unavailable.</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">Please try again in a moment.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex min-h-[40px] items-center text-xs font-semibold text-blue-700 underline-offset-2 hover:underline"
        >
          Retry preview
        </button>
      </div>
    ) : (
      <div>
        <p className="text-sm font-semibold text-slate-800">No live marketplace listings available right now.</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">We never show placeholder listings.</p>
        <Link
          to="/auth/signup"
          className="mt-3 inline-flex min-h-[40px] items-center text-xs font-semibold text-blue-700 underline-offset-2 hover:underline"
        >
          Create free account
        </Link>
      </div>
    )}
  </div>
);

export default GuestMarketplacePreviewStatus;
