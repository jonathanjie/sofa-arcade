// GO7 acceptance only. Observe one exact owned app; optionally return to it once.
// Does not inspect other apps' contents, change power policy, or use Accessibility.
import AppKit
import Foundation

let args = CommandLine.arguments
guard args.count == 4, ["observe", "activate"].contains(args[1]),
      let pid = Int32(args[2]), pid > 1 else {
    fputs("usage: go7-native-ui-state observe|activate PID OWNED_EXECUTABLE\n", stderr)
    exit(2)
}
let expected = URL(fileURLWithPath: args[3]).standardizedFileURL.resolvingSymlinksInPath()
guard let app = NSRunningApplication(processIdentifier: pid),
      let executable = app.executableURL,
      executable.standardizedFileURL.resolvingSymlinksInPath() == expected,
      app.bundleIdentifier == "com.sofaarcade.desktop" else {
    fputs("The requested native process does not match the owned executable.\n", stderr)
    exit(3)
}

func state() -> [String: Any] {
    let frontmost = NSWorkspace.shared.frontmostApplication?.processIdentifier
    return ["ownedPid": Int(pid), "frontmostPid": Int(frontmost ?? -1),
            "isFrontmost": frontmost == pid, "isActive": app.isActive,
            "isHidden": app.isHidden, "isTerminated": app.isTerminated]
}
let before = state()
var activationAccepted: Any = NSNull()
if args[1] == "activate" {
    // Model the user's single return from Finder to the game, rather than
    // repeatedly taking focus or changing App Nap / system power preferences.
    // On macOS 14+ this is a request: the deprecated ignoringOtherApps option
    // is ignored (Apple WWDC23/10054, Cooperative app activation). The caller
    // fails the foreground precondition if declined; it never relaunches/retries.
    if app.isHidden { _ = app.unhide() }
    activationAccepted = app.activate(options: [.activateAllWindows])
    let deadline = Date().addingTimeInterval(5)
    while Date() < deadline {
        // AppKit's changing process properties refresh on a main RunLoop turn.
        _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
        if app.isActive && !app.isHidden
            && NSWorkspace.shared.frontmostApplication?.processIdentifier == pid { break }
        Thread.sleep(forTimeInterval: 0.01)
    }
}
let result: [String: Any] = ["matchesOwnedExecutable": true,
    "operation": args[1], "before": before, "after": state(),
    "activationAccepted": activationAccepted]
guard let encoded = try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]),
      let json = String(data: encoded, encoding: .utf8) else { exit(4) }
print(json)
