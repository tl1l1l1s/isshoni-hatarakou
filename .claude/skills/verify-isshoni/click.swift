import Foundation
import CoreGraphics
// 사용: click <x> <y> [move|instant]. move는 커서를 먼저 옮기고 120ms 뒤에 누른다 (사람이 마우스를 옮겨 누르는 흐름). instant는 옮기자마자 누른다 (펜을 들었다가 바로 찍는 흐름)
let a = CommandLine.arguments
let p = CGPoint(x: Double(a[1])!, y: Double(a[2])!)
let mode = a.count > 3 ? a[3] : "move"
func post(_ t: CGEventType) { CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap) }
post(.mouseMoved)
if mode == "hover" { exit(0) }
usleep(mode == "move" ? 120_000 : 1_000)
post(.leftMouseDown)
usleep(50_000)
post(.leftMouseUp)
