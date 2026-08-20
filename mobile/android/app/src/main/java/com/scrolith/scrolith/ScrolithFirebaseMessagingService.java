package com.scrolith.scrolith;

import android.app.ActivityManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.text.TextUtils;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Receives data-only incoming-call pushes while the WebView is backgrounded or stopped. */
public final class ScrolithFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CALL_TYPE = "call_ringing";
    private static final String CHANNEL_ID = "scrolith_calls_v1";
    private static final String PREFS = "scrolith_incoming_call";
    private static final String PREF_CALL_ID = "call_id";
    private static final String PREF_NOTIFICATION_ID = "notification_id";
    private static final String PREF_TIMESTAMP = "timestamp";
    private static final long DEDUPE_WINDOW_MS = 60_000L;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (data == null || !CALL_TYPE.equals(data.get("type"))) {
            return;
        }

        String callId = data.get("callId");
        String conversationId = data.get("conversationId");
        if (TextUtils.isEmpty(callId) || TextUtils.isEmpty(conversationId) || isApplicationVisible()) {
            return;
        }

        showIncomingCallNotification(data, callId, conversationId);
    }

    private void showIncomingCallNotification(Map<String, String> data, String callId, String conversationId) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        createCallChannel(manager);

        int notificationId = notificationIdFor(callId);
        android.content.SharedPreferences preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        String previousCallId = preferences.getString(PREF_CALL_ID, null);
        long previousTimestamp = preferences.getLong(PREF_TIMESTAMP, 0L);
        if (!TextUtils.isEmpty(previousCallId) && !callId.equals(previousCallId)
            && System.currentTimeMillis() - previousTimestamp < DEDUPE_WINDOW_MS) {
            manager.cancel(preferences.getInt(PREF_NOTIFICATION_ID, notificationId));
        }

        Intent intent = new Intent(this, MainActivity.class)
            .setAction(MainActivity.ACTION_INCOMING_CALL)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(MainActivity.EXTRA_CALL_ID, callId)
            .putExtra(MainActivity.EXTRA_CONVERSATION_ID, conversationId)
            .putExtra(MainActivity.EXTRA_INITIATOR_ID, data.get("initiatorId"))
            .putExtra(MainActivity.EXTRA_INITIATOR_NAME, data.get("initiatorName"))
            .putExtra(MainActivity.EXTRA_MEDIA_MODE, normalizeMediaMode(data.get("mediaMode")))
            .putExtra(MainActivity.EXTRA_CALL_TYPE, data.get("callType"))
            .putExtra(MainActivity.EXTRA_PARTICIPANT_IDS, data.get("participantIds"))
            .putExtra(MainActivity.EXTRA_DEEP_LINK, data.get("deepLink"));
        PendingIntent fullScreenIntent = PendingIntent.getActivity(
            this, notificationId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String mediaMode = normalizeMediaMode(data.get("mediaMode"));
        String initiatorName = TextUtils.isEmpty(data.get("initiatorName"))
            ? "Scrolith contact" : data.get("initiatorName");
        String title = "Incoming " + ("video".equals(mediaMode) ? "video" : "voice") + " call";
        Uri sound = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.scrolith);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        android.app.Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_scrolith)
            .setColor(ContextCompat.getColor(this, R.color.colorPrimary))
            .setContentTitle(title)
            .setContentText(initiatorName + " is calling you")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSound(sound, AudioManager.STREAM_RING)
            .setFullScreenIntent(fullScreenIntent, true)
            .setContentIntent(fullScreenIntent)
            .setTimeoutAfter(30_000L)
            .build();
        manager.notify(notificationId, notification);
        preferences.edit().putString(PREF_CALL_ID, callId)
            .putInt(PREF_NOTIFICATION_ID, notificationId)
            .putLong(PREF_TIMESTAMP, System.currentTimeMillis()).apply();
    }

    private void createCallChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Incoming Scrolith voice and video calls");
        channel.enableVibration(true);
        channel.setSound(Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.scrolith), audioAttributes);
        manager.createNotificationChannel(channel);
    }

    private boolean isApplicationVisible() {
        ActivityManager manager = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
        if (manager == null) return false;
        for (ActivityManager.RunningAppProcessInfo process : manager.getRunningAppProcesses()) {
            if (getPackageName().equals(process.processName)) {
                return process.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE;
            }
        }
        return false;
    }

    private static String normalizeMediaMode(String value) {
        return "video".equalsIgnoreCase(value) ? "video" : "audio";
    }

    private static int notificationIdFor(String callId) {
        return 20_000 + (callId.hashCode() & 0x7fff);
    }

    public static void dismissCallNotification(Context context, String callId) {
        if (TextUtils.isEmpty(callId)) return;
        android.content.SharedPreferences preferences = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        if (!callId.equals(preferences.getString(PREF_CALL_ID, null))) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(preferences.getInt(PREF_NOTIFICATION_ID, notificationIdFor(callId)));
        preferences.edit().clear().apply();
    }
}
