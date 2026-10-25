import CryptoKit
import DeviceCheck
import ExpoModulesCore
import Foundation

// Device integrity for exams: an App Attest attestation over SHA-256 of the server's nonce, and the signs of a
// jailbroken phone. The hints are advisory; the attestation Apple signs is what the API checks.
public final class ExaminusAttestModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExaminusAttest")

    // A fresh key attested over `nonce`. The key id is kept in the keychain so the device is recognised later.
    AsyncFunction("attest") { (nonce: String) async throws -> [String: String] in
      let service = DCAppAttestService.shared
      guard service.isSupported else {
        throw Exception(name: "ERR_APP_ATTEST", description: "App Attest isn't supported on this device.")
      }
      let keyId = try await service.generateKey()
      Keychain.save(keyId)
      let clientDataHash = Data(SHA256.hash(data: Data(nonce.utf8)))
      let attestation = try await service.attestKey(keyId, clientDataHash: clientDataHash)
      return ["keyId": keyId, "token": attestation.base64EncodedString()]
    }

    Function("deviceHints") { () -> [String] in
      return Self.jailbroken() ? ["rooted_device"] : []
    }
  }

  private static func jailbroken() -> Bool {
    #if targetEnvironment(simulator)
    return false
    #else
    let paths = [
      "/Applications/Cydia.app", "/Library/MobileSubstrate/MobileSubstrate.dylib", "/bin/bash", "/usr/sbin/sshd",
      "/etc/apt", "/private/var/lib/apt/", "/usr/bin/ssh", "/var/jb", "/Applications/Sileo.app",
    ]
    if paths.contains(where: { FileManager.default.fileExists(atPath: $0) }) { return true }
    // A sandboxed app can't write outside its container.
    let probe = "/private/examinus-\(UUID().uuidString)"
    do {
      try "x".write(toFile: probe, atomically: true, encoding: .utf8)
      try? FileManager.default.removeItem(atPath: probe)
      return true
    } catch {
      return false
    }
    #endif
  }
}

// The App Attest key id, in the keychain (this device only, after first unlock).
private enum Keychain {
  static func save(_ keyId: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "app.examinus.attest",
      kSecAttrAccount as String: "app-attest-key-id",
    ]
    SecItemDelete(query as CFDictionary)
    var add = query
    add[kSecValueData as String] = Data(keyId.utf8)
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(add as CFDictionary, nil)
  }
}
