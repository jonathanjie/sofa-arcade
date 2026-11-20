//! Platform-independent lifecycle invariants are tested without launching a webview.
pub mod config;
#[cfg(feature = "native")]
pub mod native;
pub mod process;
pub mod protocol;
pub mod secure;
#[cfg(any(feature = "native", test))]
pub(crate) mod termination;
