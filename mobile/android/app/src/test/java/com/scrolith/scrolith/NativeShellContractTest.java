package com.scrolith.scrolith;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Contract checks for the stable, public native-shell surface. */
public class NativeShellContractTest {
    @Test
    public void bridgeContractIsVersioned() {
        assertEquals("ScrolithNative", ScrolithNativeBridge.NAME);
        assertEquals("2", ScrolithNativeBridge.VERSION);
    }

    @Test
    public void eventScriptUsesSafeCustomEventEnvelope() {
        String script = ScrolithNativeBridge.eventScript("scrolith:native-file-selected", null);
        assertTrue(script.contains("CustomEvent('scrolith:native-file-selected'"));
        assertTrue(script.contains("JSON.parse"));
    }
}
