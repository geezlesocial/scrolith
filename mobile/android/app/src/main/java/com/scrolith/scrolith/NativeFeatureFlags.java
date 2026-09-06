package com.scrolith.scrolith;

import android.content.Context;
import android.content.Intent;

/**
 * Phase 2 gates. Priority screen content remains on the existing WebView until
 * it has passed physical-device parity testing for auth, realtime, and calls.
 */
final class NativeFeatureFlags {
    private static final String PREFS = "scrolith_native_phase2";
    private static final String NAVIGATION_OVERRIDE = "native_navigation_override";
    private static final String PRIORITY_SCREEN_OVERRIDE = "native_priority_screen_override";
    private static final String NOTIFICATIONS_OVERRIDE = "native_notifications_override";

    private NativeFeatureFlags() {}

    static boolean isNativeNavigationEnabled(Context context) {
        return isDebugBuild(context) && readOverride(context, NAVIGATION_OVERRIDE);
    }

    static boolean arePriorityScreensEnabled(Context context) {
        return isDebugBuild(context) && readOverride(context, PRIORITY_SCREEN_OVERRIDE);
    }

    static boolean isNativeNotificationsEnabled(Context context) {
        return isDebugBuild(context) && readOverride(context, NOTIFICATIONS_OVERRIDE);
    }

    static void applyDebugOverrides(Context context, Intent intent) {
        if (!isDebugBuild(context) || intent == null) return;
        android.content.SharedPreferences.Editor editor =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        if (intent.hasExtra("scrolith_native_navigation")) {
            editor.putBoolean(NAVIGATION_OVERRIDE, intent.getBooleanExtra("scrolith_native_navigation", false));
        }
        if (intent.hasExtra("scrolith_native_priority_screens")) {
            editor.putBoolean(PRIORITY_SCREEN_OVERRIDE, intent.getBooleanExtra("scrolith_native_priority_screens", false));
        }
        if (intent.hasExtra("scrolith_native_notifications")) {
            editor.putBoolean(NOTIFICATIONS_OVERRIDE, intent.getBooleanExtra("scrolith_native_notifications", false));
        }
        editor.apply();
    }

    private static boolean isDebugBuild(Context context) {
        return (context.getApplicationInfo().flags
            & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private static boolean readOverride(Context context, String key) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(key, false);
    }
}
