import CoreGraphics
import Foundation

// 列出 Electron 进程的可见窗口及其 bounds（无需屏幕录制权限）
let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
for w in info {
    guard let owner = w[kCGWindowOwnerName as String] as? String, owner.contains("Electron"),
          let b = w[kCGWindowBounds as String] as? [String: Any] else { continue }
    let layer = w[kCGWindowLayer as String] as? Int ?? 0
    let alpha = w[kCGWindowAlpha as String] as? Double ?? 1
    print("owner=\(owner) layer=\(layer) alpha=\(alpha) bounds=\(b)")
}
