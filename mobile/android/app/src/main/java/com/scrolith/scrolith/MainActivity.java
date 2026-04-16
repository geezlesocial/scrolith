package com.scrolith.scrolith;

import android.Manifest;
import android.content.pm.PackageManager;
import android.webkit.PermissionRequest;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final int WEBRTC_MEDIA_PERMISSION_REQUEST_CODE = 4157;

    private PermissionRequest pendingWebRtcPermissionRequest;

    @Override
    protected void load() {
        super.load();
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }
        bridge.getWebView().setWebChromeClient(new AppWebChromeClient());
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        if (requestCode == WEBRTC_MEDIA_PERMISSION_REQUEST_CODE) {
            boolean granted = grantResults.length > 0;
            for (int grantResult : grantResults) {
                if (grantResult != PackageManager.PERMISSION_GRANTED) {
                    granted = false;
                    break;
                }
            }
            resolvePendingWebRtcPermission(granted);
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
    }

    private void handleWebRtcPermissionRequest(PermissionRequest request) {
        List<String> requestedPermissions = new ArrayList<>();
        List<String> resources = Arrays.asList(request.getResources());

        if (resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
            requestedPermissions.add(Manifest.permission.CAMERA);
        }
        if (resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
            requestedPermissions.add(Manifest.permission.RECORD_AUDIO);
        }

        if (requestedPermissions.isEmpty()) {
            request.grant(request.getResources());
            return;
        }

        if (hasAllPermissions(requestedPermissions)) {
            request.grant(request.getResources());
            return;
        }

        pendingWebRtcPermissionRequest = request;
        ActivityCompat.requestPermissions(
            this,
            requestedPermissions.toArray(new String[0]),
            WEBRTC_MEDIA_PERMISSION_REQUEST_CODE
        );
    }

    private boolean hasAllPermissions(List<String> permissions) {
        for (String permission : permissions) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    private void resolvePendingWebRtcPermission(boolean granted) {
        if (pendingWebRtcPermissionRequest == null) {
            return;
        }

        PermissionRequest request = pendingWebRtcPermissionRequest;
        pendingWebRtcPermissionRequest = null;

        if (granted) {
            request.grant(request.getResources());
        } else {
            request.deny();
        }
    }
}
