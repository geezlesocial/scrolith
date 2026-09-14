package com.scrolith.scrolith;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Small bounded native queue for offline-safe, non-secret sync envelopes.
 * The web app remains authoritative and decides when an item can be replayed.
 */
final class OfflineSyncStore {
    private static final String PREFS = "scrolith_offline_sync_v1";
    private static final String QUEUE = "queue";
    private static final int MAX_ITEMS = 100;
    private static final int MAX_ITEM_BYTES = 32768;

    private OfflineSyncStore() {}

    static synchronized JSONObject enqueue(Context context, JSONObject input) {
        JSONArray current = read(context);
        JSONObject item = new JSONObject();
        try {
            item.put("id", java.util.UUID.randomUUID().toString());
            item.put("type", safe(input == null ? "" : input.optString("type", ""), 48));
            item.put("path", safe(input == null ? "" : input.optString("path", ""), 512));
            item.put("payload", input == null ? new JSONObject() : input.optJSONObject("payload") == null
                ? new JSONObject() : input.optJSONObject("payload"));
            item.put("createdAt", System.currentTimeMillis());
            if (item.toString().length() > MAX_ITEM_BYTES) return item.put("rejected", true);
            JSONArray next = new JSONArray();
            next.put(item);
            for (int i = 0; i < Math.min(current.length(), MAX_ITEMS - 1); i++) next.put(current.get(i));
            write(context, next);
        } catch (Throwable ignored) {
            return item;
        }
        return item;
    }

    static synchronized JSONArray snapshot(Context context) { return read(context); }

    static synchronized void clear(Context context) { write(context, new JSONArray()); }

    private static JSONArray read(Context context) {
        try { return new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(QUEUE, "[]")); }
        catch (Throwable ignored) { return new JSONArray(); }
    }

    private static void write(Context context, JSONArray value) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(QUEUE, value.toString()).apply();
    }

    private static String safe(String value, int max) {
        String normalized = value == null ? "" : value.trim();
        return normalized.length() > max ? normalized.substring(0, max) : normalized;
    }
}
