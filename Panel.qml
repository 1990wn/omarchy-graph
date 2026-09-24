import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Equation.js" as Equation
import "PlotMath.js" as Plot

Panel {
  id: root
  moduleName: "graph"
  ipcTarget: "graph"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  readonly property color contentForeground: bar ? bar.foreground : Color.foreground
  readonly property color contentBackground: bar ? bar.background : Color.background
  readonly property string contentFontFamily: bar ? bar.fontFamily : Style.font.family

  readonly property string configPath: Quickshell.env("HOME") + "/.local/state/omarchy/graph.json"
  readonly property string themeColorsPath: Quickshell.env("HOME") + "/.local/state/omarchy/current/theme/colors.toml"

  readonly property var examples: [
    { value: "sin(x)", label: "sin(x)" },
    { value: "2*sin(x)", label: "2·sin(x)" },
    { value: "a*sin(b*x + c)", label: "a·sin(b x + c)" },
    { value: "x^2", label: "x²" },
    { value: "x^3 - x", label: "x³ − x" },
    { value: "1/x", label: "1/x" },
    { value: "tan(x)", label: "tan(x)" },
    { value: "exp(-x^2)", label: "e^(−x²)" },
    { value: "sin(x)/x", label: "sin(x)/x" },
    { value: "abs(x)", label: "|x|" },
    { value: "log(x)", label: "log(x)" },
    { value: "sqrt(x)", label: "√x" },
    { value: "sin(x); cos(x)", label: "sin & cos" },
    { value: "sum(n=1 to 7, 1.5/sqrt(n)*sin(n*x))", label: "Σ 1.5/√n sin(nx)" },
    { value: "z = x^2 + y^2", label: "z = x² + y²" },
    { value: "sin(x)*cos(y)", label: "sin(x) cos(y)" },
    { value: "sin(sqrt(x^2 + y^2))", label: "ripple" },
    { value: "exp(-(x^2 + y^2)/4)", label: "gaussian" },
    { value: "r = 1 + cos(t)", label: "cardioid" },
    { value: "r = sin(3t)", label: "3-rose" },
    { value: "x = cos(t); y = sin(3t)", label: "Lissajous" },
    { value: "x = cos(t); y = sin(t)", label: "circle" },
    { value: "x^2 + y^2 = 1", label: "circle =" },
    { value: "x^2 - y^2 = 1", label: "hyperbola" },
    { value: "y^2 = x^3 - x", label: "elliptic" },
    { value: "sin(x)*sin(y) = 0.3", label: "implicit sin" }
  ]

  property string equationText: "sin(x)"
  property var analysis: ({ ok: false, expressions: [], params: [], independent: "x", pretty: "", usesTrig: false })
  property var paramList: []
  property var paramValues: ({})
  property var series: []
  property var surface: null
  property var extraColors: []
  property real xCenter: 0
  property real xHalf: Math.PI * 2
  property bool yAuto: true
  property real yCenter: 0
  property real yHalf: 2
  property real yMin: -2
  property real yMax: 2
  property real zMin: -2
  property real zMax: 2
  property real azimuth: -48
  property real elevation: 30
  property real pinnedTraceX: 0
  property real hoverX: 0
  property bool plotHovering: false
  property bool examplesOpen: false
  property string parseError: ""
  property bool loadingConfig: false
  property bool playing: false
  readonly property real playSeconds: 4
  // name -> { phase, dir } for every slider currently sweeping.
  property var playAnim: ({})
  property bool applyingExample: false
  property bool showTangent: true
  property bool showArea: true
  property int sliderEdits: 0

  function noteSliderFocus(on) {
    sliderEdits += on ? 1 : -1
    if (sliderEdits < 0) sliderEdits = 0
  }

  readonly property real xMin: xCenter - xHalf
  readonly property real xMax: xCenter + xHalf
  readonly property real zoomMin: 0.25
  readonly property real zoomMax: 80
  readonly property real zoomSlider: sliderFromHalf(xHalf)
  readonly property real liveTraceX: plotHovering ? hoverX : pinnedTraceX
  readonly property var traceYs: computeTrace(liveTraceX, analysis, paramValues, series)
  readonly property bool is3d: analysis && analysis.dim === 3
  readonly property string plotKind: analysis && analysis.kind ? analysis.kind : "cartesian"
  readonly property bool isCurve: plotKind === "polar" || plotKind === "parametric" || plotKind === "implicit"
  readonly property real tMin: analysis && isFinite(analysis.tMin) ? analysis.tMin : 0
  readonly property real tMax: analysis && isFinite(analysis.tMax) ? analysis.tMax : Math.PI * 2
  readonly property real traceMin: isCurve ? tMin : xMin
  readonly property real traceMax: {
    if (plotKind === "implicit") {
      var pts = series.length && series[0] ? series[0].points : null
      var mt = 1
      if (pts) {
        for (var i = 0; i < pts.length; i++) {
          if (pts[i] && isFinite(pts[i].t) && pts[i].t > mt) mt = pts[i].t
        }
      }
      return mt
    }
    return isCurve ? tMax : xMax
  }
  readonly property var geom: geometryAt(liveTraceX, series)
  // Recomputing mid-sweep would cost a frame and nothing snaps while a slider
  // is driving the tracer, so the targets go away until the sweep stops.
  readonly property var snapTargets: (playing || is3d || plotKind === "implicit")
    ? []
    : Plot.snapTargets(series, plotKind === "polar", Math.max(1e-9, yMax - yMin))
  readonly property real snapTolerance: (traceMax - traceMin) * 0.012
  readonly property string snapKind: Plot.snapKindAt(snapTargets, liveTraceX, snapTolerance * 0.02)

  function open() {
    configFile.reload()
    root.controller.show()
    Qt.callLater(function() {
      if (equationField) {
        equationField.forceActiveFocus()
        equationField.selectAll()
      }
    })
  }

  function openFromHotkey() {
    configFile.reload()
    root.controller.show()
    Qt.callLater(function() {
      if (root.opened) setCenterHoverRevealSuppressed(true)
      if (equationField) {
        equationField.forceActiveFocus()
        equationField.selectAll()
      }
    })
  }

  function close() {
    stopAllAnimating()
    setCenterHoverRevealSuppressed(false)
    persist()
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function setCenterHoverRevealSuppressed(value) {
    if (root.bar && typeof root.bar.setCenterHoverRevealSuppressed === "function")
      root.bar.setCenterHoverRevealSuppressed(value)
    else if (root.bar && "centerHoverRevealSuppressed" in root.bar)
      root.bar.centerHoverRevealSuppressed = value
  }

  function seriesColor(index) {
    if (index === 0) return Color.accent
    var list = extraColors
    if (list && list.length)
      return list[(index - 1) % list.length]
    return Color.urgent
  }

  function sliderFromHalf(h) {
    var t = Math.log(Math.max(zoomMin, Number(h) || zoomMin) / zoomMin) / Math.log(zoomMax / zoomMin)
    return Plot.clamp(t, 0, 1)
  }

  function halfFromSlider(t) {
    return zoomMin * Math.pow(zoomMax / zoomMin, Plot.clamp(t, 0, 1))
  }

  function formatValue(v) {
    return Plot.formatNumber(v)
  }

  // The value of a series at one point of the independent variable, as a plain
  // function, so the refiners can hunt for the exact root or turning point.
  function seriesFn(index) {
    if (!analysis || !analysis.ok) return null
    var expr = analysis.expressions[index]
    if (!expr || !expr.ast) return null
    var ind = analysis.independent || "x"
    var env = Plot.envFrom(ind, 0, paramList, paramValues)
    return function(t) {
      env[ind] = t
      return Equation.evaluate(expr.ast, env)
    }
  }

  function refineSnap(target) {
    var f = seriesFn(target.series)
    if (!f) return target.t
    var refined = NaN
    if (target.kind === "peak") {
      refined = Plot.refineExtremum(f, target.a, target.b, target.dir)
    } else if (target.kind === "cross") {
      var g = seriesFn(target.other)
      if (g) refined = Plot.refineRoot(function(t) { return f(t) - g(t) }, target.a, target.b)
    } else {
      refined = Plot.refineRoot(f, target.a, target.b)
    }
    // A refiner that cannot bracket the feature hands back the grid estimate.
    return isFinite(refined) ? refined : target.t
  }

  function snapTrace(t) {
    var hit = Plot.nearestSnap(snapTargets, t, snapTolerance)
    if (!hit) return t
    return Plot.clamp(refineSnap(hit), traceMin, traceMax)
  }

  function setParam(name, value) {
    var next = {}
    for (var k in paramValues) next[k] = paramValues[k]
    next[name] = value
    paramValues = next
    resample()
    persistSoon()
  }

  function expandIfNeeded(index, value) {
    if (index < 0 || index >= paramList.length) return
    var p = paramList[index]
    var span = p.max - p.min
    if (!(span > 0)) return
    var grown = false
    var min = p.min
    var max = p.max
    if (p.integer) {
      if (value >= max - 0.51) {
        max = Math.min(256, Math.round(value) + 8)
        grown = true
      }
      if (min < 1) min = 1
    } else {
      if (value <= min + span * 0.02) {
        min = value - span * 0.6
        grown = true
      }
      if (value >= max - span * 0.02) {
        max = value + span * 0.6
        grown = true
      }
    }
    if (!grown) return
    var copy = []
    for (var i = 0; i < paramList.length; i++) {
      var item = {}
      for (var key in paramList[i]) item[key] = paramList[i][key]
      if (i === index) {
        item.min = min
        item.max = max
      }
      copy.push(item)
    }
    paramList = copy
  }

  function parseEquation(text, resetView) {
    var next = Equation.analyze(text)
    if (!next.ok) {
      parseError = next.error
      return
    }
    parseError = ""
    analysis = next
    var incoming = String(text)
    var sameText = incoming === String(equationText)
    var values = {}
    for (var i = 0; i < next.params.length; i++) {
      var spec = next.params[i]
      var prev = paramValues[spec.name]
      // Keep slider positions when reloading the same equation or when the
      // name is a typed letter. Fresh literals in new text take the number
      // from the formula so leftover `a` cannot turn x^2 into x^3.
      var keep = prev !== undefined && isFinite(prev)
        && (loadingConfig || sameText || spec.kind === "symbol")
      values[spec.name] = keep ? prev : spec.value
    }
    paramValues = values
    equationText = incoming
    paramList = next.params.slice()
    pruneAnimating()
    if (resetView) {
      xCenter = next.xCenter
      xHalf = next.xHalf
      yAuto = true
      pinnedTraceX = next.kind === "polar" || next.kind === "parametric" || next.kind === "implicit"
        ? (isFinite(next.tMin) ? next.tMin : 0)
        : next.xCenter
    }
    resample()
    if (resetView && (next.kind || "cartesian") === "cartesian" && series.length && series[0]) {
      var fitted = Plot.fitCartesianHalf(series[0].points, xCenter, xHalf)
      if (fitted < xHalf - 1e-6) {
        xHalf = fitted
        resample()
      }
    }
    pinnedTraceX = Plot.clamp(pinnedTraceX, traceMin, traceMax)
    persistSoon()
  }

  function resample() {
    if (!analysis || !analysis.ok) {
      series = []
      surface = null
      return
    }
    if (analysis.dim === 3) {
      series = []
      var n = playing ? 22 : 32
      var ast = analysis.expressions[0].ast
      var mesh = Plot.sampleSurface(Equation.evaluate, ast, analysis.independent, analysis.independent2,
                                    paramList, paramValues, xMin, xMax, xMin, xMax, n)
      surface = mesh
      if (yAuto) {
        var zext = Plot.robustZExtent(mesh.zs, 0.14)
        zMin = zext.min
        zMax = zext.max
      }
      return
    }
    surface = null
    var count = Math.max(playing ? 200 : 280, Math.round((plot.width || 640) * (playing ? 0.7 : 1.6)))
    var list = []
    var kind = analysis.kind || "cartesian"
    if (kind === "polar") {
      var polarPts = Plot.samplePolar(Equation.evaluate, analysis.expressions[0].ast,
                                      analysis.independent, paramList, paramValues, tMin, tMax, count)
      list.push({ points: polarPts, color: seriesColor(0), pretty: analysis.expressions[0].pretty })
    } else if (kind === "parametric" && analysis.expressions.length >= 2) {
      var paraPts = Plot.sampleParametric(Equation.evaluate, analysis.expressions[0].ast, analysis.expressions[1].ast,
                                          analysis.independent, paramList, paramValues, tMin, tMax, count)
      list.push({ points: paraPts, color: seriesColor(0), pretty: analysis.pretty })
    } else if (kind === "implicit") {
      if (yAuto) {
        yCenter = 0
        yHalf = xHalf
        yMin = -xHalf
        yMax = xHalf
      } else {
        yMin = yCenter - yHalf
        yMax = yCenter + yHalf
      }
      for (var im = 0; im < analysis.expressions.length; im++) {
        var implPts = Plot.sampleImplicit(Equation.evaluate, analysis.expressions[im].ast,
                                          paramList, paramValues, xMin, xMax, yMin, yMax, playing ? 44 : 80)
        list.push({ points: implPts, color: seriesColor(im), pretty: analysis.expressions[im].pretty })
      }
    } else {
      for (var i = 0; i < analysis.expressions.length; i++) {
        var expr = analysis.expressions[i].ast
        var pts = Plot.sampleSeries(Equation.evaluate, expr, analysis.independent, paramList, paramValues, xMin, xMax, count)
        list.push({ points: pts, color: seriesColor(i), pretty: analysis.expressions[i].pretty })
      }
    }
    series = list
    if (kind === "polar" || kind === "parametric" || kind === "implicit") {
      if (yAuto) {
        yCenter = 0
        yHalf = xHalf
        yMin = -xHalf
        yMax = xHalf
      } else {
        yMin = yCenter - yHalf
        yMax = yCenter + yHalf
      }
    } else if (yAuto) {
      var ext = Plot.robustYExtent(list.map(function(s) { return s.points }), 0.14)
      yMin = ext.min
      yMax = ext.max
      yCenter = (ext.min + ext.max) / 2
      yHalf = Math.max(0.5, (ext.max - ext.min) / 2)
    } else {
      yMin = yCenter - yHalf
      yMax = yCenter + yHalf
    }
  }

  function computeTrace(x, _analysis, _values, _series) {
    if (!analysis || !analysis.ok || !isFinite(x)) return []
    if (isCurve) return []
    var env = {}
    env[analysis.independent] = x
    for (var k in paramValues) env[k] = Number(paramValues[k])
    var out = []
    for (var i = 0; i < analysis.expressions.length; i++) {
      var y = Equation.evaluate(analysis.expressions[i].ast, env)
      out.push({ y: y, ok: isFinite(y), color: seriesColor(i) })
    }
    return out
  }

  function geometryAt(t, seriesVal) {
    var empty = { tanX: NaN, tanY: NaN, tanDx: 1, tanDy: 0, area: 0, px: NaN, py: NaN }
    var list = seriesVal || series
    var pts = list && list.length && list[0] ? list[0].points : null
    if (!pts || !isFinite(t)) return empty
    var tan = Plot.tangentAt(pts, t)
    var area = 0
    if (plotKind === "polar") area = Plot.areaPolar(pts, tMin, t)
    else if (plotKind === "parametric" || plotKind === "implicit") area = Plot.areaParametric(pts, tMin, t)
    else area = Plot.areaCartesian(pts, 0, t)
    return {
      tanX: tan.x,
      tanY: tan.y,
      tanDx: tan.dx,
      tanDy: tan.dy,
      area: area,
      px: tan.x,
      py: tan.y
    }
  }

  function isAnimating(name) {
    return playAnim[name] !== undefined
  }

  function animKeys() {
    var keys = []
    var k
    for (k in playAnim) keys.push(k)
    return keys
  }

  function animCopy() {
    var next = {}
    var k
    for (k in playAnim) next[k] = playAnim[k]
    return next
  }

  function paramSpec(name) {
    var i
    for (i = 0; i < paramList.length; i++) {
      if (paramList[i].name === name) return paramList[i]
    }
    return null
  }

  // Where a slider already sits, as a 0..1 sweep position, so pressing play
  // picks up from the current value instead of jumping to the start.
  function animPhase(name) {
    if (name === "__zoom__") return zoomSlider
    if (name === "__azimuth__") return ((((azimuth + 180) % 360) + 360) % 360) / 360
    if (name === "__elevation__") return (elevation + 90) / 180
    if (name === "__trace__") {
      var span = traceMax - traceMin
      return span > 0 ? (pinnedTraceX - traceMin) / span : 0
    }
    var spec = paramSpec(name)
    if (!spec) return 0
    var lo = Number(spec.min)
    var hi = Number(spec.max)
    var v = Number(paramValues[name])
    if (!isFinite(v) || !(hi > lo)) return 0
    return (v - lo) / (hi - lo)
  }

  function animValid(name) {
    if (name === "__zoom__") return true
    if (name === "__trace__") return !is3d
    if (name === "__azimuth__" || name === "__elevation__") return is3d
    return paramSpec(name) !== null
  }

  function startAnimating(name) {
    if (!name || !animValid(name)) return
    var t = Plot.clamp(animPhase(name), 0, 1)
    var next = animCopy()
    next[name] = { phase: t, dir: t >= 1 ? -1 : 1 }
    playAnim = next
    playing = true
  }

  function stopAnimating(name) {
    if (!isAnimating(name)) return
    var next = animCopy()
    delete next[name]
    playAnim = next
    if (name === "__zoom__" && !isCurve)
      pinnedTraceX = Plot.clamp(pinnedTraceX, xMin, xMax)
    if (!animKeys().length) {
      playing = false
      resample()
    }
  }

  function toggleAnimating(name) {
    if (isAnimating(name)) stopAnimating(name)
    else startAnimating(name)
  }

  function stopAllAnimating() {
    var wasZooming = isAnimating("__zoom__")
    playAnim = ({})
    if (wasZooming && !isCurve)
      pinnedTraceX = Plot.clamp(pinnedTraceX, xMin, xMax)
    if (playing) {
      playing = false
      resample()
    }
  }

  function pruneAnimating() {
    var next = {}
    var k
    for (k in playAnim) {
      if (animValid(k)) next[k] = playAnim[k]
    }
    playAnim = next
    if (!animKeys().length) playing = false
  }

  function tickPlay(dt) {
    // Clamp so one long frame (a theme reload, a resize) cannot jump the sweep.
    var step = Plot.clamp(isFinite(dt) ? dt : 0.016, 0, 0.05) / playSeconds
    var keys = animKeys()
    if (!keys.length) {
      playing = false
      return
    }
    var nextVals = {}
    var k
    for (k in paramValues) nextVals[k] = paramValues[k]
    var paramsDirty = false
    var viewDirty = false
    var i
    for (i = 0; i < keys.length; i++) {
      var name = keys[i]
      var state = playAnim[name]
      state.phase += state.dir * step
      if (state.phase >= 1) {
        state.phase = 1
        state.dir = -1
      } else if (state.phase <= 0) {
        state.phase = 0
        state.dir = 1
      }
      var t = state.phase
      if (name === "__zoom__") {
        // Deliberately no tracer clamp here: clamping 60 times a second would
        // walk the tracer (and with it the shaded area) into the origin as the
        // window tightens, and it would not come back on the way out.
        xHalf = halfFromSlider(t)
        viewDirty = true
        continue
      }
      if (name === "__azimuth__") {
        azimuth = -180 + t * 360
        if (azimuth >= 180) azimuth -= 360
        continue
      }
      if (name === "__elevation__") {
        elevation = Plot.clamp(-90 + t * 180, -90, 90)
        continue
      }
      if (name === "__trace__") {
        pinnedTraceX = traceMin + t * (traceMax - traceMin)
        continue
      }
      var spec = paramSpec(name)
      if (!spec) continue
      var lo = Number(spec.min)
      var hi = Number(spec.max)
      var v = lo + t * (hi - lo)
      if (spec.integer) v = Math.round(v)
      nextVals[name] = v
      paramsDirty = true
    }
    if (paramsDirty) paramValues = nextVals
    if (paramsDirty || viewDirty) resample()
    persistSoon()
  }

  function zoomBy(factor, pivot) {
    stopAnimating("__zoom__")
    var p = isFinite(pivot) ? pivot : xCenter
    var next = Plot.zoomAbout(xCenter, xHalf, factor, p)
    xCenter = next.xCenter
    xHalf = next.xHalf
    if (!isCurve) pinnedTraceX = Plot.clamp(pinnedTraceX, xMin, xMax)
    resample()
    persistSoon()
  }

  function panBy(dx) {
    xCenter += dx
    if (!isCurve) pinnedTraceX = Plot.clamp(pinnedTraceX, xMin, xMax)
    resample()
    persistSoon()
  }

  function resetView() {
    stopAnimating("__zoom__")
    if (analysis && analysis.ok) {
      xCenter = analysis.xCenter
      xHalf = analysis.xHalf
    } else {
      xCenter = 0
      xHalf = Math.PI * 2
    }
    yAuto = true
    pinnedTraceX = isCurve ? tMin : xCenter
    azimuth = -48
    elevation = 30
    resample()
    if (isCurve && series.length && series[0]) {
      var box = Plot.xyExtent(series[0].points)
      xCenter = 0
      xHalf = Math.max(1, box.maxAbs * 1.2)
      yMin = -xHalf
      yMax = xHalf
      yHalf = xHalf
    }
    persistSoon()
  }

  function rotateBy(daz, del) {
    azimuth = ((azimuth + daz + 180) % 360 + 360) % 360 - 180
    elevation = Plot.clamp(elevation + del, -90, 90)
    persistSoon()
  }

  function lookTop() {
    elevation = 90
    persistSoon()
  }

  function persistSoon() {
    persistTimer.restart()
  }

  function persist() {
    if (loadingConfig) return
    var payload = JSON.stringify({
      equation: equationText,
      params: paramValues,
      xCenter: xCenter,
      xHalf: xHalf,
      yAuto: yAuto,
      yCenter: yCenter,
      yHalf: yHalf,
      traceX: pinnedTraceX,
      azimuth: azimuth,
      elevation: elevation,
      showTangent: showTangent,
      showArea: showArea
    }, null, 2) + "\n"
    configFile.setText(payload)
  }

  function applyConfig(raw) {
    loadingConfig = true
    var data = {}
    try { data = JSON.parse(raw || "{}") } catch (e) { data = {} }
    if (!data || typeof data !== "object") data = {}
    var eq = String(data.equation || "sin(x)")
    if (data.params && typeof data.params === "object") paramValues = data.params
    if (isFinite(Number(data.xCenter))) xCenter = Number(data.xCenter)
    if (isFinite(Number(data.xHalf)) && Number(data.xHalf) > 0) xHalf = Number(data.xHalf)
    if (data.yAuto === false) yAuto = false
    if (isFinite(Number(data.yCenter))) yCenter = Number(data.yCenter)
    if (isFinite(Number(data.yHalf)) && Number(data.yHalf) > 0) yHalf = Number(data.yHalf)
    if (isFinite(Number(data.traceX))) pinnedTraceX = Number(data.traceX)
    if (isFinite(Number(data.azimuth))) azimuth = Number(data.azimuth)
    if (isFinite(Number(data.elevation))) elevation = Plot.clamp(Number(data.elevation), -90, 90)
    if (data.showTangent === false) showTangent = false
    if (data.showArea === false) showArea = false
    if (equationField) equationField.text = eq
    parseEquation(eq, false)
    loadingConfig = false
  }

  function loadThemeColors(raw) {
    var map = {}
    var lines = String(raw || "").split("\n")
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^\s*([A-Za-z0-9_]+)\s*=\s*["']?(#[0-9A-Fa-f]{6})/)
      if (m) map[m[1]] = m[2]
    }
    extraColors = [
      map.cyan || map.blue || "#3db8ff",
      map.magenta || "#c45cff",
      map.yellow || "#d4ff3a",
      map.orange || map.green || "#9aff3a"
    ]
    if (analysis && analysis.ok) resample()
  }

  Timer {
    id: parseTimer
    interval: 80
    onTriggered: {
      if (equationField) root.parseEquation(equationField.text, false)
    }
  }

  Timer {
    id: persistTimer
    interval: 400
    onTriggered: root.persist()
  }

  // Frame-synced so the sweep lands on vsync instead of beating against it,
  // and advances by elapsed time so a slow frame costs smoothness, not speed.
  FrameAnimation {
    running: root.playing
    onTriggered: root.tickPlay(frameTime)
  }

  FileView {
    id: configFile
    path: root.configPath
    watchChanges: false
    atomicWrites: true
    printErrors: false
    onLoaded: root.applyConfig(text())
    onLoadFailed: {
      if (equationField) equationField.text = "sin(x)"
      root.parseEquation("sin(x)", true)
    }
  }

  FileView {
    path: root.themeColorsPath
    watchChanges: true
    printErrors: false
    onLoaded: root.loadThemeColors(text())
    onFileChanged: reload()
    onLoadFailed: root.extraColors = ["#3db8ff", "#c45cff", "#d4ff3a", "#9aff3a"]
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(920))
    contentHeight: panel.fittedContentHeight(Style.space(760), Style.space(900))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      blocked: equationField.activeFocus || root.examplesOpen || root.sliderEdits > 0
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(t) {
        if (t === "+" || t === "=") root.zoomBy(0.82, root.xCenter)
        else if (t === "-" || t === "_") root.zoomBy(1.22, root.xCenter)
        else if (t === "0") root.resetView()
        else if (t === "a" || t === "A") {
          root.yAuto = !root.yAuto
          root.resample()
        }
        else if (t === "t" || t === "T") {
          if (!root.is3d) {
            root.showTangent = !root.showTangent
            root.persistSoon()
          }
        }
        else if (t === "s" || t === "S") {
          if (!root.is3d) {
            root.showArea = !root.showArea
            root.persistSoon()
          }
        }
        else if (t === "[") root.panBy(-root.xHalf * 0.15)
        else if (t === "]") root.panBy(root.xHalf * 0.15)
      }

      ColumnLayout {
        anchors.fill: parent
        spacing: Style.space(10)

        PanelHero {
          Layout.fillWidth: true
          title: "Graph"
          meta: "Equation plotter"
          foreground: root.contentForeground
          fontFamily: root.contentFontFamily
          iconComponent: Component {
            GraphMark {
              implicitWidth: Style.font.display
              implicitHeight: Style.font.display
              foreground: Color.accent
            }
          }
          trailingControl: Component {
            Dropdown {
              width: Style.space(168)
              showLabel: false
              value: root.equationText
              options: root.examples
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              onPopupOpenChanged: root.examplesOpen = popupOpen
              onChanged: function(next) {
                root.applyingExample = true
                parseTimer.stop()
                equationField.text = next
                root.parseEquation(next, true)
                root.applyingExample = false
                keyCatcher.forceActiveFocus()
              }
            }
          }
        }

        Text {
          visible: analysis.ok && analysis.pretty !== ""
          text: analysis.pretty
          color: Qt.darker(root.contentForeground, 1.35)
          font.family: root.contentFontFamily
          font.pixelSize: Style.font.bodySmall
          font.italic: true
          elide: Text.ElideRight
          Layout.fillWidth: true
        }

        RowLayout {
          Layout.fillWidth: true
          spacing: Style.space(10)

          Text {
            text: root.is3d ? "z =" : "y ="
            visible: root.plotKind === "cartesian" || root.plotKind === "surface" || root.is3d
            color: Qt.darker(root.contentForeground, 1.45)
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.subtitle
            font.italic: true
            Layout.alignment: Qt.AlignVCenter
          }

          TextField {
            id: equationField
            Layout.fillWidth: true
            foreground: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.subtitle
            placeholderText: "sin(x),  x^2 + y^2 = 1,  r=1+cos(t)"
            onTextChanged: {
              if (!root.applyingExample) parseTimer.restart()
            }
            onAccepted: {
              parseTimer.stop()
              root.parseEquation(text, false)
              keyCatcher.forceActiveFocus()
            }
            Keys.onEscapePressed: function(event) {
              if (text !== root.equationText) {
                text = root.equationText
                keyCatcher.forceActiveFocus()
              } else {
                root.close()
              }
              event.accepted = true
            }
          }
        }

        Text {
          visible: root.parseError !== ""
          text: root.parseError
          color: Color.urgent
          font.family: root.contentFontFamily
          font.pixelSize: Style.font.caption
          Layout.fillWidth: true
        }

        Item {
          Layout.fillWidth: true
          Layout.fillHeight: true
          Layout.minimumHeight: Style.space(240)

          PlotCanvas {
            id: plot
            anchors.fill: parent
            visible: !root.is3d
            xMin: root.xMin
            xMax: root.xMax
            yMin: root.yMin
            yMax: root.yMax
            series: root.series
            usesTrig: analysis.usesTrig === true && root.plotKind !== "polar" && root.plotKind !== "parametric"
            kind: root.plotKind
            equalScale: root.isCurve
            independent: analysis.independent || "x"
            xAxisLabel: "x"
            yAxisLabel: "y"
            pretty: analysis.pretty || ""
            traceX: root.liveTraceX
            traceYs: root.traceYs
            hovering: root.plotHovering
            showTangent: !root.is3d && root.showTangent
            showArea: !root.is3d && root.showArea
            areaValue: root.geom.area
            tanX: root.geom.tanX
            tanY: root.geom.tanY
            tanDx: root.geom.tanDx
            tanDy: root.geom.tanDy
            tracePlotX: root.geom.px
            tracePlotY: root.geom.py
            snapKind: root.snapKind
            snapColor: Color.urgent
            foreground: root.contentForeground
            background: Color.popups.background
            accent: Color.accent
            muted: Color.muted
            fontFamily: root.contentFontFamily
            onHoverAt: function(x) {
              root.hoverX = root.snapTrace(x)
              root.plotHovering = true
            }
            onHoverEnded: root.plotHovering = false
            onPanBy: function(dx) { root.panBy(dx) }
            onZoomAt: function(factor, pivot) { root.zoomBy(factor, pivot) }
            onResetView: root.resetView()
            onPinTrace: function(x) {
              root.pinnedTraceX = root.snapTrace(x)
              root.persistSoon()
            }
          }

          SurfaceCanvas {
            id: surfacePlot
            anchors.fill: parent
            visible: root.is3d
            xMin: root.xMin
            xMax: root.xMax
            yMin: root.xMin
            yMax: root.xMax
            zMin: root.zMin
            zMax: root.zMax
            surface: root.surface
            azimuth: root.azimuth
            elevation: root.elevation
            usesTrig: analysis.usesTrig === true
            independent: analysis.independent || "x"
            independent2: analysis.independent2 || "y"
            foreground: root.contentForeground
            background: Color.popups.background
            accent: Color.accent
            fontFamily: root.contentFontFamily
            onRotateBy: function(daz, del) { root.rotateBy(daz, del) }
            onZoomAt: function(factor) { root.zoomBy(factor, root.xCenter) }
            onResetView: root.resetView()
          }
        }

        RowLayout {
          Layout.fillWidth: true
          spacing: Style.space(8)

          Text {
            text: "ZOOM"
            color: Qt.darker(root.contentForeground, 1.5)
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.caption
            font.bold: true
            font.letterSpacing: 1
            Layout.alignment: Qt.AlignVCenter
          }

          PanelSlider {
            Layout.fillWidth: true
            bar: root.bar
            value: root.zoomSlider
            minimum: 0
            maximum: 1
            step: 0.02
            fillColor: Color.accent
            knobColor: root.contentForeground
            onMoved: function(v) {
              root.stopAnimating("__zoom__")
              root.xHalf = root.halfFromSlider(v)
              if (!root.isCurve) root.pinnedTraceX = Plot.clamp(root.pinnedTraceX, root.xMin, root.xMax)
              root.resample()
            }
            onReleased: root.persistSoon()
          }

          PanelActionButton {
            iconText: "−"
            tooltipText: "Zoom out"
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            onClicked: root.zoomBy(1.22, root.xCenter)
          }

          PanelActionButton {
            iconText: "+"
            tooltipText: "Zoom in"
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            onClicked: root.zoomBy(0.82, root.xCenter)
          }

          PanelActionButton {
            iconText: "󰁯"
            tooltipText: "Reset view"
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            onClicked: root.resetView()
          }

          PanelActionButton {
            visible: root.is3d
            iconText: "󰕒"
            tooltipText: "Look from above"
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            onClicked: root.lookTop()
          }

          PanelActionButton {
            iconText: root.playAnim["__zoom__"] !== undefined ? "󰏤" : "󰐊"
            tooltipText: root.playAnim["__zoom__"] !== undefined ? "Stop zoom" : "Animate zoom"
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            onClicked: root.toggleAnimating("__zoom__")
          }

          Text {
            text: root.is3d ? "Z AUTO" : "Y AUTO"
            color: Qt.darker(root.contentForeground, 1.5)
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.caption
            font.bold: true
            font.letterSpacing: 1
            Layout.alignment: Qt.AlignVCenter
            Layout.leftMargin: Style.space(6)
          }

          ToggleSwitch {
            checked: root.yAuto
            foreground: root.contentForeground
            onToggled: {
              root.yAuto = !root.yAuto
              root.resample()
              root.persistSoon()
            }
          }
        }

        RowLayout {
          Layout.fillWidth: true
          Layout.preferredHeight: 40
          Layout.minimumHeight: 40
          Layout.maximumHeight: 40
          spacing: Style.space(10)

          Text {
            text: "TANGENT"
            color: Qt.darker(root.contentForeground, 1.5)
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.caption
            font.bold: true
            font.letterSpacing: 1
            Layout.alignment: Qt.AlignVCenter
          }

          ToggleSwitch {
            checked: root.showTangent
            foreground: root.contentForeground
            onToggled: {
              root.showTangent = !root.showTangent
              root.persistSoon()
            }
          }

          Text {
            text: "AREA"
            color: Qt.darker(root.contentForeground, 1.5)
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.caption
            font.bold: true
            font.letterSpacing: 1
            Layout.alignment: Qt.AlignVCenter
          }

          ToggleSwitch {
            checked: root.showArea
            foreground: root.contentForeground
            onToggled: {
              root.showArea = !root.showArea
              root.persistSoon()
            }
          }

          Item { Layout.fillWidth: true }
        }

        ParamSlider {
          visible: !root.yAuto && !root.is3d
          Layout.fillWidth: true
          Layout.preferredHeight: visible ? implicitHeight : 0
          label: "Y"
          valueText: root.formatValue(root.yHalf)
          value: root.sliderFromHalf(root.yHalf)
          minimum: 0
          maximum: 1
          step: 0.02
          bar: root.bar
          foreground: root.contentForeground
          fontFamily: root.contentFontFamily
          onInputFocusChanged: function(on) { root.noteSliderFocus(on) }
          onMoved: function(v) {
            root.yHalf = Math.max(0.2, root.halfFromSlider(v))
            root.yMin = root.yCenter - root.yHalf
            root.yMax = root.yCenter + root.yHalf
          }
          onValueEntered: function(v) {
            root.yHalf = Math.max(0.2, v)
            root.yMin = root.yCenter - root.yHalf
            root.yMax = root.yCenter + root.yHalf
          }
          onReleased: root.persistSoon()
        }

        ParamSlider {
          visible: !root.is3d
          Layout.fillWidth: true
          Layout.preferredHeight: visible ? implicitHeight : 0
          label: (analysis.independent === "theta" ? "θ" : (analysis.independent || "x").toUpperCase())
          valueText: Plot.formatTick(root.pinnedTraceX, analysis.usesTrig === true || root.isCurve)
          value: root.pinnedTraceX
          minimum: root.traceMin
          maximum: root.traceMax
          step: (root.traceMax - root.traceMin) / 200
          bar: root.bar
          foreground: root.contentForeground
          fontFamily: root.contentFontFamily
          animating: root.playAnim["__trace__"] !== undefined
          onAnimateClicked: root.toggleAnimating("__trace__")
          onInputFocusChanged: function(on) { root.noteSliderFocus(on) }
          onMoved: function(v) {
            root.stopAnimating("__trace__")
            root.pinnedTraceX = root.snapTrace(v)
          }
          onValueEntered: function(v) {
            root.stopAnimating("__trace__")
            root.pinnedTraceX = Plot.clamp(v, root.traceMin, root.traceMax)
          }
          onReleased: root.persistSoon()
        }

        ParamSlider {
          visible: root.is3d
          Layout.fillWidth: true
          Layout.preferredHeight: visible ? implicitHeight : 0
          label: "AZ"
          valueText: Math.round(root.azimuth) + "°"
          value: ((root.azimuth + 180) % 360 + 360) % 360
          minimum: 0
          maximum: 360
          step: 1
          bar: root.bar
          foreground: root.contentForeground
          fontFamily: root.contentFontFamily
          animating: root.playAnim["__azimuth__"] !== undefined
          onAnimateClicked: root.toggleAnimating("__azimuth__")
          onInputFocusChanged: function(on) { root.noteSliderFocus(on) }
          onMoved: function(v) {
            root.stopAnimating("__azimuth__")
            root.azimuth = v - 180
          }
          onValueEntered: function(v) {
            root.stopAnimating("__azimuth__")
            root.azimuth = ((v + 180) % 360 + 360) % 360 - 180
          }
          onReleased: root.persistSoon()
        }

        ParamSlider {
          visible: root.is3d
          Layout.fillWidth: true
          Layout.preferredHeight: visible ? implicitHeight : 0
          label: "EL"
          valueText: Math.round(root.elevation) + "°"
          value: root.elevation
          minimum: -90
          maximum: 90
          step: 1
          integer: true
          bar: root.bar
          foreground: root.contentForeground
          fontFamily: root.contentFontFamily
          animating: root.playAnim["__elevation__"] !== undefined
          onAnimateClicked: root.toggleAnimating("__elevation__")
          onInputFocusChanged: function(on) { root.noteSliderFocus(on) }
          onMoved: function(v) {
            root.stopAnimating("__elevation__")
            root.elevation = v
          }
          onValueEntered: function(v) {
            root.stopAnimating("__elevation__")
            root.elevation = Plot.clamp(v, -90, 90)
          }
          onReleased: root.persistSoon()
        }

        Flickable {
          Layout.fillWidth: true
          Layout.preferredHeight: visible ? Math.min(paramColumn.implicitHeight, Style.space(148)) : 0
          visible: paramList.length > 0
          clip: true
          contentWidth: width
          contentHeight: paramColumn.implicitHeight
          boundsBehavior: Flickable.StopAtBounds
          flickableDirection: Flickable.VerticalFlick

          Column {
            id: paramColumn
            width: parent.width
            spacing: Style.space(4)

            Repeater {
              model: paramList

              ParamSlider {
                required property var modelData
                required property int index
                width: paramColumn.width
                label: String(modelData.name)
                valueText: root.formatValue(root.paramValues[modelData.name])
                value: Number(root.paramValues[modelData.name])
                minimum: Number(modelData.min)
                maximum: Number(modelData.max)
                step: Number(modelData.step) || 0.1
                integer: modelData.integer === true
                bar: root.bar
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                animating: root.playAnim[modelData.name] !== undefined
                onAnimateClicked: root.toggleAnimating(modelData.name)
                onInputFocusChanged: function(on) { root.noteSliderFocus(on) }
                onMoved: function(v) {
                  root.stopAnimating(modelData.name)
                  root.setParam(modelData.name, v)
                }
                onValueEntered: function(v) {
                  root.stopAnimating(modelData.name)
                  root.setParam(modelData.name, v)
                  root.expandIfNeeded(index, v)
                }
                onReleased: function(v) {
                  root.expandIfNeeded(index, v)
                  root.persistSoon()
                }
              }
            }
          }
        }
      }
    }
  }

}
