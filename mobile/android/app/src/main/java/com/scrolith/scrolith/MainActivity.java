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
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import org.json.JSONObject;
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
import java.util.Locale;
import java.util.Set;

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

    private static final int WEBRTC_MEDIA_PERMISSION_REQUEST_CODE = 4157;
    private static volatile boolean appInForeground = false;

    private PermissionRequest pendingWebRtcPermissionRequest;
    private String[] pendingAndroidPermissions = new String[0];
    private boolean splashKeepOnScreen = true;

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
        dispatchIncomingCallIntent(getIntent());
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
        bridge.getWebView().setWebChromeClient(new AppWebChromeClient());
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
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        // Low-memory recovery: drop WebView render priority when the system is under pressure.
        try {
            if (bridge != null && bridge.getWebView() != null) {
                if (level >= android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
                    bridge.getWebView().pauseTimers();
                    bridge.getWebView().resumeTimers();
                }
                if (level >= android.content.ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN) {
                    // Free GPU resources while backgrounded.
                    bridge.getWebView().onPause();
                    bridge.getWebView().onResume();
                }
            }
        } catch (Throwable ignored) {
            // Best-effort only.
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        appInForeground = true;
        dispatchIncomingCallIntent(getIntent());
        try {
            if (bridge != null && bridge.getWebView() != null) {
                injectNativeOnlineState(bridge.getWebView());
            }
        } catch (Throwable ignored) {
            // ignore
        }
    }

    @Override
    public void onPause() {
        appInForeground = false;
        super.onPause();
    }

    public static boolean isAppInForeground() {
        return appInForeground;
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        dispatchIncomingCallIntent(intent);
    }

    /**
     * Restore a native incoming-call notification into the existing WebView
     * event contract after a cold start or task reuse.
     */
    private void dispatchIncomingCallIntent(final Intent intent) {
        if (intent == null || !"call_ringing".equals(intent.getStringExtra("type"))) {
            return;
        }
        final String callId = intent.getStringExtra("callId");
        final String conversationId = intent.getStringExtra("conversationId");
        final String initiatorId = intent.getStringExtra("initiatorId");
        final String initiatorName = intent.getStringExtra("initiatorName");
        final String mediaMode = intent.getStringExtra("mediaMode");
        final String callType = intent.getStringExtra("callType");
        if (callId == null || conversationId == null || bridge == null || bridge.getWebView() == null) {
            return;
        }

        try {
            JSONObject payload = new JSONObject();
            payload.put("type", "call_ringing");
            payload.put("callId", callId);
            payload.put("conversationId", conversationId);
            payload.put("initiatorId", initiatorId == null ? "" : initiatorId);
            payload.put("initiatorName", initiatorName == null ? "A Scrolith member" : initiatorName);
            payload.put("mediaMode", mediaMode == null ? "audio" : mediaMode);
            payload.put("callType", callType == null ? "direct" : callType);
            payload.put("status", "ringing");
            final String script = "(function(){var p=" + payload + ";window.__scrolithPendingIncomingCall=p;window.dispatchEvent(new CustomEvent('mobile:incoming-call',{detail:p}));})();";
            bridge.getWebView().postDelayed(() -> bridge.getWebView().evaluateJavascript(script, null), 350L);
            intent.removeExtra("type");
        } catch (Throwable ignored) {
            // Best-effort restoration; the conversation deep link still opens.
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
        String scheme = String.valueOf(origin.getScheme() == null ? "" : origin.getScheme()).toLowerCase(Locale.US);
        String host = String.valueOf(origin.getHost() == null ? "" : origin.getHost()).toLowerCase(Locale.US);

        // Capacitor local shell
        if ("https".equals(scheme) && ("localhost".equals(host) || "127.0.0.1".equals(host))) {
            return true;
        }
        if ("http".equals(scheme) && ("localhost".equals(host) || "127.0.0.1".equals(host))) {
            return true;
        }
        // Capacitor app scheme / custom
        if ("capacitor".equals(scheme) || "ionic".equals(scheme) || "https".equals(scheme) && host.contains("capacitor")) {
            return true;
        }
        // Production + staging Scrolith hosts
        if ("https".equals(scheme)) {
            if (host.equals("scrolith.com")
                || host.equals("www.scrolith.com")
                || host.endsWith(".scrolith.com")
                || host.contains("scrolith-frontend")
                || host.endsWith(".a.run.app")) {
                return true;
            }
        }
        return false;
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
