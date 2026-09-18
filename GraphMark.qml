import QtQuick
import qs.Commons

// Tiny axes + sine wave for the bar slot. Painted so the mark always
// follows the bar foreground instead of shipping two SVG variants.
Item {
  id: root
  property color foreground: Color.foreground

  Canvas {
    id: mark
    anchors.fill: parent
    onPaint: {
      var ctx = getContext("2d")
      ctx.reset()
      var w = width
      var h = height
      if (w < 4 || h < 4) return
      var c = root.foreground
      var stroke = "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + "," + Math.round(c.b * 255) + ","
      var pad = Math.max(1.5, Math.min(w, h) * 0.12)
      var left = pad
      var right = w - pad * 0.4
      var top = pad
      var bottom = h - pad * 0.4
      var ox = left
      var oy = (top + bottom) / 2

      ctx.strokeStyle = stroke + "0.45)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(ox, top)
      ctx.lineTo(ox, bottom)
      ctx.moveTo(ox, oy)
      ctx.lineTo(right, oy)
      ctx.stroke()

      ctx.strokeStyle = stroke + "1)"
      ctx.lineWidth = Math.max(1.2, Math.min(w, h) * 0.09)
      ctx.lineJoin = "round"
      ctx.lineCap = "round"
      ctx.beginPath()
      var amp = (bottom - top) * 0.34
      var first = true
      for (var i = 0; i <= 24; i++) {
        var t = i / 24
        var x = ox + t * (right - ox)
        var y = oy - Math.sin(t * Math.PI * 2) * amp
        if (first) { ctx.moveTo(x, y); first = false }
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }

  onForegroundChanged: mark.requestPaint()
  onWidthChanged: mark.requestPaint()
  onHeightChanged: mark.requestPaint()
}
