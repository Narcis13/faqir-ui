// @ui:core csp-evaluator

/**
 * The strict-CSP expression evaluator.  [forecraft #50]
 *
 * The default engine compiles every `l-*` expression with `new Function`, which
 * a Content-Security-Policy without `'unsafe-eval'` refuses. This module is the
 * other half of that seam: `scripts/build-core.mjs` swaps it in for the region
 * between `// @faqir:evaluator-start` and `// @faqir:evaluator-end` in
 * `src/core-src/engine.js` when it assembles `faqir-core.csp.js` (and its
 * `.dev.js` twin). The default builds drop the two marker lines and nothing
 * else, so they stay byte-identical.
 *
 * It exports the same two functions with the same contract — a compiled
 * expression is `fn.call(thisArg, $scope, $el, $this)` — but compiles to a
 * syntax tree walked by an interpreter: a lazy tokenizer, a Pratt parser and an
 * evaluator. Nothing here turns a string into code.
 *
 * The language is the JavaScript subset directive expressions actually use
 * (read off the registry, the docs site and the docs, not designed in advance):
 *
 *   literals      numbers, strings, template literals, regex literals,
 *                 true/false/null, arrays and objects (spread, shorthand,
 *                 computed keys, methods, get/set accessors)
 *   operators     member and optional access (`a.b`, `a[b]`, `a?.b`, `a?.()`),
 *                 calls and `new` with spread arguments, every unary, binary
 *                 and logical operator, `??`, the ternary, the comma
 *   assignment    `=` and every compound form (`+=`, `??=`, `&&=` …), `++`/`--`
 *   functions     arrows and `function` expressions, with expression or block
 *                 bodies; plain and rest parameters
 *   statements    `;`-separated expression statements, blocks, `if`/`else`,
 *                 `return`, `var`/`let`/`const`, `for (… of …)`,
 *                 `for (… in …)`, `break`, `continue`
 *
 * Anything else — classes, async/await, generators, destructuring, default
 * parameters, `switch`, `try`, `while`, labels, tagged templates — is a
 * SyntaxError naming the construct, which the engine reports as an expression
 * error naming the expression (the dev build adds a pointer to this subset).
 *
 * Name resolution follows the `with ($scope)` of the default build: local
 * bindings of enclosing interpreted functions, then the scope object (by `in`,
 * so proxies' `has` traps apply), then the `$scope`/`$el`/`$this` parameters,
 * then globals. A function found on the scope is called with the scope as
 * `this`; an unresolvable read throws ReferenceError, `typeof` of one is
 * "undefined", and assigning one creates a global, as sloppy-mode code does.
 *
 * `constructor`, `__proto__` and `prototype` are not reachable as members —
 * statically (a SyntaxError) or computed (a TypeError at run time). That closes
 * the classic reach from any value to `Function` and to shared prototypes; it
 * does not make the subset a sandbox, and expressions remain trusted code.
 *
 * Shape: an ESM module so the unit tests can import it directly; the build
 * strips `export` and injects it into the engine's closure. Everything but the
 * two compile functions lives inside the IIFE, so no name can collide with the
 * engine's.
 */

var cspInterpreter = (function() {
  var G = globalThis;
  var HINT = '';
  /* @faqir:dev */ HINT = ' (the strict-CSP build interprets a subset of JavaScript; see docs/security.md)';

  var FORBID = /^(?:constructor|__proto__|prototype)$/;
  var RESERVED = /^(?:await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|function|if|import|in|instanceof|let|new|null|return|super|switch|this|throw|true|try|typeof|var|void|while|with|yield)$/;
  var ASSIGN = /^(?:[-+*/%&|^]|\*\*|<<|>>>?|&&|\|\||\?\?)?=$/;
  var PUNCT = '>>>= ... === !== **= <<= >>= >>> &&= ||= ??= => == != <= >= && || ?? ?. ++ -- += -= *= /= %= &= |= ^= ** << >>'.split(' ');
  var SINGLE = '{}()[];,<>+-*/%&|^!~?:=.';
  var ESC = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
  var PREC = Object.create(null);
  '?? || && | ^ & ==,!=,===,!== <,>,<=,>=,instanceof,in <<,>>,>>> +,- *,/,% **'.split(' ').forEach(function(g, i) {
    g.split(',').forEach(function(op) { PREC[op] = i + 1; });
  });
  var BRK = {}, CNT = {}, SHORT = {};

  function fail(Err, msg) { throw new Err(msg + HINT); }

  // ── Parser ────────────────────────────────────────────────────────────────
  // A lazy tokenizer driven by the parser: `tok` is the current token and `pos`
  // the offset just past it, which is what lets template literals and regex
  // literals be scanned raw from where the parser stands.
  function parse(src, isExpr) {
    var pos = 0, tok, loops = 0;

    function err(msg) {
      fail(SyntaxError, msg || (tok.t === 'e' ? 'Unexpected end of input'
        : 'Unexpected "' + src.slice(tok.s, pos) + '" at ' + tok.s));
    }

    function sticky(re) { re.lastIndex = pos; var m = re.exec(src); return m && m[0]; }

    function esc() {
      var c = src[pos++], h;
      if (c in ESC) return ESC[c];
      if (c === 'x' || c === 'u') {
        if (c === 'u' && src[pos] === '{') {
          var end = src.indexOf('}', pos);
          h = end < 0 ? '' : src.slice(pos + 1, end);
          pos = end + 1;
        }
        else { h = src.substr(pos, c === 'x' ? 2 : 4); pos += h.length; }
        if (!/^[\da-f]+$/i.test(h)) err('Invalid escape');
        return String.fromCodePoint(parseInt(h, 16));
      }
      if (c === '\r' && src[pos] === '\n') pos++;
      return /[\r\n\u2028\u2029]/.test(c) ? '' : c;
    }

    function next() {
      var nl = false, c, m;
      for (;;) {
        c = src[pos];
        if (c === '/' && src[pos + 1] === '/') { while (pos < src.length && !/[\r\n]/.test(src[pos])) pos++; }
        else if (c === '/' && src[pos + 1] === '*') {
          m = src.indexOf('*/', pos + 2);
          if (m < 0) { tok = { s: pos }; pos = src.length; err('Unterminated comment'); }
          if (/[\r\n]/.test(src.slice(pos, m))) nl = true;
          pos = m + 2;
        }
        else if (c !== undefined && /\s/.test(c)) { if (/[\r\n\u2028\u2029]/.test(c)) nl = true; pos++; }
        else break;
      }
      tok = { s: pos, n: nl };
      if (pos >= src.length) { tok.t = 'e'; return; }
      if (m = sticky(/[A-Za-z_$][\w$]*/y)) { tok.t = 'i'; tok.v = m; pos += m.length; return; }
      if (m = sticky(/(?:0[xX][\da-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y)) {
        tok.t = 'n'; tok.x = Number(m); pos += m.length; return;
      }
      if (c === '"' || c === "'") {
        var s = '';
        for (pos++; src[pos] !== c; ) {
          if (pos >= src.length || /[\r\n]/.test(src[pos])) err('Unterminated string');
          s += src[pos] === '\\' ? (pos++, esc()) : src[pos++];
        }
        pos++; tok.t = 's'; tok.x = s; return;
      }
      if (c === '`') { pos++; tok.t = '`'; return; }
      for (var i = 0; i < PUNCT.length; i++) {
        if (src.startsWith(PUNCT[i], pos) && !(PUNCT[i] === '?.' && /\d/.test(src[pos + 2] || ''))) {
          tok.t = 'p'; tok.v = PUNCT[i]; pos += PUNCT[i].length; return;
        }
      }
      if (SINGLE.indexOf(c) < 0) err('Unexpected character "' + c + '" at ' + pos);
      tok.t = 'p'; tok.v = c; pos++;
    }

    function is(v) { return tok.v === v; }
    function eat(v) { if (tok.v === v) { next(); return true; } }
    function expect(v) { if (!eat(v)) err(); }
    function ident() {
      if (tok.t !== 'i') err();
      if (RESERVED.test(tok.v)) err('Unsupported syntax "' + tok.v + '" at ' + tok.s);
      var v = tok.v; next(); return v;
    }
    function name() {
      if (tok.t !== 'i') err();
      var v = tok.v;
      if (FORBID.test(v)) err('Access to "' + v + '" is forbidden');
      next(); return v;
    }
    function semi() { if (!eat(';') && !is('}') && tok.t !== 'e' && !tok.n) err(); }
    function target(n) { if (n[0] !== 'id' && n[0] !== 'mem') err('Invalid assignment target'); return n; }

    function expr() {
      var e = assign();
      if (!is(',')) return e;
      var l = [e];
      while (eat(',')) l.push(assign());
      return ['seq', l];
    }

    function assign() {
      var a = arrow();
      if (a) return a;
      var l = cond();
      if (tok.t === 'p' && ASSIGN.test(tok.v)) {
        var op = tok.v; target(l); next();
        return ['asg', op, l, assign()];
      }
      return l;
    }

    // `x => …` or `(a, b) => …`: try the parameter list, rewind if it is not one.
    function arrow() {
      var save = pos, st = tok, ps = null;
      try {
        if (tok.t === 'i') ps = [[ident()], 0];
        else if (eat('(')) ps = params(')');
      } catch (e) { ps = null; }
      if (!ps || !is('=>') || tok.n) { pos = save; tok = st; return null; }
      next();
      return is('{') ? ['fn', ps, body(), 0, 1] : ['fn', ps, assign(), 1, 1];
    }

    function cond() {
      var t = bin(0);
      if (!eat('?')) return t;
      var a = assign(); expect(':');
      return ['?', t, a, assign()];
    }

    function bin(min) {
      var l = unary();
      for (;;) {
        var op = tok.v, p = (tok.t === 'p' || tok.t === 'i') && PREC[op];
        if (!p || p <= min) return l;
        next();
        var r = bin(op === '**' ? p - 1 : p);
        l = [op === '&&' || op === '||' || op === '??' ? 'log' : 'bin', op, l, r];
      }
    }

    function unary() {
      var op = tok.v;
      if (tok.t === 'p' && /^[!~+-]$/.test(op) || tok.t === 'i' && /^(?:typeof|void|delete)$/.test(op)) {
        next(); return ['un', op, unary()];
      }
      if (op === '++' || op === '--') { next(); return ['upd', op, 1, target(unary())]; }
      var e = postfix();
      op = tok.v;
      if ((op === '++' || op === '--') && !tok.n) { next(); return ['upd', op, 0, target(e)]; }
      return e;
    }

    function postfix(noCall) {
      var e = primary(), opt = 0, k;
      for (;;) {
        if (eat('.')) e = ['mem', e, name(), 0];
        else if (!noCall && eat('?.')) {
          opt = 1;
          if (eat('(')) e = ['call', e, list(')'), 1];
          else if (eat('[')) { k = expr(); expect(']'); e = ['mem', e, k, 1, 1]; }
          else e = ['mem', e, name(), 1];
        }
        else if (eat('[')) { k = expr(); expect(']'); e = ['mem', e, k, 0, 1]; }
        else if (!noCall && eat('(')) e = ['call', e, list(')'), 0];
        else if (tok.t === '`') err('Unsupported syntax: tagged template');
        else return opt ? ['chain', e] : e;
      }
    }

    function primary() {
      var t = tok, v = t.v;
      if (t.t === 'n' || t.t === 's') { next(); return ['lit', t.x]; }
      if (t.t === '`') return template();
      if (v === '(') { next(); var e = expr(); expect(')'); return e; }
      if (v === '[') { next(); return ['arr', list(']')]; }
      if (v === '{') return object();
      if (v === '/' || v === '/=') return regex();
      if (t.t === 'i') {
        if (v === 'true' || v === 'false' || v === 'null') { next(); return ['lit', v === 'null' ? null : v === 'true']; }
        if (v === 'this') { next(); return ['this']; }
        if (v === 'function') {
          next();
          var fname = tok.t === 'i' ? ident() : null;
          expect('(');
          var f = ['fn', params(')'), body(), 0, 0, fname];
          return f;
        }
        if (v === 'new') {
          next();
          if (is('.')) err('Unsupported syntax "new.target"');
          var c = postfix(1);
          return ['new', c, eat('(') ? list(')') : []];
        }
        return ['id', ident()];
      }
      err();
    }

    // Comma-separated items up to `end`, with `...spread`. Holes are refused.
    function list(end) {
      var l = [];
      while (!eat(end)) {
        l.push(eat('...') ? ['...', assign()] : assign());
        if (!is(end)) expect(',');
      }
      return l;
    }

    function params(end) {
      var ps = [], rest = 0;
      while (!eat(end)) {
        if (rest) err();
        if (eat('...')) rest = 1;
        ps.push(ident());
        if (is('=')) err('Unsupported syntax: default parameter');
        if (!is(end)) expect(',');
      }
      return [ps, rest];
    }

    function body() {
      var outer = loops;
      loops = 0;
      expect('{');
      var b = stmts(1);
      next();
      loops = outer;
      return b;
    }

    function object() {
      next();
      var props = [];
      while (!eat('}')) {
        if (eat('...')) props.push(['...', assign()]);
        else {
          var kt = tok.t, comp = 0, kind = 0, key = propKey();
          if ((key === 'get' || key === 'set') && kt === 'i' && (tok.t === 'i' || tok.t === 's' || tok.t === 'n' || is('['))) {
            kind = key; kt = tok.t; comp = is('['); key = propKey();
          }
          if (kind || is('(')) { expect('('); props.push([kind || 'm', key, comp, ['fn', params(')'), body(), 0, 0]]); }
          else if (eat(':')) props.push([':', key, comp, assign()]);
          else if (kt === 'i' && !comp) { if (RESERVED.test(key)) err(); props.push([':', key, 0, ['id', key]]); }
          else err();
        }
        if (!is('}')) expect(',');
      }
      return ['obj', props];

      function propKey() {
        if (eat('[')) { comp = 1; var k = assign(); expect(']'); return k; }
        var t = tok;
        if (t.t !== 'i' && t.t !== 's' && t.t !== 'n') err();
        next();
        k = t.t === 'i' ? t.v : String(t.x);
        if (k === '__proto__') err('Access to "__proto__" is forbidden');
        return k;
      }
    }

    function template() {
      var q = [], ex = [], s = '', c;
      for (;;) {
        c = src[pos++];
        if (c === undefined) err('Unterminated template literal');
        if (c === '`') break;
        if (c === '\\') s += esc();
        else if (c === '$' && src[pos] === '{') {
          pos++; q.push(s); s = '';
          next(); ex.push(expr());
          if (!is('}')) err();
        }
        else s += c;
      }
      q.push(s);
      next();
      return ['tpl', q, ex];
    }

    function regex() {
      var p = tok.s + 1, cls = 0, c;
      for (;; p++) {
        c = src[p];
        if (c === undefined || /[\r\n]/.test(c)) err('Unterminated regular expression');
        if (c === '\\') p++;
        else if (c === '[') cls = 1;
        else if (c === ']') cls = 0;
        else if (c === '/' && !cls) break;
      }
      var re = src.slice(tok.s + 1, p);
      pos = p + 1;
      var flags = sticky(/[a-z]*/y);
      pos += flags.length;
      new RegExp(re, flags);
      next();
      return ['re', re, flags];
    }

    function stmts(inBlock) {
      var l = [];
      while (inBlock ? !is('}') : tok.t !== 'e') {
        if (tok.t === 'e') err();
        l.push(stmt());
      }
      return l;
    }

    function stmt() {
      var v = tok.t === 'i' || tok.t === 'p' ? tok.v : '', s, t;
      if (v === ';') { next(); return ['emp']; }
      if (v === '{') { next(); s = ['blk', stmts(1)]; next(); return s; }
      if (v === 'function') err('Unsupported syntax: function declaration');
      if (v === 'if') {
        next(); expect('('); t = expr(); expect(')');
        s = ['if', t, stmt(), null];
        if (eat('else')) s[3] = stmt();
        return s;
      }
      if (v === 'return') {
        next();
        s = ['ret', is(';') || is('}') || tok.t === 'e' || tok.n ? null : expr()];
        semi(); return s;
      }
      if (v === 'var' || v === 'let' || v === 'const') {
        next();
        var ds = [];
        do {
          var n = ident(), init = null;
          if (eat('=')) init = assign();
          else if (v === 'const') err('Missing initializer in const declaration');
          ds.push([n, init]);
        } while (eat(','));
        semi();
        return ['var', v, ds];
      }
      if (v === 'for') {
        next(); expect('(');
        var k = tok.v;
        if (!/^(?:var|let|const)$/.test(k)) err('Unsupported syntax: for loop other than for…of / for…in');
        next();
        var id = ident(), o = tok.v;
        if (o !== 'of' && o !== 'in') err('Unsupported syntax: for loop other than for…of / for…in');
        next(); t = expr(); expect(')');
        loops++;
        s = ['for', k, id, o, t, stmt()];
        loops--;
        return s;
      }
      if (v === 'break' || v === 'continue') {
        if (!loops) err('Illegal ' + v + ' statement');
        next(); semi(); return [v];
      }
      s = ['ex', expr()];
      semi();
      return s;
    }

    next();
    if (!isExpr) return stmts(0);
    var e = expr();
    if (tok.t !== 'e') err();
    return e;
  }

  // ── Evaluator ─────────────────────────────────────────────────────────────
  // An environment is `{ v: bindings, p: parent, t: this, r: root, f: isFunction }`.
  // The root is `{ s: scope, pm: the three parameters, t, r: itself }` — the
  // `with ($scope)` and `new Function('$scope', '$el', '$this', …)` of the
  // default build, in that order.

  function env(p, t, f) { return { v: Object.create(null), p: p, t: t, r: p.r, f: f }; }

  function holder(e, n) {
    for (; e.v; e = e.p) if (n in e.v) return e.v;
    if (n in e.s) return e.s;
    if (n in e.pm) return e.pm;
    if (n in G) return G;
  }

  function guard(k) {
    if (typeof k !== 'symbol' && FORBID.test(k = String(k))) fail(TypeError, 'Access to "' + k + '" is forbidden');
    return k;
  }

  function key(n, e) { return n[4] ? guard(ev(n[2], e)) : n[2]; }

  function ref(n, e) { return n[0] === 'id' ? [holder(e, n[1]), n[1], 1] : [ev(n[1], e), key(n, e)]; }

  function get(r) {
    if (r[2] && !r[0]) throw new ReferenceError(r[1] + ' is not defined');
    return r[0][r[1]];
  }

  // Sloppy-mode writes, as the `new Function` body makes them: a refused write
  // (a getter-only magic, a frozen object) is ignored rather than thrown.
  function set(r, v) {
    var o = r[2] && !r[0] ? G : r[0];
    if (o == null) o[r[1]] = v;
    else Reflect.set(Object(o), r[1], v);
    return v;
  }

  function spread(l, e) {
    var out = [];
    for (var i = 0; i < l.length; i++) {
      if (l[i][0] === '...') for (var x of ev(l[i][1], e)) out.push(x);
      else out.push(ev(l[i], e));
    }
    return out;
  }

  // Interpreted functions are real functions, so the engine, the DOM and the
  // standard library can call them: `forEach`, `setTimeout`, `$watch`, getters.
  function fn(n, e) {
    var fe = e, f = n[4]
      ? (...a) => call(n, e, e.t, a)
      : function(...a) { return call(n, fe, this, a); };
    if (n[5]) { fe = env(e, e.t, 0); fe.v[n[5]] = f; }
    return f;
  }

  function call(n, e, t, a) {
    var s = env(e, t, 1), ps = n[1][0];
    for (var i = 0; i < ps.length; i++) {
      s.v[ps[i]] = n[1][1] && i === ps.length - 1 ? a.slice(i) : a[i];
    }
    if (n[3]) return ev(n[2], s);
    var c = run(n[2], s);
    return c ? c.r : undefined;
  }

  function binop(op, a, b) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return a / b;
      case '%': return a % b;
      case '**': return a ** b;
      case '==': return a == b;
      case '!=': return a != b;
      case '===': return a === b;
      case '!==': return a !== b;
      case '<': return a < b;
      case '>': return a > b;
      case '<=': return a <= b;
      case '>=': return a >= b;
      case '&': return a & b;
      case '|': return a | b;
      case '^': return a ^ b;
      case '<<': return a << b;
      case '>>': return a >> b;
      case '>>>': return a >>> b;
      case 'in': return a in b;
      case 'instanceof': return a instanceof b;
    }
  }

  function ev(n, e) {
    var o, v, r, i, h;
    switch (n[0]) {
      case 'lit': return n[1];
      case 'id': return get(ref(n, e));
      case 'this': return e.t;
      case 'tpl':
        for (v = n[1][0], i = 0; i < n[2].length; i++) v += String(ev(n[2][i], e)) + n[1][i + 1];
        return v;
      case 're': return new RegExp(n[1], n[2]);
      case 'arr': return spread(n[1], e);
      case 'obj':
        o = {};
        for (i = 0; i < n[1].length; i++) {
          var p = n[1][i];
          if (p[0] === '...') { Object.assign(o, ev(p[1], e)); continue; }
          var k = p[2] ? guard(ev(p[1], e)) : p[1];
          if (p[0] === ':' || p[0] === 'm') o[k] = p[0] === 'm' ? fn(p[3], e) : ev(p[3], e);
          else Object.defineProperty(o, k, { [p[0]]: fn(p[3], e), enumerable: true, configurable: true });
        }
        return o;
      case 'fn': return fn(n, e);
      case 'seq':
        for (i = 0; i < n[1].length; i++) v = ev(n[1][i], e);
        return v;
      case 'chain': v = ev(n[1], e); return v === SHORT ? undefined : v;
      case 'mem':
        o = ev(n[1], e);
        if (o === SHORT || n[3] && o == null) return SHORT;
        return o[key(n, e)];
      case 'call':
        var c = n[1], t;
        if (c[0] === 'mem') {
          t = ev(c[1], e);
          if (t === SHORT || c[3] && t == null) return SHORT;
          v = t[key(c, e)];
        } else if (c[0] === 'id') {
          r = ref(c, e); v = get(r);
          if (r[0] === e.r.s) t = r[0];
        } else if ((v = ev(c, e)) === SHORT) return SHORT;
        if (n[3] && v == null) return SHORT;
        if (typeof v !== 'function') {
          throw new TypeError((c[0] === 'id' ? c[1] : c[0] === 'mem' && !c[4] ? c[2] : 'expression') + ' is not a function');
        }
        return v.apply(t, spread(n[2], e));
      case 'new': return Reflect.construct(ev(n[1], e), spread(n[2], e));
      case 'un':
        o = n[2];
        if (n[1] === 'typeof') return o[0] === 'id' && !holder(e, o[1]) ? 'undefined' : typeof ev(o, e);
        if (n[1] === 'delete') {
          if (o[0] === 'id') return !(h = holder(e, o[1])) || Reflect.deleteProperty(h, o[1]);
          if (o[0] !== 'mem') return true;
          r = ref(o, e);
          return Reflect.deleteProperty(Object(r[0]), r[1]);
        }
        v = ev(o, e);
        return n[1] === '!' ? !v : n[1] === '-' ? -v : n[1] === '+' ? +v : n[1] === '~' ? ~v : undefined;
      case 'upd':
        r = ref(n[3], e);
        o = +get(r);
        v = n[1] === '++' ? o + 1 : o - 1;
        set(r, v);
        return n[2] ? v : o;
      case 'bin': return binop(n[1], ev(n[2], e), ev(n[3], e));
      case 'log':
        v = ev(n[2], e);
        return (n[1] === '&&' ? v : n[1] === '||' ? !v : v == null) ? ev(n[3], e) : v;
      case '?': return ev(n[1], e) ? ev(n[2], e) : ev(n[3], e);
      case 'asg':
        r = ref(n[2], e);
        var op = n[1];
        if (op === '=') return set(r, ev(n[3], e));
        v = get(r);
        if (!/^(?:&&|\|\||\?\?)=$/.test(op)) return set(r, binop(op.slice(0, -1), v, ev(n[3], e)));
        return (op === '&&=' ? v : op === '||=' ? !v : v == null) ? set(r, ev(n[3], e)) : v;
    }
  }

  function run(l, e) {
    for (var i = 0, c; i < l.length; i++) if (c = exec(l[i], e)) return c;
  }

  function exec(s, e) {
    var t, c, x;
    switch (s[0]) {
      case 'ex': ev(s[1], e); return;
      case 'blk': return run(s[1], env(e, e.t, 0));
      case 'if': return ev(s[1], e) ? exec(s[2], e) : s[3] ? exec(s[3], e) : undefined;
      case 'ret': return { r: s[1] ? ev(s[1], e) : undefined };
      case 'var':
        for (t = e; s[1] === 'var' && !t.f; t = t.p);
        for (x of s[2]) if (x[1] || !(x[0] in t.v)) t.v[x[0]] = x[1] ? ev(x[1], e) : undefined;
        return;
      case 'for':
        var it = ev(s[4], e);
        if (s[3] === 'in') { var ks = []; for (x in it) ks.push(x); it = ks; }
        for (x of it) {
          var b = env(e, e.t, 0);
          for (t = b; s[1] === 'var' && !t.f; t = t.p);
          t.v[s[2]] = x;
          c = exec(s[5], b);
          if (c === BRK) break;
          if (c && c !== CNT) return c;
        }
        return;
      case 'break': return BRK;
      case 'continue': return CNT;
    }
  }

  // ── Compile ───────────────────────────────────────────────────────────────
  var cache = new Map();

  function compile(src, isExpr) {
    var k = (isExpr ? 'expr:' : 'stmt:') + src, f = cache.get(k);
    if (f) return f;
    var ast = parse(src, isExpr);
    f = function($scope, $el, $this) {
      var pm = Object.create(null);
      pm.$scope = $scope; pm.$el = $el; pm.$this = $this;
      var root = { s: $scope, pm: pm, t: this };
      root.r = root;
      var e = env(root, this, 1);
      if (isExpr) return ev(ast, e);
      run(ast, e);
    };
    cache.set(k, f);
    return f;
  }

  return compile;
})();

export function compileExpression(expr) {
  return cspInterpreter(expr, true);
}

export function compileStatement(expr) {
  return cspInterpreter(expr, false);
}
