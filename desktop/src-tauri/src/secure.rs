//! Narrow native-only trusted-LAN messages. No general invoke or filesystem API.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use url::Url;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SecureControllerStatus {
    pub enabled: bool,
    pub status: String,
    pub controller_origins: Vec<String>,
    pub requires_phone_trust: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub certificate_fingerprint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub valid_until: Option<String>,
}

fn fingerprint(value: &str) -> bool {
    value.len() == 95 && value.split(':').count() == 32
        && value.split(':').all(|part| part.len() == 2 && part.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_lowercase()))
}

fn validity(value: &str) -> bool {
    // Node emits canonical ISO-8601 UTC with milliseconds. Date arithmetic and
    // certificate validity stay in the certificate implementation, not Rust UI.
    value.len() == 24 && value.as_bytes()[4] == b'-' && value.as_bytes()[7] == b'-'
        && value.as_bytes()[10] == b'T' && value.as_bytes()[13] == b':' && value.as_bytes()[16] == b':'
        && value.as_bytes()[19] == b'.' && value.ends_with('Z')
        && value.bytes().enumerate().all(|(i, b)| [4, 7, 10, 13, 16, 19, 23].contains(&i) || b.is_ascii_digit())
}

impl SecureControllerStatus {
    pub fn validate(&self) -> Result<(), &'static str> {
        if !matches!(self.status.as_str(), "disabled" | "needs-setup" | "ready" | "certificate-expired" | "address-mismatch" | "failed")
            || self.controller_origins.len() > 16
            || (self.status != "ready" && !self.controller_origins.is_empty())
            || self.certificate_fingerprint.as_deref().is_some_and(|v| !fingerprint(v))
            || self.valid_until.as_deref().is_some_and(|v| !validity(v)) {
            return Err("invalid secure readiness");
        }
        if self.status == "ready" && (!self.enabled || !self.requires_phone_trust || self.controller_origins.is_empty()
            || self.certificate_fingerprint.is_none() || self.valid_until.is_none()) {
            return Err("incomplete secure readiness");
        }
        let mut seen = std::collections::HashSet::new();
        for raw in &self.controller_origins {
            let url = Url::parse(raw).map_err(|_| "invalid secure origin")?;
            let local = match url.host() {
                Some(url::Host::Ipv4(ip)) => ip.is_private() || ip.is_loopback() || ip.is_link_local(),
                Some(url::Host::Domain(name)) => name == "localhost",
                _ => false,
            };
            if !local || url.scheme() != "https" || url.port().is_none_or(|port| port == 0)
                || !url.username().is_empty() || url.password().is_some() || url.query().is_some()
                || url.fragment().is_some() || url.path() != "/" || url.origin().ascii_serialization() != *raw
                || !seen.insert(raw) { return Err("invalid secure origin"); }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicTrust {
    pub filename: String,
    pub media_type: String,
    pub contents: String,
    pub certificate_fingerprint: String,
    pub valid_until: String,
}
impl PublicTrust {
    pub fn validate(&self) -> Result<(), &'static str> {
        let name = &self.filename;
        if name.is_empty() || name.len() > 120 || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
            || !name.as_bytes()[0].is_ascii_alphanumeric() || name.contains("..")
            || self.contents.is_empty() || self.contents.len() > 12000
            || self.contents.contains("PRIVATE") || self.contents.contains("<!ENTITY") || self.contents.contains("file://")
            || !fingerprint(&self.certificate_fingerprint) || !validity(&self.valid_until) {
            return Err("invalid public trust export");
        }
        let pem = name.ends_with(".crt") && self.media_type == "application/x-x509-ca-cert"
            && self.contents.starts_with("-----BEGIN CERTIFICATE-----\n")
            && self.contents.trim_end().ends_with("-----END CERTIFICATE-----")
            && self.contents.matches("-----BEGIN CERTIFICATE-----").count() == 1;
        let profile = name.ends_with(".mobileconfig") && self.media_type == "application/x-apple-aspen-config"
            && self.contents.contains("<string>com.apple.security.root</string>")
            && self.contents.contains("<string>Configuration</string>")
            && self.contents.matches("<data>").count() == 1;
        if !pem && !profile { return Err("invalid public trust export"); }
        Ok(())
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SecureResult {
    #[serde(rename = "type")]
    pub kind: String,
    pub protocol_version: u8,
    pub id: String,
    pub operation: String,
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<SecureControllerStatus>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub public_trust: Option<PublicTrust>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}
fn valid_id(id: &str) -> bool { !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') }
fn operation(op: &str) -> bool { matches!(op, "getStatus" | "provision" | "exportPublicTrust" | "remove") }
impl SecureResult {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.kind != "secure-result" || self.protocol_version != 1 || !valid_id(&self.id) || !operation(&self.operation) {
            return Err("invalid secure result");
        }
        if !self.ok {
            if self.status.is_some() || self.public_trust.is_some() || self.code.as_deref() != Some("secure_operation_failed") { return Err("invalid secure failure"); }
        } else if self.code.is_some() { return Err("invalid secure result"); }
        else if self.operation == "exportPublicTrust" {
            if self.status.is_some() { return Err("invalid secure export"); }
            self.public_trust.as_ref().ok_or("missing secure export")?.validate()?;
        } else {
            if self.public_trust.is_some() { return Err("invalid secure status"); }
            self.status.as_ref().ok_or("missing secure status")?.validate()?;
        }
        Ok(())
    }
    pub fn failure(id: String, operation: String) -> Self {
        Self { kind: "secure-result".into(), protocol_version: 1, id, operation, ok: false, status: None, public_trust: None, code: Some("secure_operation_failed".into()) }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SecureCommand {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub id: String,
    pub operation: String,
    pub options: Value,
}

pub fn parse_secure_navigation(url: &Url) -> Option<SecureCommand> {
    if url.scheme() != "https" || url.host_str() != Some("sofa-native.invalid") || url.port().is_some()
        || url.path() != "/secure" || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some()
        || url.as_str().len() > 512 { return None; }
    let pairs: Vec<_> = url.query_pairs().collect();
    let mut fields = std::collections::HashMap::new();
    for (key, value) in pairs {
        if !matches!(key.as_ref(), "id" | "operation" | "replaceRoot" | "format" | "mode") || fields.insert(key.into_owned(), value.into_owned()).is_some() { return None; }
    }
    let id = fields.remove("id")?;
    let op = fields.remove("operation")?;
    if !valid_id(&id) || !operation(&op) { return None; }
    let options = match op.as_str() {
        "getStatus" if fields.is_empty() => json!({}),
        "provision" if fields.len() == 1 => match fields.get("replaceRoot")?.as_str() { "true" => json!({"replaceRoot": true}), "false" => json!({"replaceRoot": false}), _ => return None },
        "exportPublicTrust" if fields.len() == 1 => match fields.get("format")?.as_str() { format @ ("pem" | "mobileconfig") => json!({"format": format}), _ => return None },
        "remove" if fields.len() == 1 => match fields.get("mode")?.as_str() { mode @ ("disable" | "remove") => json!({"mode": mode}), _ => return None },
        _ => return None,
    };
    Some(SecureCommand { kind: "secure", id, operation: op, options })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn navigation_is_fixed_bounded_and_carries_no_paths_or_bearers() {
        let good = "https://sofa-native.invalid/secure?id=abc-1&operation=provision&replaceRoot=false";
        let command = parse_secure_navigation(&Url::parse(good).unwrap()).unwrap();
        assert_eq!(command.options, json!({"replaceRoot":false}));
        for bad in [good.replace("false", "yes"), good.replace("sofa-native.invalid", "attacker.invalid"), good.replace("https:", "http:"), format!("{good}&token=secret"), format!("{good}&id=duplicate"), good.replace("replaceRoot=false", "path=/tmp/key"), good.replace("abc-1", "a%2Fb")] {
            assert!(parse_secure_navigation(&Url::parse(&bad).unwrap()).is_none(), "{bad}");
        }
    }
    #[test]
    fn secure_status_rejects_remote_credentialed_or_unready_origins() {
        let good = json!({"enabled":true,"status":"ready","controllerOrigins":["https://192.168.1.2:4178"],"requiresPhoneTrust":true,"certificateFingerprint":"AA:".repeat(31)+"AA","validUntil":"2027-02-19T00:00:00.000Z"});
        assert!(serde_json::from_value::<SecureControllerStatus>(good.clone()).unwrap().validate().is_ok());
        for (key, value) in [("controllerOrigins",json!(["https://example.com:4178"])), ("controllerOrigins",json!(["https://192.168.1.2:4178/?token=x"])), ("status",json!("disabled")), ("requiresPhoneTrust",json!(false)), ("certificateFingerprint",json!("private"))] {
            let mut bad = good.clone(); bad[key] = value;
            assert!(serde_json::from_value::<SecureControllerStatus>(bad).unwrap().validate().is_err());
        }
        let mut extra = good; extra["privateKey"] = json!("secret");
        assert!(serde_json::from_value::<SecureControllerStatus>(extra).is_err());
    }
}
