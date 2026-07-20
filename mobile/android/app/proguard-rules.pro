# Scrolith Android release ProGuard / R8 rules (Phase 20.11)
# Capacitor Bridge + plugins must not be stripped.

-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod
-keepattributes Exceptions

# Capacitor core
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-keep interface com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**
-dontwarn com.capacitorjs.**

# App package
-keep class com.scrolith.scrolith.** { *; }

# Firebase / FCM
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# Phase 25 — Play Integrity
-keep class com.google.android.play.core.integrity.** { *; }
-dontwarn com.google.android.play.core.integrity.**

# Cordova bridge residual (Capacitor cordova plugins host)
-keep class org.apache.cordova.** { *; }
-dontwarn org.apache.cordova.**

# Biometric plugin
-keep class com.aparajita.capacitor.biometricauth.** { *; }
-dontwarn com.aparajita.**

# WebView JS interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Do not leak file names in stack traces to public artifacts
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable
