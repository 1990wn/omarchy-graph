// Run with: node --test tests/
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

function load(name) {
  const source = fs.readFileSync(path.join(__dirname, "..", name), "utf8")
  const context = { Math, Number, String, Error, isFinite, Infinity, NaN }
  vm.createContext(context)
  vm.runInContext(source.replace(/^\.pragma library\s*/, ""), context)
  return context
}

const E = load("Equation.js")
const P = load("PlotMath.js")

function names(analysis) {
  return analysis.params.map(function (p) { return String(p.name) }).join(",")
}

test("parses y=sin(x)", function () {
  const a = E.analyze("y=sin(x)")
  assert.equal(a.ok, true)
  assert.equal(a.independent, "x")
  assert.equal(a.params.length, 0)
  assert.equal(a.usesTrig, true)
  assert.equal(E.evaluate(a.expressions[0].ast, { x: 0 }), 0)
  assert.ok(Math.abs(E.evaluate(a.expressions[0].ast, { x: Math.PI / 2 }) - 1) < 1e-10)
})

test("promotes the 2 in 2*sin(x) to a slider", function () {
  const a = E.analyze("y=2*sin(x)")
  assert.equal(a.ok, true)
  assert.equal(names(a), "a")
  assert.equal(a.params[0].value, 2)
  assert.equal(String(a.pretty), "a · sin(x)")
  const y = E.evaluate(a.expressions[0].ast, { x: Math.PI / 2, a: 2 })
  assert.ok(Math.abs(y - 2) < 1e-10)
  const y2 = E.evaluate(a.expressions[0].ast, { x: Math.PI / 2, a: 5 })
  assert.ok(Math.abs(y2 - 5) < 1e-10)
})

test("implicit multiplication 2sin(x)", function () {
  const a = E.analyze("2sin(x)")
  assert.equal(a.ok, true)
  assert.equal(names(a), "a")
  assert.ok(Math.abs(E.evaluate(a.expressions[0].ast, { x: 0, a: 2 })) < 1e-12)
})

test("named parameters a*sin(b*x+c)", function () {
  const a = E.analyze("a*sin(b*x+c)")
  assert.equal(a.ok, true)
  assert.equal(names(a), "a,b,c")
  const y = E.evaluate(a.expressions[0].ast, { x: 0, a: 2, b: 1, c: Math.PI / 2 })
  assert.ok(Math.abs(y - 2) < 1e-10)
})

test("numeric exponents stay literals", function () {
  const a = E.analyze("x^2")
  assert.equal(a.ok, true)
  assert.equal(a.params.length, 0)
  assert.equal(E.evaluate(a.expressions[0].ast, { x: 3 }), 9)
  assert.equal(E.evaluate(a.expressions[0].ast, { x: -3 }), 9)
})

test("x^a is a live exponent", function () {
  const a = E.analyze("x^a")
  assert.equal(a.ok, true)
  assert.equal(names(a), "a")
  assert.equal(a.params[0].kind, "symbol")
  assert.equal(E.evaluate(a.expressions[0].ast, { x: 3, a: 2 }), 9)
})

test("ripple surface has no exponent sliders", function () {
  const a = E.analyze("sin(sqrt(x^2 + y^2))")
  assert.equal(a.ok, true, a.error)
  assert.equal(a.kind, "surface")
  assert.equal(a.params.length, 0)
})

test("1*x^3 - x only sliders the 1", function () {
  const a = E.analyze("1 * x^3 - x")
  assert.equal(a.ok, true)
  assert.equal(names(a), "a")
  assert.equal(a.params[0].value, 1)
  assert.equal(E.evaluate(a.expressions[0].ast, { x: -1, a: 1 }), 0)
  assert.equal(E.evaluate(a.expressions[0].ast, { x: -1.5, a: 1 }), -1.875)
  assert.equal(E.evaluate(a.expressions[0].ast, { x: -1.5, a: 2 }), -5.25)
})

test("unary minus binds weaker than power", function () {
  const a = E.analyze("-x^2")
  assert.equal(a.ok, true)
  const y = E.evaluate(a.expressions[0].ast, { x: 3 })
  assert.equal(y, -9)
})

test("2x^2 is 2*(x^2)", function () {
  const a = E.analyze("2x^2")
  const y = E.evaluate(a.expressions[0].ast, { x: 3, a: 2 })
  assert.equal(y, 18)
})

test("constants pi and e", function () {
  const a = E.analyze("sin(pi)")
  assert.ok(Math.abs(E.evaluate(a.expressions[0].ast, { x: 0 })) < 1e-10)
  const b = E.analyze("ln(e)")
  assert.ok(Math.abs(E.evaluate(b.expressions[0].ast, { x: 0 }) - 1) < 1e-10)
})

test("absolute value bars", function () {
  const a = E.analyze("|x|")
  assert.equal(E.evaluate(a.expressions[0].ast, { x: -3 }), 3)
})

test("multiple series", function () {
  const a = E.analyze("sin(x); cos(x)")
  assert.equal(a.ok, true)
  assert.equal(a.expressions.length, 2)
})

test("function without parens", function () {
  const a = E.analyze("sin x")
  assert.equal(a.ok, true)
  assert.ok(Math.abs(E.evaluate(a.expressions[0].ast, { x: 0 })) < 1e-12)
})

test("unknown function is an error", function () {
  const a = E.analyze("sn(x)")
  assert.equal(a.ok, false)
  assert.match(a.error, /Unknown function/)
})

test("empty input is an error", function () {
  const a = E.analyze("  ")
  assert.equal(a.ok, false)
})

test("t is independent when x is absent", function () {
  const a = E.analyze("sin(t)")
  assert.equal(a.independent, "t")
})

test("1/x samples with a discontinuity", function () {
  const a = E.analyze("1/x")
  const pts = P.sampleSeries(E.evaluate, a.expressions[0].ast, "x", a.params, { a: 1 }, -2, 2, 21)
  const mid = pts[10]
  assert.equal(mid.x, 0)
  assert.equal(mid.ok, false)
})

test("trig default window is ±2π", function () {
  const a = E.analyze("sin(x)")
  assert.ok(Math.abs(a.xHalf - Math.PI * 2) < 1e-9)
})

test("pi tick labels", function () {
  assert.equal(P.formatPi(0), "0")
  assert.equal(P.formatPi(Math.PI), "π")
  assert.equal(P.formatPi(-Math.PI), "−π")
  assert.equal(P.formatPi(Math.PI / 2), "π/2")
  assert.equal(P.formatPi(2 * Math.PI), "2π")
  assert.equal(P.formatPi(3 * Math.PI / 2), "3π/2")
})

test("±2π window uses π/2 ticks", function () {
  const t = P.ticksFor(-2 * Math.PI, 2 * Math.PI, 8, true)
  assert.equal(t.pi, true)
  assert.ok(Math.abs(t.step - Math.PI / 2) < 1e-9)
})

test("pretty print uses juxtaposition and π", function () {
  const a = E.analyze("2*pi*x")
  assert.ok(a.pretty.indexOf("π") !== -1)
})

test("log(x, 10) is log base 10", function () {
  const a = E.analyze("log(x, 10)")
  const y = E.evaluate(a.expressions[0].ast, { x: 100, a: 10 })
  assert.ok(Math.abs(y - 2) < 1e-10)
})

test("sum(n=1 to 2, n) is 3", function () {
  const a = E.analyze("sum(n=1 to 2, n)")
  assert.equal(a.ok, true)
  assert.equal(E.evaluate(a.expressions[0].ast, { N: 2 }), 3)
})

test("sum index is not a free parameter", function () {
  const a = E.analyze("sum(n=1 to 7, sin(n*x))")
  assert.equal(a.ok, true)
  assert.equal(a.independent, "x")
  assert.equal(names(a).indexOf("n") === -1 || names(a) === "N", true)
  assert.ok(names(a).split(",").indexOf("N") !== -1)
  assert.equal(a.usesTrig, true)
})

test("sum from n=1 to 7 of 1.5/sqrt(n)*sin(nx)", function () {
  const a = E.analyze("y = sum from n=1 to 7 of 1.5/sqrt(n)*sin(nx)")
  assert.equal(a.ok, true, a.error)
  assert.ok(names(a).split(",").indexOf("N") !== -1)
  assert.ok(names(a).split(",").indexOf("a") !== -1)
  const y0 = E.evaluate(a.expressions[0].ast, { x: 0, N: 7, a: 1.5 })
  assert.ok(Math.abs(y0) < 1e-10)
  const yPi2 = E.evaluate(a.expressions[0].ast, { x: Math.PI / 2, N: 1, a: 1.5 })
  assert.ok(Math.abs(yPi2 - 1.5) < 1e-10)
})

test("sum(n=1..3, n*x) at x=1 is 6", function () {
  const a = E.analyze("sum(n=1..3, n*x)")
  assert.equal(a.ok, true, a.error)
  assert.equal(E.evaluate(a.expressions[0].ast, { x: 1, N: 3 }), 6)
})

test("sigma unicode is sum", function () {
  const a = E.analyze("Σ(n=1 to 2, n)")
  assert.equal(a.ok, true, a.error)
  assert.equal(E.evaluate(a.expressions[0].ast, { N: 2 }), 3)
})

test("z = x^2 + y^2 is a 3d surface", function () {
  const a = E.analyze("z = x^2 + y^2")
  assert.equal(a.ok, true, a.error)
  assert.equal(a.dim, 3)
  assert.equal(a.independent, "x")
  assert.equal(a.independent2, "y")
  assert.ok(names(a).split(",").indexOf("y") === -1)
  const z = E.evaluate(a.expressions[0].ast, { x: 2, y: 1 })
  assert.equal(z, 5)
})

test("sin(x)*cos(y) is 3d without an explicit z", function () {
  const a = E.analyze("sin(x)*cos(y)")
  assert.equal(a.ok, true, a.error)
  assert.equal(a.dim, 3)
  assert.equal(a.params.length, 0)
  const z = E.evaluate(a.expressions[0].ast, { x: Math.PI / 2, y: 0 })
  assert.ok(Math.abs(z - 1) < 1e-10)
})

test("x^2 + y^2 = 1 is implicit, not a surface", function () {
  const a = E.analyze("x^2 + y^2 = 1")
  assert.equal(a.ok, true, a.error)
  assert.equal(a.kind, "implicit")
  assert.equal(a.dim, 2)
  const F = E.evaluate(a.expressions[0].ast, { x: 1, y: 0, a: 1 })
  assert.ok(Math.abs(F) < 1e-8)
  const pts = P.sampleImplicit(E.evaluate, a.expressions[0].ast, a.params, { a: 1 }, -1.5, 1.5, -1.5, 1.5, 40)
  var near = false
  for (var i = 0; i < pts.length; i++) {
    if (!pts[i].ok) continue
    if (Math.abs(pts[i].x * pts[i].x + pts[i].y * pts[i].y - 1) < 0.08) near = true
  }
  assert.equal(near, true)
})

test("y = x^2 stays cartesian", function () {
  const a = E.analyze("y = x^2")
  assert.equal(a.kind, "cartesian")
  assert.equal(a.dim, 2)
})

test("sin(x) stays 2d", function () {
  const a = E.analyze("sin(x)")
  assert.equal(a.dim, 2)
  assert.equal(a.independent2, "")
})

test("r = 1+cos(t) is polar", function () {
  const a = E.analyze("r = 1 + cos(t)")
  assert.equal(a.ok, true, a.error)
  assert.equal(a.kind, "polar")
  assert.equal(a.independent, "t")
  const pts = P.samplePolar(E.evaluate, a.expressions[0].ast, "t", a.params, { a: 1 }, 0, 0, 2)
  assert.ok(Math.abs(pts[0].x - 2) < 1e-8)
  assert.ok(Math.abs(pts[0].y) < 1e-8)
})

test("x=cos(t), y=sin(t) is parametric", function () {
  const a = E.analyze("x = cos(t), y = sin(t)")
  assert.equal(a.ok, true, a.error)
  assert.equal(a.kind, "parametric")
  assert.equal(a.expressions.length, 2)
  const pts = P.sampleParametric(E.evaluate, a.expressions[0].ast, a.expressions[1].ast, "t", a.params, {}, 0, Math.PI / 2, 48)
  assert.ok(Math.abs(pts[0].x - 1) < 1e-8)
  assert.ok(Math.abs(pts[pts.length - 1].y - 1) < 1e-8)
})

test("r = 1+cos(θ) uses theta", function () {
  const a = E.analyze("r = 1+cos(θ)")
  assert.equal(a.ok, true, a.error)
  assert.equal(a.independent, "theta")
})

test("cartesian area under y=1 from 0 to 2 is 2", function () {
  const pts = [
    { x: 0, y: 1, t: 0, ok: true },
    { x: 1, y: 1, t: 1, ok: true },
    { x: 2, y: 1, t: 2, ok: true }
  ]
  assert.ok(Math.abs(P.areaCartesian(pts, 0, 2) - 2) < 1e-9)
})

test("tan(x) breaks at the asymptote", function () {
  const a = E.analyze("tan(x)")
  const pts = P.sampleSeries(E.evaluate, a.expressions[0].ast, "x", a.params, {}, 1.0, 2.1, 80)
  var broke = false
  for (var i = 1; i < pts.length; i++) {
    if (pts[i - 1].ok && pts[i].ok && pts[i - 1].x < Math.PI / 2 && pts[i].x > Math.PI / 2) {
      assert.equal(P.shouldBreak(pts[i - 1], pts[i], -20, 20), true)
      broke = true
    }
  }
  assert.equal(broke, true)
})

test("1/x breaks at the origin", function () {
  const a = E.analyze("1/x")
  const vals = { a: 1 }
  const pts = P.sampleSeries(E.evaluate, a.expressions[0].ast, "x", a.params, vals, -2, 2, 81)
  var left = null
  var right = null
  for (var i = 0; i < pts.length; i++) {
    if (!pts[i].ok) continue
    if (pts[i].x < 0) left = pts[i]
    if (pts[i].x > 0 && !right) right = pts[i]
  }
  assert.ok(left && right)
  assert.equal(P.shouldBreak(left, right, -10, 10), true)
})

test("x^3 - x does not break across the origin", function () {
  const a = E.analyze("x^3 - x")
  const pts = P.sampleSeries(E.evaluate, a.expressions[0].ast, "x", a.params, {}, -2, 2, 80)
  for (var i = 1; i < pts.length; i++) {
    if (pts[i - 1].ok && pts[i].ok && pts[i - 1].x < 0 && pts[i].x > 0)
      assert.equal(P.shouldBreak(pts[i - 1], pts[i], -8, 8), false)
  }
})

test("fitCartesianHalf shrinks x^2 from ±10 to a readable window", function () {
  const a = E.analyze("x^2")
  const vals = { a: 2 }
  const pts = P.sampleSeries(E.evaluate, a.expressions[0].ast, "x", a.params, vals, -10, 10, 200)
  const half = P.fitCartesianHalf(pts, 0, 10)
  assert.ok(half < 6)
  assert.ok(half > 2)
})

test("wheel zoom in shrinks the window", function () {
  assert.ok(P.zoomFactorFromWheel(120, 0) < 1)
  assert.ok(P.zoomFactorFromWheel(-120, 0) > 1)
})

test("top-down view does not flatten the xy plane", function () {
  const cam = P.makeCam(-1, 1, -1, 1, -1, 1, 0, 90, 0, 400, 0, 400)
  const a = P.projectPoint(1, 0, 0, cam)
  const b = P.projectPoint(0, 1, 0, cam)
  const c = P.projectPoint(-1, 0, 0, cam)
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 20)
  assert.ok(Math.hypot(a.x - c.x, a.y - c.y) > 20)
})

function snapSetup(source, xMin, xMax, count) {
  const a = E.analyze(source)
  const values = {}
  a.params.forEach(function (p) { values[p.name] = p.value })
  const series = a.expressions.map(function (e) {
    return { points: P.sampleSeries(E.evaluate, e.ast, a.independent, a.params, values, xMin, xMax, count || 800) }
  })
  function fn(index) {
    const env = P.envFrom(a.independent, 0, a.params, values)
    return function (t) {
      env[a.independent] = t
      return E.evaluate(a.expressions[index].ast, env)
    }
  }
  function refine(target) {
    if (target.kind === "peak") return P.refineExtremum(fn(target.series), target.a, target.b, target.dir)
    if (target.kind === "cross") {
      const f = fn(target.series)
      const g = fn(target.other)
      return P.refineRoot(function (t) { return f(t) - g(t) }, target.a, target.b)
    }
    return P.refineRoot(fn(target.series), target.a, target.b)
  }
  return { series: series, refine: refine }
}

test("snap targets find the zeros of sin(x) exactly", function () {
  const s = snapSetup("sin(x)", -7, 7)
  const zeros = P.snapTargets(s.series, false, 4)
    .filter(function (t) { return t.kind === "zero" })
    .map(s.refine)
  assert.equal(zeros.length, 5)
  zeros.forEach(function (z) {
    assert.ok(Math.abs(z - Math.round(z / Math.PI) * Math.PI) < 1e-12)
  })
})

test("snap targets find a peak that lands between two samples", function () {
  const s = snapSetup("exp(-x^2)", -5, 5)
  const peaks = P.snapTargets(s.series, false, 1).filter(function (t) { return t.kind === "peak" })
  assert.equal(peaks.length, 1)
  assert.ok(Math.abs(s.refine(peaks[0])) < 1e-6)
})

test("snap targets find where two series cross", function () {
  const s = snapSetup("sin(x); cos(x)", -7, 7)
  const crosses = P.snapTargets(s.series, false, 4)
    .filter(function (t) { return t.kind === "cross" })
    .map(s.refine)
  assert.ok(crosses.length >= 4)
  crosses.forEach(function (x) {
    assert.ok(Math.abs(Math.sin(x) - Math.cos(x)) < 1e-9)
  })
})

test("a pole is not mistaken for a zero crossing", function () {
  const s = snapSetup("1/x", -6, 6)
  const zeros = P.snapTargets(s.series, false, 8).filter(function (t) { return t.kind === "zero" })
  assert.equal(zeros.length, 0)
})

test("nearestSnap only catches targets inside the tolerance", function () {
  const s = snapSetup("sin(x)", -7, 7)
  const targets = P.snapTargets(s.series, false, 4)
  assert.ok(Math.abs(P.nearestSnap(targets, 3.0, 0.25).t - Math.PI) < 0.01)
  assert.equal(P.nearestSnap(targets, 2.0, 0.2), null)
})

test("polar zeros land on the petal edges of r = sin(3t)", function () {
  const a = E.analyze("r = sin(3t)")
  const pts = P.samplePolar(E.evaluate, a.expressions[0].ast, a.independent, a.params, {}, 0, Math.PI * 2, 900)
  const targets = P.snapTargets([{ points: pts }], true, 2).filter(function (t) { return t.kind === "zero" })
  assert.ok(targets.length >= 6)
  targets.forEach(function (t) {
    const k = Math.round(t.t / (Math.PI / 3))
    assert.ok(Math.abs(t.t - k * Math.PI / 3) < 1e-3)
  })
})

test("an area between arbitrary bounds matches the exact integral", function () {
  const a = E.analyze("sin(x)")
  const pts = P.sampleSeries(E.evaluate, a.expressions[0].ast, "x", a.params, {}, -7, 7, 801)
  const cases = [[0, Math.PI], [Math.PI / 6, Math.PI / 2], [1, 2], [-2, -0.5]]
  cases.forEach(function (pair) {
    const got = P.areaCartesian(pts, pair[0], pair[1])
    const want = Math.cos(pair[0]) - Math.cos(pair[1])
    assert.ok(Math.abs(got - want) < 1e-3, pair + " gave " + got + ", wanted " + want)
  })
})

test("swapping the bounds negates the area", function () {
  const a = E.analyze("sin(x)")
  const pts = P.sampleSeries(E.evaluate, a.expressions[0].ast, "x", a.params, {}, -7, 7, 801)
  const forward = P.areaCartesian(pts, 0, Math.PI)
  assert.ok(Math.abs(forward + P.areaCartesian(pts, Math.PI, 0)) < 1e-12)
})

test("one petal of r = sin(3t) integrates to pi/12", function () {
  const a = E.analyze("r = sin(3t)")
  const pts = P.samplePolar(E.evaluate, a.expressions[0].ast, a.independent, a.params, {}, 0, Math.PI * 2, 900)
  assert.ok(Math.abs(P.areaPolar(pts, 0, Math.PI / 3) - Math.PI / 12) < 1e-4)
})

test("half of the unit circle integrates to pi/2", function () {
  const a = E.analyze("x = cos(t); y = sin(t)")
  const pts = P.sampleParametric(E.evaluate, a.expressions[0].ast, a.expressions[1].ast,
    a.independent, a.params, {}, 0, Math.PI * 2, 900)
  assert.ok(Math.abs(P.areaParametric(pts, 0, Math.PI) - Math.PI / 2) < 1e-3)
})

test("snap targets come back in order, so stepping can walk them", function () {
  const a = E.analyze("sin(x); cos(x)")
  const values = {}
  const series = a.expressions.map(function (e) {
    return { points: P.sampleSeries(E.evaluate, e.ast, a.independent, a.params, values, -7, 7, 800) }
  })
  const targets = P.snapTargets(series, false, 4)
  assert.ok(targets.length > 5)
  for (var i = 1; i < targets.length; i++) assert.ok(targets[i].t >= targets[i - 1].t)
})

function derivativeOf(source) {
  const a = E.analyze(source)
  const d = E.derivative(a.expressions[0].ast, a.independent)
  const values = {}
  a.params.forEach(function (p) { values[p.name] = p.value })
  return { analysis: a, d: d, values: values }
}

test("symbolic derivatives match central differences", function () {
  const sources = ["sin(x)", "cos(x)", "tan(x)", "exp(-x^2)", "sqrt(x)", "ln(x)", "x^3 - x",
    "sin(x)*cos(x)", "sin(x)/x", "atan(x)", "tanh(x)", "log10(x)", "cbrt(x)", "sinc(x)",
    "sec(x)", "cot(x)", "x^x", "2^x", "sin(x^2)", "exp(x)*ln(x)", "x^4",
    "sum(n=1 to 5, sin(n*x))"]
  sources.forEach(function (source) {
    const s = derivativeOf(source)
    assert.ok(s.d, "no derivative for " + source)
    const ind = s.analysis.independent
    const at = function (x) {
      const env = Object.assign({}, s.values)
      env[ind] = x
      return E.evaluate(s.analysis.expressions[0].ast, env)
    }
    ;[0.3, 0.7, 1.1, 1.9, 2.6].forEach(function (x) {
      const h = 1e-6
      const numeric = (at(x + h) - at(x - h)) / (2 * h)
      const env = Object.assign({}, s.values)
      env[ind] = x
      const symbolic = E.evaluate(s.d, env)
      if (!isFinite(numeric) || !isFinite(symbolic)) return
      const scale = Math.max(1, Math.abs(numeric))
      assert.ok(Math.abs(symbolic - numeric) / scale < 1e-6,
        source + " at " + x + ": " + symbolic + " vs " + numeric)
    })
  })
})

test("the derivative folds away the identities it creates", function () {
  assert.equal(E.pretty(derivativeOf("sin(x)").d), "cos(x)")
  assert.equal(E.pretty(derivativeOf("x^2").d), "2x")
  assert.equal(E.pretty(derivativeOf("ln(x)").d), "1 / x")
  assert.equal(E.pretty(derivativeOf("x^x").d), "x^x · (ln(x) + 1)")
})

test("no symbolic rule yields null rather than a wrong answer", function () {
  assert.equal(derivativeOf("min(x, 2)").d, null)
  assert.equal(derivativeOf("hypot(x, 2)").d, null)
})

test("a constant differentiates to zero and a parameter is held constant", function () {
  const s = derivativeOf("a*x")
  const env = { x: 3, a: 5 }
  assert.equal(E.evaluate(s.d, env), 5)
})

test("area between two series matches the exact integral", function () {
  const a = E.analyze("sin(x); cos(x)")
  const series = a.expressions.map(function (e) {
    return P.sampleSeries(E.evaluate, e.ast, a.independent, a.params, {}, -7, 7, 1600)
  })
  const got = P.areaBetween(series[0], series[1], Math.PI / 4, 5 * Math.PI / 4)
  assert.ok(Math.abs(got - 2 * Math.SQRT2) < 1e-3, "got " + got)
  assert.ok(Math.abs(got + P.areaBetween(series[0], series[1], 5 * Math.PI / 4, Math.PI / 4)) < 1e-12)
})

test("the numeric derivative fallback tracks the real slope", function () {
  const a = E.analyze("sin(x)")
  const pts = P.sampleSeries(E.evaluate, a.expressions[0].ast, "x", a.params, {}, -7, 7, 1600)
  const d = P.derivativePoints(pts)
  assert.equal(d.length, pts.length)
  d.forEach(function (p) {
    if (!p.ok) return
    assert.ok(Math.abs(p.y - Math.cos(p.x)) < 1e-3)
  })
})
