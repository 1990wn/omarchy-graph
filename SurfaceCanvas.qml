import QtQuick
import qs.Commons
import "PlotMath.js" as Plot

// Perspective surface for z = f(x, y). The mesh is sampled in Panel;
// this item only projects, lights, and paints.
Item {
  id: root

  property real xMin: -6.28
  property real xMax: 6.28
  property real yMin: -6.28
  property real yMax: 6.28
  property real zMin: -2
  property real zMax: 2
  property var surface: null
  property real azimuth: -48
  property real elevation: 30
  property bool usesTrig: false
  property string independent: "x"
  property string independent2: "y"
  property color foreground: Color.foreground
  property color background: Color.background
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  property int captionSize: Style.font.caption
  property int bodySize: Style.font.body
  property real cornerRadius: Style.cornerRadius
  property var hover: null

  readonly property int padLeft: Style.space(18)
  readonly property int padRight: Style.space(18)
  readonly property int padTop: Style.space(16)
  readonly property int padBottom: Style.space(22)
  readonly property real plotLeft: padLeft
  readonly property real plotRight: Math.max(padLeft + 8, width - padRight)
  readonly property real plotTop: padTop
  readonly property real plotBottom: Math.max(padTop + 8, height - padBottom)

  signal rotateBy(real daz, real del)
  signal zoomAt(real factor)
  signal resetView()

  function css(c, a) {
    var alpha = a === undefined ? c.a : a
    return "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + ","
      + Math.round(c.b * 255) + "," + alpha + ")"
  }

  function mixCss(a, b, t, alpha) {
    t = Plot.clamp(t, 0, 1)
    var r = a.r + (b.r - a.r) * t
    var g = a.g + (b.g - a.g) * t
    var bl = a.b + (b.b - a.b) * t
    return "rgba(" + Math.round(r * 255) + "," + Math.round(g * 255) + ","
      + Math.round(bl * 255) + "," + alpha + ")"
  }

  function cam() {
    return Plot.makeCam(xMin, xMax, yMin, yMax, zMin, zMax, azimuth, elevation,
                        plotLeft, plotRight, plotTop, plotBottom)
  }

  function heightT(z) {
    var span = zMax - zMin
    if (!(span > 0)) return 0.5
    return Plot.clamp((z - zMin) / span, 0, 1)
  }

  function drawFloor(ctx, camera) {
    var corners = [
      { x: xMin, y: yMin, z: zMin },
      { x: xMax, y: yMin, z: zMin },
      { x: xMax, y: yMax, z: zMin },
      { x: xMin, y: yMax, z: zMin }
    ]
    ctx.beginPath()
    for (var i = 0; i < 4; i++) {
      var p = Plot.projectPoint(corners[i].x, corners[i].y, corners[i].z, camera)
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
    ctx.fillStyle = css(foreground, 0.045)
    ctx.fill()
    ctx.strokeStyle = css(foreground, 0.16)
    ctx.lineWidth = 1
    ctx.stroke()

    var ticks = Plot.ticksFor(xMin, xMax, 6, usesTrig)
    ctx.strokeStyle = css(foreground, 0.08)
    ctx.lineWidth = 1
    var t
    for (t = 0; t < ticks.values.length; t++) {
      var xv = ticks.values[t]
      var a = Plot.projectPoint(xv, yMin, zMin, camera)
      var b = Plot.projectPoint(xv, yMax, zMin, camera)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    var yTicks = Plot.ticksFor(yMin, yMax, 6, usesTrig)
    for (t = 0; t < yTicks.values.length; t++) {
      var yv = yTicks.values[t]
      var c = Plot.projectPoint(xMin, yv, zMin, camera)
      var d = Plot.projectPoint(xMax, yv, zMin, camera)
      ctx.beginPath()
      ctx.moveTo(c.x, c.y)
      ctx.lineTo(d.x, d.y)
      ctx.stroke()
    }

    ctx.fillStyle = css(foreground, 0.7)
    ctx.font = "italic " + bodySize + "px \"" + fontFamily + "\""
    var xEnd = Plot.projectPoint(xMax, (yMin + yMax) / 2, zMin, camera)
    var yEnd = Plot.projectPoint((xMin + xMax) / 2, yMax, zMin, camera)
    var zEnd = Plot.projectPoint(xMin, yMin, zMax, camera)
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(independent, xEnd.x + 8, xEnd.y)
    ctx.fillText(independent2, yEnd.x + 8, yEnd.y)
    ctx.fillText("z", zEnd.x - 4, zEnd.y - 10)

    ctx.font = captionSize + "px \"" + fontFamily + "\""
    ctx.fillStyle = css(foreground, 0.5)
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    for (t = 0; t < ticks.values.length; t++) {
      var xt = ticks.values[t]
      var xp = Plot.projectPoint(xt, yMin, zMin, camera)
      ctx.fillText(Plot.formatTick(xt, ticks.pi), xp.x, xp.y + 4)
    }

    var zTicks = Plot.linearTicks(zMin, zMax, 5)
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    var zAxisX = xMin
    var zAxisY = yMin
    ctx.beginPath()
    var z0 = Plot.projectPoint(zAxisX, zAxisY, zMin, camera)
    var z1 = Plot.projectPoint(zAxisX, zAxisY, zMax, camera)
    ctx.moveTo(z0.x, z0.y)
    ctx.lineTo(z1.x, z1.y)
    ctx.strokeStyle = css(foreground, 0.28)
    ctx.stroke()
    for (t = 0; t < zTicks.values.length; t++) {
      var zv = zTicks.values[t]
      var zp = Plot.projectPoint(zAxisX, zAxisY, zv, camera)
      ctx.fillText(Plot.formatTick(zv, false), zp.x - 6, zp.y)
    }
  }

  function drawSurface(ctx, camera) {
    var mesh = root.surface
    if (!mesh || !mesh.rows || !mesh.n) return
    var n = mesh.n
    var rows = mesh.rows
    var quads = []
    var i, j
    for (j = 0; j < n - 1; j++) {
      for (i = 0; i < n - 1; i++) {
        var p00 = rows[j][i]
        var p10 = rows[j][i + 1]
        var p01 = rows[j + 1][i]
        var p11 = rows[j + 1][i + 1]
        if (!p00 || !p10 || !p01 || !p11) continue
        if (!p00.ok || !p10.ok || !p01.ok || !p11.ok) continue
        var q00 = Plot.projectPoint(p00.x, p00.y, p00.z, camera)
        var q10 = Plot.projectPoint(p10.x, p10.y, p10.z, camera)
        var q01 = Plot.projectPoint(p01.x, p01.y, p01.z, camera)
        var q11 = Plot.projectPoint(p11.x, p11.y, p11.z, camera)
        var nrm = Plot.faceNormal(p00, p10, p01)
        var shade = Plot.shadeOf(nrm)
        var zMid = (p00.z + p10.z + p01.z + p11.z) / 4
        quads.push({
          pts: [q00, q10, q11, q01],
          depth: (q00.depth + q10.depth + q01.depth + q11.depth) / 4,
          shade: shade,
          t: heightT(zMid)
        })
      }
    }
    quads.sort(function(a, b) { return a.depth - b.depth })
    for (i = 0; i < quads.length; i++) {
      var q = quads[i]
      ctx.beginPath()
      ctx.moveTo(q.pts[0].x, q.pts[0].y)
      ctx.lineTo(q.pts[1].x, q.pts[1].y)
      ctx.lineTo(q.pts[2].x, q.pts[2].y)
      ctx.lineTo(q.pts[3].x, q.pts[3].y)
      ctx.closePath()
      var fillA = 0.38 + 0.42 * q.shade
      ctx.fillStyle = mixCss(background, accent, 0.35 + 0.65 * q.t, fillA)
      ctx.fill()
      ctx.strokeStyle = mixCss(accent, foreground, q.t, 0.18 + 0.22 * q.shade)
      ctx.lineWidth = 0.8
      ctx.stroke()
    }
  }

  function drawHover(ctx, camera) {
    if (!hover || !hover.ok) return
    var p = Plot.projectPoint(hover.x, hover.y, hover.z, camera)
    ctx.fillStyle = css(accent, 1)
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = css(background, 0.9)
    ctx.lineWidth = 1.5
    ctx.stroke()
    var text = independent + " = " + Plot.formatTick(hover.x, usesTrig)
      + "    " + independent2 + " = " + Plot.formatTick(hover.y, usesTrig)
      + "    z = " + Plot.formatNumber(hover.z)
    ctx.font = captionSize + "px \"" + fontFamily + "\""
    var tw = ctx.measureText(text).width
    var boxW = tw + Style.space(16)
    var boxH = captionSize + Style.space(10)
    var bx = Plot.clamp(p.x - boxW / 2, plotLeft + 4, plotRight - boxW - 4)
    var by = Math.max(plotTop + 4, p.y - boxH - 10)
    ctx.beginPath()
    var r = Math.min(cornerRadius, 6)
    ctx.moveTo(bx + r, by)
    ctx.arcTo(bx + boxW, by, bx + boxW, by + boxH, r)
    ctx.arcTo(bx + boxW, by + boxH, bx, by + boxH, r)
    ctx.arcTo(bx, by + boxH, bx, by, r)
    ctx.arcTo(bx, by, bx + boxW, by, r)
    ctx.closePath()
    ctx.fillStyle = css(background, 0.82)
    ctx.fill()
    ctx.strokeStyle = css(foreground, 0.16)
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = css(foreground, 0.92)
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(text, bx + boxW / 2, by + boxH / 2)
  }

  function pick(px, py) {
    var mesh = root.surface
    if (!mesh || !mesh.rows) return null
    var camera = cam()
    var best = null
    var bestD = 14 * 14
    var n = mesh.n
    for (var j = 0; j < n; j++) {
      var row = mesh.rows[j]
      for (var i = 0; i < n; i++) {
        var pt = row[i]
        if (!pt || !pt.ok) continue
        var q = Plot.projectPoint(pt.x, pt.y, pt.z, camera)
        var dx = q.x - px
        var dy = q.y - py
        var d = dx * dx + dy * dy
        if (d < bestD) {
          bestD = d
          best = pt
        }
      }
    }
    return best
  }

  Canvas {
    id: canvas
    anchors.fill: parent
    onPaint: {
      var ctx = getContext("2d")
      ctx.reset()
      if (width < 40 || height < 40) return
      ctx.translate(0.5, 0.5)
      var camera = root.cam()
      root.drawFloor(ctx, camera)
      root.drawSurface(ctx, camera)
      root.drawHover(ctx, camera)
    }
  }

  MouseArea {
    id: mouse
    anchors.fill: parent
    hoverEnabled: true
    acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
    cursorShape: pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor
    property real lastX: 0
    property real lastY: 0
    property bool dragging: false

    onPressed: function(ev) {
      if (ev.button === Qt.RightButton || ev.button === Qt.MiddleButton) {
        root.resetView()
        return
      }
      dragging = true
      lastX = ev.x
      lastY = ev.y
    }
    onPositionChanged: function(ev) {
      if (dragging) {
        var daz = (ev.x - lastX) * 0.5
        var del = (lastY - ev.y) * 0.5
        lastX = ev.x
        lastY = ev.y
        root.rotateBy(daz, del)
        return
      }
      root.hover = root.pick(ev.x, ev.y)
      canvas.requestPaint()
    }
    onReleased: dragging = false
    onExited: {
      dragging = false
      root.hover = null
      canvas.requestPaint()
    }
    onDoubleClicked: root.resetView()
    onWheel: function(wheel) {
      var dy = wheel.angleDelta.y
      if (!dy) dy = wheel.pixelDelta.y
      if (!dy) return
      var steps = dy / 120
      if (Math.abs(steps) < 0.05) steps = dy > 0 ? 0.2 : -0.2
      root.zoomAt(Math.pow(0.8, steps))
      wheel.accepted = true
    }
  }

  onSurfaceChanged: canvas.requestPaint()
  onAzimuthChanged: canvas.requestPaint()
  onElevationChanged: canvas.requestPaint()
  onZMinChanged: canvas.requestPaint()
  onZMaxChanged: canvas.requestPaint()
  onXMinChanged: canvas.requestPaint()
  onXMaxChanged: canvas.requestPaint()
  onYMinChanged: canvas.requestPaint()
  onYMaxChanged: canvas.requestPaint()
  onForegroundChanged: canvas.requestPaint()
  onAccentChanged: canvas.requestPaint()
  onWidthChanged: canvas.requestPaint()
  onHeightChanged: canvas.requestPaint()
  onHoverChanged: canvas.requestPaint()
}
