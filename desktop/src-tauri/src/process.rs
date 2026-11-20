//! Owned-child control. No PID-based discovery, signals to process names, shells, or PATH lookup.
use std::{
    io::{self, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Debug)]
pub struct Paths {
    pub node: PathBuf,
    pub runtime: PathBuf,
    pub data: PathBuf,
}

pub fn host_command(paths: &Paths, port: u16) -> io::Result<Command> {
    if !paths.node.is_absolute() || !paths.runtime.is_absolute() || !paths.data.is_absolute() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "host paths must be absolute",
        ));
    }
    let mut command = Command::new(&paths.node);
    command
        .arg("--no-warnings")
        .arg(paths.runtime.join("desktop/host/entry.mjs"))
        .arg("--root")
        .arg(&paths.runtime)
        .arg("--database")
        .arg(paths.data.join("rooms.sqlite"))
        .arg("--port")
        .arg(port.to_string())
        .current_dir(&paths.runtime)
        // Node startup must not inherit NODE_OPTIONS, NODE_PATH, loader, or library injection.
        .env_clear()
        .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
        .env("LANG", "en_US.UTF-8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    Ok(command)
}

pub fn send(child: &mut Child, record: &[u8]) -> io::Result<()> {
    let pipe = child
        .stdin
        .as_mut()
        .ok_or_else(|| io::Error::new(io::ErrorKind::BrokenPipe, "owned host unavailable"))?;
    pipe.write_all(record)?;
    pipe.flush()
}

/// Close only the retained Child handle. EOF is also the host's parent-death watchdog.
pub fn stop(child: &mut Child, grace: Duration) -> io::Result<()> {
    let _ = send(child, b"{\"type\":\"shutdown\"}\n");
    drop(child.stdin.take());
    let deadline = Instant::now() + grace;
    loop {
        if child.try_wait()?.is_some() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            break;
        }
        thread::sleep(Duration::from_millis(20));
    }
    // Child::kill uses the exact process spawned here; never a PID recovered from disk/network.
    if child.try_wait()?.is_none() {
        child.kill()?;
    }
    child.wait()?;
    Ok(())
}

pub fn bundled_node(executable: &Path) -> io::Result<PathBuf> {
    Ok(executable
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "application location unavailable"))?
        .join(if cfg!(windows) { "node.exe" } else { "node" }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fixed_paths_arguments_and_clean_environment() {
        let paths = Paths {
            node: "/Application With Spaces/node".into(),
            runtime: "/Application With Spaces/runtime".into(),
            data: "/User With Spaces/Arcade".into(),
        };
        let command = host_command(&paths, 4177).unwrap();
        assert_eq!(command.get_program(), paths.node.as_os_str());
        let args: Vec<_> = command
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            args,
            [
                "--no-warnings",
                "/Application With Spaces/runtime/desktop/host/entry.mjs",
                "--root",
                "/Application With Spaces/runtime",
                "--database",
                "/User With Spaces/Arcade/rooms.sqlite",
                "--port",
                "4177"
            ]
        );
        assert!(!command
            .get_envs()
            .any(|(k, _)| k == "NODE_OPTIONS" || k == "NODE_PATH"));
        assert!(host_command(
            &Paths {
                node: "node".into(),
                ..paths
            },
            4177
        )
        .is_err());
    }
    #[cfg(unix)]
    #[test]
    fn shutdown_reaps_only_owned_child_leaving_unrelated_process_alive() {
        let mut owned = Command::new("/bin/cat")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        let mut other = Command::new("/bin/cat")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        stop(&mut owned, Duration::from_secs(1)).unwrap();
        assert!(owned.try_wait().unwrap().is_some());
        assert!(other.try_wait().unwrap().is_none());
        stop(&mut other, Duration::from_secs(1)).unwrap();
    }
}
