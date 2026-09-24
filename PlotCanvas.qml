import QtQuick
import qs.Commons
import "PlotMath.js" as Plot

// Theme-colored figure canvas. Ticks, glow, and tracer all live here.

// Figure: grid, labelled axes, glowing series, and a live tracer.
Item {
  id: root

  property real xMin: -6.283185307179586
  property real xMax: 6.283185307179586
  property real yMin: -2
  property real yMax: 2
  property var series: []
  property bool usesTrig: false
  property string kind: "cartesian"
  property string independent: "x"
  property string xAxisLabel: "x"
  property string yAxisLabel: "y"
  property string pretty: ""
  property real traceX: NaN
  property var traceYs: []
  property bool hovering: false
  property bool showTangent: true
  property bool showArea: true
  property real areaValue: 0
  property real tanX: NaN
  property real tanY: NaN
  property real tanDx: 1
  property real tanDy: 0
  property real tracePlotX: NaN
  property real tracePlotY: NaN
  // "" when the tracer is free, otherwise "zero" | "peak" | "cross".
  property string snapKind: ""
  property color snapColor: Color.urgent
  // Lower limit of the shaded integral, and whether the user pinned it there.
  property real areaFrom: 0
  property bool areaBoundSet: false
  readonly property bool snapped: snapKind !== ""
  readonly property bool curveTrace: kind === "polar" || kind === "parametric" || kind === "implicit"
  property color foreground: Color.foreground
  property color background: Color.background
  property color accent: Color.accent
  property color muted: Color.muted
  property string fontFamily: Style.font.family
  property int captionSize: Style.font.caption
  property int bodySize: Style.font.body
  property real cornerRadius: Style.cornerRadius

  property bool equalScale: false

  readonly property int padLeft: Style.space(52)
  readonly property int padRight: Style.space(36)
  readonly property int padTop: Style.space(28)
  readonly property int padBottom: Style.space(36)
  readonly property real plotLeft: {
    if (!equalScale) return padLeft
    var xSpan = Math.max(1e-12, xMax - xMin)
    var ySpan = Math.max(1e-12, yMax - yMin)
    var availW = Math.max(1, width - padLeft - padRight)
    var availH = Math.max(1, height - padTop - padBottom)
    var s = Math.min(availW / xSpan, availH / ySpan)
    return padLeft + (availW - xSpan * s) / 2
  }
  readonly property real plotRight: {
    if (!equalScale) return Math.max(padLeft + 8, width - padRight)
    var xSpan = Math.max(1e-12, xMax - xMin)
    var ySpan = Math.max(1e-12, yMax - yMin)
    var availW = Math.max(1, width - padLeft - padRight)
    var availH = Math.max(1, height - padTop - padBottom)
    var s = Math.min(availW / xSpan, availH / ySpan)
    return plotLeft + xSpan * s
  }
  readonly property real plotTop: {
    if (!equalScale) return padTop
    var xSpan = Math.max(1e-12, xMax - xMin)
    var ySpan = Math.max(1e-12, yMax - yMin)
    var availW = Math.max(1, width - padLeft - padRight)
    var availH = Math.max(1, height - padTop - padBottom)
    var s = Math.min(availW / xSpan, availH / ySpan)
    return padTop + (availH - ySpan * s) / 2
  }
  readonly property real plotBottom: {
    if (!equalScale) return Math.max(padTop + 8, height - padBottom)
    var xSpan = Math.max(1e-12, xMax - xMin)
    var ySpan = Math.max(1e-12, yMax - yMin)
    var availW = Math.max(1, width - padLeft - padRight)
    var availH = Math.max(1, height - padTop - padBottom)
    var s = Math.min(availW / xSpan, availH / ySpan)
    return plotTop + ySpan * s
  }

  signal hoverAt(real x)
  signal hoverEnded()
  signal panBy(real dx)
  signal zoomAt(real factor, real pivot)
  signal resetView()
  signal pinTrace(real x)
  signal setAreaBound(real x)

  function css(c, a) {
    var alpha = a === undefined ? c.a : a
    return "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + ","
      + Math.round(c.b * 255) + "," + alpha + ")"
  }

  function pxX(x) { return Plot.mapX(x, xMin, xMax, plotLeft, plotRight) }
  function pxY(y) { return Plot.mapY(y, yMin, yMax, plotTop, plotBottom) }
  function xAt(px) { return Plot.unmapX(px, xMin, xMax, plotLeft, plotRight) }

  function pickIndependent(px, py) {
    if (!curveTrace) return xAt(px)
    var pts = series.length && series[0] ? series[0].points : null
    if (!pts) return traceX
    var bestT = traceX
    var bestD = 1e15
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i]
      if (!p || !p.ok) continue
      var dx = pxX(p.x) - px
      var dy = pxY(p.y) - py
      var d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        bestT = p.t
      }
    }
    return bestT
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.max(0, Math.min(r, w / 2, h / 2))
    ctx.beginPath()
    if (rr <= 0) {
      ctx.rect(x, y, w, h)
      return
    }
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + w, y, x + w, y + h, rr)
    ctx.arcTo(x + w, y + h, x, y + h, rr)
    ctx.arcTo(x, y + h, x, y, rr)
    ctx.arcTo(x, y, x + w, y, rr)
    ctx.closePath()
  }

  function drawGrid(ctx) {
    var xTicks = Plot.ticksFor(xMin, xMax, 8, usesTrig)
    var yTicks = Plot.linearTicks(yMin, yMax, 7)
    var well = css(foreground, 0.045)
    roundRect(ctx, plotLeft, plotTop, plotRight - plotLeft, plotBottom - plotTop, cornerRadius)
    ctx.fillStyle = well
    ctx.fill()

    ctx.save()
    ctx.beginPath()
    ctx.rect(plotLeft, plotTop, plotRight - plotLeft, plotBottom - plotTop)
    ctx.clip()

    ctx.strokeStyle = css(foreground, 0.06)
    ctx.lineWidth = 1
    var i
    for (i = 0; i < xTicks.values.length; i++) {
      var gx = pxX(xTicks.values[i])
      ctx.beginPath()
      ctx.moveTo(gx, plotTop)
      ctx.lineTo(gx, plotBottom)
      ctx.stroke()
    }
    for (i = 0; i < yTicks.values.length; i++) {
      var gy = pxY(yTicks.values[i])
      ctx.beginPath()
      ctx.moveTo(plotLeft, gy)
      ctx.lineTo(plotRight, gy)
      ctx.stroke()
    }

    ctx.strokeStyle = css(foreground, 0.38)
    ctx.lineWidth = 1.25
    if (yMin < 0 && yMax > 0) {
      var axisY = pxY(0)
      ctx.beginPath()
      ctx.moveTo(plotLeft, axisY)
      ctx.lineTo(plotRight, axisY)
      ctx.stroke()
      drawArrow(ctx, plotRight, axisY, 1, 0)
    }
    if (xMin < 0 && xMax > 0) {
      var axisX = pxX(0)
      ctx.beginPath()
      ctx.moveTo(axisX, plotBottom)
      ctx.lineTo(axisX, plotTop)
      ctx.stroke()
      drawArrow(ctx, axisX, plotTop, 0, -1)
    }
    ctx.restore()

    ctx.fillStyle = css(foreground, 0.55)
    ctx.font = captionSize + "px \"" + fontFamily + "\""
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    for (i = 0; i < xTicks.values.length; i++) {
      var xv = xTicks.values[i]
      if (Math.abs(xv) < xTicks.step * 0.15 && yMin < 0 && yMax > 0) continue
      ctx.fillText(Plot.formatTick(xv, xTicks.pi), pxX(xv), plotBottom + Style.space(6))
    }
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    for (i = 0; i < yTicks.values.length; i++) {
      var yv = yTicks.values[i]
      if (Math.abs(yv) < yTicks.step * 0.15 && xMin < 0 && xMax > 0) continue
      ctx.fillText(Plot.formatTick(yv, false), plotLeft - Style.space(8), pxY(yv))
    }

    ctx.fillStyle = css(foreground, 0.7)
    ctx.font = "italic " + bodySize + "px \"" + fontFamily + "\""
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    var axisY = (yMin < 0 && yMax > 0) ? pxY(0) : plotBottom
    ctx.fillText(xAxisLabel, plotRight + Style.space(8), axisY)
    ctx.textAlign = "center"
    ctx.textBaseline = "bottom"
    ctx.fillText(yAxisLabel, (xMin < 0 && xMax > 0) ? pxX(0) : plotLeft, plotTop - Style.space(6))
  }

  function drawArrow(ctx, x, y, dx, dy) {
    var s = Style.space(7)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - dy * s - dx * s, y + dx * s - dy * s)
    ctx.moveTo(x, y)
    ctx.lineTo(x + dy * s - dx * s, y - dx * s - dy * s)
    ctx.stroke()
  }

  function strokeSeries(ctx, points, color, width, alpha) {
    ctx.strokeStyle = css(color, alpha)
    ctx.lineWidth = width
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    ctx.beginPath()
    var drawing = false
    var prev = null
    for (var i = 0; i < points.length; i++) {
      var p = points[i]
      if (!p || !p.ok || Plot.shouldBreak(prev, p, yMin, yMax)) {
        drawing = false
        prev = p && p.ok ? p : null
        continue
      }
      var x = pxX(p.x)
      var y = pxY(p.y)
      if (y < plotTop - 80 || y > plotBottom + 80) {
        drawing = false
        prev = p
        continue
      }
      y = Math.max(plotTop - 2, Math.min(plotBottom + 2, y))
      if (!drawing) {
        ctx.moveTo(x, y)
        drawing = true
      } else {
        ctx.lineTo(x, y)
      }
      prev = p
    }
    ctx.stroke()
  }

  function fillSeries(ctx, points, color) {
    if (!showArea || !points || !points.length) return
    if (kind === "implicit") return
    if (curveTrace) {
      fillPolarArea(ctx, points, color)
      return
    }
    var from = isFinite(areaFrom) ? areaFrom : 0
    var lo = Math.min(from, traceX)
    var hi = Math.max(from, traceX)
    if (!isFinite(traceX)) return
    var started = false
    var filled = false
    var firstX = 0
    var lastX = 0
    var prev = null

    // Drop down to the axis and close the run that is open, if any. The whole
    // shaded region is one path, so this can happen several times (each break
    // in the curve ends a run) and the fill at the end covers all of them.
    function closeRun() {
      if (!started) return
      var base = pxY(Math.max(yMin, Math.min(yMax, 0)))
      ctx.lineTo(lastX, base)
      ctx.lineTo(firstX, base)
      ctx.closePath()
      started = false
      filled = true
    }

    ctx.beginPath()
    for (var i = 0; i < points.length; i++) {
      var p = points[i]
      if (!p || !p.ok || p.x < lo - 1e-12 || p.x > hi + 1e-12 || Plot.shouldBreak(prev, p, yMin, yMax)) {
        closeRun()
        prev = p && p.ok ? p : null
        continue
      }
      var x = pxX(p.x)
      var y = Math.max(plotTop, Math.min(plotBottom, pxY(p.y)))
      if (!started) {
        ctx.moveTo(x, y)
        firstX = x
        started = true
      } else {
        ctx.lineTo(x, y)
      }
      lastX = x
      prev = p
    }
    closeRun()
    if (filled) {
      ctx.fillStyle = css(color, 0.20)
      ctx.fill()
    }
  }

  function fillPolarArea(ctx, points, color) {
    if (!isFinite(traceX)) return
    var originX = pxX(0)
    var originY = pxY(0)
    ctx.beginPath()
    ctx.moveTo(originX, originY)
    var any = false
    var tFrom = isFinite(areaFrom) ? areaFrom : 0
    var tMax = traceX
    for (var i = 0; i < points.length; i++) {
      var p = points[i]
      if (!p || !p.ok) continue
      var t = p.t !== undefined ? p.t : 0
      if (t < tFrom - 1e-12) continue
      if (t > tMax + 1e-12) break
      ctx.lineTo(pxX(p.x), pxY(p.y))
      any = true
    }
    if (!any) return
    ctx.closePath()
    ctx.fillStyle = css(color, 0.18)
    ctx.fill()
  }

  function snapLabel() {
    if (snapKind === "zero") return "ZERO"
    if (snapKind === "peak") return "PEAK"
    if (snapKind === "cross") return "CROSS"
    return ""
  }

  function drawSnapRing(ctx, px, py) {
    ctx.beginPath()
    ctx.arc(px, py, 9, 0, Math.PI * 2)
    ctx.strokeStyle = css(snapColor, 0.75)
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // The pinned lower limit: a dashed rule on a cartesian plot, a ring on the
  // curve itself where there is no meaningful vertical.
  function drawAreaBound(ctx) {
    if (!areaBoundSet || !showArea || !isFinite(areaFrom)) return
    ctx.save()
    ctx.beginPath()
    ctx.rect(plotLeft, plotTop, plotRight - plotLeft, plotBottom - plotTop)
    ctx.clip()
    if (curveTrace) {
      var pts = series.length && series[0] ? series[0].points : null
      var best = null
      var bestD = 1e15
      for (var i = 0; pts && i < pts.length; i++) {
        var p = pts[i]
        if (!p || !p.ok) continue
        var d = Math.abs((p.t !== undefined ? p.t : 0) - areaFrom)
        if (d < bestD) {
          bestD = d
          best = p
        }
      }
      if (best) {
        ctx.beginPath()
        ctx.arc(pxX(best.x), pxY(best.y), 5, 0, Math.PI * 2)
        ctx.strokeStyle = css(foreground, 0.7)
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    } else if (areaFrom >= xMin && areaFrom <= xMax) {
      var bx = pxX(areaFrom)
      ctx.strokeStyle = css(foreground, 0.45)
      ctx.lineWidth = 1
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(bx, plotTop)
      ctx.lineTo(bx, plotBottom)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = css(foreground, 0.7)
      ctx.font = "italic " + captionSize + "px \"" + fontFamily + "\""
      ctx.textAlign = "center"
      ctx.textBaseline = "top"
      ctx.fillText("a", bx, plotTop + Style.space(2))
    }
    ctx.restore()
  }

  function drawTangent(ctx) {
    if (!showTangent || !isFinite(tanX) || !isFinite(tanY)) return
    var len = Math.sqrt(tanDx * tanDx + tanDy * tanDy)
    if (!(len > 1e-9)) return
    var span = Math.max(xMax - xMin, yMax - yMin) * 2
    var ux = tanDx / len
    var uy = tanDy / len
    ctx.save()
    ctx.beginPath()
    ctx.rect(plotLeft, plotTop, plotRight - plotLeft, plotBottom - plotTop)
    ctx.clip()
    ctx.strokeStyle = css(foreground, 0.55)
    ctx.lineWidth = 1.25
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(pxX(tanX - ux * span), pxY(tanY - uy * span))
    ctx.lineTo(pxX(tanX + ux * span), pxY(tanY + uy * span))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  function drawTrace(ctx) {
    var px = isFinite(tracePlotX) ? pxX(tracePlotX) : (curveTrace ? NaN : pxX(traceX))
    var py = isFinite(tracePlotY) ? pxY(tracePlotY) : NaN
    if (!curveTrace && isFinite(traceX)) px = pxX(traceX)
    ctx.save()
    ctx.beginPath()
    ctx.rect(plotLeft, plotTop, plotRight - plotLeft, plotBottom - plotTop)
    ctx.clip()
    if (!curveTrace && isFinite(traceX) && traceX >= xMin && traceX <= xMax) {
      ctx.strokeStyle = snapped ? css(snapColor, 0.55) : css(foreground, hovering ? 0.35 : 0.22)
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(px, plotTop)
      ctx.lineTo(px, plotBottom)
      ctx.stroke()
      ctx.setLineDash([])
    }

    var labels = []
    if (curveTrace && isFinite(px) && isFinite(py)) {
      if (snapped) drawSnapRing(ctx, px, py)
      ctx.fillStyle = snapped ? css(snapColor, 1) : css(accent, 1)
      ctx.beginPath()
      ctx.arc(px, py, 4.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = css(background, 0.9)
      ctx.lineWidth = 1.5
      ctx.stroke()
    } else {
      for (var i = 0; i < traceYs.length; i++) {
        var pt = traceYs[i]
        if (!pt || !pt.ok || !isFinite(pt.y)) continue
        var pty = pxY(pt.y)
        if (pty < plotTop - 4 || pty > plotBottom + 4) continue
        if (snapped) drawSnapRing(ctx, px, pty)
        ctx.fillStyle = snapped ? css(snapColor, 1) : css(pt.color || accent, 1)
        ctx.beginPath()
        ctx.arc(px, pty, 4.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = css(background, 0.9)
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }
    ctx.restore()

    var bits = []
    var indName = independent === "theta" ? "θ" : independent
    bits.push(indName + " = " + Plot.formatTick(traceX, usesTrig || curveTrace))
    if (curveTrace && isFinite(tracePlotX) && isFinite(tracePlotY)) {
      bits.push("x = " + Plot.formatNumber(tracePlotX))
      bits.push("y = " + Plot.formatNumber(tracePlotY))
    } else if (traceYs.length) {
      for (var k = 0; k < traceYs.length; k++) {
        if (traceYs[k] && traceYs[k].ok)
          bits.push((traceYs.length > 1 ? "y" + (k + 1) : "y") + " = " + Plot.formatNumber(traceYs[k].y))
      }
    }
    if (showTangent && isFinite(tanDy) && isFinite(tanDx) && Math.abs(tanDx) > 1e-9)
      bits.push("m = " + Plot.formatNumber(tanDy / tanDx))
    else if (showTangent && isFinite(tanDy) && Math.abs(tanDx) <= 1e-9)
      bits.push("m = ∞")
    if (showArea && isFinite(areaValue))
      bits.push("A = " + Plot.formatNumber(areaValue))
    if (showArea && areaBoundSet)
      bits.push("a = " + Plot.formatTick(areaFrom, usesTrig || curveTrace))
    if (snapped) bits.push(snapLabel())
    if (!bits.length) return
    ctx.font = captionSize + "px \"" + fontFamily + "\""
    var text = bits.join("    ")
    var tw = ctx.measureText(text).width
    var boxW = tw + Style.space(16)
    var boxH = captionSize + Style.space(10)
    var bx = Plot.clamp((isFinite(px) ? px : (plotLeft + plotRight) / 2) - boxW / 2, plotLeft + 4, plotRight - boxW - 4)
    var by = plotTop + Style.space(6)
    roundRect(ctx, bx, by, boxW, boxH, Math.min(cornerRadius, 6))
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

  Canvas {
    id: canvas
    anchors.fill: parent
    onPaint: {
      var ctx = getContext("2d")
      ctx.reset()
      if (width < 40 || height < 40) return
      ctx.translate(0.5, 0.5)
      root.drawGrid(ctx)

      ctx.save()
      ctx.beginPath()
      ctx.rect(root.plotLeft, root.plotTop, root.plotRight - root.plotLeft, root.plotBottom - root.plotTop)
      ctx.clip()
      var list = root.series || []
      if (list.length > 0 && list[0].points)
        root.fillSeries(ctx, list[0].points, list[0].color || root.accent)
      for (var i = 0; i < list.length; i++) {
        var s = list[i]
        if (!s || !s.points) continue
        var col = s.color || root.accent
        root.strokeSeries(ctx, s.points, col, 7, 0.10)
        root.strokeSeries(ctx, s.points, col, 3.5, 0.22)
        root.strokeSeries(ctx, s.points, col, 1.8, 1)
      }
      ctx.restore()
      root.drawAreaBound(ctx)
      root.drawTangent(ctx)
      root.drawTrace(ctx)
    }
  }

  MouseArea {
    id: mouse
    anchors.fill: parent
    hoverEnabled: true
    acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
    cursorShape: pressed ? Qt.ClosedHandCursor : (insidePlot(mouseX, mouseY) ? Qt.CrossCursor : Qt.ArrowCursor)
    property real lastX: 0
    property bool dragging: false

    function insidePlot(px, py) {
      return px >= root.plotLeft && px <= root.plotRight && py >= root.plotTop && py <= root.plotBottom
    }

    onPositionChanged: function(ev) {
      if (dragging) {
        var dx = root.xAt(lastX) - root.xAt(ev.x)
        lastX = ev.x
        root.panBy(dx)
        return
      }
      if (insidePlot(ev.x, ev.y)) root.hoverAt(root.pickIndependent(ev.x, ev.y))
      else root.hoverEnded()
    }
    onExited: {
      dragging = false
      root.hoverEnded()
    }
    onPressed: function(ev) {
      if (!insidePlot(ev.x, ev.y)) return
      if (ev.button === Qt.RightButton || ev.button === Qt.MiddleButton) {
        root.resetView()
        return
      }
      if (ev.modifiers & Qt.ShiftModifier) {
        root.setAreaBound(root.pickIndependent(ev.x, ev.y))
        return
      }
      dragging = true
      lastX = ev.x
      root.pinTrace(root.pickIndependent(ev.x, ev.y))
    }
    onReleased: dragging = false
    onDoubleClicked: root.resetView()
    onWheel: function(wheel) {
      if (!insidePlot(wheel.x, wheel.y)) return
      var dy = wheel.angleDelta.y
      if (!dy) dy = wheel.pixelDelta.y
      if (!dy) return
      var steps = dy / 120
      if (Math.abs(steps) < 0.05) steps = dy > 0 ? 0.2 : -0.2
      root.zoomAt(Math.pow(0.8, steps), root.xAt(wheel.x))
      wheel.accepted = true
    }
  }

  onXMinChanged: canvas.requestPaint()
  onXMaxChanged: canvas.requestPaint()
  onYMinChanged: canvas.requestPaint()
  onYMaxChanged: canvas.requestPaint()
  onSeriesChanged: canvas.requestPaint()
  onTraceXChanged: canvas.requestPaint()
  onTraceYsChanged: canvas.requestPaint()
  onHoveringChanged: canvas.requestPaint()
  onKindChanged: canvas.requestPaint()
  onShowTangentChanged: canvas.requestPaint()
  onShowAreaChanged: canvas.requestPaint()
  onAreaValueChanged: canvas.requestPaint()
  onTanXChanged: canvas.requestPaint()
  onTanYChanged: canvas.requestPaint()
  onTanDxChanged: canvas.requestPaint()
  onTanDyChanged: canvas.requestPaint()
  onSnapKindChanged: canvas.requestPaint()
  onAreaFromChanged: canvas.requestPaint()
  onAreaBoundSetChanged: canvas.requestPaint()
  onTracePlotXChanged: canvas.requestPaint()
  onTracePlotYChanged: canvas.requestPaint()
  onPrettyChanged: canvas.requestPaint()
  onForegroundChanged: canvas.requestPaint()
  onAccentChanged: canvas.requestPaint()
  onEqualScaleChanged: canvas.requestPaint()
  onWidthChanged: canvas.requestPaint()
  onHeightChanged: canvas.requestPaint()
}
