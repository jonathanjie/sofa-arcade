//! Coordinate ordinary window close and AppKit Quit without exiting mid-shutdown.
//! The state machine stays platform-independent so the normal Rust suite tests it.

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum Phase {
    #[default]
    Running,
    Draining,
    Complete,
    Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Request {
    Start,
    Wait,
    Complete,
    Refuse,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Completion {
    Exit,
    ReplyToAppKit(bool),
    Failed,
    None,
}

#[derive(Debug, Default)]
pub(crate) struct Coordinator {
    phase: Phase,
    appkit_reply_pending: bool,
}

impl Coordinator {
    pub(crate) fn request(&mut self, from_appkit: bool) -> Request {
        match self.phase {
            Phase::Complete => Request::Complete,
            Phase::Failed => Request::Refuse,
            Phase::Running | Phase::Draining => {
                self.appkit_reply_pending |= from_appkit;
                if self.phase == Phase::Running {
                    self.phase = Phase::Draining;
                    Request::Start
                } else {
                    Request::Wait
                }
            }
        }
    }

    pub(crate) fn complete(&mut self, succeeded: bool) -> Completion {
        if self.phase != Phase::Draining {
            return Completion::None;
        }
        self.phase = if succeeded {
            Phase::Complete
        } else {
            Phase::Failed
        };
        if std::mem::take(&mut self.appkit_reply_pending) {
            Completion::ReplyToAppKit(succeeded)
        } else if succeeded {
            Completion::Exit
        } else {
            Completion::Failed
        }
    }

    // A worker could not start, so the calling AppKit callback has not promised
    // NSTerminateLater yet. Refuse immediately instead of replying too early.
    pub(crate) fn could_not_start(&mut self) {
        self.phase = Phase::Failed;
        self.appkit_reply_pending = false;
    }

    pub(crate) fn is_complete(&self) -> bool {
        self.phase == Phase::Complete
    }

    pub(crate) fn is_running(&self) -> bool {
        self.phase == Phase::Running
    }
}

#[cfg(all(feature = "native", target_os = "macos"))]
pub(crate) mod macos {
    use objc2::{
        ffi,
        runtime::{AnyClass, AnyObject, Imp, NSObjectProtocol, Sel},
        sel, Encode, MainThreadMarker,
    };
    use objc2_app_kit::{NSApplication, NSApplicationTerminateReply};
    use std::{ffi::CString, io, sync::OnceLock};

    static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

    extern "C-unwind" fn application_should_terminate(
        _delegate: *mut AnyObject,
        _selector: Sel,
        _application: *mut NSApplication,
    ) -> NSApplicationTerminateReply {
        // AppKit invokes this delegate method on its main thread. Refuse a
        // malformed invocation rather than replying or destroying UI elsewhere.
        if MainThreadMarker::new().is_none() {
            return NSApplicationTerminateReply::TerminateCancel;
        }
        let Some(app) = APP.get() else {
            return NSApplicationTerminateReply::TerminateCancel;
        };
        match crate::native::request_quit(app, true) {
            super::Request::Complete => NSApplicationTerminateReply::TerminateNow,
            super::Request::Start | super::Request::Wait => {
                NSApplicationTerminateReply::TerminateLater
            }
            super::Request::Refuse => NSApplicationTerminateReply::TerminateCancel,
        }
    }

    /// Preserve Tao's existing delegate and every existing callback. The pinned
    /// Tao 0.37.3 delegate has no applicationShouldTerminate:; its final
    /// applicationWillTerminate: goes straight to RunEvent::Exit, too late to
    /// wait for main-thread webview destruction. Add only that absent public
    /// AppKit selector, and fail setup if a future runtime already owns it.
    pub(crate) fn install(app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
        let mtm = MainThreadMarker::new()
            .ok_or_else(|| io::Error::other("Native Quit must be installed on the main thread"))?;
        let application = NSApplication::sharedApplication(mtm);
        let delegate = application.delegate().ok_or_else(|| {
            io::Error::other("Native Quit requires the existing application delegate")
        })?;
        let delegate_object: &AnyObject = (*delegate).as_ref();
        let class = delegate_object.class();
        let selector = sel!(applicationShouldTerminate:);
        if class.instance_method(selector).is_some() {
            return Err(io::Error::other("The application delegate already handles native Quit; review its shutdown contract").into());
        }
        APP.set(app)
            .map_err(|_| io::Error::other("Native Quit was already installed"))?;
        // Derive the NSUInteger return encoding from the typed AppKit binding;
        // the remaining encodings are Objective-C self, selector, and sender.
        let encoding = CString::new(format!("{}@:@", NSApplicationTerminateReply::ENCODING))?;
        let callback: extern "C-unwind" fn(
            *mut AnyObject,
            Sel,
            *mut NSApplication,
        ) -> NSApplicationTerminateReply = application_should_terminate;
        // SAFETY: the callback has the exact public selector ABI above. No
        // methods are replaced, no ivars/layout change, and this retained
        // delegate remains the same object throughout registration.
        let added = unsafe {
            ffi::class_addMethod(
                (class as *const AnyClass).cast_mut(),
                selector,
                std::mem::transmute::<_, Imp>(callback),
                encoding.as_ptr(),
            )
        };
        if !added.as_bool() {
            return Err(
                io::Error::other("Could not install the native Quit delegate method").into(),
            );
        }
        class.verify_sel::<(&NSApplication,), NSApplicationTerminateReply>(selector)?;
        // NSApplication may cache its delegate's optional capabilities. Reset
        // the same strongly retained object to refresh those flags without
        // replacing Tao's delegate or forwarding its lifecycle methods.
        application.setDelegate(None);
        application.setDelegate(Some(&delegate));
        if !delegate.respondsToSelector(selector) {
            return Err(
                io::Error::other("Native Quit delegate registration was not established").into(),
            );
        }
        Ok(())
    }

    pub(crate) fn reply(proceed: bool) {
        let mtm = MainThreadMarker::new().expect("Native Quit replies must run on the main thread");
        NSApplication::sharedApplication(mtm).replyToApplicationShouldTerminate(proceed);
    }
}

#[cfg(test)]
mod tests {
    use super::{Completion, Coordinator, Request};

    #[test]
    fn repeated_native_quit_waits_for_one_real_completion() {
        let mut state = Coordinator::default();
        assert!(state.is_running());
        assert_eq!(state.request(true), Request::Start);
        assert!(!state.is_running());
        assert_eq!(state.request(true), Request::Wait);
        assert!(!state.is_complete());
        assert_eq!(state.complete(true), Completion::ReplyToAppKit(true));
        assert_eq!(state.complete(true), Completion::None);
        assert_eq!(state.request(true), Request::Complete);
    }

    #[test]
    fn native_quit_attaches_to_a_window_close_already_in_progress() {
        let mut state = Coordinator::default();
        assert_eq!(state.request(false), Request::Start);
        assert_eq!(state.request(true), Request::Wait);
        assert_eq!(state.request(false), Request::Wait);
        assert_eq!(state.complete(true), Completion::ReplyToAppKit(true));
    }

    #[test]
    fn exit_request_cannot_complete_a_pending_native_quit() {
        let mut state = Coordinator::default();
        assert_eq!(state.request(true), Request::Start);
        assert_eq!(state.request(false), Request::Wait);
        assert!(!state.is_complete());
        assert_eq!(state.complete(true), Completion::ReplyToAppKit(true));
        assert!(state.is_complete());
    }

    #[test]
    fn completed_window_close_needs_no_late_appkit_reply() {
        let mut state = Coordinator::default();
        assert_eq!(state.request(false), Request::Start);
        assert_eq!(state.complete(true), Completion::Exit);
        assert_eq!(state.request(true), Request::Complete);
        assert_eq!(state.complete(true), Completion::None);
    }

    #[test]
    fn failed_shutdown_never_claims_native_completion() {
        let mut state = Coordinator::default();
        assert_eq!(state.request(true), Request::Start);
        assert_eq!(state.complete(false), Completion::ReplyToAppKit(false));
        assert!(!state.is_complete());
        assert_eq!(state.request(true), Request::Refuse);
        assert_eq!(state.complete(true), Completion::None);
    }

    #[test]
    fn failed_worker_start_does_not_reply_before_appkit_has_deferred() {
        let mut state = Coordinator::default();
        assert_eq!(state.request(true), Request::Start);
        state.could_not_start();
        assert_eq!(state.request(true), Request::Refuse);
        assert_eq!(state.complete(false), Completion::None);
        assert!(!state.is_complete());
    }
}
