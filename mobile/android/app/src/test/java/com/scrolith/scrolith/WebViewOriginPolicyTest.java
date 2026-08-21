package com.scrolith.scrolith;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class WebViewOriginPolicyTest {
    @Test
    public void acceptsOnlyOwnedProductionOrigins() {
        assertTrue(WebViewOriginPolicy.isTrusted("https", "scrolith.com", false));
        assertTrue(WebViewOriginPolicy.isTrusted("https", "api.scrolith.com", false));
        assertTrue(WebViewOriginPolicy.isTrusted("https", "tenant.scrolith.com", false));
        assertFalse(WebViewOriginPolicy.isTrusted("https", "scrolith.com.attacker.example", false));
        assertFalse(WebViewOriginPolicy.isTrusted("https", "scrolith-frontend.attacker.example", false));
        assertFalse(WebViewOriginPolicy.isTrusted("http", "scrolith.com", false));
    }

    @Test
    public void permitsDevelopmentHostsOnlyInDebugBuilds() {
        assertTrue(WebViewOriginPolicy.isTrusted("http", "10.0.2.2", true));
        assertTrue(WebViewOriginPolicy.isTrusted("https", "candidate-123.a.run.app", true));
        assertFalse(WebViewOriginPolicy.isTrusted("http", "10.0.2.2", false));
        assertFalse(WebViewOriginPolicy.isTrusted("https", "candidate-123.a.run.app", false));
    }

    @Test
    public void acceptsCapacitorLocalShellOnly() {
        assertTrue(WebViewOriginPolicy.isTrusted("capacitor", "localhost", false));
        assertTrue(WebViewOriginPolicy.isTrusted("ionic", "", false));
        assertFalse(WebViewOriginPolicy.isTrusted("capacitor", "attacker.example", false));
    }
}
