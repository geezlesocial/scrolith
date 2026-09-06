package com.scrolith.scrolith;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Small, memory-only native Notifications Center.
 *
 * The WebView remains the source of truth. This view only renders sanitized
 * state and reports user actions to MainActivity for delegation to the web
 * notification service and router.
 */
final class NativeNotificationsView extends FrameLayout {
    interface Listener {
        void requestSnapshot();
        void markRead(String notificationId);
        void markAllRead();
        void openAction(String notificationId, String actionPath);
        void close();
    }

    private static final int MAX_ITEMS = 40;
    private static final int MAX_TEXT_LENGTH = 600;
    private static final int BLUE = Color.rgb(37, 99, 235);
    private static final int NAVY = Color.rgb(15, 23, 42);
    private static final int MUTED = Color.rgb(71, 85, 105);
    private static final int SURFACE = Color.rgb(248, 250, 252);

    private final Listener listener;
    private final LinearLayout itemsContainer;
    private final TextView statusText;
    private final Button markAllButton;
    private boolean snapshotReceived;

    NativeNotificationsView(Context context, Listener listener) {
        super(context);
        this.listener = listener;
        setBackgroundColor(SURFACE);
        setFocusableInTouchMode(true);
        setContentDescription("Scrolith Notifications");

        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(SURFACE);
        addView(root, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout toolbar = new LinearLayout(context);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(16), dp(10), dp(12), dp(10));
        toolbar.setBackgroundColor(Color.WHITE);
        toolbar.setElevation(dp(4));

        LinearLayout titleGroup = new LinearLayout(context);
        titleGroup.setOrientation(LinearLayout.VERTICAL);
        TextView title = text(context, "Notifications", 20, NAVY, true);
        TextView subtitle = text(context, "Stay up to date", 12, MUTED, false);
        titleGroup.addView(title, new LinearLayout.LayoutParams(0, -2, 1f));
        titleGroup.addView(subtitle, new LinearLayout.LayoutParams(0, -2, 1f));
        toolbar.addView(titleGroup, new LinearLayout.LayoutParams(0, -2, 1f));

        markAllButton = new Button(context);
        markAllButton.setText("Mark all read");
        markAllButton.setAllCaps(false);
        markAllButton.setTextSize(12);
        markAllButton.setTextColor(BLUE);
        markAllButton.setContentDescription("Mark all notifications as read");
        markAllButton.setOnClickListener(v -> listener.markAllRead());
        toolbar.addView(markAllButton, new LinearLayout.LayoutParams(-2, dp(44)));

        ImageButton refresh = iconButton(context, android.R.drawable.ic_popup_sync, "Refresh notifications");
        refresh.setOnClickListener(v -> {
            showLoading();
            listener.requestSnapshot();
        });
        toolbar.addView(refresh, buttonParams());

        ImageButton close = iconButton(context, android.R.drawable.ic_menu_close_clear_cancel, "Close notifications");
        close.setOnClickListener(v -> listener.close());
        toolbar.addView(close, buttonParams());
        root.addView(toolbar, new LinearLayout.LayoutParams(-1, -2));

        statusText = text(context, "Loading notifications...", 14, MUTED, false);
        statusText.setGravity(Gravity.CENTER);
        statusText.setPadding(dp(24), dp(32), dp(24), dp(16));
        root.addView(statusText, new LinearLayout.LayoutParams(-1, -2));

        ScrollView scroll = new ScrollView(context);
        scroll.setFillViewport(true);
        itemsContainer = new LinearLayout(context);
        itemsContainer.setOrientation(LinearLayout.VERTICAL);
        itemsContainer.setPadding(dp(16), dp(4), dp(16), dp(24));
        scroll.addView(itemsContainer, new ScrollView.LayoutParams(-1, -2));
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1f));
    }

    void requestInitialSnapshot() {
        showLoading();
        postDelayed(listener::requestSnapshot, 120L);
    }

    void showLoading() {
        statusText.setText("Loading notifications...");
        statusText.setVisibility(View.VISIBLE);
        markAllButton.setVisibility(View.GONE);
    }

    void showError() {
        statusText.setText("Notifications are temporarily unavailable. Tap refresh to try again.");
        statusText.setVisibility(View.VISIBLE);
        markAllButton.setVisibility(View.GONE);
        itemsContainer.removeAllViews();
    }

    void clearState() {
        snapshotReceived = false;
        itemsContainer.removeAllViews();
        showLoading();
    }

    void applySnapshot(JSONObject envelope) {
        if (envelope == null) {
            showError();
            return;
        }
        try {
            JSONArray items = envelope.optJSONArray("items");
            itemsContainer.removeAllViews();
            int count = 0;
            if (items != null) {
                for (int i = 0; i < items.length() && count < MAX_ITEMS; i++) {
                    JSONObject item = items.optJSONObject(i);
                    if (item == null) continue;
                    String id = bounded(item.optString("id", ""), 128);
                    if (id.isEmpty()) continue;
                    addNotificationRow(item, id);
                    count++;
                }
            }
            snapshotReceived = true;
            if (count == 0) {
                statusText.setText("No notifications yet.");
                statusText.setVisibility(View.VISIBLE);
                markAllButton.setVisibility(View.GONE);
            } else {
                statusText.setVisibility(View.GONE);
                markAllButton.setVisibility(View.VISIBLE);
            }
        } catch (Throwable ignored) {
            showError();
        }
    }

    void applyActionResult(JSONObject result) {
        if (result == null || !result.optBoolean("success", true)) {
            showError();
        }
    }

    boolean hasSnapshot() {
        return snapshotReceived;
    }

    private void addNotificationRow(JSONObject item, String id) {
        Context context = getContext();
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(dp(16), dp(14), dp(16), dp(14));
        boolean unread = !item.optBoolean("isRead", true);
        row.setBackground(round(unread ? Color.rgb(239, 246, 255) : Color.WHITE, unread ? BLUE : Color.rgb(226, 232, 240)));
        row.setClickable(true);
        row.setFocusable(true);
        row.setContentDescription("Notification: " + bounded(item.optString("title", "Notification"), 160));

        String category = bounded(item.optString("category", ""), 48);
        String title = bounded(item.optString("title", "Notification"), 160);
        String message = bounded(item.optString("message", ""), MAX_TEXT_LENGTH);
        String timestamp = bounded(item.optString("createdAt", ""), 80);
        String actionPath = item.optString("actionPath", "");

        LinearLayout heading = new LinearLayout(context);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        TextView titleView = text(context, title, 16, NAVY, unread);
        heading.addView(titleView, new LinearLayout.LayoutParams(0, -2, 1f));
        if (!category.isEmpty()) {
            TextView categoryView = text(context, category, 11, BLUE, true);
            categoryView.setGravity(Gravity.CENTER);
            categoryView.setPadding(dp(8), dp(3), dp(8), dp(3));
            categoryView.setBackground(round(Color.rgb(239, 246, 255), Color.rgb(191, 219, 254)));
            heading.addView(categoryView, new LinearLayout.LayoutParams(-2, dp(28)));
        }
        row.addView(heading, new LinearLayout.LayoutParams(-1, -2));
        if (!message.isEmpty()) {
            TextView messageView = text(context, message, 14, MUTED, false);
            messageView.setMaxLines(3);
            messageView.setEllipsize(TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(-1, -2);
            messageParams.setMargins(0, dp(6), 0, 0);
            row.addView(messageView, messageParams);
        }
        if (!timestamp.isEmpty()) {
            TextView timestampView = text(context, timestamp, 11, Color.rgb(100, 116, 139), false);
            LinearLayout.LayoutParams timestampParams = new LinearLayout.LayoutParams(-1, -2);
            timestampParams.setMargins(0, dp(8), 0, 0);
            row.addView(timestampView, timestampParams);
        }

        row.setOnClickListener(v -> {
            listener.markRead(id);
            if (isSafePath(actionPath)) listener.openAction(id, actionPath);
        });
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(-1, -2);
        rowParams.setMargins(0, 0, 0, dp(10));
        itemsContainer.addView(row, rowParams);
    }

    private ImageButton iconButton(Context context, int icon, String description) {
        ImageButton button = new ImageButton(context);
        button.setImageResource(icon);
        button.setColorFilter(MUTED);
        button.setBackground(round(Color.WHITE, Color.rgb(226, 232, 240)));
        button.setContentDescription(description);
        button.setPadding(dp(10), dp(10), dp(10), dp(10));
        return button;
    }

    private LinearLayout.LayoutParams buttonParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(44), dp(44));
        params.setMargins(dp(4), 0, 0, 0);
        return params;
    }

    private TextView text(Context context, String value, float size, int color, boolean bold) {
        TextView view = new TextView(context);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setTypeface(null, bold ? Typeface.BOLD : Typeface.NORMAL);
        return view;
    }

    private GradientDrawable round(int color, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(16));
        drawable.setStroke(dp(1), strokeColor);
        return drawable;
    }

    private String bounded(String value, int max) {
        String normalized = value == null ? "" : value.trim();
        return normalized.length() > max ? normalized.substring(0, max) : normalized;
    }

    private boolean isSafePath(String value) {
        return value != null && value.startsWith("/") && !value.startsWith("//")
            && !value.contains("\\")
            && !value.toLowerCase(java.util.Locale.US).contains("javascript:")
            && value.length() <= 512;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
