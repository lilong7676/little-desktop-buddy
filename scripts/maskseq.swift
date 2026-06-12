import AppKit
import CoreImage
import Foundation
import Vision

// Usage: swift maskseq.swift <frames dir> <out dir>
// 对视频抽帧序列逐帧做主体抠图，全序列统一画布（按所有帧 alpha 的并集 bbox 裁剪），
// 保证合成动图时猫不会抖动。

func alphaBBox(_ cg: CGImage) -> CGRect? {
    let w = cg.width
    let h = cg.height
    var data = [UInt8](repeating: 0, count: w * h * 4)
    guard
        let ctx = CGContext(
            data: &data,
            width: w,
            height: h,
            bitsPerComponent: 8,
            bytesPerRow: w * 4,
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
    else { return nil }
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
    var minX = w
    var minY = h
    var maxX = -1
    var maxY = -1
    for y in 0..<h {
        for x in 0..<w where data[(y * w + x) * 4 + 3] > 16 {
            if x < minX { minX = x }
            if x > maxX { maxX = x }
            if y < minY { minY = y }
            if y > maxY { maxY = y }
        }
    }
    if maxX < 0 { return nil }
    return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
}

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write("usage: swift maskseq.swift <inDir> <outDir>\n".data(using: .utf8)!)
    exit(1)
}
let inDir = args[1]
let outDir = args[2]
try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

let files = try FileManager.default.contentsOfDirectory(atPath: inDir)
    .filter { $0.hasSuffix(".png") }
    .sorted()

let ciContext = CIContext()
var rendered: [(name: String, cg: CGImage)] = []
var union: CGRect?

for f in files {
    let url = URL(fileURLWithPath: inDir).appendingPathComponent(f)
    guard let ci = CIImage(contentsOf: url) else { continue }
    let handler = VNImageRequestHandler(ciImage: ci, options: [:])
    let req = VNGenerateForegroundInstanceMaskRequest()
    try? handler.perform([req])
    guard let res = req.results?.first,
        let buf = try? res.generateMaskedImage(
            ofInstances: res.allInstances,
            from: handler,
            croppedToInstancesExtent: false
        )
    else {
        print("skip \(f) (no foreground)")
        continue
    }
    let masked = CIImage(cvPixelBuffer: buf)
    guard let cg = ciContext.createCGImage(masked, from: masked.extent) else { continue }
    if let bbox = alphaBBox(cg) {
        union = union.map { $0.union(bbox) } ?? bbox
        print("bbox \(f) \(Int(bbox.width))x\(Int(bbox.height))")
    }
    rendered.append((f, cg))
}

guard var crop = union, !rendered.isEmpty else {
    FileHandle.standardError.write("no foreground detected in any frame\n".data(using: .utf8)!)
    exit(1)
}
let full = CGRect(x: 0, y: 0, width: rendered[0].cg.width, height: rendered[0].cg.height)
crop = crop.insetBy(dx: -8, dy: -8).intersection(full).integral

for (name, cg) in rendered {
    guard let cropped = cg.cropping(to: crop) else { continue }
    let rep = NSBitmapImageRep(cgImage: cropped)
    guard let data = rep.representation(using: .png, properties: [:]) else { continue }
    try data.write(to: URL(fileURLWithPath: outDir).appendingPathComponent(name))
}
print("frames=\(rendered.count) size=\(Int(crop.width))x\(Int(crop.height))")
