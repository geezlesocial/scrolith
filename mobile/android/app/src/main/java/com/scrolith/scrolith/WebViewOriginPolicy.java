package com.scrolith.scrolith;

import java.util.Locale;

/** Exact WebView origin allowlist used for camera and microphone capture. */
final class WebViewOriginPolicy {
    private WebViewOriginPolicy() {
    }

    static boolean isTrusted(String rawScheme, String rawHost, boolean isDebuggable) {
        String scheme = normalize(rawScheme);
        String host = normalize(rawHost);

        // Capacitor's local shell is trusted only for the documented local hosts.
        if (("http".equals(scheme) || "https".equals(scheme)) && isLocalHost(host)) {
            return isDebuggable;
        }
        if (("capacitor".equals(scheme) || "ionic".equals(scheme))
            && (host.isEmpty() || "localhost".equals(host))) {
            return true;
        }

        // Production may use the canonical host or an explicitly owned subdomain.
        if ("https".equals(scheme)
            && ("scrolith.com".equals(host) || "www.scrolith.com".equals(host)
                || host.endsWith(".scrolith.com"))) {
            return true;
        }

        // Revision hosts are usable only in debuggable builds. They must never
        // become trusted capture origins in a Play release.
        return isDebuggable && "https".equals(scheme) && host.endsWith(".a.run.app");
    }

    private static boolean isLocalHost(String host) {
        return "localhost".equals(host)
            || "127.0.0.1".equals(host)
            || "10.0.2.2".equals(host)
            || "192.168.1.168".equals(host);
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.US);
    }
}
