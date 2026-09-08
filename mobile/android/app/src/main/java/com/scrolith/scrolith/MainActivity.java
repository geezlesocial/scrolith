package com.scrolith.scrolith;

import android.Manifest;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import android.view.Gravity;
import android.view.ViewGroup;
import android.graphics.drawable.GradientDrawable;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Phase 25 — Capacitor BridgeActivity production shell.
 *
 * Continuity from 21.1.2R: camera/mic WebRTC + voice-note permission bridge,
 * release WebView hardening, cookie persistence, keyboard resize, low-memory recovery.
 *
 * Phase 25 additive:
 * - AndroidX SplashScreen install
 * - Edge-to-edge system bars with brand colors
 * - Predictive back (Android 13+) via OnBackPressedCallback
 * - External http(s) links open outside WebView when not Scrolith
 * - File chooser / download hooks preserved through BridgeWebChromeClient
 * - Offline connectivity probe exposed to WebView as window.__SCROLITH_NATIVE_ONLINE
 * - FCM monochrome icon meta already declared in AndroidManifest
 */
public class MainActivity extends BridgeActivity {

    public static final String ACTION_INCOMING_CALL = "com.scrolith.action.INCOMING_CALL";
    public static final String EXTRA_CALL_ID = "scrolith_call_id";
    public static final String EXTRA_CONVERSATION_ID = "scrolith_conversation_id";
    public static final String EXTRA_INITIATOR_ID = "scrolith_initiator_id";
    public static final String EXTRA_INITIATOR_NAME = "scrolith_initiator_name";
    public static final String EXTRA_MEDIA_MODE = "scrolith_media_mode";
    public static final String EXTRA_CALL_TYPE = "scrolith_call_type";
    public static final String EXTRA_PARTICIPANT_IDS = "scrolith_participant_ids";
    public static final String EXTRA_DEEP_LINK = "scrolith_deep_link";

    private static final int WEBRTC_MEDIA_PERMISSION_REQUEST_CODE = 4157;
    private static final int NATIVE_FILE_PICKER_REQUEST_CODE = 4158;
    private static final String NATIVE_BRIDGE_NAME = ScrolithNativeBridge.NAME;
    private static final String NATIVE_SHELL_TAG = "ScrolithNativeShell";

    private PermissionRequest pendingWebRtcPermissionRequest;
    private String[] pendingAndroidPermissions = new String[0];
    private boolean splashKeepOnScreen = true;
    private String pendingIncomingCallJson;
    private ConnectivityManager.NetworkCallback networkCallback;
    private View nativeStatusOverlay;
    private TextView nativeStatusTitle;
    private TextView nativeStatusMessage;
    private Button nativeStatusAction;
    private View nativeNavigationBar;
    private int nativeNavigationOriginalBottomPadding = -1;
    private NativeNotificationsView nativeNotificationsView;
    private NativeMessagesListView nativeMessagesListView;
    private boolean pageLoaded;
    private boolean mainFrameLoadFailed;
    private boolean renderProcessRecoveryAttempted;
    private String pendingFilePickerAccept = "*/*";
    private boolean pendingFilePickerMultiple;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Phase 25 — install splash before super so cold start is branded.
        try {
            SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
            splashScreen.setKeepOnScreenCondition(() -> splashKeepOnScreen);
        } catch (Throwable ignored) {
            // Older devices / missing dependency: theme splash still applies.
        }

        // Soft input must be set before super so the Bridge WebView resizes with
        // the keyboard (messaging composer / Scrolitha / auth forms).
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        NativeFeatureFlags.applyDebugOverrides(this, getIntent());
        super.onCreate(savedInstanceState);
        handleIncomingCallIntent(getIntent());
        configureSystemBars();
        registerPredictiveBack();
        // Release splash once first layout is ready (WebView load continues async).
        getWindow().getDecorView().post(() -> splashKeepOnScreen = false);
    }

    @Override
    protected void load() {
        super.load();
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }

        final WebView webView = bridge.getWebView();
        final boolean isDebuggable =
            (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;

        // Production hardening: never leave remote WebView debugging enabled in release.
        try {
            if (!isDebuggable) {
                WebView.setWebContentsDebuggingEnabled(false);
            }
        } catch (Throwable ignored) {
            // Best-effort only.
        }

        configureWebViewForProduction(webView, isDebuggable);
        ensureNativeStatusOverlay(webView);
        ensureNativeNavigationBar(webView);
        observeWindowInsets(webView);
        webView.addJavascriptInterface(
            new ScrolithNativeBridge(this, webView, new ScrolithNativeBridge.Host() {
                @Override
                public boolean isTrustedCurrentPage() {
                    return isTrustedWebViewOrigin(Uri.parse(valueOrEmpty(webView.getUrl())));
                }

                @Override
                public void openNativeFilePicker(String accept, boolean allowMultiple) {
                    openNativeFilePickerInternal(accept, allowMultiple);
                }

                @Override
                public void navigate(String path) {
                    navigateWebPath(path);
                }

                @Override
                public void openNativeNotifications() {
                    showNativeNotifications();
                }

                @Override
                public void closeNativeNotifications() {
                    hideNativeNotifications();
                }

                @Override
                public void openNativeMessages() {
                    showNativeMessages();
                }

                @Override
                public void closeNativeMessages() {
                    hideNativeMessages();
                }

                @Override
                public void handleBridgeEvent(String eventName, JSONObject payload) {
                    handleBridgeEventInternal(eventName, payload);
                }
            }),
            NATIVE_BRIDGE_NAME
        );
        injectNativeOnlineState(webView);
        publishPendingIncomingCall(webView);
        bridge.getWebView().setWebChromeClient(new AppWebChromeClient());
        bridge.setWebViewClient(new AppWebViewClient(bridge));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingCallIntent(intent);
        if (bridge != null && bridge.getWebView() != null) {
            publishPendingIncomingCall(bridge.getWebView());
        }
    }

    private void handleIncomingCallIntent(Intent intent) {
        if (intent == null || !intent.hasExtra(EXTRA_CALL_ID)) return;
        String callId = intent.getStringExtra(EXTRA_CALL_ID);
        String conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID);
        if (TextUtils.isEmpty(callId) || TextUtils.isEmpty(conversationId)) return;

        try {
            JSONObject data = new JSONObject();
            data.put("type", "call_ringing");
            data.put("callId", callId);
            data.put("conversationId", conversationId);
            data.put("initiatorId", valueOrEmpty(intent.getStringExtra(EXTRA_INITIATOR_ID)));
            data.put("initiatorName", valueOrEmpty(intent.getStringExtra(EXTRA_INITIATOR_NAME)));
            data.put("mediaMode", "video".equals(intent.getStringExtra(EXTRA_MEDIA_MODE)) ? "video" : "audio");
            data.put("callType", valueOrEmpty(intent.getStringExtra(EXTRA_CALL_TYPE)));
            String participantIds = intent.getStringExtra(EXTRA_PARTICIPANT_IDS);
            if (!TextUtils.isEmpty(participantIds)) {
                try {
                    data.put("participantIds", new JSONArray(participantIds));
                } catch (JSONException ignored) {
                    data.put("participantIds", participantIds);
                }
            }

            JSONObject payload = new JSONObject();
            payload.put("type", "call_ringing");
            payload.put("data", data);
            payload.put("deepLink", valueOrEmpty(intent.getStringExtra(EXTRA_DEEP_LINK)));
            payload.put("title", "Incoming call");
            payload.put("body", "Incoming Scrolith call");
            pendingIncomingCallJson = payload.toString();
            ScrolithFirebaseMessagingService.dismissCallNotification(this, callId);
        } catch (JSONException ignored) {
            pendingIncomingCallJson = null;
        }
    }

    private static String valueOrEmpty(String value) {
        return value == null ? "" : value;
    }

    private void publishPendingIncomingCall(WebView webView) {
        if (webView == null || pendingIncomingCallJson == null) return;
        final String payload = pendingIncomingCallJson;
        webView.postDelayed(() -> {
            try {
                String encodedPayload = JSONObject.quote(payload);
                String js = "(function(){try{var p=JSON.parse(" + encodedPayload + ")"
                    + ";window.__scrolithPendingIncomingCall=p;window.dispatchEvent(new CustomEvent('mobile:incoming-call',{detail:p}));}catch(e){}})();";
                webView.evaluateJavascript(js, null);
                if (payload.equals(pendingIncomingCallJson)) pendingIncomingCallJson = null;
            } catch (Throwable ignored) {
                // The WebView may still be loading; a later lifecycle callback retries.
            }
        }, 750L);
    }

    /**
     * Session cookies + performance defaults required by the production SPA.
     * Does not replace Capacitor WebSettings; only hardens release behavior.
     */
    private void configureWebViewForProduction(WebView webView, boolean isDebuggable) {
        try {
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                cookieManager.flush();
            }
        } catch (Throwable ignored) {
            // Best-effort; Capacitor still loads the SPA.
        }

        try {
            WebSettings settings = webView.getSettings();
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
            settings.setSupportZoom(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(true);
            settings.setSupportMultipleWindows(false);
            String userAgent = settings.getUserAgentString();
            String appMarker = " ScrolithAndroid/" + getInstalledVersionName();
            if (userAgent != null && !userAgent.contains("ScrolithAndroid/")) {
                settings.setUserAgentString(userAgent + appMarker);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                settings.setSafeBrowsingEnabled(true);
            }
            // Allow WebAuthn/passkey ceremony inside the trusted production WebView.
            // The web app still gates the feature with VITE_PASSKEYS_ENABLED; this
            // only enables the platform capability for Android 9+ devices.
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) {
                WebSettingsCompat.setWebAuthenticationSupport(
                    settings,
                    WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP
                );
            }
            // Use the normal validated cache online, but allow the last known SPA shell
            // to start when the device has no network. The web app still owns auth and
            // data freshness; this only improves cold-start resilience.
            settings.setCacheMode(
                isNetworkOnline()
                    ? WebSettings.LOAD_DEFAULT
                    : WebSettings.LOAD_CACHE_ELSE_NETWORK
            );
            if (!isDebuggable) {
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            }
            // Layer type for smoother scroll on modern devices.
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
            webView.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
            // Phase 25 — reduce jank on fling.
            webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        } catch (Throwable ignored) {
            // Best-effort only.
        }
    }

    private void configureSystemBars() {
        try {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                getWindow().setStatusBarColor(ContextCompat.getColor(this, R.color.statusBarColor));
                getWindow().setNavigationBarColor(ContextCompat.getColor(this, R.color.navigationBarColor));
            }
            View decor = getWindow().getDecorView();
            WindowInsetsControllerCompat controller =
                new WindowInsetsControllerCompat(getWindow(), decor);
            // Light nav icons on dark status bar (brand primary / dark mode bar).
            controller.setAppearanceLightStatusBars(false);
            boolean night =
                (getResources().getConfiguration().uiMode
                        & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
                    == android.content.res.Configuration.UI_MODE_NIGHT_YES;
            controller.setAppearanceLightNavigationBars(!night);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                getWindow().setNavigationBarContrastEnforced(true);
            }
        } catch (Throwable ignored) {
            // Best-effort on older devices.
        }
    }

    private void applyThemeMode(String mode) {
        String normalized = mode == null ? "system" : mode.trim().toLowerCase(java.util.Locale.ROOT);
        boolean night = (getResources().getConfiguration().uiMode
            & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
            == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        if ("dark".equals(normalized)) night = true;
        if ("light".equals(normalized)) night = false;
        try {
            WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(
                getWindow(), getWindow().getDecorView());
            controller.setAppearanceLightStatusBars(false);
            controller.setAppearanceLightNavigationBars(!night);
        } catch (Throwable ignored) {
            // Theme synchronization is best-effort.
        }
    }

    private void handleBridgeEventInternal(String eventName, JSONObject payload) {
        if ("set_theme".equals(eventName)) {
            applyThemeMode(payload == null ? "system" : payload.optString("mode", "system"));
            return;
        }
        if ("set_keyboard_mode".equals(eventName)) {
            String mode = payload == null ? "resize" : payload.optString("mode", "resize");
            int softInputMode = "pan".equalsIgnoreCase(mode)
                ? WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN
                : WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
            getWindow().setSoftInputMode(softInputMode);
            return;
        }
        if ("route_changed".equals(eventName)) {
            String path = payload == null ? "" : payload.optString("path", "");
            updateNativeNavigationVisibility(path);
            return;
        }
        if ("notifications:ready".equals(eventName)) {
            runOnUiThread(() -> {
                if (nativeNotificationsView != null) nativeNotificationsView.requestInitialSnapshot();
            });
            return;
        }
        if ("notifications:state".equals(eventName)) {
            runOnUiThread(() -> {
                if (nativeNotificationsView != null) nativeNotificationsView.applySnapshot(payload);
            });
            return;
        }
        if ("notifications:action_result".equals(eventName)) {
            runOnUiThread(() -> {
                if (nativeNotificationsView != null) nativeNotificationsView.applyActionResult(payload);
            });
            return;
        }
        if ("messages:ready".equals(eventName)) {
            runOnUiThread(() -> {
                if (nativeMessagesListView != null) nativeMessagesListView.requestInitialSnapshot();
            });
            return;
        }
        if ("messages:list_state".equals(eventName)) {
            runOnUiThread(() -> {
                if (nativeMessagesListView != null) nativeMessagesListView.applySnapshot(payload);
            });
            return;
        }
        if ("messages:action_result".equals(eventName)) {
            runOnUiThread(() -> {
                if (nativeMessagesListView != null) nativeMessagesListView.applyActionResult(payload);
            });
        }
    }

    private void showNativeNotifications() {
        if (!NativeFeatureFlags.isNativeNotificationsEnabled(this)
            || bridge == null || bridge.getWebView() == null
            || !(bridge.getWebView().getParent() instanceof ViewGroup)) return;
        runOnUiThread(() -> {
            try {
                ViewGroup parent = getNativeShellContainer(bridge.getWebView());
                if (parent == null) return;
                if (nativeNotificationsView == null) {
                    nativeNotificationsView = new NativeNotificationsView(this,
                        new NativeNotificationsView.Listener() {
                            @Override
                            public void requestSnapshot() {
                                dispatchNativeNotificationCommand("notifications.request_snapshot", null);
                            }

                            @Override
                            public void markRead(String notificationId) {
                                JSONObject data = new JSONObject();
                                try {
                                    data.put("id", notificationId);
                                } catch (JSONException ignored) {
                                    return;
                                }
                                dispatchNativeNotificationCommand("notifications.mark_read", data);
                            }

                            @Override
                            public void markAllRead() {
                                dispatchNativeNotificationCommand("notifications.mark_all_read", null);
                            }

                            @Override
                            public void openAction(String notificationId, String actionPath) {
                                JSONObject data = new JSONObject();
                                try {
                                    data.put("id", notificationId);
                                    data.put("actionPath", actionPath);
                                } catch (JSONException ignored) {
                                    return;
                                }
                                hideNativeNotifications();
                                dispatchNativeNotificationCommand("notifications.open_action", data);
                            }

                            @Override
                            public void close() {
                                hideNativeNotifications();
                            }
                        });
                    parent.addView(nativeNotificationsView, new ViewGroup.LayoutParams(-1, -1));
                }
                nativeNotificationsView.setVisibility(View.VISIBLE);
                nativeNotificationsView.bringToFront();
                nativeNotificationsView.requestFocus();
                nativeNotificationsView.requestInitialSnapshot();
            } catch (Throwable ignored) {
                hideNativeNotifications();
            }
        });
    }

    private void hideNativeNotifications() {
        runOnUiThread(() -> {
            if (nativeNotificationsView != null) {
                nativeNotificationsView.clearState();
                nativeNotificationsView.setVisibility(View.GONE);
            }
        });
    }

    private void showNativeMessages() {
        if (!NativeFeatureFlags.isNativeMessagesListEnabled(this)
            || bridge == null || bridge.getWebView() == null
            || !(bridge.getWebView().getParent() instanceof ViewGroup)) return;
        runOnUiThread(() -> {
            try {
                hideNativeNotifications();
                ViewGroup parent = getNativeShellContainer(bridge.getWebView());
                if (parent == null) return;
                if (nativeMessagesListView == null) {
                    nativeMessagesListView = new NativeMessagesListView(this,
                        new NativeMessagesListView.Listener() {
                            @Override
                            public void requestSnapshot() {
                                dispatchNativeMessagesCommand("messages.request_snapshot", null);
                            }

                            @Override
                            public void refresh() {
                                dispatchNativeMessagesCommand("messages.refresh", null);
                            }

                            @Override
                            public void markRead(String conversationId) {
                                JSONObject data = new JSONObject();
                                try {
                                    data.put("conversationId", conversationId);
                                } catch (JSONException ignored) {
                                    return;
                                }
                                dispatchNativeMessagesCommand("messages.mark_read", data);
                            }

                            @Override
                            public void openConversation(String conversationId, String actionPath) {
                                JSONObject data = new JSONObject();
                                try {
                                    data.put("conversationId", conversationId);
                                    data.put("actionPath", actionPath);
                                } catch (JSONException ignored) {
                                    return;
                                }
                                hideNativeMessages();
                                dispatchNativeMessagesCommand("messages.open_conversation", data);
                            }

                            @Override
                            public void openMenu() {
                                hideNativeMessages();
                                navigateWebPath("/m/home?openMenu=1");
                            }

                            @Override
                            public void close() {
                                hideNativeMessages();
                            }
                        });
                    parent.addView(nativeMessagesListView, new ViewGroup.LayoutParams(-1, -1));
                }
                nativeMessagesListView.setVisibility(View.VISIBLE);
                nativeMessagesListView.bringToFront();
                nativeMessagesListView.requestFocus();
                nativeMessagesListView.requestInitialSnapshot();
            } catch (Throwable ignored) {
                hideNativeMessages();
            }
        });
    }

    private void hideNativeMessages() {
        runOnUiThread(() -> {
            if (nativeMessagesListView != null) {
                nativeMessagesListView.clearState();
                nativeMessagesListView.setVisibility(View.GONE);
            }
        });
    }

    private void dispatchNativeNotificationCommand(String command, JSONObject data) {
        if (bridge == null || bridge.getWebView() == null || command == null) return;
        try {
            JSONObject payload = data == null ? new JSONObject() : new JSONObject(data.toString());
            payload.put("command", command);
            payload.put("bridgeVersion", ScrolithNativeBridge.VERSION);
            payload.put("requestId", UUID.randomUUID().toString());
            String script = ScrolithNativeBridge.eventScript("scrolith:native-command", payload);
            bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(script, null));
        } catch (JSONException ignored) {
            // Optional native command must never interrupt the WebView.
        }
    }

    private void dispatchNativeMessagesCommand(String command, JSONObject data) {
        if (bridge == null || bridge.getWebView() == null || command == null) return;
        try {
            JSONObject payload = data == null ? new JSONObject() : new JSONObject(data.toString());
            payload.put("command", command);
            payload.put("bridgeVersion", ScrolithNativeBridge.VERSION);
            payload.put("requestId", UUID.randomUUID().toString());
            String script = ScrolithNativeBridge.eventScript("scrolith:native-command", payload);
            bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(script, null));
        } catch (JSONException ignored) {
            // Optional native command must never interrupt the WebView.
        }
    }

    private void navigateWebPath(String path) {
        String normalized = path == null ? "" : path.trim();
        if (!normalized.startsWith("/") || normalized.startsWith("//")
            || normalized.contains("\\") || normalized.toLowerCase(java.util.Locale.US).contains("javascript:")
            || normalized.length() > 512) return;
        try {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().loadUrl("https://scrolith.com" + normalized);
            }
        } catch (Throwable ignored) {
            Log.w(NATIVE_SHELL_TAG, "Native navigation fallback failed");
        }
    }

    private void ensureNativeNavigationBar(WebView webView) {
        if (!NativeFeatureFlags.isNativeNavigationEnabled(this)
            || nativeNavigationBar != null) return;
        ViewGroup parent = getNativeShellContainer(webView);
        if (parent == null) return;
        if (nativeNavigationOriginalBottomPadding < 0) {
            nativeNavigationOriginalBottomPadding = webView.getPaddingBottom();
        }
        LinearLayout navigation = new LinearLayout(this);
        navigation.setOrientation(LinearLayout.HORIZONTAL);
        navigation.setGravity(Gravity.CENTER);
        navigation.setBackgroundColor(Color.WHITE);
        navigation.setElevation(dp(8));
        navigation.setContentDescription("Scrolith native navigation");

        int[] icons = {
            android.R.drawable.ic_menu_view,
            android.R.drawable.ic_dialog_email,
            android.R.drawable.ic_menu_sort_by_size,
            android.R.drawable.ic_menu_search,
            android.R.drawable.ic_menu_myplaces
        };
        String[] labels = {"Home", "Messages", "Scroll", "Match", "Profile"};
        String[] paths = {"/member-home", "/messages", "/scroll", "/match", "/profile/edit"};
        for (int i = 0; i < labels.length; i++) {
            LinearLayout item = new LinearLayout(this);
            item.setOrientation(LinearLayout.VERTICAL);
            item.setGravity(Gravity.CENTER);
            item.setPadding(dp(4), dp(3), dp(4), dp(3));
            item.setFocusable(true);
            item.setClickable(true);
            item.setContentDescription(labels[i]);
            ImageButton icon = new ImageButton(this);
            icon.setImageResource(icons[i]);
            icon.setColorFilter(Color.rgb(30, 41, 59));
            icon.setBackgroundColor(Color.TRANSPARENT);
            icon.setContentDescription(labels[i]);
            icon.setPadding(dp(8), dp(4), dp(8), dp(2));
            item.addView(icon, new LinearLayout.LayoutParams(dp(40), dp(32)));
            TextView label = new TextView(this);
            label.setText(labels[i]);
            label.setTextColor(Color.rgb(30, 41, 59));
            label.setTextSize(11);
            label.setGravity(Gravity.CENTER);
            item.addView(label, new LinearLayout.LayoutParams(-1, dp(24)));
            final String path = paths[i];
            final String labelText = labels[i];
            item.setOnClickListener(v -> {
                if ("Messages".equals(labelText) && NativeFeatureFlags.isNativeMessagesListEnabled(this)) {
                    showNativeMessages();
                } else {
                    navigateWebPath(path);
                }
            });
            navigation.addView(item, new LinearLayout.LayoutParams(0, dp(56), 1f));
        }
        if (parent instanceof FrameLayout) {
            FrameLayout.LayoutParams navigationParams = new FrameLayout.LayoutParams(-1, dp(56));
            navigationParams.gravity = Gravity.BOTTOM;
            parent.addView(navigation, navigationParams);
        } else {
            parent.addView(navigation, new ViewGroup.LayoutParams(-1, dp(64)));
        }
        nativeNavigationBar = navigation;
        updateNativeNavigationVisibility(valueOrEmpty(webView.getUrl()));
    }

    private void updateNativeNavigationVisibility(String rawPath) {
        if (nativeNavigationBar == null) return;
        String path = rawPath == null ? "" : rawPath.trim();
        try {
            Uri uri = Uri.parse(path);
            path = uri.getPath() == null ? path : uri.getPath();
        } catch (Throwable ignored) {
            // Treat malformed route state as a non-home route.
        }
        while (path.length() > 1 && path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        boolean memberHome = "/m".equals(path)
            || "/m/home".equals(path)
            || "/member-home".equals(path)
            || "/home".equals(path)
            || path.isEmpty();
        int visibility = memberHome ? View.VISIBLE : View.GONE;
        nativeNavigationBar.setVisibility(visibility);
        if (bridge == null || bridge.getWebView() == null) return;
        WebView webView = bridge.getWebView();
        int bottom = nativeNavigationOriginalBottomPadding < 0
            ? webView.getPaddingBottom()
            : nativeNavigationOriginalBottomPadding;
        if (memberHome) bottom += dp(56);
        webView.setPadding(webView.getPaddingLeft(), webView.getPaddingTop(), webView.getPaddingRight(), bottom);
    }

    /**
     * Host native overlays in the activity content frame, not the WebView's
     * implementation parent. Some Capacitor versions use a LinearLayout
     * parent, which otherwise places the navigation bar above the web shell.
     */
    private ViewGroup getNativeShellContainer(WebView webView) {
        View content = findViewById(android.R.id.content);
        if (content instanceof ViewGroup) return (ViewGroup) content;
        if (webView != null && webView.getParent() instanceof ViewGroup) {
            return (ViewGroup) webView.getParent();
        }
        return null;
    }

    private void observeWindowInsets(WebView webView) {
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            dispatchNativeInsets(insets);
            return insets;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    private void dispatchNativeInsets(WindowInsetsCompat insets) {
        if (insets == null || bridge == null || bridge.getWebView() == null) return;
        try {
            android.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()).toPlatformInsets();
            android.graphics.Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime()).toPlatformInsets();
            JSONObject payload = new JSONObject();
            payload.put("top", bars.top);
            payload.put("right", bars.right);
            payload.put("bottom", bars.bottom);
            payload.put("left", bars.left);
            payload.put("keyboardVisible", insets.isVisible(WindowInsetsCompat.Type.ime()));
            payload.put("keyboardBottom", ime.bottom);
            String script = ScrolithNativeBridge.eventScript("scrolith:native-insets", payload);
            bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(script, null));
        } catch (JSONException ignored) {
            // Optional insets event only.
        }
    }

    /**
     * Phase 25 — Android 13+ predictive back: WebView history first, then finish.
     */
    private void registerPredictiveBack() {
        try {
            getOnBackPressedDispatcher().addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        try {
                            if (nativeNotificationsView != null
                                && nativeNotificationsView.getVisibility() == View.VISIBLE) {
                                hideNativeNotifications();
                                return;
                            }
                            if (nativeMessagesListView != null
                                && nativeMessagesListView.getVisibility() == View.VISIBLE) {
                                hideNativeMessages();
                                return;
                            }
                            if (bridge != null && bridge.getWebView() != null && bridge.getWebView().canGoBack()) {
                                bridge.getWebView().goBack();
                                return;
                            }
                        } catch (Throwable ignored) {
                            // fall through
                        }
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                }
            );
        } catch (Throwable ignored) {
            // BridgeActivity default back handling remains.
        }
    }

    /** Publish connectivity to SPA for offline banners / queue drain. */
    private void injectNativeOnlineState(WebView webView) {
        try {
            final boolean online = isNetworkOnline();
            webView.post(() -> {
                try {
                    String js =
                        "try{window.__SCROLITH_NATIVE_ONLINE="
                            + (online ? "true" : "false")
                            + ";window.dispatchEvent(new CustomEvent('scrolith:native-network',{detail:{online:"
                            + (online ? "true" : "false")
                            + "}}));}catch(e){}";
                    webView.evaluateJavascript(js, null);
                } catch (Throwable ignored) {
                    // ignore
                }
            });
        } catch (Throwable ignored) {
            // ignore
        }
    }

    private boolean isNetworkOnline() {
        return isNetworkOnline(this);
    }

    static boolean isNetworkOnline(android.content.Context context) {
        try {
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(CONNECTIVITY_SERVICE);
            if (cm == null) return true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network network = cm.getActiveNetwork();
                if (network == null) return false;
                NetworkCapabilities caps = cm.getNetworkCapabilities(network);
                if (caps == null) return false;
                return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    && (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                        || caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                        || caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
                        || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET));
            }
            android.net.NetworkInfo info = cm.getActiveNetworkInfo();
            return info != null && info.isConnected();
        } catch (Throwable ignored) {
            return true;
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        try {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().onResume();
                injectNativeOnlineState(bridge.getWebView());
                publishPendingIncomingCall(bridge.getWebView());
            }
        } catch (Throwable ignored) {
            // ignore
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        registerNetworkCallback();
    }

    @Override
    public void onStop() {
        unregisterNetworkCallback();
        super.onStop();
    }

    @Override
    public void onPause() {
        try {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().onPause();
            }
        } catch (Throwable ignored) {
            // The WebView may already be tearing down.
        }
        super.onPause();
    }

    @Override
    public void onDestroy() {
        try {
            if (pendingWebRtcPermissionRequest != null) {
                pendingWebRtcPermissionRequest.deny();
                pendingWebRtcPermissionRequest = null;
            }
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().removeJavascriptInterface(NATIVE_BRIDGE_NAME);
            }
            nativeNotificationsView = null;
        } catch (Throwable ignored) {
            // Best-effort cleanup; Capacitor owns the final WebView teardown.
        }
        super.onDestroy();
    }

    private String getInstalledVersionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Throwable ignored) {
            return "unknown";
        }
    }

    /** Keep the SPA's offline queue and reconnect UI aligned with Android network changes. */
    private void registerNetworkCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N || networkCallback != null) {
            return;
        }
        try {
            ConnectivityManager connectivityManager =
                (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (connectivityManager == null) {
                return;
            }
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    dispatchCurrentNetworkState();
                }

                @Override
                public void onLost(Network network) {
                    dispatchCurrentNetworkState();
                }

                @Override
                public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                    dispatchCurrentNetworkState();
                }
            };
            connectivityManager.registerDefaultNetworkCallback(networkCallback);
        } catch (Throwable ignored) {
            networkCallback = null;
        }
    }

    private void unregisterNetworkCallback() {
        if (networkCallback == null) {
            return;
        }
        try {
            ConnectivityManager connectivityManager =
                (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (connectivityManager != null) {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            }
        } catch (Throwable ignored) {
            // The callback may already have been removed by the platform.
        } finally {
            networkCallback = null;
        }
    }

    private void dispatchCurrentNetworkState() {
        try {
            if (bridge != null && bridge.getWebView() != null) {
                injectNativeOnlineState(bridge.getWebView());
                if (!pageLoaded && isNetworkOnline() && nativeStatusOverlay != null
                    && nativeStatusOverlay.getVisibility() == View.VISIBLE) {
                    reloadWebView();
                }
            }
        } catch (Throwable ignored) {
            // The WebView may be tearing down during an activity transition.
        }
    }

    private void ensureNativeStatusOverlay(WebView webView) {
        if (nativeStatusOverlay != null || !(webView.getParent() instanceof ViewGroup)) return;
        ViewGroup parent = (ViewGroup) webView.getParent();
        LinearLayout overlay = new LinearLayout(this);
        overlay.setOrientation(LinearLayout.VERTICAL);
        overlay.setGravity(Gravity.CENTER);
        overlay.setPadding(dp(28), dp(28), dp(28), dp(28));
        overlay.setBackgroundColor(Color.rgb(248, 250, 252));
        overlay.setVisibility(View.GONE);

        TextView title = new TextView(this);
        title.setTextColor(Color.rgb(15, 23, 42));
        title.setTextSize(22);
        title.setGravity(Gravity.CENTER);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        overlay.addView(title, new LinearLayout.LayoutParams(-1, -2));

        TextView message = new TextView(this);
        message.setTextColor(Color.rgb(71, 85, 105));
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(-1, -2);
        messageParams.setMargins(0, dp(12), 0, dp(20));
        overlay.addView(message, messageParams);

        Button action = new Button(this);
        action.setText("Retry");
        action.setAllCaps(false);
        action.setTextColor(Color.WHITE);
        GradientDrawable buttonBackground = new GradientDrawable();
        buttonBackground.setColor(Color.rgb(11, 95, 255));
        buttonBackground.setCornerRadius(dp(24));
        action.setBackground(buttonBackground);
        action.setOnClickListener(v -> reloadWebView());
        overlay.addView(action, new LinearLayout.LayoutParams(dp(160), dp(52)));

        parent.addView(overlay, new ViewGroup.LayoutParams(-1, -1));
        nativeStatusOverlay = overlay;
        nativeStatusTitle = title;
        nativeStatusMessage = message;
        nativeStatusAction = action;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void showNativeStatus(boolean offline) {
        runOnUiThread(() -> {
            if (nativeStatusOverlay == null) return;
            nativeStatusTitle.setText(offline ? "No internet connection" : "Scrolith could not load");
            nativeStatusMessage.setText(offline
                ? "Check your connection and retry when you are online."
                : "The app could not load this page. Retry to continue.");
            nativeStatusAction.setText("Retry");
            nativeStatusOverlay.setVisibility(View.VISIBLE);
        });
    }

    private void hideNativeStatus() {
        runOnUiThread(() -> {
            if (nativeStatusOverlay != null) nativeStatusOverlay.setVisibility(View.GONE);
        });
    }

    private void reloadWebView() {
        if (!isNetworkOnline()) {
            showNativeStatus(true);
            return;
        }
        try {
            pageLoaded = false;
            renderProcessRecoveryAttempted = false;
            if (bridge != null && bridge.getWebView() != null) {
                hideNativeStatus();
                bridge.getWebView().reload();
            }
        } catch (Throwable ignored) {
            showNativeStatus(false);
        }
    }

    private void openNativeFilePickerInternal(String accept, boolean allowMultiple) {
        runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(accept == null || accept.isEmpty() ? "*/*" : accept)
                .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple);
            pendingFilePickerAccept = accept;
            pendingFilePickerMultiple = allowMultiple;
            try {
                startActivityForResult(intent, NATIVE_FILE_PICKER_REQUEST_CODE);
            } catch (ActivityNotFoundException ignored) {
                dispatchNativeFileSelection(new Uri[0], true);
            }
        });
    }

    private void dispatchNativeFileSelection(Uri[] uris, boolean cancelled) {
        if (bridge == null || bridge.getWebView() == null) return;
        try {
            JSONObject payload = new JSONObject();
            payload.put("cancelled", cancelled);
            payload.put("accept", pendingFilePickerAccept);
            payload.put("multiple", pendingFilePickerMultiple);
            JSONArray files = new JSONArray();
            if (uris != null) {
                for (Uri uri : uris) if (uri != null) files.put(uri.toString());
            }
            payload.put("uris", files);
            String script = ScrolithNativeBridge.eventScript("scrolith:native-file-selected", payload);
            bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(script, null));
        } catch (JSONException ignored) {
            // Ignore malformed optional event payloads.
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == NATIVE_FILE_PICKER_REQUEST_CODE) {
            List<Uri> selected = new ArrayList<>();
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                        Uri uri = data.getClipData().getItemAt(i).getUri();
                        if (uri != null) selected.add(uri);
                    }
                } else if (data.getData() != null) {
                    selected.add(data.getData());
                }
            }
            dispatchNativeFileSelection(selected.toArray(new Uri[0]), selected.isEmpty());
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private final class AppWebViewClient extends BridgeWebViewClient {
        AppWebViewClient(com.getcapacitor.Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            pageLoaded = false;
            mainFrameLoadFailed = false;
            updateNativeNavigationVisibility(url);
            super.onPageStarted(view, url, favicon);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (mainFrameLoadFailed) {
                return;
            }
            pageLoaded = true;
            renderProcessRecoveryAttempted = false;
            updateNativeNavigationVisibility(url);
            hideNativeStatus();
            injectNativeOnlineState(view);
            publishPendingIncomingCall(view);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (request == null || request.isForMainFrame()) {
                pageLoaded = false;
                mainFrameLoadFailed = true;
                showNativeStatus(isNetworkOnline() == false);
            }
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            super.onReceivedError(view, errorCode, description, failingUrl);
            pageLoaded = false;
            showNativeStatus(isNetworkOnline() == false);
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            super.onReceivedHttpError(view, request, response);
            if (request == null || request.isForMainFrame()) {
                pageLoaded = false;
                mainFrameLoadFailed = true;
                showNativeStatus(false);
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            super.onRenderProcessGone(view, detail);
            if (!renderProcessRecoveryAttempted && !isFinishing()) {
                renderProcessRecoveryAttempted = true;
                showNativeStatus(false);
                view.postDelayed(() -> {
                    if (!isFinishing()) recreate();
                }, 250L);
            }
            return true;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        if (requestCode == WEBRTC_MEDIA_PERMISSION_REQUEST_CODE) {
            boolean allGranted = grantResults.length > 0;
            for (int grantResult : grantResults) {
                if (grantResult != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            resolvePendingWebRtcPermission(allGranted, permissions, grantResults);
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    private final class AppWebChromeClient extends BridgeWebChromeClient {

        AppWebChromeClient() {
            super(MainActivity.this.bridge);
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(() -> handleWebRtcPermissionRequest(request));
        }

        @Override
        public boolean onShowFileChooser(
            WebView webView,
            ValueCallback<Uri[]> filePathCallback,
            WebChromeClient.FileChooserParams fileChooserParams
        ) {
            // Delegate to Capacitor Bridge file chooser (camera / gallery / documents).
            return super.onShowFileChooser(webView, filePathCallback, fileChooserParams);
        }

        @Override
        public boolean onCreateWindow(
            WebView view,
            boolean isDialog,
            boolean isUserGesture,
            android.os.Message resultMsg
        ) {
            // Phase 25 — open target=_blank / window.open external destinations in system browser
            // when host is not Scrolith; otherwise load in the primary WebView.
            try {
                WebView.HitTestResult result = view.getHitTestResult();
                String extra = result != null ? result.getExtra() : null;
                if (extra != null && (extra.startsWith("http://") || extra.startsWith("https://"))) {
                    Uri uri = Uri.parse(extra);
                    if (!isTrustedWebViewOrigin(uri)) {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                        return false;
                    }
                    view.loadUrl(extra);
                    return false;
                }
            } catch (Throwable ignored) {
                // fall through
            }
            return super.onCreateWindow(view, isDialog, isUserGesture, resultMsg);
        }
    }

    /**
     * Only Scrolith origins may receive capture grants.
     * Grants only the capture resources that match approved Android runtime permissions.
     */
    private void handleWebRtcPermissionRequest(PermissionRequest request) {
        if (request == null) {
            return;
        }

        if (!isTrustedWebViewOrigin(request.getOrigin())) {
            try {
                request.deny();
            } catch (Throwable ignored) {
                // ignore
            }
            return;
        }

        List<String> resources = Arrays.asList(request.getResources());
        List<String> androidPermissions = new ArrayList<>();
        boolean wantsAudio = resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
        boolean wantsVideo = resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);

        if (wantsVideo) {
            androidPermissions.add(Manifest.permission.CAMERA);
        }
        if (wantsAudio) {
            androidPermissions.add(Manifest.permission.RECORD_AUDIO);
        }

        // Non-capture WebView resources (rare): deny rather than blanket-grant.
        if (androidPermissions.isEmpty()) {
            try {
                request.deny();
            } catch (Throwable ignored) {
                // ignore
            }
            return;
        }

        if (hasAllPermissions(androidPermissions)) {
            grantCaptureResources(request, wantsAudio, wantsVideo, true, true);
            return;
        }

        pendingWebRtcPermissionRequest = request;
        pendingAndroidPermissions = androidPermissions.toArray(new String[0]);
        ActivityCompat.requestPermissions(
            this,
            pendingAndroidPermissions,
            WEBRTC_MEDIA_PERMISSION_REQUEST_CODE
        );
    }

    private boolean isTrustedWebViewOrigin(Uri origin) {
        if (origin == null) {
            return false;
        }
        return WebViewOriginPolicy.isTrusted(
            origin.getScheme(),
            origin.getHost(),
            (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0
        );
    }

    private void grantCaptureResources(
        PermissionRequest request,
        boolean wantsAudio,
        boolean wantsVideo,
        boolean audioGranted,
        boolean videoGranted
    ) {
        List<String> granted = new ArrayList<>();
        if (wantsAudio && audioGranted) {
            granted.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
        }
        if (wantsVideo && videoGranted) {
            granted.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
        }
        try {
            if (granted.isEmpty()) {
                request.deny();
            } else {
                request.grant(granted.toArray(new String[0]));
            }
        } catch (Throwable ignored) {
            try {
                request.deny();
            } catch (Throwable ignored2) {
                // ignore
            }
        }
    }

    private boolean hasAllPermissions(List<String> permissions) {
        for (String permission : permissions) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    private void resolvePendingWebRtcPermission(boolean allGranted, String[] permissions, int[] grantResults) {
        if (pendingWebRtcPermissionRequest == null) {
            return;
        }

        PermissionRequest request = pendingWebRtcPermissionRequest;
        pendingWebRtcPermissionRequest = null;

        // The page may have navigated while Android was showing the permission
        // dialog. Never grant capture to the origin that is currently stale.
        if (!isTrustedWebViewOrigin(request.getOrigin())) {
            try {
                request.deny();
            } catch (Throwable ignored) {
                // ignore
            }
            return;
        }

        List<String> resources = Arrays.asList(request.getResources());
        boolean wantsAudio = resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
        boolean wantsVideo = resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);

        Set<String> grantedSet = new HashSet<>();
        if (permissions != null && grantResults != null) {
            for (int i = 0; i < permissions.length && i < grantResults.length; i++) {
                if (grantResults[i] == PackageManager.PERMISSION_GRANTED) {
                    grantedSet.add(permissions[i]);
                }
            }
        }

        boolean audioGranted =
            !wantsAudio || grantedSet.contains(Manifest.permission.RECORD_AUDIO)
                || ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                    == PackageManager.PERMISSION_GRANTED;
        boolean videoGranted =
            !wantsVideo || grantedSet.contains(Manifest.permission.CAMERA)
                || ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED;

        // If the platform reported a bulk denial, still evaluate per-resource.
        if (!allGranted && !audioGranted && !videoGranted) {
            try {
                request.deny();
            } catch (Throwable ignored) {
                // ignore
            }
            return;
        }

        grantCaptureResources(request, wantsAudio, wantsVideo, audioGranted, videoGranted);
    }
}
