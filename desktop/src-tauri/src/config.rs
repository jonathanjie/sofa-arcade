use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
};
use url::Url;

pub const DEFAULT_PORT: u16 = 4177;
const MAX_CONFIG_BYTES: u64 = 4096;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    pub schema_version: u8,
    pub port: u16,
    #[serde(default = "default_path")]
    pub last_path: String,
}
fn default_path() -> String {
    "/".into()
}
impl Default for Config {
    fn default() -> Self {
        Self {
            schema_version: 1,
            port: DEFAULT_PORT,
            last_path: default_path(),
        }
    }
}

/// Store only public collection/room routing. Never retain arbitrary queries or credentials.
pub fn safe_saved_path(url: &Url, port: u16) -> Option<String> {
    if !crate::protocol::allowed_game_navigation(url, port) {
        return None;
    }
    let fields: Vec<_> = url.query_pairs().collect();
    if let Some((_, room)) = fields.iter().find(|(name, _)| name == "room") {
        if room.len() == 6
            && room
                .chars()
                .all(|c| "23456789ABCDEFGHJKMNPQRSTUVWXYZ".contains(c))
        {
            return Some(format!("/?room={room}"));
        }
    }
    if let Some((_, game)) = fields.iter().find(|(name, _)| name == "game") {
        if !game.is_empty()
            && game.len() <= 64
            && game
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        {
            return Some(format!("/?game={game}"));
        }
    }
    Some("/".into())
}

pub fn load_or_create(directory: &Path) -> io::Result<Config> {
    fs::create_dir_all(directory)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(directory, fs::Permissions::from_mode(0o700))?;
    }
    let filename = directory.join("config.json");
    if !filename.try_exists()? {
        let config = Config::default();
        save(directory, &config)?;
        return Ok(config);
    }
    if fs::symlink_metadata(&filename)?.file_type().is_symlink()
        || fs::metadata(&filename)?.len() > MAX_CONFIG_BYTES
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid local settings",
        ));
    }
    let mut data = String::new();
    fs::File::open(filename)?
        .take(MAX_CONFIG_BYTES + 1)
        .read_to_string(&mut data)?;
    let config: Config = serde_json::from_str(&data)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid local settings"))?;
    let parsed = Url::parse(&format!(
        "http://127.0.0.1:{}{}",
        config.port, config.last_path
    ));
    if config.schema_version != 1
        || config.port < 1024
        || parsed
            .ok()
            .and_then(|u| safe_saved_path(&u, config.port))
            .as_deref()
            != Some(config.last_path.as_str())
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid local settings",
        ));
    }
    Ok(config)
}

pub fn save(directory: &Path, config: &Config) -> io::Result<()> {
    atomic_json(directory.join("config.json"), config)
}

pub fn atomic_json<T: Serialize>(destination: PathBuf, value: &T) -> io::Result<()> {
    let mut temporary = destination.clone();
    temporary.set_extension("next");
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    // Old incomplete writes may remain after power loss; remove the path, never follow it.
    match fs::remove_file(&temporary) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    let mut file = options.open(&temporary)?;
    serde_json::to_writer(&mut file, value)?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    fs::rename(&temporary, &destination)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        sync::atomic::{AtomicUsize, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    fn temporary() -> PathBuf {
        std::env::temp_dir().join(format!(
            "sofa-config-{}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ))
    }
    #[test]
    fn saves_same_origin_and_public_route_on_relaunch() {
        let dir = temporary();
        let mut config = load_or_create(&dir).unwrap();
        assert_eq!(config.port, 4177);
        config.last_path = "/?room=ABC234".into();
        save(&dir, &config).unwrap();
        assert_eq!(load_or_create(&dir).unwrap(), config);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(dir.join("config.json"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
            assert_eq!(
                fs::metadata(&dir).unwrap().permissions().mode() & 0o777,
                0o700
            );
        }
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn invalid_saved_config_is_not_silently_reset_losing_origin() {
        let dir = temporary();
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("config.json"), r#"{"schemaVersion":1,"port":0}"#).unwrap();
        assert!(load_or_create(&dir).is_err());
        assert!(fs::read_to_string(dir.join("config.json"))
            .unwrap()
            .contains(":0"));
        fs::write(dir.join("config.json"), vec![b'x'; 5000]).unwrap();
        assert!(load_or_create(&dir).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn saved_path_strips_secrets_and_foreign_origins() {
        assert_eq!(
            safe_saved_path(
                &Url::parse("http://127.0.0.1:4177/?room=ABC234&token=secret#password").unwrap(),
                4177
            )
            .unwrap(),
            "/?room=ABC234"
        );
        assert_eq!(
            safe_saved_path(
                &Url::parse("http://127.0.0.1:4177/?game=sofa-kingdoms&token=secret").unwrap(),
                4177
            )
            .unwrap(),
            "/?game=sofa-kingdoms"
        );
        assert_eq!(
            safe_saved_path(
                &Url::parse("http://127.0.0.1:4177/?room=secret").unwrap(),
                4177
            )
            .unwrap(),
            "/"
        );
        assert!(safe_saved_path(&Url::parse("http://evil.invalid:4177/").unwrap(), 4177).is_none());
    }
}
