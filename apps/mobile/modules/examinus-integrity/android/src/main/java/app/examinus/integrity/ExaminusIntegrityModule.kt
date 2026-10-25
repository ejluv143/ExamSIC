package app.examinus.integrity

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.provider.Settings
import android.view.Window
import android.view.WindowManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.function.Consumer

// What the exam screen can see about itself on Android: the pinned screen (Lock Task), split screen and picture in
// picture, a window drawn over the exam, other displays and screen recording. The JS side (index.ts) turns the events
// into integrity log entries; nothing here decides what counts as cheating.
class ExaminusIntegrityModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private val activity: Activity?
    get() = appContext.currentActivity
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.AppContextLost()

  private var watching = false
  // We asked for the pinned screen: only then does leaving it mean something.
  private var expectLock = false
  private var lastLock = "none"
  private var lastSplit = false
  private var lastPip = false
  private var lastOverlayAt = 0L

  private var window: Window? = null
  private var originalCallback: Window.Callback? = null
  private var displayListener: DisplayManager.DisplayListener? = null
  private var recordingCallback: Consumer<Int>? = null
  private var recording = false

  private fun lockState(): String {
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    return when (manager.lockTaskModeState) {
      ActivityManager.LOCK_TASK_MODE_LOCKED -> "locked"
      ActivityManager.LOCK_TASK_MODE_PINNED -> "pinned"
      else -> "none"
    }
  }

  private fun displayCount(): Int {
    val manager = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
    return manager.displays.size
  }

  // The "Screen pinning" switch in Settings (`lock_to_app_enabled`). Without it `startLockTask` does nothing on a phone
  // the school doesn't manage. Read from the system settings, which any app may read; the secure table is the fallback
  // for builds that moved it there.
  private fun screenPinningEnabled(): Boolean {
    val resolver = context.contentResolver
    return Settings.System.getInt(resolver, "lock_to_app_enabled", 0) == 1 || Settings.Secure.getInt(resolver, "lock_to_app_enabled", 0) == 1
  }

  private fun snapshot(): Map<String, Any> {
    val current = activity
    return mapOf(
      "lockTask" to lockState(),
      "split" to (current?.isInMultiWindowMode ?: false),
      "pip" to (current?.isInPictureInPictureMode ?: false),
      "displays" to displayCount(),
      "recording" to recording,
    )
  }

  // Polled: the system has no callback for the pinned screen or for split screen that works for every window mode.
  private val tick = object : Runnable {
    override fun run() {
      if (!watching) return
      check()
      handler.postDelayed(this, 500)
    }
  }

  private fun check() {
    val lock = lockState()
    if (lock != lastLock) {
      lastLock = lock
      if (expectLock) sendEvent("onLockTask", mapOf("state" to lock))
    }
    val current = activity ?: return
    val split = current.isInMultiWindowMode
    val pip = current.isInPictureInPictureMode
    if (split != lastSplit || pip != lastPip) {
      lastSplit = split
      lastPip = pip
      sendEvent("onWindowMode", mapOf("split" to split, "pip" to pip))
    }
  }

  // Every touch passes the window's callback first; the system marks it when another window covers the spot touched.
  private fun watchTouches(current: Activity) {
    val target = current.window
    val original = target.callback ?: return
    if (original is Overlay) return
    window = target
    originalCallback = original
    target.callback = Overlay(original) {
      val now = System.currentTimeMillis()
      if (now - lastOverlayAt > 5000) {
        lastOverlayAt = now
        sendEvent("onOverlay", mapOf("at" to now))
      }
    }
  }

  private class Overlay(private val inner: Window.Callback, private val onObscured: () -> Unit) : Window.Callback by inner {
    override fun dispatchTouchEvent(event: MotionEvent?): Boolean {
      if (event != null && event.actionMasked == MotionEvent.ACTION_DOWN) {
        val obscured = MotionEvent.FLAG_WINDOW_IS_OBSCURED or MotionEvent.FLAG_WINDOW_IS_PARTIALLY_OBSCURED
        if (event.flags and obscured != 0) onObscured()
      }
      return inner.dispatchTouchEvent(event)
    }
  }

  private fun startWatching() {
    if (watching) return
    watching = true
    val current = activity
    val snap = snapshot()
    lastLock = snap["lockTask"] as String
    lastSplit = snap["split"] as Boolean
    lastPip = snap["pip"] as Boolean
    if (current != null) watchTouches(current)

    val displays = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
    val listener = object : DisplayManager.DisplayListener {
      override fun onDisplayAdded(displayId: Int) = sendEvent("onDisplays", mapOf("count" to displayCount()))
      override fun onDisplayRemoved(displayId: Int) = sendEvent("onDisplays", mapOf("count" to displayCount()))
      override fun onDisplayChanged(displayId: Int) {}
    }
    displayListener = listener
    displays.registerDisplayListener(listener, handler)

    if (Build.VERSION.SDK_INT >= 35 && current != null) {
      val windows = current.getSystemService(WindowManager::class.java)
      val callback = Consumer<Int> { state ->
        recording = state == WindowManager.SCREEN_RECORDING_STATE_VISIBLE
        sendEvent("onScreenRecording", mapOf("recording" to recording))
      }
      recordingCallback = callback
      recording = windows.addScreenRecordingCallback(current.mainExecutor, callback) == WindowManager.SCREEN_RECORDING_STATE_VISIBLE
    }
    handler.postDelayed(tick, 500)
  }

  private fun stopWatching() {
    watching = false
    handler.removeCallbacks(tick)
    window?.let { w -> originalCallback?.let { w.callback = it } }
    window = null
    originalCallback = null
    displayListener?.let { (context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager).unregisterDisplayListener(it) }
    displayListener = null
    if (Build.VERSION.SDK_INT >= 35) {
      recordingCallback?.let { activity?.getSystemService(WindowManager::class.java)?.removeScreenRecordingCallback(it) }
    }
    recordingCallback = null
    recording = false
  }

  override fun definition() = ModuleDefinition {
    Name("ExaminusIntegrity")

    Events("onLockTask", "onWindowMode", "onOverlay", "onDisplays", "onScreenRecording")

    Function("snapshot") { snapshot() }

    Function("lockTaskState") { lockState() }

    Function("screenPinningEnabled") { screenPinningEnabled() }

    // Pins the screen: Home, Recents and the status bar stop working until the pin is lifted. On a school-managed
    // device the owner can whitelist the app so the pin has no way out; on any other the student can lift it.
    AsyncFunction<Unit>("startLockTask") {
      val current = activity ?: throw Exceptions.MissingActivity()
      expectLock = true
      current.startLockTask()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction<Unit>("stopLockTask") {
      // Cleared first, so the pin coming off is not reported as the student leaving it.
      expectLock = false
      if (lockState() != "none") activity?.stopLockTask()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction<Unit>("startWatching") { startWatching() }.runOnQueue(Queues.MAIN)

    AsyncFunction<Unit>("stopWatching") { stopWatching() }.runOnQueue(Queues.MAIN)

    OnDestroy {
      handler.post { stopWatching() }
    }
  }
}
