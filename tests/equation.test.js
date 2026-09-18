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

test("x^2 exponent is tunable", function () {
  const a = E.analyze("x^2")
  assert.equal(a.ok, true)
  assert.equal(a.params[0].value, 2)
  assert.equal(E.evaluate(a.expressions[0].ast, { x: 3, a: 2 }), 9)
  assert.equal(E.evaluate(a.expressions[0].ast, { x: 3, a: 3 }), 27)
})

test("unary minus binds weaker than power", function () {
  const a = E.analyze("-x^2")
  assert.equal(a.ok, true)
  const y = E.evaluate(a.expressions[0].ast, { x: 3, a: 2 })
  assert.equal(y, -9)
})

test("2x^2 is 2*(x^2)", function () {
  const a = E.analyze("2x^2")
  const y = E.evaluate(a.expressions[0].ast, { x: 3, a: 2, b: 2 })
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
  const z = E.evaluate(a.expressions[0].ast, { x: 2, y: 1, a: 2, b: 2 })
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
