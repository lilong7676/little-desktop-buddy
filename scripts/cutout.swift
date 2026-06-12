import Foundation
import Vision
import CoreImage
import AppKit

// Usage: swift cutout.swift <input image> <output dir>
// Subject-lift via VNGenerateForegroundInstanceMaskRequest, one PNG per instance.

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write("usage: swift cutout.swift <input> <outdir>\n".data(using: .utf8)!)
    exit(1)
}
let inputURL = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2])
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

guard let ciImage = CIImage(contentsOf: inputURL) else {
    FileHandle.standardError.write("cannot load \(args[1])\n".data(using: .utf8)!)
    exit(1)
}

let handler = VNImageRequestHandler(ciImage: ciImage, options: [:])
let request = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([request])

guard let result = request.results?.first else {
    print("no foreground found in \(inputURL.lastPathComponent)")
    exit(0)
}

let context = CIContext()
let stem = inputURL.deletingPathExtension().lastPathComponent
    .replacingOccurrences(of: " ", with: "_")

for instance in result.allInstances {
    let buffer = try result.generateMaskedImage(
        ofInstances: IndexSet(integer: instance),
        from: handler,
        croppedToInstancesExtent: true
    )
    let masked = CIImage(cvPixelBuffer: buffer)
    let outURL = outDir.appendingPathComponent("\(stem)_i\(instance).png")
    guard let png = context.pngRepresentation(
        of: masked,
        format: .RGBA8,
        colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!
    ) else { continue }
    try png.write(to: outURL)
    print("wrote \(outURL.lastPathComponent) (\(Int(masked.extent.width))x\(Int(masked.extent.height)))")
}
