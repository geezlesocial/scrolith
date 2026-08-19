package com.scrolith.scrolith;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Delivers incoming calls when the Capacitor WebView is backgrounded or cold.
 * Non-call messages remain on Capacitor's existing JavaScript delivery path.
 */
public final class ScrolithFirebaseMessagingService extends MessagingService {
    private static final String CALL_TYPE = "call_ringing";
    private static final String CALL_CHANNEL_ID = "scrolith_incoming_calls_v1";
    private static final long CALL_TIMEOUT_MS = 60_000L;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if (!CALL_TYPE.equals(String.valueOf(data.get("type")))) {
            super.onMessageReceived(remoteMessage);
            return;
        }

        if (MainActivity.isAppInForeground()) {
            super.onMessageReceived(remoteMessage);
            return;
        }

        showIncomingCallNotification(data);
    }

    private void showIncomingCallNotification(Map<String, String> data) {
        String callId = value(data, "callId", "unknown-call");
        String conversationId = value(data, "conversationId", "");
        if (conversationId.isEmpty()) {
            return;
        }
        String initiatorName = value(data, "initiatorName", "A Scrolith member");
        boolean video = "video".equalsIgnoreCase(value(data, "mediaMode", "audio"));
        String title = video ? "Incoming video call" : "Incoming voice call";
        String body = initiatorName + " is calling you.";

        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }
        ensureCallChannel(manager);

        String encodedConversationId = Uri.encode(conversationId);
        Intent openIntent = new Intent(this, MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("scrolith://messages/" + encodedConversationId))
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("type", CALL_TYPE)
            .putExtra("callId", callId)
            .putExtra("conversationId", conversationId)
            .putExtra("initiatorId", value(data, "initiatorId", ""))
            .putExtra("initiatorName", initiatorName)
            .putExtra("mediaMode", value(data, "mediaMode", "audio"))
            .putExtra("callType", value(data, "callType", "direct"));
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            stableNotificationId(callId),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CALL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_scrolith)
            .setColor(getColorCompat(R.color.colorPrimary))
            .setContentTitle(title)
            .setContentText(body)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOngoing(true)
            .setTimeoutAfter(CALL_TIMEOUT_MS)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true)
            .setVibrate(new long[] { 0L, 500L, 500L, 500L });

        manager.notify(stableNotificationId(callId), builder.build());
    }

    private void ensureCallChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CALL_CHANNEL_ID,
            "Incoming calls",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Voice and video call ringing");
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0L, 500L, 500L, 500L });
        Uri sound = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + getPackageName() + "/" + R.raw.scrolith);
        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(sound, attributes);
        manager.createNotificationChannel(channel);
    }

    private static String value(Map<String, String> data, String key, String fallback) {
        String value = data == null ? null : data.get(key);
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }

    private static int stableNotificationId(String callId) {
        return 0x5C000000 | (callId == null ? 1 : callId.hashCode() & 0x00FFFFFF);
    }

    private int getColorCompat(int resourceId) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return getColor(resourceId);
        }
        return getResources().getColor(resourceId);
    }
}
