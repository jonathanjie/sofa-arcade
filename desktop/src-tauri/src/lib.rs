//! Platform-independent lifecycle invariants are tested without launching a webview.
pub mod config;
#[cfg(feature = "native")]
pub mod native;
pub mod process;
pub mod protocol;
#[cfg(any(feature = "native", test))]
pub(crate) mod termination;
