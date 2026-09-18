.pragma library

// Sampling, tick marks, and coordinate mapping for the graphing calculator.

function envFrom(independent, x, params, values) {
  var env = {}
  env[independent] = x
  if (params) {
    for (var i = 0; i < params.length; i++) {
      var name = params[i].name
      var v = values && values[name] !== undefined ? values[name] : params[i].value
      env[name] = Number(v)
    }
  }
  return env
}

function envFrom2(indX, x, indY, y, params, values) {
  var env = envFrom(indX, x, params, values)
  env[indY] = y
  return env
}

function sampleSurface(evaluate, ast, indX, indY, params, values, xMin, xMax, yMin, yMax, count) {
  var n = Math.max(6, Math.min(56, Math.round(count || 32)))
  var dx = (xMax - xMin) / Math.max(1, n - 1)
  var dy = (yMax - yMin) / Math.max(1, n - 1)
  var rows = []
  var zs = []
  for (var j = 0; j < n; j++) {
    var y = yMin + dy * j
    var row = []
    for (var i = 0; i < n; i++) {
      var x = xMin + dx * i
      var env = envFrom2(indX, x, indY, y, params, values)
      var z = evaluate(ast, env)
      var ok = typeof z === "number" && isFinite(z)
      row.push({ x: x, y: y, z: ok ? z : NaN, ok: ok })
      if (ok) zs.push(z)
    }
    rows.push(row)
  }
  return { n: n, rows: rows, zs: zs }
}

function robustZExtent(zs, pad) {
  if (!zs || !zs.length) return { min: -1, max: 1 }
  var sorted = zs.slice().sort(function(a, b) { return a - b })
  var lo = percentile(sorted, 0.02)
  var hi = percentile(sorted, 0.98)
  if (hi === lo) {
    lo -= 1
    hi += 1
  }
  var span = hi - lo
  var p = pad === undefined ? 0.12 : pad
  lo -= span * p
  hi += span * p
  if (lo > 0 && lo / span < 0.18) lo = 0
  if (hi < 0 && (-hi) / span < 0.18) hi = 0
  return { min: lo, max: hi }
}

function worldToView(x, y, z, az, el) {
  var a = az * Math.PI / 180
  var e = el * Math.PI / 180
  var ca = Math.cos(a)
  var sa = Math.sin(a)
  var ce = Math.cos(e)
  var se = Math.sin(e)
  var x1 = x * ca + y * sa
  var y1 = -x * sa + y * ca
  var z1 = z
  return {
    x: x1,
    y: y1 * ce + z1 * se,
    z: -y1 * se + z1 * ce
  }
}

function projectPoint(x, y, z, cam) {
  var X = (x - cam.xMid) / cam.xScale
  var Y = (y - cam.yMid) / cam.yScale
  var Z = (z - cam.zMid) / cam.zScale
  var v = worldToView(X, Y, Z, cam.azimuth, cam.elevation)
  var k = 1.05 / Math.max(0.35, 1.45 + v.y * cam.perspective)
  return {
    x: cam.cx + v.x * cam.size * k,
    y: cam.cy - v.z * cam.size * k,
    depth: v.y,
    vx: v.x,
    vy: v.y,
    vz: v.z
  }
}

function makeCam(xMin, xMax, yMin, yMax, zMin, zMax, azimuth, elevation, left, right, top, bottom) {
  var xSpan = Math.max(1e-6, xMax - xMin)
  var ySpan = Math.max(1e-6, yMax - yMin)
  var zSpan = Math.max(1e-6, zMax - zMin)
  var scale = Math.max(xSpan, ySpan, zSpan) / 2
  var w = Math.max(1, right - left)
  var h = Math.max(1, bottom - top)
  return {
    xMid: (xMin + xMax) / 2,
    yMid: (yMin + yMax) / 2,
    zMid: (zMin + zMax) / 2,
    xScale: scale,
    yScale: scale,
    zScale: scale,
    azimuth: azimuth,
    elevation: elevation,
    perspective: 0.55 * Math.pow(Math.cos(elevation * Math.PI / 180), 2),
    cx: (left + right) / 2,
    cy: (top + bottom) / 2 + h * 0.02,
    size: Math.min(w, h) * 0.50
  }
}

function faceNormal(p00, p10, p01) {
  var ux = p10.x - p00.x
  var uy = p10.y - p00.y
  var uz = p10.z - p00.z
  var vx = p01.x - p00.x
  var vy = p01.y - p00.y
  var vz = p01.z - p00.z
  var nx = uy * vz - uz * vy
  var ny = uz * vx - ux * vz
  var nz = ux * vy - uy * vx
  var len = Math.sqrt(nx * nx + ny * ny + nz * nz)
  if (!(len > 0)) return { x: 0, y: 0, z: 1 }
  return { x: nx / len, y: ny / len, z: nz / len }
}

function shadeOf(normal) {
  var lx = 0.32
  var ly = 0.48
  var lz = 0.82
  var llen = Math.sqrt(lx * lx + ly * ly + lz * lz)
  lx /= llen
  ly /= llen
  lz /= llen
  var d = normal.x * lx + normal.y * ly + normal.z * lz
  if (d < 0) d = -d
  return 0.22 + 0.78 * d
}

function sampleSeries(evaluate, ast, independent, params, values, xMin, xMax, count) {
  var n = Math.max(8, Math.round(count || 400))
  var dx = (xMax - xMin) / Math.max(1, n - 1)
  var points = []
  for (var i = 0; i < n; i++) {
    var x = xMin + dx * i
    var env = envFrom(independent, x, params, values)
    var y = evaluate(ast, env)
    var ok = typeof y === "number" && isFinite(y)
    points.push({ x: x, y: ok ? y : NaN, t: x, ok: ok })
  }
  return points
}

function samplePolar(evaluate, ast, independent, params, values, tMin, tMax, count) {
  var n = Math.max(24, Math.round(count || 480))
  var dt = (tMax - tMin) / Math.max(1, n - 1)
  var points = []
  for (var i = 0; i < n; i++) {
    var t = tMin + dt * i
    var env = envFrom(independent, t, params, values)
    var r = evaluate(ast, env)
    var ok = typeof r === "number" && isFinite(r)
    points.push({
      t: t,
      r: ok ? r : NaN,
      x: ok ? r * Math.cos(t) : NaN,
      y: ok ? r * Math.sin(t) : NaN,
      ok: ok
    })
  }
  return points
}

function sampleParametric(evaluate, astX, astY, independent, params, values, tMin, tMax, count) {
  var n = Math.max(24, Math.round(count || 480))
  var dt = (tMax - tMin) / Math.max(1, n - 1)
  var points = []
  for (var i = 0; i < n; i++) {
    var t = tMin + dt * i
    var env = envFrom(independent, t, params, values)
    var x = evaluate(astX, env)
    var y = evaluate(astY, env)
    var ok = typeof x === "number" && isFinite(x) && typeof y === "number" && isFinite(y)
    points.push({ t: t, x: ok ? x : NaN, y: ok ? y : NaN, ok: ok })
  }
  return points
}

function xyExtent(points) {
  var maxAbs = 0
  var minX = Infinity
  var maxX = -Infinity
  var minY = Infinity
  var maxY = -Infinity
  if (!points) return { maxAbs: 1, minX: -1, maxX: 1, minY: -1, maxY: 1 }
  for (var i = 0; i < points.length; i++) {
    var p = points[i]
    if (!p || !p.ok) continue
    if (Math.abs(p.x) > maxAbs) maxAbs = Math.abs(p.x)
    if (Math.abs(p.y) > maxAbs) maxAbs = Math.abs(p.y)
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  if (!isFinite(minX)) return { maxAbs: 1, minX: -1, maxX: 1, minY: -1, maxY: 1 }
  return { maxAbs: Math.max(1e-6, maxAbs), minX: minX, maxX: maxX, minY: minY, maxY: maxY }
}

function nearestPoint(points, t) {
  if (!points || !points.length || !isFinite(t)) return null
  var best = null
  var bestD = Infinity
  for (var i = 0; i < points.length; i++) {
    var p = points[i]
    if (!p || !p.ok) continue
    var d = Math.abs((p.t !== undefined ? p.t : p.x) - t)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

function tangentAt(points, t) {
  if (!points || points.length < 3 || !isFinite(t))
    return { ok: false, x: 0, y: 0, dx: 1, dy: 0, slope: NaN }
  var i = 0
  var bestD = Infinity
  var k
  for (k = 0; k < points.length; k++) {
    if (!points[k] || !points[k].ok) continue
    var d = Math.abs((points[k].t !== undefined ? points[k].t : points[k].x) - t)
    if (d < bestD) {
      bestD = d
      i = k
    }
  }
  var p = points[i]
  var prev = i > 0 ? points[i - 1] : null
  var next = i + 1 < points.length ? points[i + 1] : null
  var dx = 0
  var dy = 0
  if (prev && prev.ok && next && next.ok) {
    dx = next.x - prev.x
    dy = next.y - prev.y
  } else if (next && next.ok) {
    dx = next.x - p.x
    dy = next.y - p.y
  } else if (prev && prev.ok) {
    dx = p.x - prev.x
    dy = p.y - prev.y
  }
  var len = Math.sqrt(dx * dx + dy * dy)
  if (!(len > 1e-12)) return { ok: false, x: p.x, y: p.y, dx: 1, dy: 0, slope: NaN }
  return {
    ok: true,
    x: p.x,
    y: p.y,
    dx: dx / len,
    dy: dy / len,
    slope: Math.abs(dx) > 1e-12 ? dy / dx : (dy > 0 ? Infinity : -Infinity)
  }
}

function areaCartesian(points, fromX, toX) {
  if (!points || !points.length) return 0
  var a = Math.min(fromX, toX)
  var b = Math.max(fromX, toX)
  var sum = 0
  var prev = null
  for (var i = 0; i < points.length; i++) {
    var p = points[i]
    if (!p || !p.ok) {
      prev = null
      continue
    }
    if (p.x < a - 1e-12) {
      prev = p
      continue
    }
    if (p.x > b + 1e-12) break
    if (prev && prev.ok) {
      var x0 = Math.max(a, prev.x)
      var x1 = Math.min(b, p.x)
      if (x1 > x0) sum += (prev.y + p.y) * 0.5 * (x1 - x0)
    }
    prev = p
  }
  return fromX > toX ? -sum : sum
}

function areaPolar(points, fromT, toT) {
  if (!points || !points.length) return 0
  var a = Math.min(fromT, toT)
  var b = Math.max(fromT, toT)
  var sum = 0
  var prev = null
  for (var i = 0; i < points.length; i++) {
    var p = points[i]
    if (!p || !p.ok || p.r === undefined) {
      prev = null
      continue
    }
    if (p.t < a - 1e-12) {
      prev = p
      continue
    }
    if (p.t > b + 1e-12) break
    if (prev && prev.ok) {
      var t0 = Math.max(a, prev.t)
      var t1 = Math.min(b, p.t)
      if (t1 > t0) sum += 0.5 * (prev.r * prev.r + p.r * p.r) * 0.5 * (t1 - t0)
    }
    prev = p
  }
  return fromT > toT ? -sum : sum
}

function areaParametric(points, fromT, toT) {
  if (!points || !points.length) return 0
  var a = Math.min(fromT, toT)
  var b = Math.max(fromT, toT)
  var sum = 0
  var prev = null
  for (var i = 0; i < points.length; i++) {
    var p = points[i]
    if (!p || !p.ok) {
      prev = null
      continue
    }
    if (p.t < a - 1e-12) {
      prev = p
      continue
    }
    if (p.t > b + 1e-12) break
    if (prev && prev.ok)
      sum += prev.x * p.y - p.x * prev.y
    prev = p
  }
  var area = 0.5 * sum
  return fromT > toT ? -area : area
}

function shouldBreak(a, b, yMin, yMax) {
  if (!a || !b) return true
  if (!a.ok || !b.ok) return true
  var span = Math.max(1e-9, yMax - yMin)
  if (Math.abs(b.y - a.y) > span * 2.4) return true
  if (a.y * b.y < 0 && Math.abs(b.y - a.y) > span * 0.85) return true
  return false
}

function robustYExtent(seriesList, pad) {
  var ys = []
  for (var s = 0; s < seriesList.length; s++) {
    var pts = seriesList[s]
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].ok) ys.push(pts[i].y)
    }
  }
  if (!ys.length) return { min: -1, max: 1 }
  ys.sort(function(a, b) { return a - b })
  var lo = percentile(ys, 0.02)
  var hi = percentile(ys, 0.98)
  if (hi === lo) {
    lo -= 1
    hi += 1
  }
  var span = hi - lo
  var p = pad === undefined ? 0.12 : pad
  lo -= span * p
  hi += span * p
  if (lo > 0 && lo / span < 0.15) lo = 0
  if (hi < 0 && (-hi) / span < 0.15) hi = 0
  return { min: lo, max: hi }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0
  var idx = (sorted.length - 1) * p
  var lo = Math.floor(idx)
  var hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  var t = idx - lo
  return sorted[lo] * (1 - t) + sorted[hi] * t
}

function niceNum(range, round) {
  if (!(range > 0) || !isFinite(range)) return 1
  var exp = Math.floor(Math.log(range) / Math.LN10)
  var f = range / Math.pow(10, exp)
  var nf
  if (round) {
    if (f < 1.5) nf = 1
    else if (f < 3) nf = 2
    else if (f < 7) nf = 5
    else nf = 10
  } else {
    if (f <= 1) nf = 1
    else if (f <= 2) nf = 2
    else if (f <= 5) nf = 5
    else nf = 10
  }
  return nf * Math.pow(10, exp)
}

function linearTicks(min, max, count) {
  var lo = Number(min)
  var hi = Number(max)
  if (!isFinite(lo) || !isFinite(hi) || hi <= lo) {
    lo = -1
    hi = 1
  }
  var target = Math.max(2, count || 6)
  var range = niceNum(hi - lo, false)
  var step = niceNum(range / (target - 1), true)
  if (!(step > 0)) step = 1
  var start = Math.ceil((lo - step * 1e-9) / step) * step
  var values = []
  var guard = 0
  for (var x = start; x <= hi + step * 0.5 && guard < 40; x += step) {
    values.push(parseFloat(x.toPrecision(12)))
    guard++
  }
  return { values: values, step: step, pi: false }
}

function formatNumber(v) {
  if (!isFinite(v)) return ""
  if (Math.abs(v) < 1e-6) return "0"
  var abs = Math.abs(v)
  if (abs >= 10000 || abs < 0.001)
    return trimExp(v.toExponential(1))
  if (Math.abs(v - Math.round(v)) < 1e-9)
    return String(Math.round(v))
  var s = v.toFixed(abs >= 100 ? 1 : abs >= 10 ? 2 : 3)
  return s.replace(/\.?0+$/, "")
}

function trimExp(s) {
  return String(s).replace(/e\+/, "e").replace(/e(-?)0+/, "e$1")
}

function gcd(a, b) {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) {
    var t = b
    b = a % b
    a = t
  }
  return a || 1
}

function formatPi(v) {
  var r = v / Math.PI
  if (!isFinite(r)) return formatNumber(v)
  if (Math.abs(r) < 1e-10) return "0"
  var dens = [1, 2, 3, 4, 6, 8, 12]
  var bestDen = 0
  var bestNum = 0
  var bestErr = 1
  for (var i = 0; i < dens.length; i++) {
    var den = dens[i]
    var num = Math.round(r * den)
    var err = Math.abs(r - num / den)
    if (err < bestErr) {
      bestErr = err
      bestNum = num
      bestDen = den
    }
  }
  if (bestErr > 0.006 || bestNum === 0) return formatNumber(v)
  var g = gcd(bestNum, bestDen)
  bestNum /= g
  bestDen /= g
  var sign = bestNum < 0 ? "−" : ""
  bestNum = Math.abs(bestNum)
  if (bestDen === 1) {
    if (bestNum === 1) return sign + "π"
    return sign + bestNum + "π"
  }
  if (bestNum === 1) return sign + "π/" + bestDen
  return sign + bestNum + "π/" + bestDen
}

function piTicks(min, max) {
  var span = (max - min) / Math.PI
  if (!(span > 0) || !isFinite(span)) return linearTicks(min, max, 6)
  var units = [1 / 6, 1 / 4, 1 / 3, 1 / 2, 1, 2]
  var unit = 1
  var bestDiff = 1e9
  for (var i = 0; i < units.length; i++) {
    var count = span / units[i]
    var diff = Math.abs(count - 6)
    if (count >= 3 && count <= 9 && diff < bestDiff) {
      bestDiff = diff
      unit = units[i]
    }
  }
  var step = unit * Math.PI
  var start = Math.ceil((min - step * 1e-9) / step) * step
  var values = []
  var guard = 0
  for (var x = start; x <= max + step * 0.5 && guard < 40; x += step) {
    values.push(x)
    guard++
  }
  return { values: values, step: step, pi: true }
}

function shouldUsePi(min, max, usesTrig) {
  if (!usesTrig) return false
  var span = max - min
  if (!(span > 0)) return false
  var inPi = span / Math.PI
  return inPi >= 0.6 && inPi <= 16
}

function ticksFor(min, max, count, usesTrig) {
  if (shouldUsePi(min, max, usesTrig)) return piTicks(min, max)
  return linearTicks(min, max, count)
}

function formatTick(v, piMode) {
  return piMode ? formatPi(v) : formatNumber(v)
}

function mapX(x, xMin, xMax, left, right) {
  if (xMax === xMin) return (left + right) / 2
  return left + (x - xMin) / (xMax - xMin) * (right - left)
}

function mapY(y, yMin, yMax, top, bottom) {
  if (yMax === yMin) return (top + bottom) / 2
  return bottom - (y - yMin) / (yMax - yMin) * (bottom - top)
}

function unmapX(px, xMin, xMax, left, right) {
  if (right === left) return (xMin + xMax) / 2
  return xMin + (px - left) / (right - left) * (xMax - xMin)
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function formatCoord(v, piMode) {
  if (!isFinite(v)) return "—"
  if (piMode && shouldUsePi(v - 1, v + 1, true) && Math.abs(v) > 0.2)
    return formatPi(v)
  return formatNumber(v)
}

function zoomFactorFromWheel(angleY, pixelY) {
  var dy = Number(angleY)
  if (!dy) dy = Number(pixelY) || 0
  if (!dy) return 1
  var steps = dy / 120
  if (Math.abs(steps) < 0.05) steps = dy > 0 ? 0.2 : -0.2
  return Math.pow(0.8, steps)
}

function zoomAbout(xCenter, xHalf, factor, pivot) {
  var half = Math.max(0.05, xHalf * factor)
  var maxHalf = 1e6
  if (half > maxHalf) half = maxHalf
  var t = 0.5
  if (isFinite(pivot)) t = (pivot - (xCenter - xHalf)) / (2 * xHalf)
  if (!isFinite(t)) t = 0.5
  t = clamp(t, 0, 1)
  var newMin = pivot - t * 2 * half
  var newCenter = newMin + half
  return { xCenter: newCenter, xHalf: half }
}
