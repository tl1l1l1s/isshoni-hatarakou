import Foundation
import CoreGraphics
// 사용: click <x> <y> [move|instant|hover|<밀리초>] 또는 click <x> <y> drag <x2> <y2>
// move는 커서를 먼저 옮기고 120ms 뒤에 누른다 (사람이 마우스를 옮겨 누르는 흐름). instant는 옮기자마자 누른다 (펜을 들었다가 바로 찍는 흐름)
// 숫자는 옮긴 뒤 그 밀리초만큼 기다렸다가 누른다. drag는 x, y에서 누른 채 x2, y2까지 끌고 뗀다 (이름표를 끌어 캐릭터를 옮기는 흐름)
let a = CommandLine.arguments
let p = CGPoint(x: Double(a[1])!, y: Double(a[2])!)
let mode = a.count > 3 ? a[3] : "move"
func post(_ t: CGEventType, _ at: CGPoint = p) { CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: at, mouseButton: .left)?.post(tap: .cghidEventTap) }
post(.mouseMoved)
if mode == "hover" { exit(0) }
usleep(mode == "instant" ? 1_000 : Double(mode).map { UInt32($0 * 1000) } ?? 120_000)
post(.leftMouseDown)
if mode == "drag" {
  let to = CGPoint(x: Double(a[4])!, y: Double(a[5])!)
  for i in 1...20 {
    let t = Double(i) / 20
    post(.leftMouseDragged, CGPoint(x: p.x + (to.x - p.x) * t, y: p.y + (to.y - p.y) * t))
    usleep(16_000)
  }
  usleep(100_000)
  post(.leftMouseUp, to)
  exit(0)
}
usleep(50_000)
post(.leftMouseUp)
