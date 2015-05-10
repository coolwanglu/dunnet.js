/*

Minimum emacs lisp interpreter for dunnet
Copyright (c) 2015 Lu Wang <coolwanglu@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

(function() {
function assert(condition) {
  if(!condition) throw new Error('assertion failed');
}

function Parser (str) {
  this.s = 'progn\n' + str + '\n)';
  this.idx = 0;
}
Parser.prototype = {
  peak: function(offset) {
    offset = offset || 0;
    assert((0 <= this.idx + offset) && (this.idx + offset < this.s.length));
    return this.s[this.idx + offset];
  },
  advance: function() {
    ++ this.idx;
    return this.peak(-1);
  },
  peak_next_non_space: function() {
    while(' \n\t\f'.indexOf(this.peak()) != -1) this.advance();
    return this.peak();
  },
  advance_word: function() {
    var idx = this.idx;
    while(' \n\t\f)"'.indexOf(this.peak()) === -1) this.advance();
    return this.s.substring(idx, this.idx);
  },
  advance_string: function() {
    var l = [];
    var escapes = {
      a: '\x07',
      b: '\x08',
      t: '\x09',
      n: '\x0a',
      v: '\x0b',
      f: '\x0c',
      r: '\x0d',
      e: '\x1b',
      s: ' ',
      d: '\x7f'
    };
    while(true) {
      var c = this.advance();
      if (c === '"') return { type: 'string', value: l.join('') };
      else if (c === '\\') {
        c = this.advance();
        if(c in escapes) l.push(escapes[c]);
        else if (c != '\n') l.push(c);
      } else l.push(c);
    }
  },
  tokenize: function(get_one) {
    var result = [];
    var stack = [result];
    while(true) {
      var token = null;
      switch(this.peak_next_non_space()) {
        case ';': 
          while(this.advance() != '\n') {} 
          break;
        case '(': 
          this.advance();
          token = this.tokenize();
          break;
        case ')': 
          this.advance(); 
          return result;
        case '"':
          this.advance();
          token = this.advance_string();
          break;
        case '\'':
          this.advance();
          token = { type:'quote', value:this.tokenize(true) };
          break;
        default:
          var word = this.advance_word();
          var try_int = Number(word);
          if(!isNaN(try_int)) token = try_int;
          else if (word === '.') {
            token = null;
            stack.pop(-1);
            stack[stack.length-1].pop(-1);
          } else if (word[0] === '?') {
            assert(word.length === 2);
            token = word.charCodeAt(1);
          } else token = word;
          break;
      }
      if(token != null) {
        if(get_one) return token;
        var tail_list = stack[stack.length-1];
        assert(tail_list.length < 2);
        tail_list.push(token);
        if(tail_list.length === 1) {
          tail_list.push([]);
          stack.push(tail_list[1]);
        }
      }
    }
  },
};

function Scope (parent, map) {
  this.map = map || {};
  this.parent = parent;
}
Scope.prototype = {
  get: function(name) {
    var cur = this;
    while(cur) {
      if(name in cur.map) return cur.map[name];
      cur = cur.parent;
    }
    throw new Error("Cannot find: " + JSON.stringify(name));
  },
  set: function(name, value) {
    this.map[name] = value;
  },
  get_containing_scope: function(name, value) {
    var cur = this;
    while(cur) {
      if(name in cur.map) return cur;
      cur = cur.parent;
    }
    return null;
  }
};

function is_nil(obj) {
  return (obj instanceof Array) && (obj.length === 0);
}

function _car(l) {
  assert(l instanceof Array);
  if(is_nil(l)) return [];
  return l[0];
}

function _caar(l) {
  return _car(_car(l));
}

function _cadr(l) {
  return _car(_cdr(l));
}

function _cdr(l) {
  assert(l instanceof Array);
  if(is_nil(l)) return [];
  assert(l.length === 2);
  return l[1];
}

function _cddr(l) {
  return _cdr(_cdr(l));
}

function _eq(a,b) {
  return Object.is(a, b) ? 't' : [];
}

function _equal(a, b) {
  if(typeof a !== typeof b) return [];
  if(typeof a === 'string' || typeof a === 'number') {
    return (a === b) ? 't' : [];
  } else if(a instanceof Array) {
    if(!(b instanceof Array)) return [];
    if(is_nil(a)) return is_nil(b) ? 't' : [];
    if(is_nil(b)) return [];
    if(is_nil(_equal(_car(a), _car(b)))) return [];
    return _equal(_cdr(a), _cdr(b));
  } else {
    if(a.type !== b.type) return [];
    return (a.value === b.value) ? 't': [];
  }
}

function list_for_each(_, l, f) {
  while(true) {
    if(is_nil(l)) return;
    f(_, _car(l));
    l = _cdr(l);
  }
}

var Stack = [];
function interpret(_, obj, scope) {
  assert(scope);
  if(obj instanceof Array) {
    if(is_nil(obj)) return [];
    var f = interpret(_, _car(obj), scope);
    if(is_nil(f)) throw new Error("Unknown function:" + JSON.stringify(_car(obj)));
    if(f instanceof Function) {
      return f(_, _cdr(obj), scope);
    } else if (f.type === 'function') {
      var func_scope = new Scope(scope);
      var cur_arg = f.args;
      var cur_value = _cdr(obj);
      while(true) {
        if(cur_arg.length > 0) {
           func_scope.set(_car(cur_arg), interpret(_, _car(cur_value), scope));
           if(cur_arg.length > 1) {
             cur_arg = _cdr(cur_arg);
             cur_value = _cdr(cur_value);
           } else break;
        } else break;
      }
      Stack.push(f.name);
      var result = [];
      list_for_each(_, f.body, function(_, item) {
        result = interpret(_, item, func_scope);
      });
      Stack.pop(-1);
      return result;
    } else {
      throw new Error("Cannot run function " + JSON.stringify(obj) + ' -- ' + JSON.stringify(f));
    }
  } else if (typeof obj === 'string') {
    return scope.get(obj);
  } else if (obj.type === 'quote') {
    return obj.value;
  } else if (['string', 'vector'].indexOf(obj.type) != -1) {
    return obj;
  } else if (typeof obj === 'number') {
    return obj;
  } else {
    throw new Error("Cannot interpret " + JSON.stringify(obj));
  }
}

var Global = new Scope(null, {
  nil: [],
  t: 't',

  'emacs-version': { type: 'string', value: '22.1.1' },
  'noninteractive': 't',

  '+': function(_, obj, scope) {
    var r = 0;
    list_for_each(_, obj, function(_, item) {
      var v = interpret(_, item, scope);
      assert(typeof v === 'number');
      r += v;
    });
    return r;
  },

  '-': function(_, obj, scope) {
    var r = 0;
    var first = true;
    list_for_each(_, obj, function(_, item) {
      var v = interpret(_, item, scope);
      assert(typeof v === 'number');
      if(first) {
        first = false;
        r += v;
      } else r -= v;
    });
    return r;
  },

  '1+': function(_, obj, scope) {
    var v = interpret(_, _car(obj), scope);
    assert(typeof v === 'number');
    return v + 1;
  },

  '<': function(_, obj, scope) {
    var v1 = interpret(_, _car(obj), scope);
    assert(typeof v1 === 'number');
    var v2 = interpret(_, _cadr(obj), scope);
    if(!(typeof v2 === 'number')) console.log(v1, v2, obj);
    assert(typeof v2 === 'number');
    return (v1 < v2) ? 't' : [];
  },

  '=': function(_, obj, scope) {
    var v1 = interpret(_, _car(obj), scope);
    assert(typeof v1 === 'number');
    var v2 = interpret(_, _cadr(obj), scope);
    assert(typeof v2 === 'number');
    return (v1 === v2) ? 't' : [];
  },

  '>': function(_, obj, scope) {
    var v1 = interpret(_, _car(obj), scope);
    assert(typeof v1 === 'number');
    var v2 = interpret(_, _cadr(obj), scope);
    if(!(typeof v2 === 'number')) console.log(v1, v2, obj);
    assert(typeof v2 === 'number');
    return (v1 > v2) ? 't' : [];
  },

  '>=': function(_, obj, scope) {
    var v1 = interpret(_, _car(obj), scope);
    assert(typeof v1 === 'number');
    var v2 = interpret(_, _cadr(obj), scope);
    if(!(typeof v2 === 'number')) console.log(v1, v2, obj);
    assert(typeof v2 === 'number');
    return (v1 >= v2) ? 't' : [];
  },

  abs: function(_, obj, scope) {
    var v = interpret(_, _car(obj), scope);
    assert(typeof v === 'number');
    return Math.abs(v);
  },

  and: function(_, obj, scope) {
    var r = 't';
    while(true) {
      if(is_nil(obj)) return r;
      r = interpret(_, _car(obj), scope);
      if(is_nil(r)) return [];
      obj = _cdr(obj);
    }
  },

  append: function(_, obj, scope) {
    var l1 = interpret(_, _car(obj), scope);
    var l2 = interpret(_, _cadr(obj), scope);

    var l = l1;
    if(is_nil(l)) return l2;
    while(!is_nil(_cdr(l))) l = _cdr(l);
    l[1] = l2;

    return l1;
  },

  aref: function(_, obj, scope) {
    var a = interpret(_, _car(obj), scope);
    assert(a.type === 'vector' || a.type === 'string');
    var i = interpret(_, _cadr(obj), scope);
    assert(typeof i === 'number');
    return a.value[i];
  },
  
  aset: function(_, obj, scope) {
    var a = interpret(_, _car(obj), scope);
    assert(a.type === 'vector');
    var i = interpret(_, _cadr(obj), scope);
    assert(typeof i === 'number');
    var v = interpret(_, _cadr(_cdr(obj)), scope);
    a.value[i] = v;
    return v;
  },

  assq: function(_, obj, scope) {
   var k = interpret(_, _car(obj), scope);
   var l = interpret(_, _cadr(obj), scope);

   assert(l instanceof Array);
   while(true) {
     if(is_nil(l)) return [];
     if(!is_nil(_eq(k, _caar(l)))) return _car(l);
     l = _cdr(l);
   }
  },

  car: function(_, obj, scope) {
    var l = interpret(_, _car(obj), scope);
    return _car(l);
  },

  cadr: function(_, obj, scope) {
    var l = interpret(_, _car(obj), scope);
    return _car(_cdr(l));
  },

  cdr: function(_, obj, scope) {
    var l = interpret(_, _car(obj), scope);
    return _cdr(l);
  },

  concat: function(_, obj, scope) {
    var v1 = interpret(_, _car(obj), scope);
    assert(v1.type === 'string');
    var v2 = interpret(_, _cadr(obj), scope);
    assert(v2.type === 'string');
    return {
      type: 'string',
      value: v1.value + v2.value
    };
  },

  debug: function(_, obj, scope) {
    console.log(interpret(_, _car(obj), scope));
  },

  defconst: function(_, obj, scope) {
    var sym = _car(obj);
    Global.set(sym, interpret(_, _cadr(obj), scope));
    return sym;
  },
      
  defcustom: function(_) { return []; },

  'define-key': function(_, obj, scope) {
    var km = interpret(_, _car(obj), scope);
    assert(_car(km) === 'keymap');

    var key = interpret(_, _cadr(obj), scope);
    assert(key.type === 'string');
    key = key.value.charCodeAt(0);
    var def = interpret(_, _cadr(_cdr(obj)), scope);

    if(_cadr(km) instanceof Array) { // sparse
      var l = km;
      while(true) {
        if(is_nil(_cdr(l))) {
          l[1] = [key, def];
          break;
        }
        l = _cdr(l);
        var entry = _car(l);
        if(entry[0] === key) {
          entry[1] = def;
          break;
        }
      }
    } else { // keymap
      assert(_cadr(km).type === 'vector');
      _cadr(km).value[key] = def;
    }
    return def;
  },

  defgroup: function(_) { return []; },

  defun: function(_, obj, scope) {
    var name = _car(obj);
    var func = {
      name: name,
      type: 'function',
      args: _cadr(obj),
      body: _cddr(obj)
    };
    scope.set(name, func);
    return func;
  },

  defvar: function(_, obj, scope) {
    var sym = _car(obj);
    Global.set(sym, interpret(_, _cadr(obj), scope));
    return sym;
  },

  dolist: function(_, obj, scope) {
    var arg = _car(obj);
    assert(arg instanceof Array);
    var v = _car(arg);
    assert(typeof v === 'string');
    var list = interpret(_, _cadr(arg), scope);
    assert(list instanceof Array);
    var s = new Scope(scope);
    list_for_each(_, list, function(_, item) {
      s.set(v, item);
      list_for_each(_, _cdr(obj), function(_, item) {
        interpret(_, item, s);
      });
    });
    return s.get(_cadr(_cdr(arg)));
  },

  downcase: function(_, obj, scope) {
    var v = interpret(_, _car(obj), scope);
    assert(typeof v === 'number' || v.type === 'string');
    if(v.type === 'string') {
      return {
        type: 'string',
        value: v.value.toLowerCase()
      };
    } else {
      return String.fromCharCode(v).toLowerCase().charCodeAt(0);
    }
  },

  eq: function(_, obj, scope) {
    var v1 = interpret(_, _car(obj), scope);
    var v2 = interpret(_, _cadr(obj), scope);
    return _eq(v1, v2);
  },

  eval: function(_, obj, scope) {
    return interpret(_, interpret(_, _car(obj), scope), scope);
  },

  'eval-when-compile': function(_) { return []; },

  fset: function(_, obj, scope) {
    var fn = interpret(_, _car(obj), scope);
    assert(typeof fn === 'string');
    var fn2 = interpret(_, _cadr(obj), scope);
    assert(typeof fn2 === 'string');

    var s = scope.get_containing_scope(fn) || Global;
    s.set(fn, scope.get(fn2));
    return fn2;
  },

  if: function(_, obj, scope) {
    if(is_nil(interpret(_, _car(obj), scope))) {
      var r = [];
      list_for_each(_, _cddr(obj), function(_, item) {
        r = interpret(_, item, scope);
      });
      return r;
    } else {
      return interpret(_, _cadr(obj), scope);
    }
  },

  intern: function(_, obj, scope) {
    var s = interpret(_, _car(obj), scope);
    if(s.type !== 'string') console.log(s);
    assert(s.type === 'string');
    return s.value;
  },

  let: function(_, obj, scope) {
    var let_scope = new Scope(scope);
    list_for_each(_, _car(obj), function(_, item) {
      if(typeof item === 'string') let_scope.set(item, []);
      else let_scope.set(_car(item), interpret(_, _cadr(item), let_scope));
    });
    var r = [];
    list_for_each(_, _cdr(obj), function(_, item) {
      r = interpret(_, item, let_scope);
    });
    return r;
  },

  list: function(_, obj, scope) {
    var result = [];
    var l = result;
    list_for_each(_, obj, function(_, item) {
      l.push(interpret(_, item, scope), []);
      l = l[1];
    });
    return result;
  },

  'make-sparse-keymap': function(_, obj, scope) {
    return ["keymap", []];
  },

  'make-keymap': function(_, obj, scope) {
    var km = [];
    for(var i = 0; i < 256; ++i)
      km.push([]);
    return ["keymap", [{
      type: 'vector',
      value: km
    }, []]];
  },

  'make-vector': function(_, obj, scope) {
    var r = [];
    var len = interpret(_, _car(obj), scope);
    assert(typeof len === 'number');
    var o = interpret(_, _cadr(obj), scope);
    for(var i = 0; i < len; ++i)
      r.push(o);
    return {
      type: 'vector',
      value: r
    }
  },

  member: function(_, obj, scope) {
    var e = interpret(_, _car(obj), scope);
    var l = interpret(_, _cadr(obj), scope);
    assert(l instanceof Array);
    while(true) {
      if(is_nil(l)) return [];
      if(!is_nil(_equal(e, _car(l)))) return l;
      l = _cdr(l);
    }
  },

  not: function(_, obj, scope) {
    return (is_nil(interpret(_, _car(obj), scope)) ? 't' : []);
  },

  nth: function(_, obj, scope) {
    var n = interpret(_, _car(obj), scope);
    assert(typeof n === 'number');
    var l = interpret(_, _cadr(obj), scope);
    assert(l instanceof Array);
    for(var i = 0; i < n; ++i) {
      if(is_nil(l)) return [];
      l = _cdr(l);
    }
    return _car(l);
  },

  nthcdr: function(_, obj, scope) {
    var n = interpret(_, _car(obj), scope);
    assert(typeof n === 'number');
    var l = interpret(_, _cadr(obj), scope);
    assert(l instanceof Array);
    for(var i = 0; i < n; ++i) {
      if(is_nil(l)) return [];
      l = _cdr(l);
    }
    return l;
  },

  or: function(_, obj, scope) {
    while(true) {
      if(is_nil(obj)) return [];
      var r = interpret(_, _car(obj), scope);
      if(!is_nil(r)) return r;
      obj = _cdr(obj);
    }
  },

  'prin1-to-string': function(_, obj, scope) {
    var v = interpret(_, _car(obj), scope);
    if(typeof v === 'string') {
    } else if (typeof v === 'number') {
      v = v.toString();
    } else assert(false);
    return { 
      type: 'string', 
      value: v
    };
  },

  progn: function(_, obj, scope) {
    var r = [];
    list_for_each(_, obj, function(_, item){ 
      r = interpret(_, item, scope); 
    });
    return r;
  },

  quote: function(_, obj, scope) {
    return {
      type: 'quote',
      value: obj
    };
  },

  random: function(_, obj, scope) {
    var n = interpret(_, _car(obj), scope);
    assert(is_nil(n) || n === 't' || typeof n === 'number');
    var N = (typeof n === 'number') ? n : (1 << 31);
    return Math.floor(Math.random() * N);
  },

  'read-from-minibuffer': function(_, obj, scope) {
    var prmpt = interpret(_, _car(obj), scope);
    assert(prmpt.type === 'string');
    assert(prmpt.value === '');
    var init = interpret(_, _cadr(obj), scope);
    assert(is_nil(init));
    var keymap = interpret(_, _car(_cddr(obj)), scope);      
    assert(keymap[0] == 'keymap');
    return READLINE(_);
  },

  rplaca: function(_, obj, scope) {
    var l = interpret(_, _car(obj), scope);
    assert(l instanceof Array);
    var newcar = interpret(_, _cadr(obj), scope);
    l[0] = newcar;
    return newcar;
  },

  'send-string-to-terminal': function(_, obj, scope) {
    var s = interpret(_, _car(obj), scope);
    assert(s.type === 'string');
    document.getElementById('terminal').textContent += s.value;
  },

  setq: function(_, obj, scope) {
    var sym = _car(obj);
    var s = scope.get_containing_scope(sym) || Global;
    var r = interpret(_, _cadr(obj), scope);
    s.set(sym, r);
    return r;
  },

  'string-match': function(_, obj, scope) {
    var regexp = interpret(_, _car(obj), scope);
    assert(regexp.type === 'string');
    var s = interpret(_, _cadr(obj), scope);
    assert(s.type === 'string');
    var idx = s.value.search(new RegExp(regexp.value));
    return (idx === -1) ? [] : idx;
  },

  'string=': function(_, obj, scope) {
    var v1 = interpret(_, _car(obj), scope);
    assert((typeof v1 === 'string') || (v1.type === 'string'));
    if(v1.type === 'string') v1 = v1.value;
    var v2 = interpret(_, _cadr(obj), scope);
    assert((typeof v2 === 'string') || (v2.type === 'string'));
    if(v2.type === 'string') v2 = v2.value;
    return (v1 === v2) ? 't' : [];
  },

  stringp: function(_, obj, scope) {
    var s = interpret(_, _car(obj), scope);
    return (s.type === 'string') ? 't' : [];
  },

  substring: function(_, obj, scope) {
    var v1 = interpret(_, _car(obj), scope);
    assert(v1.type === 'string');
    var v2 = interpret(_, _cadr(obj), scope);
    assert(typeof v2 === 'number');
    var v3 = interpret(_, _cadr(_cdr(obj)), scope);
    assert(is_nil(v3) || typeof v3 === 'number');
    if(is_nil(v3)) v3 = v1.value.length;
    return {
      type: 'string',
      value: v1.value.substring(v2, v3)
    };
  },

  unless: function(_, obj, scope) {
    if(is_nil(interpret(_, _car(obj), scope))) {
      var r = [];
      list_for_each(_, _cdr(obj), function(_, item){ 
        r = interpret(_, item, scope); 
      });
      return r;
    } else {
      return [];
    }
  },

  upcase: function(_, obj, scope) {
    var v = interpret(_, _car(obj), scope);
    assert(typeof v === 'number' || v.type === 'string');
    if(v.type === 'string') {
      return {
        type: 'string',
        value: v.value.toUpperCase()
      };
    } else {
      return String.fromCharCode(v).toUpperCase().charCodeAt(0);
    }
  },

  while: function(_, obj, scope) {
    var r  = [];
    while(!is_nil(interpret(_, _car(obj), scope))) {
      list_for_each(_, _cdr(obj), function(_, item) {
        r = interpret(_, item, scope);
      });
    }
    return r;
  }
});

Global.set([], []);

function READLINE(callback) {
  READLINE_CALLBACK = function(s) {
    callback(null, { type: 'string', value: s });
  };
};
var READLINE_CALLBACK = null;

document.addEventListener('DOMContentLoaded', function(){
  document.getElementById('input').addEventListener('keyup', function(e) {
    if(e.keyCode != 13) return;
    if(!READLINE_CALLBACK) return;
    var s = e.target.value;
    e.target.value = '';
    e.preventDefault();
    var cb = READLINE_CALLBACK;
    READLINE_CALLBACK = null;
    cb(s);
  });

  function onexit () {
    console.log('game over');
  }

  var xhr = new XMLHttpRequest();
  xhr.onload = function() {
    try {
      interpret(onexit, new Parser(this.responseText).tokenize(), Global);
    } catch (e) {
      console.log(Stack);
      throw e;
    }
  };
  xhr.open('get', 'dunnet.el?' + Math.random(), true);
  xhr.overrideMimeType("text/plain");
  xhr.send();
});

})();
