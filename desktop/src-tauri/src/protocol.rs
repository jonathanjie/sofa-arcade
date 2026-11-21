use serde::Deserialize;
use std::io::{self, BufRead};
use url::Url;

pub const MAX_RECORD_BYTES: usize = 16384;
pub const MAX_READINESS_BYTES: usize = 4096;
pub const MAX_CONTROLLER_URLS: usize = 32;

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Readiness {
    #[serde(rename = "type")]
    pub kind: String,
    pub protocol_version: u8,
    pub port: u16,
    pub host_url: String,
    pub controller_urls: Vec<String>,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub secure_controller_status: Option<crate::secure::SecureControllerStatus>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HostError {
    #[serde(rename = "type")]
    kind: String,
    protocol_version: u8,
    code: String,
    message: String,
}

#[derive(Debug, Clone)]
pub enum Record {
    Ready(Readiness),
    RefreshRequested,
    Failure(&'static str),
    Secure(crate::secure::SecureResult),
}

/// Reads at most one bounded line. No unbounded `read_line`, retained logs, or raw error dumps.
pub fn read_record_line<R: BufRead>(reader: &mut R) -> io::Result<Option<Vec<u8>>> {
    let mut line = Vec::new();
    loop {
        let available = reader.fill_buf()?;
        if available.is_empty() {
            return if line.is_empty() {
                Ok(None)
            } else {
                Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "incomplete readiness record",
                ))
            };
        }
        let newline = available.iter().position(|byte| *byte == b'\n');
        let count = newline.map_or(available.len(), |index| index + 1);
        if line.len() + count > MAX_RECORD_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "oversized readiness record",
            ));
        }
        line.extend_from_slice(&available[..count]);
        reader.consume(count);
        if newline.is_some() {
            return Ok(Some(line));
        }
    }
}

pub fn parse_record(line: &[u8], expected_port: u16) -> Result<Record, &'static str> {
    if line.len() > MAX_RECORD_BYTES {
        return Err("oversized readiness record");
    }
    if let Ok(value) = serde_json::from_slice::<crate::secure::SecureResult>(line) {
        value.validate()?;
        return Ok(Record::Secure(value));
    }
    if line.len() > MAX_READINESS_BYTES { return Err("oversized readiness record"); }
    if let Ok(error) = serde_json::from_slice::<HostError>(line) {
        if error.kind != "error" || error.protocol_version != 1 || error.message.len() > 512 {
            return Err("invalid readiness record");
        }
        return Ok(Record::Failure(match error.code.as_str() {
            "port_in_use" => "port_in_use",
            "invalid_arguments" => "invalid_arguments",
            _ => "startup_failed",
        }));
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct RefreshRequest {
        #[serde(rename = "type")]
        kind: String,
        protocol_version: u8,
        reason: String,
    }
    if let Ok(request) = serde_json::from_slice::<RefreshRequest>(line) {
        if request.kind == "refresh-request"
            && request.protocol_version == 1
            && matches!(request.reason.as_str(), "network_change" | "resume")
        {
            return Ok(Record::RefreshRequested);
        }
        return Err("invalid refresh request");
    }
    let value: Readiness = serde_json::from_slice(line).map_err(|_| "invalid readiness record")?;
    if value.protocol_version != 1
        || value.port != expected_port
        || value.port == 0
        || !matches!(value.kind.as_str(), "ready" | "refreshed")
        || value.host_url != format!("http://127.0.0.1:{expected_port}/")
        || value.controller_urls.len() > MAX_CONTROLLER_URLS
    {
        return Err("invalid readiness record");
    }
    if value.kind == "ready" && value.reason.is_some() {
        return Err("invalid readiness record");
    }
    if value.kind == "refreshed"
        && !matches!(
            value.reason.as_deref(),
            Some("network_change" | "resume" | "requested")
        )
    {
        return Err("invalid readiness record");
    }
    for address in &value.controller_urls {
        let url = Url::parse(address).map_err(|_| "invalid controller address")?;
        let ipv4 = match url.host() {
            Some(url::Host::Ipv4(ip)) => ip,
            _ => return Err("invalid controller address"),
        };
        if url.scheme() != "http"
            || url.port() != Some(expected_port)
            || url.path() != "/"
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || ipv4.is_unspecified()
            || ipv4.is_multicast()
        {
            return Err("invalid controller address");
        }
    }
    if let Some(status) = &value.secure_controller_status { status.validate()?; }
    Ok(Record::Ready(value))
}

/// Only the exact owned loopback origin can navigate the game window.
pub fn allowed_game_navigation(url: &Url, port: u16) -> bool {
    url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port() == Some(port)
        && url.username().is_empty()
        && url.password().is_none()
        && url.path() == "/"
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    fn good() -> String {
        r#"{"type":"ready","protocolVersion":1,"port":4177,"hostUrl":"http://127.0.0.1:4177/","controllerUrls":["http://192.168.1.8:4177/"]}"#.into()
    }
    #[test]
    fn readiness_rejects_origin_spoofing_and_bad_ports() {
        assert!(parse_record(good().as_bytes(), 4177).is_ok());
        for bad in [
            good().replace("127.0.0.1", "evil.invalid"),
            good().replace("4177", "4178"),
            good().replace("192.168.1.8", "user:password@192.168.1.8"),
            good().replace("/\"]", "/?token=secret\"]"),
        ] {
            assert!(
                parse_record(bad.as_bytes(), 4177).is_err(),
                "accepted spoofed readiness"
            );
        }
    }
    #[test]
    fn parser_bounds_record_even_without_newline() {
        let mut reader = Cursor::new(vec![b'x'; MAX_RECORD_BYTES + 1]);
        assert!(read_record_line(&mut reader).is_err());
        assert!(read_record_line(&mut Cursor::new(b"unfinished")).is_err());
        assert!(read_record_line(&mut Cursor::new(b"")).unwrap().is_none());
        assert_eq!(
            read_record_line(&mut Cursor::new(b"{}\nnext\n"))
                .unwrap()
                .unwrap(),
            b"{}\n"
        );
    }
    #[test]
    fn unknown_protocol_and_extra_fields_fail_closed() {
        assert!(parse_record(
            good().replace("Version\":1", "Version\":2").as_bytes(),
            4177
        )
        .is_err());
        assert!(parse_record(
            good()
                .replace("\"port\":4177", "\"token\":\"hidden\",\"port\":4177")
                .as_bytes(),
            4177
        )
        .is_err());
        assert!(parse_record(
            good().replace("\"ready\"", "\"refreshed\"").as_bytes(),
            4177
        )
        .is_err());
    }
    #[test]
    fn errors_use_our_safe_message_code_not_child_content() {
        match parse_record(br#"{"type":"error","protocolVersion":1,"code":"port_in_use","message":"secret should never appear"}"#, 4177).unwrap() {
            Record::Failure(code) => assert_eq!(code, "port_in_use"), _ => panic!("expected failure"),
        }
    }
    #[test]
    fn refresh_request_accepts_only_bounded_known_reasons() {
        for reason in ["network_change", "resume"] {
            let record =
                format!(r#"{{"type":"refresh-request","protocolVersion":1,"reason":"{reason}"}}"#);
            assert!(matches!(
                parse_record(record.as_bytes(), 4177),
                Ok(Record::RefreshRequested)
            ));
        }
        assert!(parse_record(
            br#"{"type":"refresh-request","protocolVersion":1,"reason":"requested"}"#,
            4177
        )
        .is_err());
        assert!(parse_record(
            br#"{"type":"refresh-request","protocolVersion":1,"reason":"resume","token":"secret"}"#,
            4177
        )
        .is_err());
    }
    #[test]
    fn navigation_rejects_external_origins_native_schemes_and_downloads() {
        assert!(allowed_game_navigation(
            &Url::parse("http://127.0.0.1:4177/?room=ABCDEF&host=1").unwrap(),
            4177
        ));
        for bad in [
            "http://127.0.0.1:4178/",
            "https://127.0.0.1:4177/",
            "http://localhost:4177/",
            "http://127.0.0.1:4177/downloads/game.zip",
            "file:///etc/passwd",
            "https://sofa-native.invalid/retry",
            "http://user@127.0.0.1:4177/",
        ] {
            assert!(!allowed_game_navigation(&Url::parse(bad).unwrap(), 4177));
        }
    }
    #[test]
    fn secure_status_is_additive_but_readiness_and_result_shapes_remain_bounded() {
        let mut value: serde_json::Value = serde_json::from_str(&good()).unwrap();
        let status = serde_json::json!({"enabled": false, "status":"needs-setup", "controllerOrigins":[], "requiresPhoneTrust":false});
        value["secureControllerStatus"] = status.clone();
        assert!(matches!(parse_record(&serde_json::to_vec(&value).unwrap(), 4177), Ok(Record::Ready(_))));
        value["secureControllerStatus"]["privateKey"] = serde_json::json!("untrusted");
        assert!(parse_record(&serde_json::to_vec(&value).unwrap(), 4177).is_err());
        let mut response = serde_json::json!({"type":"secure-result", "protocolVersion":1, "id":"native-1", "operation":"getStatus", "ok":true, "status":status});
        assert!(matches!(parse_record(&serde_json::to_vec(&response).unwrap(), 4177), Ok(Record::Secure(_))));
        response["operation"] = serde_json::json!("loadTlsMaterial");
        assert!(parse_record(&serde_json::to_vec(&response).unwrap(), 4177).is_err());
        let mut oversized = good().into_bytes(); oversized.resize(MAX_READINESS_BYTES + 1, b' ');
        assert!(parse_record(&oversized, 4177).is_err());
    }
}
