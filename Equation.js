.pragma library

// Expression parser for the graphing calculator.
//
// Grammar is Pratt-parsed so implicit multiplication, unary minus, and
// right-associative ^ compose the way a person writing math expects:
//   -x^2     →  -(x^2)
//   2x^2     →  2*(x^2)
//   2sin(x)  →  2*sin(x)
//   sin x+1  →  sin(x)+1
//
// Numeric literals that are not 0 become tunable parameters (so y=2*sin(x)
// grows an `a` slider whose default is 2). Named letters other than the
// independent variable are parameters too.

var FUNC_ARITY = {
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, atan2: 2,
  sinh: 1, cosh: 1, tanh: 1, asinh: 1, acosh: 1, atanh: 1,
  exp: 1, log: [1, 2], ln: 1, log10: 1, log2: 1, lg: 1, lb: 1,
  sqrt: 1, cbrt: 1, abs: 1, floor: 1, ceil: 1, round: 1, trunc: 1,
  sign: 1, frac: 1, min: [1, 8], max: [1, 8], hypot: [1, 8], pow: 2,
  sinc: 1, sec: 1, csc: 1, cot: 1, sech: 1, csch: 1, coth: 1,
  deg: 1, rad: 1
}

var CONSTANTS = {
  pi: Math.PI,
  tau: Math.PI * 2,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
  inf: Infinity
}

var TRIG = {
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, atan2: 1,
  sec: 1, csc: 1, cot: 1, sinc: 1
}

var LOG_LIKE = { log: 1, ln: 1, log10: 1, log2: 1, lg: 1, lb: 1, sqrt: 1 }

var PARAM_LETTERS = ["a", "b", "c", "d", "k", "n", "m", "p", "q", "r", "s", "u", "v", "w", "z"]

var PREC_ADD = 10
var PREC_MUL = 20
var PREC_UNARY = 25
var PREC_POW = 30

function isFunc(name) {
  return FUNC_ARITY[name] !== undefined
}

function isConst(name) {
  return CONSTANTS[name] !== undefined
}

function arityOk(name, n) {
  var spec = FUNC_ARITY[name]
  if (spec === undefined) return false
  if (typeof spec === "number") return n === spec
  return n >= spec[0] && n <= spec[1]
}

function isSumName(name) {
  return name === "sum" || name === "sigma"
}

function preprocess(src) {
  var s = String(src || "")
  s = s.replace(/π/g, "pi")
  s = s.replace(/τ/g, "tau")
  s = s.replace(/[φϕ]/g, "phi")
  s = s.replace(/[×·∙]/g, "*")
  s = s.replace(/÷/g, "/")
  s = s.replace(/[−—–]/g, "-")
  s = s.replace(/√/g, "sqrt")
  s = s.replace(/²/g, "^2")
  s = s.replace(/³/g, "^3")
  s = s.replace(/[Σ∑]/g, "sum")
  s = s.replace(/θ/g, "theta")
  s = s.replace(/,\s*(?=[xyr]\s*=)/gi, ";")
  return s
}

function tokenize(src) {
  var s = preprocess(src)
  var i = 0
  var tokens = []
  while (i < s.length) {
    var c = s.charAt(i)
    if (c === " " || c === "\t" || c === "\r") {
      i++
      continue
    }
    if (c === "\n") {
      tokens.push({ type: "semi" })
      i++
      continue
    }
    if (c === "=") { tokens.push({ type: "eq" }); i++; continue }
    if (c === ",") { tokens.push({ type: "comma" }); i++; continue }
    if (c === "(") { tokens.push({ type: "lparen" }); i++; continue }
    if (c === ")") { tokens.push({ type: "rparen" }); i++; continue }
    if (c === "|") { tokens.push({ type: "pipe" }); i++; continue }
    if (c === ";") { tokens.push({ type: "semi" }); i++; continue }
    if (c === "*" && s.charAt(i + 1) === "*") {
      tokens.push({ type: "op", op: "^" })
      i += 2
      continue
    }
    if (c === "." && s.charAt(i + 1) === ".") {
      tokens.push({ type: "to" })
      i += 2
      continue
    }
    if (c === "^") { tokens.push({ type: "op", op: "^" }); i++; continue }
    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "%") {
      tokens.push({ type: "op", op: c })
      i++
      continue
    }
    if ((c >= "0" && c <= "9") || (c === "." && s.charAt(i + 1) >= "0" && s.charAt(i + 1) <= "9")) {
      var rest = s.slice(i)
      var m = rest.match(/^\d*\.?\d+(?:[eE][+-]?\d+)?/)
      if (!m) throw parseError("Bad number", i)
      tokens.push({ type: "num", value: parseFloat(m[0]) })
      i += m[0].length
      continue
    }
    if ((c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_") {
      var id = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)
      var whole = id[0].toLowerCase()
      // `sin(nx)` means sin(n*x). Split two-letter products, but keep
      // function names (`ln`), constants (`pi`), and sum keywords (`to`).
      if (whole.length === 2 && !isFunc(whole) && !isConst(whole)
          && whole !== "to" && whole !== "of") {
        tokens.push({ type: "id", name: whole.charAt(0) })
        tokens.push({ type: "id", name: whole.charAt(1) })
      } else {
        tokens.push({ type: "id", name: whole })
      }
      i += id[0].length
      continue
    }
    throw parseError("Unexpected '" + c + "'", i)
  }
  tokens.push({ type: "eof" })
  return tokens
}

function parseError(message, index) {
  var err = new Error(message)
  err.index = index
  return err
}

function splitTop(tokens) {
  var groups = []
  var current = []
  var depth = 0
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i]
    if (t.type === "lparen" || t.type === "pipe") depth++
    if (t.type === "rparen") depth = Math.max(0, depth - 1)
    if (t.type === "semi" && depth === 0) {
      if (current.length) groups.push(current)
      current = []
      continue
    }
    if (t.type === "eof") continue
    current.push(t)
  }
  if (current.length) groups.push(current)
  return groups
}

function stripLhs(tokens) {
  if (!tokens.length) return tokens
  if (tokens[0].type === "id" && tokens[1] && tokens[1].type === "eq")
    return tokens.slice(2)
  if (tokens[0].type === "id" && tokens[1] && tokens[1].type === "lparen") {
    var depth = 0
    for (var i = 1; i < tokens.length; i++) {
      if (tokens[i].type === "lparen") depth++
      else if (tokens[i].type === "rparen") {
        depth--
        if (depth === 0) {
          if (tokens[i + 1] && tokens[i + 1].type === "eq")
            return tokens.slice(i + 2)
          break
        }
      }
    }
  }
  return tokens
}

function Parser(tokens) {
  this.tokens = tokens
  this.i = 0
}

Parser.prototype.peek = function() {
  return this.tokens[this.i] || { type: "eof" }
}

Parser.prototype.at = function(type, op) {
  var t = this.peek()
  if (t.type !== type) return false
  if (op !== undefined && t.op !== op) return false
  return true
}

Parser.prototype.atId = function(name) {
  var t = this.peek()
  return t.type === "id" && t.name === name
}

Parser.prototype.atTo = function() {
  return this.at("to") || this.atId("to")
}

Parser.prototype.take = function() {
  var t = this.peek()
  this.i++
  return t
}

Parser.prototype.expect = function(type, message) {
  if (!this.at(type)) throw parseError(message || ("Expected " + type), this.i)
  return this.take()
}

Parser.prototype.startsPrimary = function() {
  var t = this.peek()
  // `|` opens an abs-value primary, but after a value it is a closer, so it
  // must not trigger implicit multiplication (`|x|` is abs, not x*|).
  // `to` / `of` / `from` are sum-range keywords, not factors of `1 to 7`.
  if (t.type === "id" && (t.name === "to" || t.name === "of" || t.name === "from"))
    return false
  return t.type === "num" || t.type === "id" || t.type === "lparen"
}

Parser.prototype.infixPrec = function() {
  var t = this.peek()
  if (t.type === "op") {
    if (t.op === "+" || t.op === "-") return PREC_ADD
    if (t.op === "*" || t.op === "/" || t.op === "%") return PREC_MUL
    if (t.op === "^") return PREC_POW
  }
  if (this.startsPrimary()) return PREC_MUL
  return -1
}

Parser.prototype.parseExpr = function(minPrec) {
  if (minPrec === undefined) minPrec = 0
  var left = this.parsePrefix()
  for (;;) {
    var prec = this.infixPrec()
    if (prec < minPrec) break
    var implicit = !this.at("op")
    var op = implicit ? "*" : this.take().op
    var nextMin = op === "^" ? prec : prec + 1
    var right = this.parseExpr(nextMin)
    left = { type: "op", op: op, left: left, right: right }
  }
  return left
}

Parser.prototype.parsePrefix = function() {
  if (this.at("op", "+")) {
    this.take()
    return this.parsePrefix()
  }
  if (this.at("op", "-")) {
    this.take()
    return { type: "uop", op: "-", arg: this.parseExpr(PREC_UNARY) }
  }
  if (this.at("num")) {
    return { type: "num", value: this.take().value }
  }
  if (this.at("id")) {
    var name = this.take().name
    if (isSumName(name)) return this.parseSum()
    if (this.at("lparen")) {
      this.take()
      var args = []
      if (!this.at("rparen")) {
        args.push(this.parseExpr(0))
        while (this.at("comma")) {
          this.take()
          args.push(this.parseExpr(0))
        }
      }
      this.expect("rparen", "Missing )")
      if (!isFunc(name)) throw parseError("Unknown function '" + name + "'")
      if (!arityOk(name, args.length))
        throw parseError("Wrong number of arguments for " + name)
      return { type: "call", name: name, args: args }
    }
    if (isFunc(name) && this.startsPrimary()) {
      var arg = this.parseExpr(PREC_UNARY)
      return { type: "call", name: name, args: [arg] }
    }
    if (isFunc(name))
      throw parseError(name + " needs an argument")
    if (isConst(name)) return { type: "const", name: name }
    return { type: "var", name: name }
  }
  if (this.at("lparen")) {
    this.take()
    var inner = this.parseExpr(0)
    this.expect("rparen", "Missing )")
    return inner
  }
  if (this.at("pipe")) {
    this.take()
    var absInner = this.parseExpr(0)
    this.expect("pipe", "Missing |")
    return { type: "call", name: "abs", args: [absInner] }
  }
  var t = this.peek()
  if (t.type === "eof") throw parseError("Unexpected end of equation")
  throw parseError("Unexpected token")
}

Parser.prototype.parseSum = function() {
  if (this.atId("from")) this.take()
  var paren = false
  if (this.at("lparen")) {
    this.take()
    paren = true
  }
  if (!this.at("id")) throw parseError("sum needs an index, like n")
  var index = this.take().name
  if (isFunc(index) || isConst(index) || isSumName(index))
    throw parseError("Cannot sum over " + index)

  var fromAst
  var toAst
  var body
  if (this.at("eq")) {
    this.take()
    fromAst = this.parseExpr(0)
    if (this.atTo() || this.at("comma")) this.take()
    else throw parseError("Expected 'to' in the sum (n=1 to 7)")
    toAst = this.parseExpr(0)
    if (this.at("comma") || this.atId("of")) this.take()
    else throw parseError("Expected a comma before the sum body")
    body = this.parseExpr(0)
  } else if (this.at("comma")) {
    this.take()
    fromAst = this.parseExpr(0)
    if (!this.at("comma")) throw parseError("Expected comma after the start of the sum")
    this.take()
    toAst = this.parseExpr(0)
    if (!this.at("comma")) throw parseError("Expected comma before the sum body")
    this.take()
    body = this.parseExpr(0)
  } else {
    throw parseError("Write sum(n=1 to 7, ...) or sum from n=1 to 7 of ...")
  }

  if (paren) this.expect("rparen", "Missing ) after sum")
  return { type: "sum", index: index, from: fromAst, to: toAst, body: body }
}

function parseOne(tokens) {
  var stripped = stripLhs(tokens)
  if (!stripped.length) throw parseError("Empty equation")
  var p = new Parser(stripped.concat([{ type: "eof" }]))
  var ast = p.parseExpr(0)
  if (!p.at("eof")) throw parseError("Unexpected extra input")
  return ast
}

function collectVars(ast, into, bound) {
  if (!ast) return
  bound = bound || {}
  if (ast.type === "var") {
    if (!bound[ast.name]) into[ast.name] = true
    return
  }
  if (ast.type === "call") {
    for (var i = 0; i < ast.args.length; i++) collectVars(ast.args[i], into, bound)
    return
  }
  if (ast.type === "op") {
    collectVars(ast.left, into, bound)
    collectVars(ast.right, into, bound)
    return
  }
  if (ast.type === "uop") {
    collectVars(ast.arg, into, bound)
    return
  }
  if (ast.type === "sum") {
    collectVars(ast.from, into, bound)
    collectVars(ast.to, into, bound)
    var inner = {}
    for (var k in bound) inner[k] = true
    inner[ast.index] = true
    collectVars(ast.body, into, inner)
  }
}

function collectCalls(ast, into) {
  if (!ast) return
  if (ast.type === "call") {
    into[ast.name] = true
    for (var i = 0; i < ast.args.length; i++) collectCalls(ast.args[i], into)
  }
  if (ast.type === "op") {
    collectCalls(ast.left, into)
    collectCalls(ast.right, into)
  }
  if (ast.type === "uop") collectCalls(ast.arg, into)
  if (ast.type === "sum") {
    collectCalls(ast.from, into)
    collectCalls(ast.to, into)
    collectCalls(ast.body, into)
  }
}

function pickIndependent(varSet) {
  if (varSet.x) return "x"
  if (varSet.t) return "t"
  var names = []
  for (var k in varSet) names.push(k)
  names.sort()
  if (names.length === 1) return names[0]
  return "x"
}

function lhsName(tokens) {
  if (!tokens || !tokens.length) return ""
  if (tokens[0].type === "id" && tokens[1] && tokens[1].type === "eq")
    return tokens[0].name
  if (tokens[0].type === "id" && tokens[1] && tokens[1].type === "lparen") {
    var depth = 0
    for (var i = 1; i < tokens.length; i++) {
      if (tokens[i].type === "lparen") depth++
      else if (tokens[i].type === "rparen") {
        depth--
        if (depth === 0) {
          if (tokens[i + 1] && tokens[i + 1].type === "eq")
            return tokens[0].name
          break
        }
      }
    }
  }
  return ""
}

function pickPolarIndep(varSet) {
  if (varSet.theta) return "theta"
  if (varSet.t) return "t"
  return pickIndependent(varSet)
}

function indepsOf() {
  var o = {}
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i]) o[arguments[i]] = true
  }
  return o
}

function pickAxes(varSet, lhsNames) {
  var names = lhsNames || []
  var lhs = names.length ? names[0] : ""
  var ix = -1
  var iy = -1
  var ir = -1
  for (var i = 0; i < names.length; i++) {
    if (names[i] === "x" && ix < 0) ix = i
    if (names[i] === "y" && iy < 0) iy = i
    if (names[i] === "r" && ir < 0) ir = i
  }
  if (ir >= 0 && names.length === 1) {
    var pind = pickPolarIndep(varSet)
    return {
      kind: "polar",
      dim: 2,
      independent: pind,
      independent2: "",
      independents: indepsOf(pind),
      output: "r",
      indexX: ir,
      indexY: -1
    }
  }
  if (ix >= 0 && iy >= 0 && names.length >= 2) {
    var tind = pickPolarIndep(varSet)
    return {
      kind: "parametric",
      dim: 2,
      independent: tind,
      independent2: "",
      independents: indepsOf(tind),
      output: "xy",
      indexX: ix,
      indexY: iy
    }
  }
  var want3d = lhs === "z" || (!!varSet.x && !!varSet.y && lhs !== "y")
  if (want3d) {
    return {
      kind: "surface",
      dim: 3,
      independent: "x",
      independent2: "y",
      independents: { x: true, y: true },
      output: "z",
      indexX: 0,
      indexY: -1
    }
  }
  var ind = pickIndependent(varSet)
  return {
    kind: "cartesian",
    dim: 2,
    independent: ind,
    independent2: "",
    independents: indepsOf(ind),
    output: "y",
    indexX: 0,
    indexY: -1
  }
}

function nextParamName(used) {
  for (var i = 0; i < PARAM_LETTERS.length; i++) {
    var n = PARAM_LETTERS[i]
    if (!used[n]) return n
  }
  var k = 1
  while (used["p" + k]) k++
  return "p" + k
}

function cloneAst(ast) {
  if (!ast) return ast
  if (ast.type === "num") return { type: "num", value: ast.value }
  if (ast.type === "var") return { type: "var", name: ast.name }
  if (ast.type === "param") return { type: "param", name: ast.name, source: ast.source }
  if (ast.type === "const") return { type: "const", name: ast.name }
  if (ast.type === "call") {
    var args = []
    for (var i = 0; i < ast.args.length; i++) args.push(cloneAst(ast.args[i]))
    return { type: "call", name: ast.name, args: args }
  }
  if (ast.type === "op")
    return { type: "op", op: ast.op, left: cloneAst(ast.left), right: cloneAst(ast.right) }
  if (ast.type === "uop")
    return { type: "uop", op: ast.op, arg: cloneAst(ast.arg) }
  if (ast.type === "sum")
    return {
      type: "sum",
      index: ast.index,
      from: cloneAst(ast.from),
      to: cloneAst(ast.to),
      body: cloneAst(ast.body)
    }
  return ast
}

function promoteNumbers(ast, used, params, mode) {
  if (!ast) return ast
  if (ast.type === "num") {
    if (mode === "bound-from") return ast
    if (mode === "bound-to") {
      var boundName = !used["N"] ? "N" : nextParamName(used)
      used[boundName] = true
      var hi = Math.max(16, Math.round(Math.abs(ast.value)) * 3 + 4)
      params.push({
        name: boundName,
        value: ast.value,
        kind: "bound",
        source: ast.value,
        integer: true,
        min: 1,
        max: Math.min(256, hi),
        step: 1
      })
      return { type: "param", name: boundName, source: ast.value }
    }
    if (ast.value === 0) return ast
    var name = nextParamName(used)
    used[name] = true
    params.push({
      name: name,
      value: ast.value,
      kind: "number",
      source: ast.value
    })
    return { type: "param", name: name, source: ast.value }
  }
  if (ast.type === "call") {
    var args = []
    for (var i = 0; i < ast.args.length; i++)
      args.push(promoteNumbers(ast.args[i], used, params, mode))
    return { type: "call", name: ast.name, args: args }
  }
  if (ast.type === "op")
    return {
      type: "op",
      op: ast.op,
      left: promoteNumbers(ast.left, used, params, mode),
      right: promoteNumbers(ast.right, used, params, mode)
    }
  if (ast.type === "uop")
    return { type: "uop", op: ast.op, arg: promoteNumbers(ast.arg, used, params, mode) }
  if (ast.type === "sum") {
    used[ast.index] = true
    return {
      type: "sum",
      index: ast.index,
      from: promoteNumbers(ast.from, used, params, "bound-from"),
      to: promoteNumbers(ast.to, used, params, "bound-to"),
      body: promoteNumbers(ast.body, used, params, mode)
    }
  }
  return ast
}

function replaceNamed(ast, independents, bound) {
  if (!ast) return ast
  bound = bound || {}
  independents = independents || {}
  if (ast.type === "var") {
    if (independents[ast.name]) return ast
    if (bound[ast.name]) return ast
    return { type: "param", name: ast.name }
  }
  if (ast.type === "call") {
    var args = []
    for (var i = 0; i < ast.args.length; i++)
      args.push(replaceNamed(ast.args[i], independents, bound))
    return { type: "call", name: ast.name, args: args }
  }
  if (ast.type === "op")
    return {
      type: "op",
      op: ast.op,
      left: replaceNamed(ast.left, independents, bound),
      right: replaceNamed(ast.right, independents, bound)
    }
  if (ast.type === "uop")
    return { type: "uop", op: ast.op, arg: replaceNamed(ast.arg, independents, bound) }
  if (ast.type === "sum") {
    var inner = {}
    for (var k in bound) inner[k] = true
    inner[ast.index] = true
    return {
      type: "sum",
      index: ast.index,
      from: replaceNamed(ast.from, independents, bound),
      to: replaceNamed(ast.to, independents, bound),
      body: replaceNamed(ast.body, independents, inner)
    }
  }
  return ast
}

function collectParams(ast, into) {
  if (!ast) return
  if (ast.type === "param") {
    if (!into[ast.name])
      into[ast.name] = { name: ast.name, value: ast.source !== undefined ? ast.source : 1, kind: ast.source !== undefined ? "number" : "symbol", source: ast.source }
  }
  if (ast.type === "call") {
    for (var i = 0; i < ast.args.length; i++) collectParams(ast.args[i], into)
  }
  if (ast.type === "op") {
    collectParams(ast.left, into)
    collectParams(ast.right, into)
  }
  if (ast.type === "uop") collectParams(ast.arg, into)
  if (ast.type === "sum") {
    collectParams(ast.from, into)
    collectParams(ast.to, into)
    collectParams(ast.body, into)
  }
}

function sliderRange(value) {
  var mag = Math.abs(Number(value))
  if (!isFinite(mag) || mag === 0) mag = 1
  var integer = Math.abs(value - Math.round(value)) < 1e-9
  var min, max, step
  if (integer && mag <= 12) {
    min = -12
    max = 12
    step = 0.1
  } else if (mag <= 1) {
    min = -5
    max = 5
    step = 0.01
  } else if (mag <= 10) {
    min = -20
    max = 20
    step = 0.1
  } else {
    var span = mag * 4
    min = -span
    max = span
    step = mag / 100
  }
  return { min: min, max: max, step: step, integer: false }
}

function pretty(ast) {
  return prettyPrec(ast, 0)
}

function prettyPrec(ast, prec) {
  if (!ast) return ""
  if (ast.type === "num") return formatConst(ast.value)
  if (ast.type === "var") return ast.name === "theta" ? "θ" : ast.name
  if (ast.type === "param") return ast.name === "theta" ? "θ" : ast.name
  if (ast.type === "const") {
    if (ast.name === "pi") return "π"
    if (ast.name === "tau") return "τ"
    if (ast.name === "phi") return "φ"
    return ast.name
  }
  if (ast.type === "uop") {
    var inner = prettyPrec(ast.arg, PREC_UNARY)
    var out = ast.op + inner
    return prec > PREC_UNARY ? "(" + out + ")" : out
  }
  if (ast.type === "call") {
    if (ast.name === "abs" && ast.args.length === 1)
      return "|" + prettyPrec(ast.args[0], 0) + "|"
    var bits = []
    for (var i = 0; i < ast.args.length; i++) bits.push(prettyPrec(ast.args[i], 0))
    return ast.name + "(" + bits.join(", ") + ")"
  }
  if (ast.type === "sum") {
    return "Σ[" + ast.index + "=" + prettyPrec(ast.from, 0) + ".." + prettyPrec(ast.to, 0) + "] "
      + prettyPrec(ast.body, PREC_MUL)
  }
  if (ast.type === "op") {
    var opPrec = ast.op === "^" ? PREC_POW : (ast.op === "+" || ast.op === "-" ? PREC_ADD : PREC_MUL)
    var left = prettyPrec(ast.left, opPrec)
    var right = prettyPrec(ast.right, ast.op === "^" ? opPrec : opPrec + 1)
    var body
    if (ast.op === "*") {
      if (juxtapose(ast.left, ast.right)) body = left + right
      else body = left + " · " + right
    } else if (ast.op === "^") {
      body = left + "^" + right
    } else if (ast.op === "/") {
      body = left + " / " + right
    } else {
      body = left + " " + ast.op + " " + right
    }
    return prec > opPrec ? "(" + body + ")" : body
  }
  return ""
}

function juxtapose(left, right) {
  // Tight juxtaposition is for coefficients sitting on a symbol or call:
  // 2x, 2π, 2sin(x). Named parameters keep the middle dot so `a sin(x)`
  // cannot be misread as the function asin.
  if (left.type === "num") {
    if (right.type === "var" || right.type === "param" || right.type === "const" || right.type === "call")
      return true
  }
  if (left.type === "const") {
    if (right.type === "var" || right.type === "param" || right.type === "call")
      return true
  }
  return false
}

function formatConst(v) {
  if (Math.abs(v - Math.PI) < 1e-12) return "π"
  if (Math.abs(v - Math.E) < 1e-12) return "e"
  if (Math.abs(v - Math.round(v)) < 1e-12) return String(Math.round(v))
  var s = String(v)
  if (s.length > 8) s = v.toPrecision(6)
  return s
}

function callFunc(name, args) {
  var x = args[0]
  switch (name) {
    case "sin": return Math.sin(x)
    case "cos": return Math.cos(x)
    case "tan": return Math.tan(x)
    case "asin": return Math.asin(x)
    case "acos": return Math.acos(x)
    case "atan": return Math.atan(x)
    case "atan2": return Math.atan2(args[0], args[1])
    case "sinh": return Math.sinh(x)
    case "cosh": return Math.cosh(x)
    case "tanh": return Math.tanh(x)
    case "asinh": return Math.asinh(x)
    case "acosh": return Math.acosh(x)
    case "atanh": return Math.atanh(x)
    case "exp": return Math.exp(x)
    case "ln": return Math.log(x)
    case "log": return args.length === 2 ? Math.log(args[0]) / Math.log(args[1]) : Math.log(x)
    case "log10": return Math.log(x) / Math.LN10
    case "log2": return Math.log(x) / Math.LN2
    case "lg": return Math.log(x) / Math.LN10
    case "lb": return Math.log(x) / Math.LN2
    case "sqrt": return Math.sqrt(x)
    case "cbrt": return Math.cbrt(x)
    case "abs": return Math.abs(x)
    case "floor": return Math.floor(x)
    case "ceil": return Math.ceil(x)
    case "round": return Math.round(x)
    case "trunc": return Math.trunc(x)
    case "sign": return Math.sign(x)
    case "frac": return x - Math.trunc(x)
    case "min": return Math.min.apply(Math, args)
    case "max": return Math.max.apply(Math, args)
    case "hypot": return Math.hypot.apply(Math, args)
    case "pow": return Math.pow(args[0], args[1])
    case "sinc": return x === 0 ? 1 : Math.sin(x) / x
    case "sec": return 1 / Math.cos(x)
    case "csc": return 1 / Math.sin(x)
    case "cot": return 1 / Math.tan(x)
    case "sech": return 1 / Math.cosh(x)
    case "csch": return 1 / Math.sinh(x)
    case "coth": return 1 / Math.tanh(x)
    case "deg": return x * 180 / Math.PI
    case "rad": return x * Math.PI / 180
    default: return NaN
  }
}

function evaluate(ast, env) {
  if (!ast) return NaN
  if (ast.type === "num") return ast.value
  if (ast.type === "const") return CONSTANTS[ast.name]
  if (ast.type === "var" || ast.type === "param") {
    var v = env[ast.name]
    return typeof v === "number" ? v : NaN
  }
  if (ast.type === "uop") {
    var a = evaluate(ast.arg, env)
    return ast.op === "-" ? -a : a
  }
  if (ast.type === "call") {
    var args = []
    for (var i = 0; i < ast.args.length; i++) args.push(evaluate(ast.args[i], env))
    return callFunc(ast.name, args)
  }
  if (ast.type === "op") {
    var l = evaluate(ast.left, env)
    var r = evaluate(ast.right, env)
    if (ast.op === "+") return l + r
    if (ast.op === "-") return l - r
    if (ast.op === "*") return l * r
    if (ast.op === "/") return l / r
    if (ast.op === "%") return l % r
    if (ast.op === "^") return Math.pow(l, r)
  }
  if (ast.type === "sum") {
    var from = evaluate(ast.from, env)
    var to = evaluate(ast.to, env)
    if (!isFinite(from) || !isFinite(to)) return NaN
    var lo = Math.round(from)
    var hi = Math.round(to)
    if (hi < lo) return 0
    if (hi - lo + 1 > 256) hi = lo + 255
    var total = 0
    var saved = env[ast.index]
    for (var n = lo; n <= hi; n++) {
      env[ast.index] = n
      total += evaluate(ast.body, env)
    }
    if (saved === undefined) delete env[ast.index]
    else env[ast.index] = saved
    return total
  }
  return NaN
}

function defaultView(usesTrig, usesLog) {
  if (usesTrig) return { xCenter: 0, xHalf: Math.PI * 2 }
  if (usesLog) return { xCenter: 5.05, xHalf: 4.95 }
  return { xCenter: 0, xHalf: 10 }
}

function analyze(source) {
  var raw = String(source || "").replace(/^\s+|\s+$/g, "")
  if (!raw) {
    return { ok: false, error: "Enter an equation", source: raw, expressions: [], params: [], independent: "x", pretty: "", usesTrig: false, usesLog: false }
  }
  try {
    var tokens = tokenize(raw)
    var groups = splitTop(tokens)
    if (!groups.length) throw parseError("Empty equation")
    var trees = []
    for (var g = 0; g < groups.length; g++)
      trees.push(parseOne(groups[g]))

    var varSet = {}
    var callSet = {}
    for (var t = 0; t < trees.length; t++) {
      collectVars(trees[t], varSet)
      collectCalls(trees[t], callSet)
    }
    var lhsNames = []
    for (var gi = 0; gi < groups.length; gi++) lhsNames.push(lhsName(groups[gi]))
    var axes = pickAxes(varSet, lhsNames)
    var independent = axes.independent
    var used = {}
    used[independent] = true
    if (axes.independent2) used[axes.independent2] = true
    used.z = true
    used.r = true
    used.theta = true
    used.sum = true
    used.sigma = true
    for (var cname in CONSTANTS) used[cname] = true
    for (var fname in FUNC_ARITY) used[fname] = true

    var named = []
    for (var vn in varSet) {
      if (!axes.independents[vn]) {
        named.push(vn)
        used[vn] = true
      }
    }
    named.sort()

    var params = []
    var expressions = []
    var pretties = []
    var order = []
    if (axes.kind === "parametric") {
      order = [axes.indexX, axes.indexY]
    } else if (axes.kind === "polar") {
      order = [axes.indexX]
    } else {
      for (var ei = 0; ei < trees.length; ei++) order.push(ei)
    }
    var roles = { polar: ["r"], parametric: ["x", "y"] }
    for (var e = 0; e < order.length; e++) {
      var ti = order[e]
      if (ti < 0 || ti >= trees.length) continue
      var ast = replaceNamed(cloneAst(trees[ti]), axes.independents)
      ast = promoteNumbers(ast, used, params)
      var role = roles[axes.kind] ? roles[axes.kind][e] : "y"
      expressions.push({ ast: ast, pretty: pretty(ast), role: role })
      pretties.push((role === "y" && axes.kind === "cartesian" ? "" : role + " = ") + pretty(ast))
    }
    if (axes.kind === "cartesian") {
      pretties = []
      for (var pe = 0; pe < expressions.length; pe++) pretties.push(expressions[pe].pretty)
    }

    var seen = {}
    var merged = []
    for (var n = 0; n < named.length; n++) {
      var nm = named[n]
      if (seen[nm]) continue
      seen[nm] = true
      var range0 = sliderRange(1)
      merged.push({
        name: nm,
        value: 1,
        min: range0.min,
        max: range0.max,
        step: range0.step,
        integer: false,
        kind: "symbol"
      })
    }
    for (var p = 0; p < params.length; p++) {
      var spec = params[p]
      if (seen[spec.name]) continue
      seen[spec.name] = true
      var range = sliderRange(spec.value)
      if (spec.integer) {
        merged.push({
          name: spec.name,
          value: spec.value,
          min: spec.min !== undefined ? spec.min : 1,
          max: spec.max !== undefined ? spec.max : Math.max(16, spec.value),
          step: 1,
          integer: true,
          kind: spec.kind,
          source: spec.source
        })
      } else {
        merged.push({
          name: spec.name,
          value: spec.value,
          min: range.min,
          max: range.max,
          step: range.step,
          integer: false,
          kind: spec.kind,
          source: spec.source
        })
      }
    }

    var usesTrig = false
    var usesLog = false
    for (var cn in callSet) {
      if (TRIG[cn]) usesTrig = true
      if (LOG_LIKE[cn]) usesLog = true
    }

    var view = defaultView(usesTrig, usesLog)
    var tMin = 0
    var tMax = Math.PI * 2
    if (axes.kind === "polar" || axes.kind === "parametric") {
      if (!usesTrig) tMax = 10
      view = { xCenter: 0, xHalf: axes.kind === "polar" ? 2.5 : 1.6 }
    }
    return {
      ok: true,
      error: "",
      source: raw,
      kind: axes.kind,
      dim: axes.dim,
      independent: independent,
      independent2: axes.independent2,
      output: axes.output,
      expressions: expressions,
      params: merged,
      pretty: pretties.join(" ;  "),
      usesTrig: usesTrig || axes.kind === "polar" || axes.kind === "parametric",
      usesLog: usesLog,
      xCenter: view.xCenter,
      xHalf: view.xHalf,
      tMin: tMin,
      tMax: tMax
    }
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : "Could not parse equation",
      source: raw,
      expressions: [],
      params: [],
      independent: "x",
      pretty: "",
      usesTrig: false,
      usesLog: false
    }
  }
}
