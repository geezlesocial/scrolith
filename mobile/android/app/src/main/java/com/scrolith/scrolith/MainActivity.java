package com.scrolith.scrolith;

import android.Manifest;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
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

    private PermissionRequest pendingWebRtcPermissionRequest;
    private String[] pendingAndroidPermissions = new String[0];
    private boolean splashKeepOnScreen = true;
    private String pendingIncomingCallJson;

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
        injectNativeOnlineState(webView);
        publishPendingIncomingCall(webView);
        bridge.getWebView().setWebChromeClient(new AppWebChromeClient());
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
                String js = "(function(){try{var p=" + payload
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
            // Prefer default HTTP cache so image/API caching from the SPA works offline-ish.
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
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
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
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
                injectNativeOnlineState(bridge.getWebView());
                publishPendingIncomingCall(bridge.getWebView());
            }
        } catch (Throwable ignored) {
            // ignore
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
