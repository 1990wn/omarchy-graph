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
  var env = envFrom2(indX, xMin, indY, yMin, params, values)
  for (var j = 0; j < n; j++) {
    var y = yMin + dy * j
    env[indY] = y
    var row = []
    for (var i = 0; i < n; i++) {
      var x = xMin + dx * i
      env[indX] = x
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
  var env = envFrom(independent, xMin, params, values)
  for (var i = 0; i < n; i++) {
    var x = xMin + dx * i
    env[independent] = x
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
  var env = envFrom(independent, tMin, params, values)
  for (var i = 0; i < n; i++) {
    var t = tMin + dt * i
    env[independent] = t
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
  var env = envFrom(independent, tMin, params, values)
  for (var i = 0; i < n; i++) {
    var t = tMin + dt * i
    env[independent] = t
    var x = evaluate(astX, env)
    var y = evaluate(astY, env)
    var ok = typeof x === "number" && isFinite(x) && typeof y === "number" && isFinite(y)
    points.push({ t: t, x: ok ? x : NaN, y: ok ? y : NaN, ok: ok })
  }
  return points
}

function sampleImplicit(evaluate, ast, params, values, xMin, xMax, yMin, yMax, count) {
  var n = Math.max(12, Math.min(96, Math.round(count || 64)))
  var dx = (xMax - xMin) / Math.max(1, n - 1)
  var dy = (yMax - yMin) / Math.max(1, n - 1)
  var grid = []
  var i, j
  var env = envFrom2("x", xMin, "y", yMin, params, values)
  for (j = 0; j < n; j++) {
    var y = yMin + dy * j
    env.y = y
    var row = []
    for (i = 0; i < n; i++) {
      var x = xMin + dx * i
      env.x = x
      var f = evaluate(ast, env)
      row.push(typeof f === "number" && isFinite(f) ? f : NaN)
    }
    grid.push(row)
  }

  function cross(x0, y0, f0, x1, y1, f1) {
    if (!isFinite(f0) || !isFinite(f1)) return null
    if (f0 === 0) return { x: x0, y: y0 }
    if (f1 === 0) return { x: x1, y: y1 }
    if ((f0 > 0 && f1 > 0) || (f0 < 0 && f1 < 0)) return null
    var t = f0 / (f0 - f1)
    if (!(t >= 0 && t <= 1)) t = t < 0 ? 0 : 1
    return { x: x0 + t * (x1 - x0), y: y0 + t * (y1 - y0) }
  }

  var segs = []
  for (j = 0; j < n - 1; j++) {
    for (i = 0; i < n - 1; i++) {
      var x0 = xMin + dx * i
      var x1 = x0 + dx
      var y0 = yMin + dy * j
      var y1 = y0 + dy
      var f00 = grid[j][i]
      var f10 = grid[j][i + 1]
      var f01 = grid[j + 1][i]
      var f11 = grid[j + 1][i + 1]
      var edges = [
        cross(x0, y0, f00, x1, y0, f10),
        cross(x1, y0, f10, x1, y1, f11),
        cross(x0, y1, f01, x1, y1, f11),
        cross(x0, y0, f00, x0, y1, f01)
      ]
      var found = []
      for (var e = 0; e < 4; e++) {
        if (edges[e]) found.push(edges[e])
      }
      if (found.length === 2) {
        segs.push([found[0], found[1]])
      } else if (found.length === 4) {
        var mid = (f00 + f10 + f01 + f11) / 4
        if (mid > 0) {
          segs.push([edges[3], edges[0]])
          segs.push([edges[1], edges[2]])
        } else {
          segs.push([edges[0], edges[1]])
          segs.push([edges[2], edges[3]])
        }
      }
    }
  }

  var eps2 = (dx * dx + dy * dy) * 0.25
  function near(p, q) {
    var ux = p.x - q.x
    var uy = p.y - q.y
    return ux * ux + uy * uy <= eps2
  }
  var used = []
  for (i = 0; i < segs.length; i++) used[i] = false
  var lines = []
  for (i = 0; i < segs.length; i++) {
    if (used[i] || !segs[i][0] || !segs[i][1]) continue
    used[i] = true
    var line = [segs[i][0], segs[i][1]]
    var grew = true
    while (grew) {
      grew = false
      for (var s = 0; s < segs.length; s++) {
        if (used[s] || !segs[s][0]) continue
        var a1 = segs[s][0]
        var b1 = segs[s][1]
        var head = line[0]
        var tail = line[line.length - 1]
        if (near(tail, a1)) { line.push(b1); used[s] = true; grew = true }
        else if (near(tail, b1)) { line.push(a1); used[s] = true; grew = true }
        else if (near(head, b1)) { line.unshift(a1); used[s] = true; grew = true }
        else if (near(head, a1)) { line.unshift(b1); used[s] = true; grew = true }
      }
    }
    lines.push(line)
  }

  var points = []
  var t = 0
  for (i = 0; i < lines.length; i++) {
    var linePts = lines[i]
    for (j = 0; j < linePts.length; j++) {
      points.push({ x: linePts[j].x, y: linePts[j].y, t: t, ok: true })
      t += 1
    }
    if (linePts.length) {
      var last = linePts[linePts.length - 1]
      points.push({ x: last.x, y: last.y, t: t, ok: false })
      t += 1
    }
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
    // Every segment that overlaps [a, b] contributes, including the two that
    // straddle the bounds: their height is interpolated where they are cut,
    // so a bound landing between samples still integrates to it exactly.
    if (prev && prev.ok) {
      var x0 = Math.max(a, prev.x)
      var x1 = Math.min(b, p.x)
      if (x1 > x0) {
        var xSpan = p.x - prev.x
        var y0 = xSpan > 0 ? prev.y + (p.y - prev.y) * (x0 - prev.x) / xSpan : prev.y
        var y1 = xSpan > 0 ? prev.y + (p.y - prev.y) * (x1 - prev.x) / xSpan : p.y
        sum += (y0 + y1) * 0.5 * (x1 - x0)
      }
    }
    if (p.x > b + 1e-12) break
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
    if (prev && prev.ok) {
      var t0 = Math.max(a, prev.t)
      var t1 = Math.min(b, p.t)
      if (t1 > t0) {
        var tSpan = p.t - prev.t
        var r0 = tSpan > 0 ? prev.r + (p.r - prev.r) * (t0 - prev.t) / tSpan : prev.r
        var r1 = tSpan > 0 ? prev.r + (p.r - prev.r) * (t1 - prev.t) / tSpan : p.r
        sum += 0.5 * (r0 * r0 + r1 * r1) * 0.5 * (t1 - t0)
      }
    }
    if (p.t > b + 1e-12) break
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
    // Shoelace over the segments inside the bounds; a straddling segment is
    // cut at the bound and its endpoint interpolated along the chord.
    if (prev && prev.ok) {
      var t0 = Math.max(a, prev.t)
      var t1 = Math.min(b, p.t)
      if (t1 > t0) {
        var tSpan = p.t - prev.t
        var f0 = tSpan > 0 ? (t0 - prev.t) / tSpan : 0
        var f1 = tSpan > 0 ? (t1 - prev.t) / tSpan : 1
        var x0 = prev.x + (p.x - prev.x) * f0
        var y0 = prev.y + (p.y - prev.y) * f0
        var x1 = prev.x + (p.x - prev.x) * f1
        var y1 = prev.y + (p.y - prev.y) * f1
        sum += x0 * y1 - x1 * y0
      }
    }
    if (p.t > b + 1e-12) break
    prev = p
  }
  var area = 0.5 * sum
  return fromT > toT ? -area : area
}

function shouldBreak(a, b, yMin, yMax) {
  if (!a || !b) return true
  if (!a.ok || !b.ok) return true
  var span = Math.max(1e-9, yMax - yMin)
  var dy = b.y - a.y
  var dx = b.x - a.x
  if (Math.abs(dy) > span * 0.5) return true
  if (a.y * b.y < 0 && Math.abs(dy) > span * 0.28) return true
  var edge = span * 0.22
  if (a.y * b.y < 0 && Math.abs(a.y) > edge && Math.abs(b.y) > edge) return true
  if (Math.abs(dx) > 1e-14 && Math.abs(dy / dx) * Math.abs(dx) > span * 0.5) return true
  return false
}

function fitCartesianHalf(points, xCenter, xHalf) {
  var half = Number(xHalf)
  if (!(half > 0) || !isFinite(half)) half = 4
  for (var step = 0; step < 12; step++) {
    var slice = []
    for (var i = 0; i < (points ? points.length : 0); i++) {
      var p = points[i]
      if (p && p.ok && Math.abs(p.x - xCenter) <= half + 1e-12) slice.push(p)
    }
    var ext = robustYExtent([slice], 0.1)
    var ySpan = ext.max - ext.min
    var xSpan = half * 2
    if (!(ySpan > Math.max(12, xSpan * 2.2))) return Math.max(1.25, half)
    half *= 0.72
  }
  return Math.max(1.25, half)
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

// --- Snap targets -----------------------------------------------------------
//
// Places worth landing exactly on: where a curve crosses the axis, where it
// turns around, and where two series meet. The sample grid only brackets them;
// each target carries the bracket so the caller can refine against the real
// function. `param` is x for cartesian plots and t for polar ones.

function pointParam(p, curve) {
  return curve ? p.t : p.x
}

function pointValue(p, curve) {
  return curve ? p.r : p.y
}

// A pole (1/x, tan) flips sign without passing through zero. Real roots move a
// sample-sized step; poles jump the height of the window and then some.
function isJump(v0, v1, yRange) {
  var limit = yRange > 0 ? yRange : 1
  return Math.abs(v1 - v0) > limit
}

function snapTargets(seriesList, curve, yRange) {
  var out = []
  if (!seriesList || !seriesList.length) return out
  var s, i

  for (s = 0; s < seriesList.length; s++) {
    var pts = seriesList[s] ? seriesList[s].points : null
    if (!pts || pts.length < 3) continue
    for (i = 1; i < pts.length; i++) {
      var pa = pts[i - 1]
      var pb = pts[i]
      if (!pa || !pb || !pa.ok || !pb.ok) continue
      var va = pointValue(pa, curve)
      var vb = pointValue(pb, curve)
      if (!isFinite(va) || !isFinite(vb)) continue
      var ta = pointParam(pa, curve)
      var tb = pointParam(pb, curve)
      if ((va < 0 && vb > 0) || (va > 0 && vb < 0)) {
        if (isJump(va, vb, yRange)) continue
        var f = va / (va - vb)
        out.push({ t: ta + f * (tb - ta), a: ta, b: tb, kind: "zero", series: s })
      } else if (va === 0) {
        out.push({ t: ta, a: ta, b: tb, kind: "zero", series: s })
      }

      // Turning point: the middle of three samples sits above or below both
      // neighbours. The parabola through them puts the vertex closer than the
      // grid does, and refinement takes it the rest of the way.
      if (i + 1 < pts.length) {
        var pc = pts[i + 1]
        if (!pc || !pc.ok) continue
        var vc = pointValue(pc, curve)
        if (!isFinite(vc)) continue
        if (isJump(va, vb, yRange) || isJump(vb, vc, yRange)) continue
        // One >= on each side: a peak that lands exactly between two samples
        // gives them equal values, and a strict test on both sides misses it.
        var up = (vb > va && vb >= vc) || (vb >= va && vb > vc)
        var down = (vb < va && vb <= vc) || (vb <= va && vb < vc)
        if (!up && !down) continue
        var tc = pointParam(pc, curve)
        var denom = va - 2 * vb + vc
        var shift = denom !== 0 ? 0.5 * (va - vc) / denom : 0
        if (!isFinite(shift) || Math.abs(shift) > 1) shift = 0
        out.push({
          t: tb + shift * (tb - ta),
          a: ta,
          b: tc,
          kind: "peak",
          series: s,
          dir: up ? 1 : -1
        })
      }
    }
  }

  // Where two series meet. They share a sample grid, so the difference of the
  // two values changes sign in the same bracket the crossing lives in.
  var j
  for (s = 0; s < seriesList.length; s++) {
    for (j = s + 1; j < seriesList.length; j++) {
      var ps = seriesList[s] ? seriesList[s].points : null
      var pj = seriesList[j] ? seriesList[j].points : null
      if (!ps || !pj) continue
      var n = Math.min(ps.length, pj.length)
      for (i = 1; i < n; i++) {
        var a0 = ps[i - 1], a1 = ps[i], b0 = pj[i - 1], b1 = pj[i]
        if (!a0 || !a1 || !b0 || !b1) continue
        if (!a0.ok || !a1.ok || !b0.ok || !b1.ok) continue
        var d0 = pointValue(a0, curve) - pointValue(b0, curve)
        var d1 = pointValue(a1, curve) - pointValue(b1, curve)
        if (!isFinite(d0) || !isFinite(d1)) continue
        if (!((d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0))) continue
        if (isJump(d0, d1, yRange)) continue
        var t0 = pointParam(a0, curve)
        var t1 = pointParam(a1, curve)
        var fr = d0 / (d0 - d1)
        out.push({ t: t0 + fr * (t1 - t0), a: t0, b: t1, kind: "cross", series: s, other: j })
      }
    }
  }

  // A feature landing between two samples can be caught from either side, so
  // the same point can show up twice. Keep one.
  out.sort(function(p, q) { return p.t - q.t })
  var kept = []
  for (i = 0; i < out.length; i++) {
    var last = kept.length ? kept[kept.length - 1] : null
    var span = Math.abs(out[i].b - out[i].a)
    if (last && last.kind === out[i].kind && last.series === out[i].series
        && Math.abs(last.t - out[i].t) <= span) continue
    kept.push(out[i])
  }
  return kept
}

function nearestSnap(targets, t, tol) {
  if (!targets || !targets.length || !isFinite(t) || !(tol > 0)) return null
  var best = null
  var bestD = tol
  for (var i = 0; i < targets.length; i++) {
    var d = Math.abs(targets[i].t - t)
    if (d <= bestD) {
      bestD = d
      best = targets[i]
    }
  }
  return best
}

function snapKindAt(targets, t, eps) {
  var hit = nearestSnap(targets, t, eps)
  return hit ? hit.kind : ""
}

// Bisection: the bracket comes from a sign change on the sample grid, so it is
// already known to hold a root.
function refineRoot(f, a, b) {
  var fa = f(a)
  var fb = f(b)
  if (!isFinite(fa) || !isFinite(fb)) return NaN
  if (fa === 0) return a
  if (fb === 0) return b
  if ((fa < 0 && fb < 0) || (fa > 0 && fb > 0)) return NaN
  var lo = a
  var hi = b
  for (var i = 0; i < 60; i++) {
    var mid = (lo + hi) / 2
    var fm = f(mid)
    if (!isFinite(fm)) return NaN
    if (fm === 0) return mid
    if ((fa < 0 && fm < 0) || (fa > 0 && fm > 0)) {
      lo = mid
      fa = fm
    } else {
      hi = mid
    }
  }
  return (lo + hi) / 2
}

// Golden-section search for the turning point. `dir` is 1 for a maximum and
// -1 for a minimum.
function refineExtremum(f, a, b, dir) {
  var invphi = (Math.sqrt(5) - 1) / 2
  var lo = a
  var hi = b
  var sign = dir < 0 ? -1 : 1
  var c = hi - invphi * (hi - lo)
  var d = lo + invphi * (hi - lo)
  var fc = sign * f(c)
  var fd = sign * f(d)
  if (!isFinite(fc) || !isFinite(fd)) return NaN
  for (var i = 0; i < 80 && hi - lo > 1e-12; i++) {
    if (fc > fd) {
      hi = d
      d = c
      fd = fc
      c = hi - invphi * (hi - lo)
      fc = sign * f(c)
    } else {
      lo = c
      c = d
      fc = fd
      d = lo + invphi * (hi - lo)
      fd = sign * f(d)
    }
    if (!isFinite(fc) || !isFinite(fd)) return NaN
  }
  return (lo + hi) / 2
}
