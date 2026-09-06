package com.scrolith.scrolith;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.DiffUtil;
import androidx.recyclerview.widget.RecyclerView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Memory-only native inbox projection. The WebView remains responsible for
 * auth, sockets, server reads, and opening the conversation thread.
 */
final class NativeMessagesListView extends FrameLayout {
    interface Listener {
        void requestSnapshot();
        void refresh();
        void markRead(String conversationId);
        void openConversation(String conversationId, String actionPath);
        void close();
    }

    private static final int MAX_ITEMS = 100;
    private static final int MAX_TEXT = 240;
    private static final int BLUE = Color.rgb(37, 99, 235);
    private static final int NAVY = Color.rgb(15, 23, 42);
    private static final int MUTED = Color.rgb(71, 85, 105);
    private static final int SURFACE = Color.rgb(248, 250, 252);

    private final Listener listener;
    private final TextView statusText;
    private final TextView countText;
    private final EditText searchInput;
    private final RecyclerView list;
    private final ConversationAdapter adapter;
    private final List<ConversationItem> allItems = new ArrayList<>();
    private String filter = "all";
    private String search = "";
    private String sessionBinding = "";
    private long revision = -1L;
    private boolean snapshotReceived;

    NativeMessagesListView(Context context, Listener listener) {
        super(context);
        this.listener = listener;
        setBackgroundColor(SURFACE);
        setFocusableInTouchMode(true);
        setContentDescription("Scrolith Messages");

        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(SURFACE);
        addView(root, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout toolbar = new LinearLayout(context);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(16), dp(10), dp(12), dp(8));
        toolbar.setBackgroundColor(Color.WHITE);
        toolbar.setElevation(dp(4));

        TextView title = text(context, "Messages", 20, NAVY, true);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(44), 1f));
        ImageButton refresh = iconButton(context, android.R.drawable.ic_popup_sync, "Refresh messages");
        refresh.setOnClickListener(v -> {
            showLoading();
            listener.refresh();
        });
        toolbar.addView(refresh, buttonParams());
        ImageButton close = iconButton(context, android.R.drawable.ic_menu_close_clear_cancel, "Close messages");
        close.setOnClickListener(v -> listener.close());
        toolbar.addView(close, buttonParams());
        root.addView(toolbar, new LinearLayout.LayoutParams(-1, -2));

        searchInput = new EditText(context);
        searchInput.setSingleLine(true);
        searchInput.setHint("Search conversations");
        searchInput.setTextSize(15);
        searchInput.setTextColor(NAVY);
        searchInput.setHintTextColor(Color.rgb(148, 163, 184));
        searchInput.setPadding(dp(14), 0, dp(14), 0);
        searchInput.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        searchInput.setBackground(round(Color.WHITE, Color.rgb(203, 213, 225), dp(14)));
        searchInput.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                search = String.valueOf(s == null ? "" : s).trim().toLowerCase(Locale.ROOT);
                applyFilters();
            }
            @Override public void afterTextChanged(Editable s) {}
        });
        LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(-1, dp(48));
        searchParams.setMargins(dp(16), dp(12), dp(16), dp(10));
        root.addView(searchInput, searchParams);

        LinearLayout filters = new LinearLayout(context);
        filters.setGravity(Gravity.CENTER_VERTICAL);
        filters.setPadding(dp(16), 0, dp(16), dp(10));
        String[] filterLabels = {"All", "Unread", "Groups", "Communities"};
        String[] filterKeys = {"all", "unread", "group", "community"};
        for (int i = 0; i < filterLabels.length; i++) {
            Button button = new Button(context);
            button.setText(filterLabels[i]);
            button.setAllCaps(false);
            button.setTextSize(12);
            button.setMinHeight(dp(40));
            button.setPadding(dp(10), 0, dp(10), 0);
            final String key = filterKeys[i];
            button.setOnClickListener(v -> {
                filter = key;
                updateFilterStyles(filters);
                applyFilters();
            });
            filters.addView(button, new LinearLayout.LayoutParams(0, dp(40), 1f));
        }
        root.addView(filters, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout stateBar = new LinearLayout(context);
        stateBar.setGravity(Gravity.CENTER_VERTICAL);
        stateBar.setPadding(dp(16), 0, dp(16), dp(6));
        countText = text(context, "", 12, MUTED, false);
        stateBar.addView(countText, new LinearLayout.LayoutParams(0, -2, 1f));
        statusText = text(context, "Loading conversations...", 13, MUTED, false);
        statusText.setGravity(Gravity.END);
        stateBar.addView(statusText, new LinearLayout.LayoutParams(0, -2, 2f));
        root.addView(stateBar, new LinearLayout.LayoutParams(-1, -2));

        adapter = new ConversationAdapter(context, item -> {
            listener.markRead(item.id);
            if (isSafePath(item.actionPath)) listener.openConversation(item.id, item.actionPath);
        });
        list = new RecyclerView(context);
        list.setLayoutManager(new androidx.recyclerview.widget.LinearLayoutManager(context));
        list.setHasFixedSize(true);
        list.setItemViewCacheSize(8);
        list.setAdapter(adapter);
        list.setClipToPadding(false);
        list.setPadding(dp(16), dp(4), dp(16), dp(24));
        root.addView(list, new LinearLayout.LayoutParams(-1, 0, 1f));

        updateFilterStyles(filters);
    }

    void requestInitialSnapshot() {
        showLoading();
        postDelayed(listener::requestSnapshot, 120L);
    }

    void showLoading() {
        statusText.setText("Loading conversations...");
        statusText.setVisibility(View.VISIBLE);
    }

    void showError() {
        statusText.setText("Messages are temporarily unavailable. Tap refresh to try again.");
        statusText.setVisibility(View.VISIBLE);
        countText.setText("");
        allItems.clear();
        adapter.submit(new ArrayList<>());
    }

    void clearState() {
        snapshotReceived = false;
        sessionBinding = "";
        revision = -1L;
        allItems.clear();
        adapter.submit(new ArrayList<>());
        showLoading();
    }

    void applySnapshot(JSONObject envelope) {
        if (envelope == null || !"2".equals(envelope.optString("bridgeVersion"))
            || !"snapshot".equals(envelope.optString("kind"))) {
            showError();
            return;
        }
        try {
            String incomingBinding = bounded(envelope.optString("sessionBinding", ""), 128);
            long incomingRevision = envelope.optLong("revision", -1L);
            if (incomingBinding.isEmpty() || (snapshotReceived && !incomingBinding.equals(sessionBinding))
                || incomingRevision < revision) return;
            JSONArray rawItems = envelope.optJSONArray("items");
            if (rawItems == null || rawItems.length() > MAX_ITEMS) {
                showError();
                return;
            }
            List<ConversationItem> next = new ArrayList<>();
            Set<String> ids = new HashSet<>();
            for (int i = 0; i < rawItems.length(); i++) {
                JSONObject raw = rawItems.optJSONObject(i);
                ConversationItem item = ConversationItem.from(raw);
                if (item == null || !ids.add(item.id)) {
                    if (item != null) showError();
                    return;
                }
                next.add(item);
            }
            sessionBinding = incomingBinding;
            revision = incomingRevision;
            snapshotReceived = true;
            allItems.clear();
            allItems.addAll(next);
            applyFilters();
        } catch (Throwable ignored) {
            showError();
        }
    }

    void applyActionResult(JSONObject result) {
        if (result == null || !result.optBoolean("success", true)) {
            statusText.setText("That message action could not be completed.");
            statusText.setVisibility(View.VISIBLE);
        }
    }

    private void applyFilters() {
        List<ConversationItem> filtered = new ArrayList<>();
        for (ConversationItem item : allItems) {
            if (!"all".equals(filter) && "unread".equals(filter) && item.unreadCount == 0) continue;
            if ("group".equals(filter) && !"group".equals(item.type)) continue;
            if ("community".equals(filter) && !"community".equals(item.type)) continue;
            if (!search.isEmpty() && !item.searchable().contains(search)) continue;
            filtered.add(item);
        }
        adapter.submit(filtered);
        countText.setText(allItems.size() == filtered.size()
            ? allItems.size() + (allItems.size() == 1 ? " conversation" : " conversations")
            : filtered.size() + " of " + allItems.size() + " conversations");
        if (!snapshotReceived) return;
        if (filtered.isEmpty()) {
            statusText.setText(allItems.isEmpty() ? "No conversations yet." : "No conversations match this view.");
            statusText.setVisibility(View.VISIBLE);
        } else {
            statusText.setVisibility(View.GONE);
        }
    }

    private void updateFilterStyles(LinearLayout filters) {
        for (int i = 0; i < filters.getChildCount(); i++) {
            Button button = (Button) filters.getChildAt(i);
            String key = new String[] {"all", "unread", "group", "community"}[i];
            boolean active = key.equals(filter);
            button.setTextColor(active ? Color.WHITE : NAVY);
            button.setBackground(round(active ? BLUE : Color.WHITE,
                active ? BLUE : Color.rgb(203, 213, 225), dp(12)));
        }
    }

    private ImageButton iconButton(Context context, int icon, String description) {
        ImageButton button = new ImageButton(context);
        button.setImageResource(icon);
        button.setColorFilter(MUTED);
        button.setBackground(round(Color.WHITE, Color.rgb(226, 232, 240), dp(12)));
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

    private GradientDrawable round(int color, int strokeColor, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radius);
        drawable.setStroke(dp(1), strokeColor);
        return drawable;
    }

    private String bounded(String value, int max) {
        String normalized = value == null ? "" : value.trim();
        return normalized.length() > max ? normalized.substring(0, max) : normalized;
    }

    private boolean isSafePath(String value) {
        return value != null && value.startsWith("/") && !value.startsWith("//")
            && !value.contains("\\") && !value.toLowerCase(Locale.US).contains("javascript:")
            && value.length() <= 512;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static final class ConversationItem {
        final String id;
        final String type;
        final String title;
        final String preview;
        final String previewKind;
        final String timestamp;
        final int unreadCount;
        final boolean muted;
        final boolean starred;
        final boolean pinned;
        final String presence;
        final String actionPath;

        private ConversationItem(String id, String type, String title, String preview, String previewKind,
                                 String timestamp, int unreadCount, boolean muted, boolean starred,
                                 boolean pinned, String presence, String actionPath) {
            this.id = id;
            this.type = type;
            this.title = title;
            this.preview = preview;
            this.previewKind = previewKind;
            this.timestamp = timestamp;
            this.unreadCount = unreadCount;
            this.muted = muted;
            this.starred = starred;
            this.pinned = pinned;
            this.presence = presence;
            this.actionPath = actionPath;
        }

        static ConversationItem from(JSONObject raw) {
            if (raw == null) return null;
            String id = boundedValue(raw.optString("id", ""), 128);
            String title = boundedValue(raw.optString("title", "Conversation"), 160);
            String type = raw.optString("type", "direct");
            if (!("direct".equals(type) || "group".equals(type) || "community".equals(type))) type = "direct";
            JSONObject preview = raw.optJSONObject("preview");
            String previewKind = preview == null ? "empty" : boundedValue(preview.optString("kind", "empty"), 16);
            String previewText = preview == null ? "" : boundedValue(preview.optString("text", ""), MAX_TEXT);
            int unread = Math.max(0, Math.min(9999, raw.optInt("unreadCount", 0)));
            String presence = raw.optJSONObject("presence") == null ? "" : raw.optJSONObject("presence").optString("state", "");
            String path = boundedValue(raw.optString("actionPath", ""), 512);
            if (id.isEmpty() || title.isEmpty() || path.isEmpty()) return null;
            return new ConversationItem(id, type, title, previewText, previewKind,
                boundedValue(raw.optString("lastMessageAt", ""), 80), unread,
                raw.optBoolean("isMuted", false), raw.optBoolean("isStarred", false),
                raw.optBoolean("isPinned", false), presence, path);
        }

        String searchable() {
            return (title + " " + preview + " " + type).toLowerCase(Locale.ROOT);
        }

        private static String boundedValue(String value, int max) {
            String normalized = value == null ? "" : value.trim();
            return normalized.length() > max ? normalized.substring(0, max) : normalized;
        }
    }

    private static final class ConversationAdapter extends RecyclerView.Adapter<ConversationHolder> {
        interface OnClick { void onClick(ConversationItem item); }
        private final Context context;
        private final OnClick onClick;
        private final List<ConversationItem> items = new ArrayList<>();

        ConversationAdapter(Context context, OnClick onClick) {
            this.context = context;
            this.onClick = onClick;
            setHasStableIds(true);
        }

        void submit(List<ConversationItem> next) {
            List<ConversationItem> old = new ArrayList<>(items);
            DiffUtil.DiffResult result = DiffUtil.calculateDiff(new DiffUtil.Callback() {
                @Override public int getOldListSize() { return old.size(); }
                @Override public int getNewListSize() { return next.size(); }
                @Override public boolean areItemsTheSame(int oldItemPosition, int newItemPosition) {
                    return old.get(oldItemPosition).id.equals(next.get(newItemPosition).id);
                }
                @Override public boolean areContentsTheSame(int oldItemPosition, int newItemPosition) {
                    return same(old.get(oldItemPosition), next.get(newItemPosition));
                }
            });
            items.clear();
            items.addAll(next);
            result.dispatchUpdatesTo(this);
        }

        @Override public long getItemId(int position) { return items.get(position).id.hashCode(); }
        @NonNull @Override public ConversationHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            return new ConversationHolder(context, onClick);
        }
        @Override public void onBindViewHolder(@NonNull ConversationHolder holder, int position) {
            holder.bind(items.get(position));
        }
        @Override public int getItemCount() { return items.size(); }

        private static boolean same(ConversationItem a, ConversationItem b) {
            return a.title.equals(b.title) && a.preview.equals(b.preview) && a.previewKind.equals(b.previewKind)
                && a.timestamp.equals(b.timestamp) && a.unreadCount == b.unreadCount
                && a.muted == b.muted && a.starred == b.starred && a.pinned == b.pinned
                && a.presence.equals(b.presence);
        }
    }

    private static final class ConversationHolder extends RecyclerView.ViewHolder {
        private final TextView avatar;
        private final TextView title;
        private final TextView preview;
        private final TextView time;
        private final TextView badge;
        private final TextView marker;
        private final ConversationAdapter.OnClick onClick;

        ConversationHolder(Context context, ConversationAdapter.OnClick onClick) {
            super(new LinearLayout(context));
            this.onClick = onClick;
            LinearLayout row = (LinearLayout) itemView;
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(context, 12), dp(context, 10), dp(context, 12), dp(context, 10));
            row.setMinimumHeight(dp(context, 76));
            row.setClickable(true);
            row.setFocusable(true);

            avatar = label(context, 16, Color.WHITE, true);
            avatar.setGravity(Gravity.CENTER);
            avatar.setBackground(circle(Color.rgb(37, 99, 235)));
            row.addView(avatar, new LinearLayout.LayoutParams(dp(context, 48), dp(context, 48)));

            LinearLayout body = new LinearLayout(context);
            body.setOrientation(LinearLayout.VERTICAL);
            body.setPadding(dp(context, 12), 0, dp(context, 8), 0);
            title = label(context, 16, Color.rgb(15, 23, 42), false);
            preview = label(context, 13, Color.rgb(71, 85, 105), false);
            preview.setMaxLines(1);
            preview.setEllipsize(TextUtils.TruncateAt.END);
            body.addView(title, new LinearLayout.LayoutParams(-1, dp(context, 26)));
            body.addView(preview, new LinearLayout.LayoutParams(-1, dp(context, 24)));
            row.addView(body, new LinearLayout.LayoutParams(0, -2, 1f));

            LinearLayout meta = new LinearLayout(context);
            meta.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
            meta.setOrientation(LinearLayout.VERTICAL);
            time = label(context, 11, Color.rgb(100, 116, 139), false);
            time.setGravity(Gravity.END);
            marker = label(context, 11, Color.rgb(37, 99, 235), true);
            marker.setGravity(Gravity.END);
            badge = label(context, 11, Color.WHITE, true);
            badge.setGravity(Gravity.CENTER);
            badge.setBackground(circle(Color.rgb(37, 99, 235)));
            meta.addView(time, new LinearLayout.LayoutParams(-2, dp(context, 24)));
            meta.addView(marker, new LinearLayout.LayoutParams(-2, dp(context, 22)));
            meta.addView(badge, new LinearLayout.LayoutParams(dp(context, 26), dp(context, 26)));
            row.addView(meta, new LinearLayout.LayoutParams(dp(context, 70), -2));

            row.setOnClickListener(v -> {
                int position = getBindingAdapterPosition();
                if (position != RecyclerView.NO_POSITION) onClick.onClick((ConversationItem) v.getTag());
            });
        }

        void bind(ConversationItem item) {
            itemView.setTag(item);
            avatar.setText(initials(item.title));
            avatar.setContentDescription(item.title + " avatar");
            title.setText(item.title);
            title.setTypeface(null, item.unreadCount > 0 ? Typeface.BOLD : Typeface.NORMAL);
            String prefix = previewLabel(item.previewKind);
            preview.setText(prefix.isEmpty() ? (item.preview.isEmpty() ? "No messages" : item.preview)
                : (item.preview.isEmpty() ? prefix : prefix + ": " + item.preview));
            time.setText(relativeTime(item.timestamp));
            StringBuilder markers = new StringBuilder();
            if (item.pinned) markers.append("Pinned ");
            if (item.starred) markers.append("Starred ");
            if (item.muted) markers.append("Muted");
            marker.setText(markers.toString().trim());
            badge.setText(item.unreadCount > 0 ? (item.unreadCount > 99 ? "99+" : String.valueOf(item.unreadCount)) : "");
            badge.setVisibility(item.unreadCount > 0 ? View.VISIBLE : View.INVISIBLE);
            itemView.setContentDescription(item.unreadCount > 0
                ? "Open " + item.title + ", " + item.unreadCount + " unread"
                : "Open " + item.title);
        }

        private static TextView label(Context context, float size, int color, boolean bold) {
            TextView view = new TextView(context);
            view.setTextSize(size);
            view.setTextColor(color);
            view.setTypeface(null, bold ? Typeface.BOLD : Typeface.NORMAL);
            return view;
        }

        private static GradientDrawable circle(int color) {
            GradientDrawable drawable = new GradientDrawable();
            drawable.setColor(color);
            drawable.setShape(GradientDrawable.OVAL);
            return drawable;
        }

        private static int dp(Context context, int value) {
            return Math.round(value * context.getResources().getDisplayMetrics().density);
        }

        private static String initials(String value) {
            String[] parts = value.trim().split("\\s+");
            if (parts.length == 0) return "?";
            if (parts.length == 1) return parts[0].substring(0, 1).toUpperCase(Locale.ROOT);
            return (parts[0].substring(0, 1) + parts[parts.length - 1].substring(0, 1)).toUpperCase(Locale.ROOT);
        }

        private static String previewLabel(String kind) {
            if ("image".equals(kind)) return "Image";
            if ("video".equals(kind)) return "Video";
            if ("audio".equals(kind)) return "Audio";
            if ("voice".equals(kind)) return "Voice message";
            if ("file".equals(kind)) return "File";
            return "";
        }

        private static String relativeTime(String value) {
            if (value == null || value.trim().isEmpty()) return "";
            try {
                String normalized = value.trim();
                Date date;
                try {
                    date = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX", Locale.US).parse(normalized);
                } catch (ParseException ignored) {
                    date = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssX", Locale.US).parse(normalized);
                }
                long delta = Math.max(0L, System.currentTimeMillis() - date.getTime());
                long minutes = delta / 60000L;
                if (minutes < 1) return "now";
                if (minutes < 60) return minutes + "m";
                long hours = minutes / 60L;
                if (hours < 24) return hours + "h";
                long days = hours / 24L;
                return days < 7 ? days + "d" : new SimpleDateFormat("MMM d", Locale.US).format(date);
            } catch (Throwable ignored) {
                return value.length() > 16 ? value.substring(0, 16) : value;
            }
        }
    }
}
