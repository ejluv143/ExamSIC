//! Where the shell points. Both values are baked in at build time (the release workflow sets them) and may be
//! overridden by an environment variable at run time, which is how development against a local web app works.

use tauri::Url;

/// The web app the shell shows. Build: `EXAMINUS_WEB_URL`; run: the same variable.
const DEFAULT_WEB_URL: &str = match option_env!("EXAMINUS_WEB_URL") {
    Some(url) => url,
    None => "http://localhost:3000",
};

/// The GitHub repository (owner/name) whose releases tagged `desktop-vX.Y.Z` carry the installers.
const DEFAULT_RELEASES_REPO: &str = match option_env!("EXAMINUS_RELEASES_REPO") {
    Some(repo) => repo,
    None => "ejluv143/ExamSIC",
};

/// Release tags of the desktop app: `desktop-v1.2.3`. The API is tagged `rpc-v…` in the same repository.
pub const DESKTOP_TAG_PREFIX: &str = "desktop-v";

/// The token the web app and the API look for in the user agent (`@examinus/domain/client`).
pub const USER_AGENT_TOKEN: &str = "ExaminusDesktop";

pub fn web_url() -> Result<Url, String> {
    let raw = std::env::var("EXAMINUS_WEB_URL").unwrap_or_else(|_| DEFAULT_WEB_URL.to_string());
    let url = Url::parse(&raw).map_err(|e| format!("EXAMINUS_WEB_URL ({raw}) isn't a URL: {e}"))?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return Err(format!("EXAMINUS_WEB_URL ({raw}) must be http(s)"));
    }
    if url.host().is_none() {
        return Err(format!("EXAMINUS_WEB_URL ({raw}) has no host"));
    }
    Ok(url)
}

pub fn releases_repo() -> String {
    std::env::var("EXAMINUS_RELEASES_REPO").unwrap_or_else(|_| DEFAULT_RELEASES_REPO.to_string())
}

/// Where the shell opens: the web app's desktop start page (sign in, or join with a key), never the landing page.
/// Any path in `EXAMINUS_WEB_URL` is ignored; only its origin matters.
pub fn start_url(web_url: &Url) -> Url {
    let mut url = web_url.clone();
    url.set_path("/desktop");
    url.set_query(None);
    url.set_fragment(None);
    url
}

pub fn releases_page(repo: &str) -> String {
    format!("https://github.com/{repo}/releases")
}

/// A desktop browser user agent for this platform with the shell's token appended. The API refuses phones on
/// computers-only exams from the user agent, so this has to read as a computer.
pub fn user_agent(version: &semver::Version) -> String {
    let platform = if cfg!(target_os = "windows") {
        "Windows NT 10.0; Win64; x64"
    } else if cfg!(target_os = "macos") {
        "Macintosh; Intel Mac OS X 10_15_7"
    } else {
        "X11; Linux x86_64"
    };
    format!("Mozilla/5.0 ({platform}) AppleWebKit/537.36 (KHTML, like Gecko) {USER_AGENT_TOKEN}/{version} Safari/537.36")
}

pub fn platform_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "Windows"
    } else if cfg!(target_os = "macos") {
        "macOS"
    } else {
        "Linux"
    }
}
