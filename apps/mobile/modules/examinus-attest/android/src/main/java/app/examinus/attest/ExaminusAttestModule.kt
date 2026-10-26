package app.examinus.attest

import android.os.Build
import com.google.android.gms.tasks.Tasks
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

// Device integrity for exams: Google's Play Integrity token over the server's nonce, and the signs of a rooted phone or
// an emulator. The hints are advisory (a rooted phone can hide them); the verdict that counts is Google's, checked by the API.
class ExaminusAttestModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExaminusAttest")

    // A classic Play Integrity request: `nonce` is the server's challenge (URL-safe base64), `project` the Google Cloud project number.
    AsyncFunction("integrityToken") { nonce: String, project: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val number = project.toLongOrNull() ?: throw CodedException("ERR_INTEGRITY_PROJECT", "The Play Integrity cloud project number isn't set.", null)
      val request = IntegrityTokenRequest.builder().setNonce(nonce).setCloudProjectNumber(number).build()
      try {
        Tasks.await(IntegrityManagerFactory.create(context).requestIntegrityToken(request)).token()
      } catch (e: Exception) {
        throw CodedException("ERR_INTEGRITY", e.cause?.message ?: e.message ?: "Play Integrity failed.", e)
      }
    }

    Function("deviceHints") {
      hints()
    }
  }

  private fun hints(): List<String> {
    val found = mutableListOf<String>()
    if (looksRooted()) found += "rooted_device"
    if (looksEmulated()) found += "emulator"
    return found
  }

  private fun looksRooted(): Boolean {
    if (Build.TAGS?.contains("test-keys") == true) return true
    val paths = listOf("/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/sbin/su", "/vendor/bin/su", "/su/bin/su", "/system/app/Superuser.apk", "/data/local/xbin/su", "/data/local/bin/su", "/system/sd/xbin/su", "/data/adb/magisk")
    return paths.any { File(it).exists() }
  }

  private fun systemProperty(name: String): String =
    try {
      val get = Class.forName("android.os.SystemProperties").getMethod("get", String::class.java)
      get.invoke(null, name) as? String ?: ""
    } catch (e: Exception) {
      ""
    }

  private fun looksEmulated(): Boolean {
    val fingerprint = Build.FINGERPRINT ?: ""
    val hardware = Build.HARDWARE ?: ""
    return systemProperty("ro.kernel.qemu") == "1" ||
      fingerprint.startsWith("generic") || fingerprint.contains("emulator") || fingerprint.contains("sdk_gphone") ||
      hardware == "goldfish" || hardware == "ranchu" || systemProperty("ro.hardware") in listOf("goldfish", "ranchu")
  }
}
