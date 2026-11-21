//! Launch-time self-update from GitHub Releases.
//!
//! The check runs once, before the local game host starts, so an update never
//! replaces files that a running host or an open room is using. Every failure
//! (offline, no release yet, a read-only install location, a bad signature)
//! is logged and ignored: local play must always start.
//!
//! The Tauri updater verifies each download against the public key in
//! tauri.conf.json before installing it. The matching private key exists only
//! in the release workflow's secrets.
use std::time::Duration;
use tauri_plugin_updater::UpdaterExt;

/// The release manifest check must be quick, so an offline launch is barely delayed.
const CHECK_TIMEOUT: Duration = Duration::from_secs(5);
/// The update bundle includes the Node runtime (around 100 MB), so allow time to download it.
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(15 * 60);
/// Set to "1" to skip the check, for example in tests or on a machine without internet.
pub const DISABLE_ENV: &str = "SOFA_DISABLE_UPDATER";

/// What the launch check did.
pub enum Outcome {
    /// No update, update checks disabled, or the check failed: start normally.
    Continue,
    /// A newer version is installed on disk. The app must restart into it.
    RestartRequired,
}

fn disabled() -> bool {
    cfg!(feature = "native-e2e") || std::env::var(DISABLE_ENV).map(|value| value == "1").unwrap_or(false)
}

/// Checks for an update and installs it. `on_installing` runs once, with the new
/// version, just before the download starts, so the status window can say so.
pub fn check_and_install(app: &tauri::AppHandle, on_installing: impl FnOnce(&str)) -> Outcome {
    if disabled() {
        return Outcome::Continue;
    }
    tauri::async_runtime::block_on(async {
        match try_update(app, on_installing).await {
            Ok(outcome) => outcome,
            Err(error) => {
                eprintln!("Sofa Arcade update check skipped: {error}");
                Outcome::Continue
            }
        }
    })
}

async fn try_update(
    app: &tauri::AppHandle,
    on_installing: impl FnOnce(&str),
) -> Result<Outcome, tauri_plugin_updater::Error> {
    // A short first request decides whether an update exists at all.
    let available = app.updater_builder().timeout(CHECK_TIMEOUT).build()?.check().await?;
    if available.is_none() {
        return Ok(Outcome::Continue);
    }
    // The download reuses the request timeout, so ask again with a longer limit.
    let Some(update) = app.updater_builder().timeout(DOWNLOAD_TIMEOUT).build()?.check().await? else {
        return Ok(Outcome::Continue);
    };
    on_installing(&update.version);
    update.download_and_install(|_, _| {}, || {}).await?;
    Ok(Outcome::RestartRequired)
}
