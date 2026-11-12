import Foundation
import AppKit
import Vision
import ImageIO
import PDFKit

func output(_ object: Any) throws { let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]); FileHandle.standardOutput.write(data) }
func imageSource(_ path: String) throws -> CGImageSource { guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath:path) as CFURL, nil) else { throw NSError(domain:"FilmAlbum",code:1,userInfo:[NSLocalizedDescriptionKey:"无法读取影像"]) }; return source }
func metadata(_ path: String) throws -> [String:Any] {
 let source=try imageSource(path), props=(CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [String:Any]) ?? [:]
 let exif=props[kCGImagePropertyExifDictionary as String] as? [String:Any] ?? [:], tiff=props[kCGImagePropertyTIFFDictionary as String] as? [String:Any] ?? [:], aux=props[kCGImagePropertyExifAuxDictionary as String] as? [String:Any] ?? [:], gps=props[kCGImagePropertyGPSDictionary as String] as? [String:Any] ?? [:]
 var out:[String:Any]=[:];for (key,value) in ["make":tiff[kCGImagePropertyTIFFMake as String],"model":tiff[kCGImagePropertyTIFFModel as String],"lens":aux[kCGImagePropertyExifAuxLensModel as String],"date":exif[kCGImagePropertyExifDateTimeOriginal as String],"aperture":exif[kCGImagePropertyExifFNumber as String],"exposure":exif[kCGImagePropertyExifExposureTime as String],"focalLength":exif[kCGImagePropertyExifFocalLength as String]] {if let v=value {out[key]=v}}
 if let iso=exif[kCGImagePropertyExifISOSpeedRatings as String] as? [Any] {out["iso"]=iso.first}
 var w=props[kCGImagePropertyPixelWidth as String] as? Int ?? 0,h=props[kCGImagePropertyPixelHeight as String] as? Int ?? 0;let orientation=props[kCGImagePropertyOrientation as String] as? Int ?? 1;if orientation>=5&&orientation<=8 {swap(&w,&h)};out["width"]=w;out["height"]=h
 if let lat=gps[kCGImagePropertyGPSLatitude as String] as? Double,let lon=gps[kCGImagePropertyGPSLongitude as String] as? Double {out["latitude"]=(gps[kCGImagePropertyGPSLatitudeRef as String] as? String)=="S" ? -lat:lat;out["longitude"]=(gps[kCGImagePropertyGPSLongitudeRef as String] as? String)=="W" ? -lon:lon}
 return out
}
func preview(_ path:String,_ destination:String,_ edge:Int) throws {
 let source=try imageSource(path);let props=CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [String:Any] ?? [:];let original=max(props[kCGImagePropertyPixelWidth as String] as? Int ?? 2048,props[kCGImagePropertyPixelHeight as String] as? Int ?? 2048)
 let options:[CFString:Any]=[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:edge==0 ? original:min(original,edge)]
 guard let cg=CGImageSourceCreateThumbnailAtIndex(source,0,options as CFDictionary),let target=CGImageDestinationCreateWithURL(URL(fileURLWithPath:destination) as CFURL,"public.jpeg" as CFString,1,nil) else {throw NSError(domain:"FilmAlbum",code:2)}
 CGImageDestinationAddImage(target,cg,[kCGImageDestinationLossyCompressionQuality:0.88] as CFDictionary);if !CGImageDestinationFinalize(target){throw NSError(domain:"FilmAlbum",code:3)}
}
func analyze(_ path:String) throws -> [String:Any] {
 let source=try imageSource(path);guard let image=CGImageSourceCreateImageAtIndex(source,0,nil) else {throw NSError(domain:"FilmAlbum",code:4)}
 let props=CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [String:Any] ?? [:];let orientation=CGImagePropertyOrientation(rawValue:UInt32(props[kCGImagePropertyOrientation as String] as? Int ?? 1)) ?? .up
 let classify=VNClassifyImageRequest(),ocr=VNRecognizeTextRequest();ocr.recognitionLevel = .accurate;ocr.recognitionLanguages=["zh-Hans","en-US"];ocr.usesLanguageCorrection=true
 try VNImageRequestHandler(cgImage:image,orientation:orientation).perform([classify,ocr]);let labels=(classify.results ?? []).filter{$0.confidence>0.08}.prefix(25).map{["label":$0.identifier,"confidence":$0.confidence] as [String:Any]};let text=(ocr.results ?? []).compactMap{$0.topCandidates(1).first?.string}.joined(separator:" ")
 let color=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:32,pixelsHigh:32,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:color);NSImage(cgImage:image,size:NSSize(width:image.width,height:image.height)).draw(in:NSRect(x:0,y:0,width:32,height:32));NSGraphicsContext.restoreGraphicsState();var r=0.0,g=0.0,b=0.0
 for y in 0..<32 {for x in 0..<32 {if let c=color.colorAt(x:x,y:y)?.usingColorSpace(.deviceRGB){r+=c.redComponent;g+=c.greenComponent;b+=c.blueComponent}}}
 let dominant = r>g*1.12 && r>b*1.12 ? "red":g>r*1.12 && g>b*1.12 ? "green":b>r*1.12 && b>g*1.12 ? "blue":"neutral"
 return ["labels":labels,"text":text,"dominant":dominant]
}
func barcode(_ path:String) throws -> [String:Any] {let source=try imageSource(path);guard let cg=CGImageSourceCreateImageAtIndex(source,0,nil) else {throw NSError(domain:"FilmAlbum",code:4)};let request=VNDetectBarcodesRequest();request.symbologies=[.qr];try VNImageRequestHandler(cgImage:cg).perform([request]);return ["codes":(request.results ?? []).compactMap{$0.payloadStringValue}]}
func drawText(_ text:String,_ rect:NSRect,_ size:CGFloat,_ color:NSColor = .black) {let style=NSMutableParagraphStyle();style.lineBreakMode = .byTruncatingTail;(text as NSString).draw(in:rect,withAttributes:[.font:NSFont.systemFont(ofSize:size),.foregroundColor:color,.paragraphStyle:style])}
func pdf(_ manifest:String,_ destination:String) throws {
 let object=try JSONSerialization.jsonObject(with:Data(contentsOf:URL(fileURLWithPath:manifest))) as! [String:Any],items=object["items"] as? [[String:Any]] ?? [],title=object["title"] as? String ?? "Film Album",mode=object["mode"] as? String ?? "yearbook"
 let data=NSMutableData();var media=CGRect(x:0,y:0,width:595,height:842);guard let consumer=CGDataConsumer(data:data),let context=CGContext(consumer:consumer,mediaBox:&media,nil) else {throw NSError(domain:"FilmAlbum",code:5)}
 let contact=mode=="contact", perPage=mode=="labels" ? 12:(contact ? 36:6), pages=max(1,Int(ceil(Double(items.count)/Double(perPage))))
 for page in 0..<pages {context.beginPDFPage(nil);NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:context,flipped:false);NSColor.white.setFill();NSRect(x:0,y:0,width:595,height:842).fill();drawText(title,NSRect(x:30,y:790,width:object["matrix"] == nil ? 535:470,height:25),20);if let matrix=object["matrix"] as? [[Bool]] {NSColor.black.setFill();for y in matrix.indices {for x in matrix[y].indices where matrix[y][x] {NSRect(x:512+CGFloat(x+4)*1.5,y:835-CGFloat(y+5)*1.5,width:1.5,height:1.5).fill()}}};drawText("FILM ALBUM  /  \(page+1) · \(pages)",NSRect(x:30,y:22,width:535,height:18),9,.gray)
  for (position,item) in items.dropFirst(page*perPage).prefix(perPage).enumerated(){let columns=mode=="labels" ? 3:(contact ? 6:2),rows=mode=="labels" ? 4:3,w:CGFloat=mode=="labels" ? 172:(contact ? 82:260),h:CGFloat=mode=="labels" ? 170:(contact ? 107:230),x:CGFloat=30+CGFloat(position%columns)*(w+(contact ? 8:15)),y:CGFloat=770-CGFloat(position/columns+1)*(h+12)
   if mode=="labels",let matrix=item["matrix"] as? [[Bool]] {let step:CGFloat=3;NSColor.black.setFill();for yy in 0..<matrix.count {for xx in 0..<matrix.count where matrix[yy][xx] {NSRect(x:x+CGFloat(xx+4)*step,y:y+h-CGFloat(yy+5)*step,width:step,height:step).fill()}};drawText(item["code"] as? String ?? "",NSRect(x:x,y:y+27,width:w,height:18),11);drawText(item["name"] as? String ?? "",NSRect(x:x,y:y+10,width:w,height:17),10)
   }else{let box=NSRect(x:x,y:y+(contact ? 25:38),width:w,height:h-(contact ? 28:42));NSColor(calibratedWhite:0.94,alpha:1).setFill();box.fill();if let path=item["path"] as? String,let image=NSImage(contentsOfFile:path){let ratio=min(box.width/image.size.width,box.height/image.size.height);let target=NSRect(x:box.midX-image.size.width*ratio/2,y:box.midY-image.size.height*ratio/2,width:image.size.width*ratio,height:image.size.height*ratio);image.draw(in:target)};drawText(item["name"] as? String ?? "",NSRect(x:x,y:y+(contact ? 11:17),width:w,height:contact ? 13:18),10);drawText(item["caption"] as? String ?? "",NSRect(x:x,y:y+2,width:w,height:15),8,.gray)}
   _=rows
  };NSGraphicsContext.restoreGraphicsState();context.endPDFPage()
 };context.closePDF();try(data as Data).write(to:URL(fileURLWithPath:destination));try output(["pages":pages,"bytes":data.length])
}
func bookPDF(_ manifest:String,_ destination:String) throws {
 let book=try JSONSerialization.jsonObject(with:Data(contentsOf:URL(fileURLWithPath:manifest))) as! [String:Any]
 let pages=book["pages"] as? [[String:Any]] ?? [], mm:CGFloat=72/25.4
 let width=CGFloat((book["width"] as? NSNumber)?.doubleValue ?? 210),height=CGFloat((book["height"] as? NSNumber)?.doubleValue ?? 297),bleed=CGFloat((book["bleed"] as? NSNumber)?.doubleValue ?? 3),margin=bleed+6
 let data=NSMutableData();var media=CGRect(x:0,y:0,width:(width+margin*2)*mm,height:(height+margin*2)*mm)
 guard let consumer=CGDataConsumer(data:data),let context=CGContext(consumer:consumer,mediaBox:&media,nil) else {throw NSError(domain:"FilmAlbum",code:5)}
 func color(_ hex:String)->NSColor {let value=UInt32(hex.dropFirst(),radix:16) ?? 0xffffff;return NSColor(srgbRed:CGFloat((value>>16)&255)/255,green:CGFloat((value>>8)&255)/255,blue:CGFloat(value&255)/255,alpha:1)}
 for page in pages {
 var trim=CGRect(x:margin*mm,y:margin*mm,width:width*mm,height:height*mm),bleedBox=CGRect(x:6*mm,y:6*mm,width:(width+2*bleed)*mm,height:(height+2*bleed)*mm)
 let info:[String:Any]=[kCGPDFContextTrimBox as String:NSData(bytes:&trim,length:MemoryLayout<CGRect>.size),kCGPDFContextBleedBox as String:NSData(bytes:&bleedBox,length:MemoryLayout<CGRect>.size)]
 context.beginPDFPage(info as CFDictionary);NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:context,flipped:false)
 NSColor.white.setFill();NSRectFromCGRect(media).fill();color(page["background"] as? String ?? "#ffffff").setFill();NSRectFromCGRect(bleedBox).fill()
 context.saveGState();context.clip(to:bleedBox)
 for el in page["elements"] as? [[String:Any]] ?? [] {
 func n(_ key:String,_ fallback:Double=0)->CGFloat {CGFloat((el[key] as? NSNumber)?.doubleValue ?? fallback)}
 let rect=CGRect(x:(margin+n("x"))*mm,y:(margin+height-n("y")-n("h"))*mm,width:n("w")*mm,height:n("h")*mm)
 context.saveGState();context.translateBy(x:rect.midX,y:rect.midY);context.rotate(by:-n("rotation") * .pi/180);context.translateBy(x:-rect.midX,y:-rect.midY);context.clip(to:rect)
 if el["type"] as? String == "image",let path=el["path"] as? String,let image=NSImage(contentsOfFile:path) {
 let contain=el["fit"] as? String == "contain",ratio=contain ? min(rect.width/image.size.width,rect.height/image.size.height):max(rect.width/image.size.width,rect.height/image.size.height)
 let w=image.size.width*ratio,h=image.size.height*ratio,cx=contain ? CGFloat(0.5):n("cropX",0.5),cy=contain ? CGFloat(0.5):n("cropY",0.5)
 image.draw(in:NSRect(x:rect.minX+(rect.width-w)*cx,y:rect.minY+(rect.height-h)*(1-cy),width:w,height:h))
 }else if el["type"] as? String == "text" {
 let style=NSMutableParagraphStyle();style.lineBreakMode = .byWordWrapping;style.alignment=el["align"] as? String == "center" ? .center:el["align"] as? String == "right" ? .right:.left
 let text=el["text"] as? String ?? "";let attrs:[NSAttributedString.Key:Any]=[.font:NSFont.systemFont(ofSize:n("fontSize",14)),.foregroundColor:color(el["color"] as? String ?? "#222222"),.paragraphStyle:style]
 (text as NSString).draw(with:rect,options:[.usesLineFragmentOrigin,.usesFontLeading],attributes:attrs)
 };context.restoreGState()
 };context.restoreGState()
 context.setStrokeColor(NSColor.black.cgColor);context.setLineWidth(0.25)
 for x in [trim.minX,trim.maxX] {for y in [trim.minY,trim.maxY] {let dx:CGFloat=x==trim.minX ? -1:1,dy:CGFloat=y==trim.minY ? -1:1;context.move(to:CGPoint(x:x+dx*(bleed+1)*mm,y:y));context.addLine(to:CGPoint(x:x+dx*(bleed+4)*mm,y:y));context.move(to:CGPoint(x:x,y:y+dy*(bleed+1)*mm));context.addLine(to:CGPoint(x:x,y:y+dy*(bleed+4)*mm));context.strokePath()}}
 NSGraphicsContext.restoreGraphicsState();context.endPDFPage()
 };context.closePDF();try(data as Data).write(to:URL(fileURLWithPath:destination));try output(["pages":pages.count,"bytes":data.length,"colorSpace":"RGB","trimWidthMM":width,"trimHeightMM":height])
}

func demoImage(_ destination:String,_ index:Int) throws {
 let size=NSSize(width:3000,height:2000),image=NSImage(size:NSSize(width:3000,height:2000));image.lockFocus()
 let palettes:[[NSColor]]=[[NSColor(red:0.08,green:0.14,blue:0.24,alpha:1),NSColor(red:0.6,green:0.24,blue:0.18,alpha:1)],[NSColor(red:0.18,green:0.35,blue:0.28,alpha:1),NSColor(red:0.8,green:0.75,blue:0.52,alpha:1)],[NSColor(red:0.55,green:0.29,blue:0.17,alpha:1),NSColor(red:0.95,green:0.75,blue:0.48,alpha:1)]]
 let colors=palettes[index%3];NSGradient(starting:colors[0],ending:colors[1])!.draw(in:NSRect(origin:.zero,size:size),angle:90)
 NSColor(calibratedRed:0.95,green:0.82,blue:0.53,alpha:1).setFill();NSBezierPath(ovalIn:NSRect(x:CGFloat(300+index*120),y:1100,width:300,height:300)).fill()
 for i in 0..<8 {NSColor(calibratedWhite:CGFloat(i)*0.015+0.03,alpha:0.45).setFill();let path=NSBezierPath();path.move(to:NSPoint(x:0,y:0));path.line(to:NSPoint(x:0,y:CGFloat(300+i*90)));path.line(to:NSPoint(x:CGFloat(500+index*70),y:CGFloat(900-i*50)));path.line(to:NSPoint(x:3000,y:CGFloat(400+i*45)));path.line(to:NSPoint(x:3000,y:0));path.close();path.fill()}
 drawText("SYNTHETIC FIELD NOTES / FRAME \(index+1)",NSRect(x:150,y:130,width:2700,height:100),44,NSColor(calibratedWhite:0.9,alpha:0.7));image.unlockFocus()
 let rep=NSBitmapImageRep(data:image.tiffRepresentation!)!;try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:destination));try output(["width":3000,"height":2000])
}
do {let args=CommandLine.arguments;if args.count<3 {throw NSError(domain:"FilmAlbum",code:0)};switch args[1] {case "metadata":try output(metadata(args[2]));case "preview":try preview(args[2],args[3],Int(args[4]) ?? 640);try output(["ok":true]);case "analyze":try output(analyze(args[2]));case "barcode":try output(barcode(args[2]));case "demo":try demoImage(args[2],Int(args[3]) ?? 0);case "bookpdf":try bookPDF(args[2],args[3]);case "pdf":try pdf(args[2],args[3]);case "pdfinfo":let doc=PDFDocument(url:URL(fileURLWithPath:args[2]));try output(["pages":doc?.pageCount ?? 0]);default:throw NSError(domain:"FilmAlbum",code:0)}}catch{FileHandle.standardError.write(Data(error.localizedDescription.utf8));exit(1)}
