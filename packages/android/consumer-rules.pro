# Applied automatically to apps that depend on this library (R8/ProGuard).
# The public entry point stays callable by name, including from Java and reflection-based DI.
-keep class com.heypointer.android.HeyPointer { public *; }
-keep class com.heypointer.android.HeyPointer$Companion { public *; }
# Parsed walkthrough types are part of the public API.
-keep class com.heypointer.android.Walkthrough { *; }
-keep class com.heypointer.android.Step { *; }
-keep class com.heypointer.android.Target { *; }
-keep class com.heypointer.android.Evidence { *; }
-keep class com.heypointer.android.Suggestion { *; }
