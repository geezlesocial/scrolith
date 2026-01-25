import React from "react";

type Variant = "info" | "warning" | "danger";

type Props = {
  // Support both
  open?: boolean;
  isOpen?: boolean;

  title: string;
  message?: string;

  confirmLabel?: string;
  cancelLabel?: string;

  variant?: Variant;
  loading?: boolean;

  onConfirm: () => void;
  onCancel: () => void;

  children?: React.ReactNode;
};

function ConfirmModalImpl({
  open,
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "info",
  loading = false,
  onConfirm,
  onCancel,
  children,
}: Props) {
  const visible = typeof isOpen === "boolean" ? isOpen : !!open;
  if (!visible) return null;

  const btn =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700"
      : variant === "warning"
      ? "bg-yellow-600 hover:bg-yellow-700"
      : "bg-blue-600 hover:bg-blue-700";

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        {message && <p className="text-sm text-gray-600 mt-2">{message}</p>}

        {children}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border text-sm font-bold"
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-sm font-bold text-white ${btn} disabled:opacity-50`}
            disabled={loading}
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ✅ default export
export default ConfirmModalImpl;

// ✅ named export for existing imports
export const ConfirmModal = ConfirmModalImpl;