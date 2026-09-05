package com.scrolith.scrolith;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONObject;

/**
 * Small, versioned bridge for capabilities that need native Android support.
 *
 * Methods intentionally expose no credentials, filesystem paths, or arbitrary
 * URL execution. MainActivity installs this interface only on the trusted app
 * WebView and each method checks the current top-level origin again.
 */
final class ScrolithNativeBridge {
    static final String NAME = "ScrolithNative";
    static final String VERSION = "2";

    interface Host {
        boolean isTrustedCurrentPage();
        void openNativeFilePicker(String accept, boolean allowMultiple);
        void navigate(String path);
        void handleBridgeEvent(String eventName, JSONObject payload);
    }

    private final Context context;
    private final WebView webView;
    private final Host host;

    ScrolithNativeBridge(Context context, WebView webView, Host host) {
        this.context = context;
        this.webView = webView;
        this.host = host;
    }

    @JavascriptInterface
    public String getBridgeVersion() {
        return isTrusted() ? VERSION : "";
    }

    @JavascriptInterface
    public String getAppVersion() {
        if (!isTrusted()) return "";
        try {
            return context.getPackageManager()
                .getPackageInfo(context.getPackageName(), 0).versionName;
        } catch (Throwable ignored) {
            return "";
        }
    }

    @JavascriptInterface
    public String getConnectionState() {
        if (!isTrusted()) return "unknown";
        return MainActivity.isNetworkOnline(context) ? "online" : "offline";
    }

    @JavascriptInterface
    public String getCapabilities() {
        if (!isTrusted()) return "{}";
        try {
            JSONObject capabilities = new JSONObject();
            capabilities.put("bridgeVersion", VERSION);
            capabilities.put("nativeNavigation", NativeFeatureFlags.isNativeNavigationEnabled(context));
            capabilities.put("nativePriorityScreens", NativeFeatureFlags.arePriorityScreensEnabled(context));
            capabilities.put("events", new org.json.JSONArray()
                .put("scrolith:native-network")
                .put("scrolith:native-insets")
                .put("scrolith:native-keyboard")
                .put("scrolith:native-file-selected")
                .put("mobile:incoming-call")
                .put("mobile:push-notification-received"));
            return capabilities.toString();
        } catch (Throwable ignored) {
            return "{}";
        }
    }

    @JavascriptInterface
    public void showToast(final String message) {
        if (!isTrusted()) return;
        final String safeMessage = normalizeMessage(message);
        if (safeMessage.isEmpty()) return;
        webView.post(() -> Toast.makeText(context, safeMessage, Toast.LENGTH_SHORT).show());
    }

    @JavascriptInterface
    public void triggerHaptic(String style) {
        if (!isTrusted()) return;
        Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long duration = "strong".equalsIgnoreCase(style) ? 28L : 14L;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            vibrator.vibrate(duration);
        }
    }

    @JavascriptInterface
    public void openNativeFilePicker(String accept, boolean allowMultiple) {
        if (!isTrusted()) return;
        host.openNativeFilePicker(normalizeAccept(accept), allowMultiple);
    }

    /**
     * Versioned Web-to-native event entry point. Only the documented event
     * names are forwarded; arbitrary method reflection is never exposed.
     */
    @JavascriptInterface
    public void postEvent(String eventName, String payload) {
        if (!isTrusted()) return;
        String safeName = normalizeEventName(eventName);
        if (safeName.isEmpty()) return;
        try {
            JSONObject parsed = new JSONObject(payload == null || payload.trim().isEmpty() ? "{}" : payload);
            if ("navigate".equals(safeName)) {
                String path = parsed.optString("path", "");
                if (isSafeAppPath(path)) host.navigate(path);
                return;
            }
            if ("set_theme".equals(safeName) || "set_keyboard_mode".equals(safeName)) {
                host.handleBridgeEvent(safeName, parsed);
            }
        } catch (Throwable ignored) {
            // Optional bridge commands must never interrupt the WebView.
        }
    }

    /** Safe JSON envelope for native events dispatched into the web runtime. */
    static String eventScript(String eventName, JSONObject payload) {
        String safeName = eventName.replaceAll("[^A-Za-z0-9:_-]", "");
        if (safeName.isEmpty()) return "";
        String encoded = quoteForJavaScript(payload == null ? "{}" : payload.toString());
        return "(function(){try{var p=JSON.parse(" + encoded + ");window.dispatchEvent(new CustomEvent('"
            + safeName + "',{detail:p}));}catch(e){}})();";
    }

    private static String quoteForJavaScript(String value) {
        StringBuilder quoted = new StringBuilder(value.length() + 2).append('"');
        for (int i = 0; i < value.length(); i++) {
            char character = value.charAt(i);
            switch (character) {
                case '\\': quoted.append("\\\\"); break;
                case '"': quoted.append("\\\""); break;
                case '\n': quoted.append("\\n"); break;
                case '\r': quoted.append("\\r"); break;
                case '\t': quoted.append("\\t"); break;
                case '\b': quoted.append("\\b"); break;
                case '\f': quoted.append("\\f"); break;
                case '\u2028': quoted.append("\\u2028"); break;
                case '\u2029': quoted.append("\\u2029"); break;
                default: quoted.append(character);
            }
        }
        return quoted.append('"').toString();
    }

    private boolean isTrusted() {
        try {
            return host.isTrustedCurrentPage();
        } catch (Throwable ignored) {
            return false;
        }
    }

    private static String normalizeMessage(String value) {
        if (value == null) return "";
        String message = value.trim();
        return message.length() > 240 ? message.substring(0, 240) : message;
    }

    private static String normalizeAccept(String value) {
        if (value == null || value.trim().isEmpty()) return "*/*";
        String accept = value.trim();
        return accept.length() > 512 ? accept.substring(0, 512) : accept;
    }

    private static String normalizeEventName(String value) {
        if (value == null) return "";
        String event = value.trim().toLowerCase(java.util.Locale.ROOT);
        return event.length() > 48 ? event.substring(0, 48) : event;
    }

    private static boolean isSafeAppPath(String value) {
        String path = value == null ? "" : value.trim();
        return path.startsWith("/") && !path.startsWith("//") && !path.contains("\\")
            && !path.contains("javascript:") && path.length() <= 512;
    }
}
