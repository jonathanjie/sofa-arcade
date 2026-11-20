// Test harness only: operates on the exact child PID supplied by our Node test.
// No accessibility entitlement, UI scripting, shell command, or Gatekeeper change.
import AppKit
import CoreGraphics
import Foundation

let args = CommandLine.arguments
if args.count != 3 || (args[1] != "quit" && args[1] != "window") {
    fputs("usage: native-control quit|window PID\n", stderr)
    exit(2)
}
guard let pid = Int32(args[2]), pid > 1 else { exit(2) }
if args[1] == "quit" {
    guard let app = NSRunningApplication(processIdentifier: pid) else { exit(3) }
    exit(app.terminate() ? 0 : 4)
}
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
for window in windows {
    guard let owner = window[kCGWindowOwnerPID as String] as? Int32,
          owner == pid,
          let layer = window[kCGWindowLayer as String] as? Int,
          layer == 0,
          let number = window[kCGWindowNumber as String] as? UInt32 else { continue }
    print(number)
    exit(0)
}
exit(5)
