# Examinus mobile app: school roll-out guide

For the IT staff and teachers who put the app on student phones and tablets. Build and release steps are in the README ("Mobile app"); the design is in `docs/native-clients-plan.md`.

## 1. What has to be true first

- The API runs over **https** and has `MOBILE_UPDATE_URL` (the page students update from) set.
- For exams on verified devices, the API has the attestation settings (`PLAY_INTEGRITY_*` for Android, `APP_ATTEST_*` for iOS; list in `docs/native-clients-plan.md`). Without them, quizzes and games work on the app, but exams refuse the phone.
- A build is published to the internal track (below).

## 2. Installing from the internal track

**Android (Google Play internal testing).**
1. In Play Console open *Testing → Internal testing → Testers* and add the school's testers (a Google Group of the school accounts is easiest).
2. Copy the **opt-in link** on the same page and send it to students (email, LMS, QR code).
3. The student opens the link on the phone while signed in with the tester's Google account, taps *Become a tester*, then *Download it on Google Play*.
4. Updates arrive through Play like any app. A build that is not on the track yet does not appear.

A `preview` EAS build (an APK) can be installed from the link EAS prints (*Internal distribution*), without Play. The student must allow installs from the browser.

**iOS (TestFlight or ad hoc).**
- TestFlight: add testers in App Store Connect and send the public link (or invite by email). Up to 10,000 external testers; internal testers (your team) need no review.
- Ad hoc (`preview` profile): each device's UDID must be registered first (`eas device:create`). Use TestFlight for a whole class.

## 3. What teachers turn on

1. Create or edit the session, choose **Exam**.
2. Under the anti-cheating step switch on **Allow the mobile app**. It is off by default; computers-only stays the rule until a teacher allows phones.
3. The teacher picks the other rules (full screen, one question at a time, paste blocking, and so on). The app maps each to its mobile equivalent.
4. At least one of web browser, desktop app and mobile app must stay allowed.

The student sees the rules, the pledge and a system check (pinned screen on, device verified, nothing drawn over the exam, battery) before the exam starts. A device that fails a check cannot start; a teacher can approve a device switch as for other clients.

## 4. Pinning the screen on the student's device

The exam asks the OS to lock the phone to the app. A student who leaves it is logged as `kiosk_exited`.

### Android: Screen pinning (no MDM)
1. *Settings → Security (or Security & privacy) → More security settings → App pinning* (also called *Screen pinning*, *Pin windows*). Turn it **on**; turn on *Ask for PIN before unpinning* if offered. Menu names vary by brand.
2. Start the exam. Android asks *Start pinning?*; the student taps **Start**. Without the setting the app can't pin and the system check fails.
3. To leave, the student holds Back and Overview (or swipes up and holds) and enters the PIN; the teacher sees the exit in the report.

### Android: Lock Task through MDM (managed devices)
On school-owned devices a device owner can allow the app to pin without the confirmation prompt and without the student's setting:
1. Enrol the device with your MDM (Android Enterprise, *fully managed*/device owner; Intune, Google Endpoint Management, Hexnode, Scalefusion, and similar all support it).
2. Allow-list the package **`app.examinus.student`** for Lock Task: in the MDM this is *Kiosk / Lock task apps*. Under the hood the device policy controller calls `DevicePolicyManager.setLockTaskPackages(admin, ["app.examinus.student"])`.
3. With the package allowed, `startLockTask()` pins at once with **no confirm prompt**, and the student cannot unpin from the screen. Limit the Lock Task features (home, overview, notifications) as you see fit.
4. Push the app silently through the MDM's managed Google Play so students need not install.

Personal (BYOD) phones are not device-owner managed: use the screen-pinning setting above.

### iOS: Guided Access (no MDM)
1. *Settings → Accessibility → Guided Access*: turn on, *Passcode Settings → Set Guided Access Passcode*, and enable *Accessibility Shortcut* (triple-click the side/Home button).
2. The app asks for Guided Access before the exam starts. Triple-click, tap **Start**. Ending needs the passcode; the student can't leave without logging `kiosk_exited`.

### iOS: Autonomous Single App Mode (MDM, supervised devices)
For supervised school iPads the MDM can let the app lock itself:
1. Supervise the devices (Apple School Manager / Apple Configurator) and enrol them in the MDM.
2. Add the **Autonomous Single App Mode** payload (`com.apple.asam`) with the bundle id **`app.examinus.student`** under `AllowedApplications`.
3. The app can then enter single-app mode itself during an exam, with no student action and no Guided Access passcode. The student's passcode does not unlock it.

## 5. What the integrity report shows

The live view and the report show where the student sat: **Mobile · Android 15** (or iOS). The integrity report lists, with times and minutes:
- `switched_app`: the app went to the background or the screen turned off, with the minutes away.
- `screenshot`, `screen_recording`, `external_display` (second screen or casting), `split_screen` (split-screen or picture-in-picture), `overlay_detected` (a window drawn over the exam), `kiosk_exited` (pin or Guided Access left or not confirmed in 15 s).
- `paste` and `bulk_input`: text that arrived in one go.
- `rooted_device` and `emulator`: the device is rooted/jailbroken or not a real device (from the attestation).
- The device check: whether Play Integrity or App Attest accepted the device. Without a valid attestation exams don't start; quizzes log it.

Limits teachers should know: the screen is hidden from screenshots by the OS (`FLAG_SECURE`/protected view), so a photo of the screen with another device is not detectable; a keyboard suggestion shorter than 30 characters can't be told from typing; overlay detection can't be tested from `adb`.

## 6. Updating and forcing updates

- **Small fixes** (JavaScript only) go out over the air to every build with the same app version: students get them the next time they open the app (applied on the launch after the download).
- **Native changes** (new permissions, SDK upgrades, the integrity module) need a store build: bump the version in `apps/mobile/package.json`, tag `mobile-vX.Y.Z`, publish to the track.
- To make older builds stop working (after a security fix), set **`MOBILE_MIN_VERSION`** on the API to the fixed version. Older builds then see "Update the app" with a link to `MOBILE_UPDATE_URL` and cannot open a paper or start an attempt. Raise it only after the new build is live on the track, or students get stuck on the update screen. An over-the-air update does not change the app's version, so `MOBILE_MIN_VERSION` is for store builds.
