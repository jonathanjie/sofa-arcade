use crate::{
    config::{self, Config},
    process::{self, Paths},
    protocol::{self, Record},
    secure::{self, SecureCommand, SecureControllerStatus, SecureResult},
    termination::{Completion, Coordinator, Request},
};
use serde::Serialize;
use std::{
    io::BufReader,
    process::Child,
    sync::{
        mpsc::{self, Receiver, Sender},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{
    menu::{MenuBuilder, SubmenuBuilder},
    Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
const STOP_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    schema_version: u8,
    state: &'static str,
    port: u16,
    parent_pid: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    child_pid: Option<u32>,
    generation: u64,
    message: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_code: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    secure_controller_status: Option<SecureControllerStatus>,
}
impl Default for Status {
    fn default() -> Self {
        Self {
            schema_version: 1,
            state: "starting",
            port: config::DEFAULT_PORT,
            parent_pid: std::process::id(),
            child_pid: None,
            generation: 0,
            message: "Opening your local game shelf…",
            error_code: None,
            secure_controller_status: None,
        }
    }
}

enum Control {
    Retry,
    Refresh,
    Shutdown(Sender<Result<(), &'static str>>),
    Secure(SecureCommand, u64),
}
struct Desktop {
    control: Sender<Control>,
    status: Arc<Mutex<Status>>,
    termination: Mutex<Coordinator>,
}

fn message_for(code: &str) -> &'static str {
    match code {
        "port_in_use" => "Sofa Arcade’s saved port is in use. Quit the other local host, then choose Retry Local Host. Your rooms and saved origin are unchanged.",
        "invalid_settings" => "Sofa Arcade could not read its saved settings. Your data has not been reset. Restore a valid config.json in Application Support, then retry.",
        "runtime_missing" => "The bundled local host could not start. Reinstall the complete Sofa Arcade application, then retry. No separate Node installation is needed.",
        "timeout" => "The local host did not become ready in time. Choose Retry Local Host to try again.",
        "refresh_timeout" => "The local connection could not refresh in time. Choose Retry Local Host to reconnect to your saved game.",
        "child_crashed" => "The local host stopped unexpectedly. Your last confirmed actions remain saved. Choose Retry Local Host to reconnect.",
        "invalid_protocol" => "The local host returned an invalid readiness record. Reinstall the complete Sofa Arcade application, then retry.",
        "settings_write" => "Sofa Arcade cannot save local settings. Check that Application Support is writable, then retry.",
        "shutdown_failed" => "Sofa Arcade could not finish closing safely. Your saved rooms have not been reset.",
        _ => "The local host could not start. Your saved rooms have not been reset. Choose Retry Local Host to try again.",
    }
}

fn set_status(
    app: &tauri::AppHandle,
    shared: &Arc<Mutex<Status>>,
    paths: &Paths,
    state: &'static str,
    code: Option<&'static str>,
    child_pid: Option<u32>,
) {
    let mut status = shared.lock().expect("status mutex poisoned");
    status.state = state;
    status.error_code = code;
    status.child_pid = child_pid;
    status.message = code.map(message_for).unwrap_or(match state {
        "ready" => "Your game shelf is ready. Host a game, then scan its QR code on both phones.",
        "stopped" => "The local host is closed. Your rooms remain saved on this Mac.",
        "restarting" => "Reconnecting your local game shelf…",
        "updating" => "Installing the latest Sofa Arcade. It will reopen by itself in a moment…",
        _ => "Opening your local game shelf…",
    });
    let _ = config::atomic_json(paths.data.join("host-status.json"), &*status);
    let payload = serde_json::to_string(&*status).expect("status is serializable");
    drop(status);
    if let Some(window) = app.get_webview_window("startup") {
        let _ = window.eval(&format!("window.setSofaStatus?.({payload})"));
        if state != "ready" && state != "stopped" {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.hide();
            }
            let _ = window.show();
        }
    }
}

fn remember_location(app: &tauri::AppHandle, config: &mut Config, paths: &Paths) {
    if let Some(main) = app.get_webview_window("main") {
        if let Ok(url) = main.url() {
            if let Some(route) = config::safe_saved_path(&url, config.port) {
                if config.last_path != route {
                    config.last_path = route;
                    let _ = config::save(&paths.data, config);
                }
            }
        }
    }
}

/// Retire the network document before releasing its owned listener. Merely
/// hiding it leaves timers/SSE active against a possible new occupant. The
/// default persistent WK datastore remains available to the next same-origin
/// window, while this window and its network activity are destroyed.
fn retire_game(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.destroy().is_err() {
            // If native teardown itself fails, close this application rather
            // than leave a credential-bearing document on an unowned port.
            // OS pipe closure still invokes the Node parent-death cleanup.
            std::process::exit(1);
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        while app.get_webview_window("main").is_some() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(10));
        }
        if app.get_webview_window("main").is_some() {
            std::process::exit(1);
        }
    }
}

fn reveal_game(app: &tauri::AppHandle, config: &Config) {
    let app = app.clone();
    let on_main = app.clone();
    let port = config.port;
    let generation = app
        .state::<Desktop>()
        .status
        .lock()
        .expect("status mutex poisoned")
        .generation;
    let _ = app.run_on_main_thread(move || {
        {
            let desktop = on_main.state::<Desktop>();
            if !desktop.termination.lock().expect("termination mutex poisoned").is_running() { return; }
            let status = desktop.status.lock().expect("status mutex poisoned");
            if status.state != "ready" || status.generation != generation { return; }
        }
        if let Some(window) = on_main.get_webview_window("main") {
            // This branch only reloads an already-owned live origin.
            let _ = window.reload();
            let _ = window.show();
            let _ = window.set_focus();
            if let Some(startup) = on_main.get_webview_window("startup") { let _ = startup.hide(); }
            return;
        }
        // The shared shell persists the current session and clears it on Exit.
        // A periodically sampled native room URL can lag that explicit choice;
        // always open the stable origin and let the shell own resume routing.
        let url = tauri::Url::parse(&format!("http://127.0.0.1:{port}/")).expect("validated loopback origin");
        let on_loaded = on_main.clone();
        let native_navigation = on_main.clone();
        let window = WebviewWindowBuilder::new(&on_main, "main", WebviewUrl::External(url))
            .title("Sofa Arcade")
            .inner_size(1440.0, 900.0).min_inner_size(800.0, 600.0)
            .visible(false)
            .initialization_script(include_str!("../../native-bridge.js"))
            .on_navigation(move |url| {
                if let Some(command) = secure::parse_secure_navigation(url) {
                    let owned_document = native_navigation.get_webview_window("main")
                        .and_then(|window| window.url().ok())
                        .is_some_and(|current| protocol::allowed_game_navigation(&current, port));
                    let desktop = native_navigation.state::<Desktop>();
                    let status = desktop.status.lock().expect("status mutex poisoned");
                    if owned_document && status.state == "ready" && status.generation == generation {
                        let _ = desktop.control.send(Control::Secure(command, generation));
                    }
                    return false;
                }
                protocol::allowed_game_navigation(url, port)
            })
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
            .on_download(|_, _| false)
            .on_page_load(move |webview, payload| {
                if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                    let desktop = on_loaded.state::<Desktop>();
                    if !desktop.termination.lock().expect("termination mutex poisoned").is_running() { return; }
                    let status = desktop.status.lock().expect("status mutex poisoned");
                    if status.state != "ready" || status.generation != generation { return; }
                    drop(status);
                    let _ = webview.show();
                    let _ = webview.set_focus();
                    if let Some(startup) = on_loaded.get_webview_window("startup") { let _ = startup.hide(); }
                }
            })
            .build();
        if window.is_err() {
            if let Some(startup) = on_main.get_webview_window("startup") {
                let _ = startup.eval("window.setSofaStatus?.({state:'error',message:'The game window could not open. Quit Sofa Arcade and reopen it.'})");
                let _ = startup.show();
            }
        }
    });
}

struct OwnedHost {
    child: Child,
    records: Receiver<Result<Record, &'static str>>,
    launched: Instant,
    ready: bool,
    refresh_started: Option<Instant>,
    secure_pending: Option<(SecureCommand, u64, Instant)>,
    retired_secure_ids: std::collections::VecDeque<String>,
}
fn launch(paths: &Paths, port: u16) -> Result<OwnedHost, &'static str> {
    let mut child = process::host_command(paths, port)
        .map_err(|_| "runtime_missing")?
        .spawn()
        .map_err(|_| "runtime_missing")?;
    let stdout = child.stdout.take().expect("piped child stdout");
    // A bounded queue also bounds memory if a broken host floods short records.
    let (tx, records) = mpsc::sync_channel(4);
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            match protocol::read_record_line(&mut reader) {
                Ok(Some(line)) => {
                    if tx.send(protocol::parse_record(&line, port)).is_err() {
                        break;
                    }
                }
                Ok(None) => break,
                Err(_) => {
                    let _ = tx.send(Err("invalid_protocol"));
                    break;
                }
            }
        }
    });
    Ok(OwnedHost {
        child,
        records,
        launched: Instant::now(),
        ready: false,
        refresh_started: None,
        secure_pending: None,
        retired_secure_ids: std::collections::VecDeque::new(),
    })
}

fn retire_secure_request(owned: &mut OwnedHost) {
    if let Some((command, _, _)) = owned.secure_pending.take() {
        if owned.retired_secure_ids.len() == 8 { owned.retired_secure_ids.pop_front(); }
        owned.retired_secure_ids.push_back(command.id);
    }
}

fn reply_secure(app: &tauri::AppHandle, shared: &Arc<Mutex<Status>>, generation: u64, result: &SecureResult) {
    // WebView getters synchronously dispatch to the main thread. Its navigation
    // and page-load callbacks also inspect Status, so never retain this lock
    // across a native WebView call. A retired document cannot consume a result:
    // its pending request is disposed and every request has a fresh UUID.
    let port = {
        let state = shared.lock().expect("status mutex poisoned");
        if state.state != "ready" || state.generation != generation { return; }
        state.port
    };
    if let Some(window) = app.get_webview_window("main") {
        if window.url().ok().is_some_and(|url| protocol::allowed_game_navigation(&url, port)) {
            if let Ok(payload) = serde_json::to_string(result) {
                let _ = window.eval(&format!("window.__sofaSecureResult?.({payload})"));
            }
        }
    }
}

/// Save exactly the already-validated public export. The client cannot choose
/// a path, existing files are never overwritten, and Finder only reveals it.
fn export_public_trust(app: &tauri::AppHandle, value: &secure::PublicTrust) -> Result<(), &'static str> {
    use std::{fs::OpenOptions, io::Write};
    value.validate()?;
    let directory = app.path().download_dir().map_err(|_| "export unavailable")?;
    let directory = directory.canonicalize().map_err(|_| "export unavailable")?;
    for attempt in 0..100 {
        let name = if attempt == 0 { value.filename.clone() } else { format!("{attempt}-{}", value.filename) };
        let destination = directory.join(name);
        let mut options = OpenOptions::new(); options.create_new(true).write(true);
        #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
        match options.open(&destination) {
            Ok(mut file) => {
                file.write_all(value.contents.as_bytes()).and_then(|_| file.sync_all()).map_err(|_| "export unavailable")?;
                #[cfg(target_os = "macos")]
                { std::process::Command::new("/usr/bin/open").arg("-R").arg(&destination).status().map_err(|_| "export unavailable")?; }
                return Ok(());
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("export unavailable"),
        }
    }
    Err("export unavailable")
}

fn supervisor(
    app: tauri::AppHandle,
    paths: Paths,
    control: Receiver<Control>,
    shared: Arc<Mutex<Status>>,
) {
    let mut config = match config::load_or_create(&paths.data) {
        Ok(config) => Some(config),
        Err(_) => None,
    };
    let mut host: Option<OwnedHost> = None;
    let mut should_launch = true;
    let mut restarts = 0u8;
    let mut last_remember = Instant::now();
    loop {
        if should_launch {
            should_launch = false;
            if let Some(cfg) = config.as_ref() {
                {
                    let mut status = shared.lock().expect("status mutex poisoned");
                    status.port = cfg.port;
                    status.generation += 1;
                }
                set_status(&app, &shared, &paths, "starting", None, None);
                match launch(&paths, cfg.port) {
                    Ok(child) => {
                        let pid = child.child.id();
                        host = Some(child);
                        set_status(&app, &shared, &paths, "starting", None, Some(pid));
                    }
                    Err(code) => set_status(&app, &shared, &paths, "error", Some(code), None),
                }
            } else {
                set_status(
                    &app,
                    &shared,
                    &paths,
                    "error",
                    Some("invalid_settings"),
                    None,
                );
            }
        }
        match control.recv_timeout(Duration::from_millis(100)) {
            Ok(Control::Shutdown(done)) => {
                if let Some(cfg) = config.as_mut() {
                    remember_location(&app, cfg, &paths);
                }
                retire_game(&app);
                let stopped = if let Some(mut owned) = host.take() {
                    process::stop(&mut owned.child, STOP_TIMEOUT).map_err(|_| "shutdown_failed")
                } else {
                    Ok(())
                };
                if stopped.is_ok() {
                    set_status(&app, &shared, &paths, "stopped", None, None);
                } else {
                    set_status(&app, &shared, &paths, "error", Some("shutdown_failed"), None);
                }
                let _ = done.send(stopped);
                break;
            }
            Ok(Control::Retry) => {
                if let Some(cfg) = config.as_mut() {
                    remember_location(&app, cfg, &paths);
                }
                set_status(&app, &shared, &paths, "restarting", None, None);
                retire_game(&app);
                if let Some(mut owned) = host.take() {
                    let _ = process::stop(&mut owned.child, STOP_TIMEOUT);
                }
                config = config::load_or_create(&paths.data).ok();
                restarts = 0;
                should_launch = true;
                continue;
            }
            Ok(Control::Refresh) => {
                if let Some(owned) = host.as_mut() {
                    if owned.ready && owned.refresh_started.is_none() {
                        if let Some(cfg) = config.as_mut() {
                            remember_location(&app, cfg, &paths);
                        }
                        shared.lock().expect("status mutex poisoned").generation += 1;
                        set_status(
                            &app,
                            &shared,
                            &paths,
                            "restarting",
                            None,
                            Some(owned.child.id()),
                        );
                        retire_game(&app);
                        retire_secure_request(owned);
                        owned.refresh_started = Some(Instant::now());
                        let _ = process::send(&mut owned.child, b"{\"type\":\"refresh\"}\n");
                    }
                }
            }
            Ok(Control::Secure(command, generation)) => {
                let current = shared.lock().expect("status mutex poisoned").generation;
                if let Some(owned) = host.as_mut() {
                    if owned.ready && owned.refresh_started.is_none() && current == generation && owned.secure_pending.is_none() {
                        if let Ok(mut bytes) = serde_json::to_vec(&command) {
                            bytes.push(b'\n');
                            if bytes.len() <= 256 && process::send(&mut owned.child, &bytes).is_ok() {
                                owned.secure_pending = Some((command, generation, Instant::now()));
                                continue;
                            }
                        }
                    }
                }
                reply_secure(&app, &shared, generation, &SecureResult::failure(command.id, command.operation));
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                if let Some(mut owned) = host.take() {
                    let _ = process::stop(&mut owned.child, STOP_TIMEOUT);
                }
                break;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        if last_remember.elapsed() >= Duration::from_secs(2) {
            if let Some(cfg) = config.as_mut() {
                remember_location(&app, cfg, &paths);
            }
            last_remember = Instant::now();
        }
        let mut failure = None;
        let mut can_restart = false;
        if let Some(owned) = host.as_mut() {
            while let Ok(record) = owned.records.try_recv() {
                match record {
                    Ok(Record::Ready(value)) => {
                        if (!owned.ready && value.kind != "ready")
                            || (owned.ready
                                && (value.kind != "refreshed" || owned.refresh_started.is_none()))
                        {
                            failure = Some("invalid_protocol");
                            break;
                        }
                        owned.ready = true;
                        owned.refresh_started = None;
                        shared.lock().expect("status mutex poisoned").secure_controller_status = value.secure_controller_status;
                        if let Some(cfg) = config.as_mut() {
                            remember_location(&app, cfg, &paths);
                            set_status(
                                &app,
                                &shared,
                                &paths,
                                "ready",
                                None,
                                Some(owned.child.id()),
                            );
                            reveal_game(&app, cfg);
                        }
                    }
                    Ok(Record::RefreshRequested) => {
                        if !owned.ready {
                            failure = Some("invalid_protocol");
                            break;
                        }
                        if owned.refresh_started.is_some() {
                            continue;
                        }
                        if let Some(cfg) = config.as_mut() {
                            remember_location(&app, cfg, &paths);
                        }
                        shared.lock().expect("status mutex poisoned").generation += 1;
                        set_status(
                            &app,
                            &shared,
                            &paths,
                            "restarting",
                            None,
                            Some(owned.child.id()),
                        );
                        retire_game(&app);
                        retire_secure_request(owned);
                        owned.refresh_started = Some(Instant::now());
                        if process::send(&mut owned.child, b"{\"type\":\"refresh\"}\n").is_err() {
                            failure = Some("child_crashed");
                            break;
                        }
                    }
                    Ok(Record::Failure(code)) => {
                        failure = Some(code);
                        break;
                    }
                    Ok(Record::Secure(mut value)) => {
                        if let Some(index) = owned.retired_secure_ids.iter().position(|id| id == &value.id) {
                            owned.retired_secure_ids.remove(index); continue;
                        }
                        let Some((command, generation, _)) = owned.secure_pending.take() else { continue; };
                        if value.id != command.id || value.operation != command.operation {
                            failure = Some("invalid_protocol"); break;
                        }
                        if let Some(public) = value.public_trust.as_ref() {
                            if export_public_trust(&app, public).is_err() {
                                value = SecureResult::failure(command.id, command.operation);
                            }
                        }
                        if let Some(status) = value.status.as_ref() {
                            shared.lock().expect("status mutex poisoned").secure_controller_status = Some(status.clone());
                            let status = shared.lock().expect("status mutex poisoned");
                            let _ = config::atomic_json(paths.data.join("host-status.json"), &*status);
                        }
                        reply_secure(&app, &shared, generation, &value);
                    }
                    Err(_) => {
                        failure = Some("invalid_protocol");
                        break;
                    }
                }
            }
            if failure.is_none() {
                if owned.secure_pending.as_ref().is_some_and(|(_, _, started)| started.elapsed() > STARTUP_TIMEOUT) {
                    if let Some((command, generation, _)) = owned.secure_pending.as_ref() {
                        reply_secure(&app, &shared, *generation, &SecureResult::failure(command.id.clone(), command.operation.clone()));
                    }
                    retire_secure_request(owned);
                }
                match owned.child.try_wait() {
                    Ok(Some(_)) | Err(_) => {
                        failure = Some("child_crashed");
                        can_restart = owned.ready;
                    }
                    Ok(None) if !owned.ready && owned.launched.elapsed() > STARTUP_TIMEOUT => {
                        failure = Some("timeout")
                    }
                    Ok(None)
                        if owned
                            .refresh_started
                            .is_some_and(|started| started.elapsed() > STARTUP_TIMEOUT) =>
                    {
                        failure = Some("refresh_timeout")
                    }
                    _ => {}
                }
            }
            if owned.ready && owned.launched.elapsed() > Duration::from_secs(60) {
                restarts = 0;
            }
        }
        if let Some(code) = failure {
            if let Some(cfg) = config.as_mut() {
                remember_location(&app, cfg, &paths);
            }
            set_status(&app, &shared, &paths, "restarting", None, None);
            retire_game(&app);
            if let Some(mut owned) = host.take() {
                let _ = process::stop(&mut owned.child, STOP_TIMEOUT);
            }
            if can_restart && restarts < 1 {
                restarts += 1;
                should_launch = true;
                set_status(&app, &shared, &paths, "restarting", None, None);
            } else {
                set_status(&app, &shared, &paths, "error", Some(code), None);
            }
        }
    }
}

fn show_quit_failure(app: &tauri::AppHandle) {
    eprintln!("Sofa Arcade could not complete controlled native shutdown");
    if let Some(startup) = app.get_webview_window("startup") {
        let _ = startup.eval("window.setSofaStatus?.({state:'error',message:'Sofa Arcade could not finish closing safely. Your saved rooms have not been reset.'})");
        let _ = startup.show();
    }
}

// Called only on the main thread, including completion dispatched back from
// the worker. AppKit's NSTerminateLater modal loop keeps Tao's common-mode
// event source/observers running, so retire_game can destroy the webview there.
fn finish_quit(app: &tauri::AppHandle, succeeded: bool) {
    let completion = app.state::<Desktop>().termination.lock()
        .expect("termination mutex poisoned").complete(succeeded);
    match completion {
        Completion::Exit => app.exit(0),
        Completion::ReplyToAppKit(proceed) => {
            #[cfg(target_os = "macos")]
            crate::termination::macos::reply(proceed);
            if !proceed { show_quit_failure(app); }
        }
        Completion::Failed => show_quit_failure(app),
        Completion::None => {}
    }
}

pub(crate) fn request_quit(app: &tauri::AppHandle, from_appkit: bool) -> Request {
    // This also runs inside the Objective-C delegate callback: refuse missing
    // state or a poisoned lock before promising a deferred AppKit reply.
    // Tauri's state lookup itself locks an internal mutex with unwrap(). Catch
    // that failure before touching our coordinator, so no unreturned Later
    // promise can leave behind a pending native reply.
    let state = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| app.try_state::<Desktop>())) {
        Ok(Some(state)) => state,
        _ => return Request::Refuse,
    };
    let request = match state.termination.lock() {
        Ok(mut coordinator) => coordinator.request(from_appkit),
        Err(_) => return Request::Refuse,
    };
    if request != Request::Start {
        return request;
    }
    let control = state.control.clone();
    let worker_app = app.clone();
    let worker = thread::Builder::new().name("sofa-native-quit".into()).spawn(move || {
        let (done, wait) = mpsc::channel();
        let succeeded = control.send(Control::Shutdown(done)).is_ok()
            && matches!(wait.recv_timeout(Duration::from_secs(10)), Ok(Ok(())));
        let completion_app = worker_app.clone();
        if worker_app.run_on_main_thread(move || finish_quit(&completion_app, succeeded)).is_err() {
            eprintln!("The native event loop closed before controlled shutdown could reply");
        }
    });
    if worker.is_err() {
        state.termination.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).could_not_start();
        // No NSTerminateLater has been returned yet, so do not send an AppKit
        // reply or call fallible UI code from the delegate on this path.
        use std::io::Write as _;
        let _ = writeln!(std::io::stderr(), "Sofa Arcade could not start controlled native shutdown");
        Request::Refuse
    } else {
        request
    }
}

pub fn run() {
    let builder = tauri::Builder::default()
        // Registered first: a duplicate launch exits before starting any host.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let state = app.try_state::<Desktop>();
            let ready = state
                .as_ref()
                .map(|state| state.status.lock().expect("status mutex poisoned").state == "ready")
                .unwrap_or(false);
            if let Some(window) = app.get_webview_window(if ready { "main" } else { "startup" }) {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build());
    #[cfg(feature = "native-e2e")]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());
    let app = builder
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            let paths = Paths {
                node: process::bundled_node(&std::env::current_exe()?)?,
                runtime: app.path().resource_dir()?.join("runtime"),
                data,
            };
            let (send, receive) = mpsc::channel();
            let status = Arc::new(Mutex::new(Status::default()));
            app.manage(Desktop {
                control: send.clone(),
                status: status.clone(),
                termination: Mutex::new(Coordinator::default()),
            });
            #[cfg(target_os = "macos")]
            crate::termination::macos::install(app.handle().clone())?;
            let startup_control = send.clone();
            let startup_state = status.clone();
            WebviewWindowBuilder::new(app, "startup", WebviewUrl::App("index.html".into()))
                .title("Sofa Arcade")
                .inner_size(720.0, 520.0)
                .min_inner_size(540.0, 440.0)
                .center()
                .on_navigation(move |url| {
                    if url.as_str() == "https://sofa-native.invalid/retry" {
                        let _ = startup_control.send(Control::Retry);
                        return false;
                    }
                    url.scheme() == "tauri"
                        || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))
                })
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .on_page_load(move |webview, payload| {
                    if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                        let state = startup_state.lock().expect("status mutex poisoned");
                        if let Ok(json) = serde_json::to_string(&*state) {
                            let _ = webview.eval(&format!("window.setSofaStatus?.({json})"));
                        }
                    }
                })
                .build()?;
            let application_menu = SubmenuBuilder::new(app, "Sofa Arcade")
                .about(None)
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let view_menu = SubmenuBuilder::new(app, "View")
                .text("reload-board", "Reload Board")
                .fullscreen()
                .build()?;
            let connection_menu = SubmenuBuilder::new(app, "Connection")
                .text("retry-host", "Retry Local Host")
                .text("refresh-network", "Refresh Network")
                .build()?;
            app.set_menu(
                MenuBuilder::new(app)
                    .items(&[&application_menu, &edit_menu, &view_menu, &connection_menu])
                    .build()?,
            )?;
            let handle = app.handle().clone();
            thread::spawn(move || {
                // Update before the host starts, so no running room is ever interrupted.
                let outcome = crate::updater::check_and_install(&handle, |_version| {
                    set_status(&handle, &status, &paths, "updating", None, None);
                });
                if let crate::updater::Outcome::RestartRequired = outcome {
                    handle.restart();
                }
                supervisor(handle, paths, receive, status)
            });
            Ok(())
        })
        .on_menu_event(|app, event| {
            let state = app.state::<Desktop>();
            match event.id().as_ref() {
                "retry-host" => {
                    let _ = state.control.send(Control::Retry);
                }
                "refresh-network" => {
                    let _ = state.control.send(Control::Refresh);
                }
                "reload-board" => {
                    if state.status.lock().expect("status mutex poisoned").state == "ready" {
                        if let Some(main) = app.get_webview_window("main") {
                            let _ = main.reload();
                        }
                    }
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("Sofa Arcade could not initialize its native window");
    app.run(|app, event| match event {
        // Only the launch-time updater restarts, and it does so before any host starts.
        RunEvent::ExitRequested { code: Some(tauri::RESTART_EXIT_CODE), .. } => {}
        RunEvent::ExitRequested { api, .. } => {
            if !app.state::<Desktop>().termination.lock().expect("termination mutex poisoned").is_complete() {
                api.prevent_exit();
                request_quit(app, false);
            }
        }
        RunEvent::WindowEvent {
            event: tauri::WindowEvent::CloseRequested { api, .. },
            ..
        } => {
            api.prevent_close();
            if request_quit(app, false) == Request::Complete {
                app.exit(0);
            }
        }
        RunEvent::Resumed => {
            if let Some(state) = app.try_state::<Desktop>() {
                if state.termination.lock().expect("termination mutex poisoned").is_running() {
                    let _ = state.control.send(Control::Refresh);
                }
            }
        }
        _ => {}
    });
}
