fn main() {
    // Rebuild when the compile-time defaults change (see src/config.rs).
    println!("cargo:rerun-if-env-changed=EXAMINUS_WEB_URL");
    println!("cargo:rerun-if-env-changed=EXAMINUS_RELEASES_REPO");
    tauri_build::build()
}
