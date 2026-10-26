import ExpoModulesCore
import UIKit

// What the exam screen can see about itself on iOS: Guided Access (the phone's pinned screen), screen recording and
// mirroring (`isCaptured`) and other screens. The JS side (index.ts) turns the events into integrity log entries.
public class ExaminusIntegrityModule: Module {
  private var observers: [NSObjectProtocol] = []

  private func captured() -> Bool {
    let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    return scene?.screen.isCaptured ?? UIScreen.main.isCaptured
  }

  private func screenCount() -> Int {
    return UIScreen.screens.count
  }

  private func snapshot() -> [String: Any] {
    return [
      "guidedAccess": UIAccessibility.isGuidedAccessEnabled,
      "recording": captured(),
      "displays": screenCount(),
    ]
  }

  private func startWatching() {
    stopWatching()
    let center = NotificationCenter.default
    observers.append(
      center.addObserver(forName: UIAccessibility.guidedAccessStatusDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
        self?.sendEvent("onGuidedAccess", ["enabled": UIAccessibility.isGuidedAccessEnabled])
      })
    observers.append(
      center.addObserver(forName: UIScreen.capturedDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
        guard let self else { return }
        self.sendEvent("onScreenRecording", ["recording": self.captured()])
      })
    for name in [UIScreen.didConnectNotification, UIScreen.didDisconnectNotification] {
      observers.append(
        center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
          guard let self else { return }
          self.sendEvent("onDisplays", ["count": self.screenCount()])
        })
    }
  }

  private func stopWatching() {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers = []
  }

  public func definition() -> ModuleDefinition {
    Name("ExaminusIntegrity")

    Events("onGuidedAccess", "onScreenRecording", "onDisplays")

    Function("snapshot") { () -> [String: Any] in
      return self.snapshot()
    }

    Function("guidedAccess") { () -> Bool in
      return UIAccessibility.isGuidedAccessEnabled
    }

    // Starts or ends a Guided Access session from the app. iOS only allows it on a supervised device whose
    // management profile lists the app for Autonomous Single App Mode; elsewhere it answers false and the student
    // turns Guided Access on from Settings.
    AsyncFunction("requestGuidedAccess") { (enabled: Bool, promise: Promise) in
      UIAccessibility.requestGuidedAccessSession(enabled: enabled) { success in
        promise.resolve(success)
      }
    }.runOnQueue(.main)

    AsyncFunction("startWatching") {
      self.startWatching()
    }.runOnQueue(.main)

    AsyncFunction("stopWatching") {
      self.stopWatching()
    }.runOnQueue(.main)

    OnDestroy {
      self.stopWatching()
    }
  }
}
