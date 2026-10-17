//! Version check against GitHub releases: the newest release tagged `desktop-vX.Y.Z` that isn't a draft or
//! pre-release. Newer than this build: the student is offered the download page. The API enforces its own minimum
//! (DESKTOP_MIN_VERSION) separately; this only keeps installs current.

use semver::Version;
use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

use crate::config::{releases_page, releases_repo, DESKTOP_TAG_PREFIX, USER_AGENT_TOKEN};

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    draft: bool,
    prerelease: bool,
}

pub struct Latest {
    pub version: Version,
    pub url: String,
}

/// The newest published desktop release, or None when there is none (or GitHub can't be reached).
pub async fn latest_release(current: &Version) -> Result<Option<Latest>, String> {
    let repo = releases_repo();
    let client = reqwest::Client::builder()
        .user_agent(format!("{USER_AGENT_TOKEN}/{current}"))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let releases: Vec<Release> = client
        .get(format!(
            "https://api.github.com/repos/{repo}/releases?per_page=50"
        ))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(releases
        .into_iter()
        .filter(|r| !r.draft && !r.prerelease)
        .filter_map(|r| {
            let version = Version::parse(r.tag_name.strip_prefix(DESKTOP_TAG_PREFIX)?).ok()?;
            Some(Latest {
                version,
                url: r.html_url,
            })
        })
        .max_by(|a, b| a.version.cmp(&b.version)))
}

/// Runs the check in the background and, when a newer release exists, asks whether to open its page.
pub fn offer_update(app: AppHandle) {
    let current = app.package_info().version.clone();
    tauri::async_runtime::spawn(async move {
        let latest = match latest_release(&current).await {
            Ok(Some(latest)) if latest.version > current => latest,
            Ok(_) => return,
            Err(e) => {
                eprintln!("update check skipped: {e}");
                return;
            }
        };
        let repo = releases_repo();
        let url = if latest.url.is_empty() {
            releases_page(&repo)
        } else {
            latest.url
        };
        app.dialog()
            .message(format!(
                "Examinus Desktop {} is available (you have {}). Install it before your next exam: your teacher may require it.",
                latest.version, current
            ))
            .title("Update available")
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom("Download".into(), "Later".into()))
            .show(move |download| {
                if download {
                    if let Err(e) = app.opener().open_url(url, None::<&str>) {
                        eprintln!("couldn't open the release page: {e}");
                    }
                }
            });
    });
}
