/*
Minimum emacs lisp interpreter 
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

var MELI = (function() {
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
      a: 0x07,
      b: 0x08,
      t: 0x09,
      n: 0x0a,
      v: 0x0b,
      f: 0x0c,
      r: 0x0d,
      e: 0x1b,
      s: 0x20,
      d: 0x7f
    };
    while(true) {
      var c = this.advance();
      if (c === '"') return { type: 'string', value: l };
      else if (c === '\\') {
        c = this.advance();
        if(c in escapes) l.push(escapes[c]);
        else if (c != '\n') l.push(c.charCodeAt(0));
      } else l.push(c.charCodeAt(0));
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
          token = ['quote', [this.tokenize(true), []]];
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
          } else if (word === 'nil') {
            token = [];
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

function _is_nil(obj) {
  return (obj instanceof Array) && (obj.length === 0);
}

function _car(l) {
  assert(l instanceof Array);
  if(_is_nil(l)) return [];
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
  if(_is_nil(l)) return [];
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
    if(_is_nil(a)) return _is_nil(b) ? 't' : [];
    if(_is_nil(b)) return [];
    if(_is_nil(_equal(_car(a), _car(b)))) return [];
    return _equal(_cdr(a), _cdr(b));
  } else {
    if(a.type !== b.type) return [];
    return (a.value === b.value) ? 't': [];
  }
}

function _list_for_each(_, l, f) {
  while(true) {
    if(_is_nil(l)) return;
    f(_, _car(l));
    l = _cdr(l);
  }
}

function _array_to_string(a) {
  return String.fromCharCode.apply(null, a);
}

function _string_to_array(s) {
  var a = [];
  for(var i = 0, l = s.length; i < l; ++i)
    a.push(s.charCodeAt(i));
  return a;
}

function _repr_array(v, no_delimiter) {
  var r = '';
  var first = true;
  while(true) {
    if(first) first = false;
    else r += ' ';
    r += _repr(_car(v), no_delimiter);
    v = _cdr(v);
    if(_is_nil(v)) return r;
    if(v instanceof Array) continue;
    else return r + ' . ' + _repr(v, no_delimiter);
  }
}

function _repr(v, no_delimiter) {
  if(typeof v === 'string') {
    return v;
  } else if (typeof v === 'number') {
    return v.toString();
  } else if (_is_nil(v)) {
    return 'nil';
  } else if (v instanceof Array) {
    return '(' + _repr_array(v, no_delimiter) + ')'; 
  } else if (v.type === 'string') {
    var s = _array_to_string(v.value)
       .replace('\\', '\\\\')
       .replace('"', '\\"')
       .replace('\x07', '\\a')
       .replace('\x08', '\\b')
       .replace('\x09', '\\t')
       .replace('\x0a', '\\n')
       .replace('\x0b', '\\v')
       .replace('\x0c', '\\f')
       .replace('\x0d', '\\r')
       .replace('\x1b', '\\e')
       .replace('\x7f', '\\d')
       ;
    return no_delimiter ? s : ('"' + s + '"');
  } else {
    console.log(v);
    assert(false);
  }
}

var Stack = [];
function _interpret(_, obj, scope) {
  assert(scope);
  if(obj instanceof Array) {
    if(_is_nil(obj)) return [];
    var funcname = _car(obj);
    assert(typeof funcname === 'string');
    if(!(funcname in Functions)) {
      window.debug_scope = scope;
      console.log(scope);
      throw new Error("Unknown function:" + JSON.stringify(_car(obj)));
    }
    var f = Functions[funcname];
    if(f instanceof Function) {
      Stack.push(f.name);
      var r = f(_, _cdr(obj), scope);
      Stack.pop(-1);
      return r;
    } else if (f.type === 'function') {
      var func_scope = new Scope(scope);
      var cur_arg = f.args;
      var cur_value = _cdr(obj);
      while(true) {
        if(cur_arg.length > 0) {
           func_scope.set(_car(cur_arg), _interpret(_, _car(cur_value), scope));
           if(cur_arg.length > 1) {
             cur_arg = _cdr(cur_arg);
             cur_value = _cdr(cur_value);
           } else break;
        } else break;
      }
      Stack.push(f.name);
      var result = [];
      _list_for_each(_, f.body, function(_, item) {
        result = _interpret(_, item, func_scope);
      });
      Stack.pop(-1);
      return result;
    } else {
      throw new Error("Cannot run function " + JSON.stringify(obj) + ' -- ' + JSON.stringify(f));
    }
  } else if (typeof obj === 'string') {
    return scope.get(obj);
  } else if (['string', 'vector'].indexOf(obj.type) != -1) {
    return obj;
  } else if (typeof obj === 'number') {
    return obj;
  } else {
    throw new Error("Cannot _interpret " + JSON.stringify(obj));
  }
}

var _readline = function _readline(callback) {
  var line = window.prompt('') || '';
  setTimeout(function() {
    callback(line);
  }, 1);
};

var _print = function _print(str) {
  console.log(str);
};

var _default_buffer_name = '*scratch*';
var Buffers = {};
var _cur_buffer = _get_or_create_buffer(_default_buffer_name);
function _get_or_create_buffer(name) {
  if(!(name in Buffers)) {
    Buffers[name] = { type: 'buffer', value: [], name: name };
  }
  return Buffers[name];
}

var Global = new Scope(null, {
  nil: [],
  t: 't',

  'emacs-version': { type: 'string', value: _string_to_array('22.1.1') },
  'noninteractive': 't',
});

Global.set([], []);

var Functions = {
  '*': function MULTIPLY(_, obj, scope) {
    var r = 1;
    _list_for_each(_, obj, function(_, item) {
      var v = _interpret(_, item, scope);
      assert(typeof v === 'number');
      r *= v;
    });
    return r;
  },

  '+': function PLUS(_, obj, scope) {
    var r = 0;
    _list_for_each(_, obj, function(_, item) {
      var v = _interpret(_, item, scope);
      assert(typeof v === 'number');
      r += v;
    });
    return r;
  },

  '-': function MINUS(_, obj, scope) {
    var r = 0;
    var first = true;
    _list_for_each(_, obj, function(_, item) {
      var v = _interpret(_, item, scope);
      assert(typeof v === 'number');
      if(first) {
        first = false;
        r += v;
      } else r -= v;
    });
    return r;
  },

  '1+': function ONEPLUS(_, obj, scope) {
    var v = _interpret(_, _car(obj), scope);
    assert(typeof v === 'number');
    return v + 1;
  },

  '<': function LESS_THAN(_, obj, scope) {
    var v1 = _interpret(_, _car(obj), scope);
    assert(typeof v1 === 'number');
    var v2 = _interpret(_, _cadr(obj), scope);
    if(!(typeof v2 === 'number')) console.log(v1, v2, obj);
    assert(typeof v2 === 'number');
    return (v1 < v2) ? 't' : [];
  },

  '=': function EQUAL(_, obj, scope) {
    var v1 = _interpret(_, _car(obj), scope);
    assert(typeof v1 === 'number');
    var v2 = _interpret(_, _cadr(obj), scope);
    assert(typeof v2 === 'number');
    return (v1 === v2) ? 't' : [];
  },

  '>': function GREATER_THAN(_, obj, scope) {
    var v1 = _interpret(_, _car(obj), scope);
    assert(typeof v1 === 'number');
    var v2 = _interpret(_, _cadr(obj), scope);
    if(!(typeof v2 === 'number')) console.log(v1, v2, obj);
    assert(typeof v2 === 'number');
    return (v1 > v2) ? 't' : [];
  },

  '>=': function GREATER_THAN_OR_EQUAL_TO(_, obj, scope) {
    var v1 = _interpret(_, _car(obj), scope);
    assert(typeof v1 === 'number');
    var v2 = _interpret(_, _cadr(obj), scope);
    if(!(typeof v2 === 'number')) console.log(v1, v2, obj);
    assert(typeof v2 === 'number');
    return (v1 >= v2) ? 't' : [];
  },

  abs: function abs(_, obj, scope) {
    var v = _interpret(_, _car(obj), scope);
    assert(typeof v === 'number');
    return Math.abs(v);
  },

  and: function and(_, obj, scope) {
    var r = 't';
    while(true) {
      if(_is_nil(obj)) return r;
      r = _interpret(_, _car(obj), scope);
      if(_is_nil(r)) return [];
      obj = _cdr(obj);
    }
  },

  append: function append(_, obj, scope) {
    var l1 = _interpret(_, _car(obj), scope);
    var l2 = _interpret(_, _cadr(obj), scope);

    var l = l1;
    if(_is_nil(l)) return l2;
    while(!_is_nil(_cdr(l))) l = _cdr(l);
    l[1] = l2;

    return l1;
  },

  aref: function aref(_, obj, scope) {
    var a = _interpret(_, _car(obj), scope);
    assert(a.type === 'vector' || a.type === 'string');
    var i = _interpret(_, _cadr(obj), scope);
    assert(typeof i === 'number');
    return a.value[i];
  },
  
  aset: function aset(_, obj, scope) {
    var a = _interpret(_, _car(obj), scope);
    var i = _interpret(_, _cadr(obj), scope);
    assert(typeof i === 'number');
    var v = _interpret(_, _cadr(_cdr(obj)), scope);
    assert(a.type === 'vector' || a.type === 'string');
    a.value[i] = v;
    return v;
  },

  assq: function assq(_, obj, scope) {
   var k = _interpret(_, _car(obj), scope);
   var l = _interpret(_, _cadr(obj), scope);

   assert(l instanceof Array);
   while(true) {
     if(_is_nil(l)) return [];
     if(!_is_nil(_eq(k, _caar(l)))) return _car(l);
     l = _cdr(l);
   }
  },

  'boundp': function boundp(_, obj, scope) {
    var s = _interpret(_, _car(obj), scope);
    assert(typeof s === 'string');
    return scope.get_containing_scope(s) ? 't' : [];
  },

  'buffer-substring': function buffer_substring(_, obj, scope) {
    var start = _interpret(_, _car(obj), scope);
    assert(typeof start === 'number');
    var end = _interpret(_, _cadr(obj), scope);
    assert(typeof end === 'number');
    return { 
      type: 'string',
      value: _cur_buffer.value.slice(start - 1, end - 1)
    };
  },

  car: function car(_, obj, scope) {
    var l = _interpret(_, _car(obj), scope);
    return _car(l);
  },

  cadr: function cadr(_, obj, scope) {
    var l = _interpret(_, _car(obj), scope);
    return _car(_cdr(l));
  },

  cdr: function cdr(_, obj, scope) {
    var l = _interpret(_, _car(obj), scope);
    return _cdr(l);
  },

  concat: function concat(_, obj, scope) {
    var r = [];
    _list_for_each(_, obj, function(_, item) {
      var v = _interpret(_, item, scope);
      assert(v.type === 'string');
      r = r.concat(v.value);
    });
    return {
      type: 'string',
      value: r
    };
  },

  cond: function cond(_, obj, scope) {
    var result = [];
    while(!_is_nil(obj)) {
      var clause = _car(obj);
      result = _interpret(_, _car(clause), scope);
      if(!_is_nil(result)) {
        while(true) {
          clause = _cdr(clause);
          if(_is_nil(clause)) break;
          result = _interpret(_, _car(clause), scope);
        }
        break;
      }
      obj = _cdr(obj);
    }
    return result;
  },

  'condition-case': function condition_case(_, obj, scope) {
    assert(_is_nil(_interpret(_, _car(obj), scope)));
    assert(_caar(_cddr(obj)) === 'error');
    var r;
    try{
      r = _interpret(_, _cadr(obj), scope);
    } catch (ex) {
      console.log(ex.message);
      r = _interpret(_, _cadr(_car(_cddr(obj))), scope);
    }
    return r;
  },

  'current-buffer': function current_buffer(_, obj, scope) {
    return _cur_buffer;
  },

  'current-time-string': function current_time_string(_, obj, scope) {
    var now = new Date();
    function to_2s(v) { return ((v < 10) ? '0' : '') + v; }
    return { 
      type: 'string', 
      value: _string_to_array(
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()] + ' ' + 
        ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()] + ' ' +
        to_2s(now.getDate()) + ' ' + 
        to_2s(now.getHours()) + ':' + 
        to_2s(now.getMinutes()) + ':' + 
        to_2s(now.getSeconds()) + ' ' + 
        now.getFullYear()
      )
    }
  },

  DEBUG: function DEBUG(_, obj, scope) {
    console.log('DEBUG', _interpret(_, _car(obj), scope));
  },

  defconst: function defconst(_, obj, scope) {
    var sym = _car(obj);
    Global.set(sym, _interpret(_, _cadr(obj), scope));
    return sym;
  },
      
  defcustom: function defcustom(_, obj, scope) { 
    var sym = _car(obj);
    Global.set(sym, _interpret(_, _cadr(obj), scope));
    return sym;
  },

  'define-key': function define_key(_, obj, scope) {
    var km = _interpret(_, _car(obj), scope);
    assert(_car(km) === 'keymap');

    var key = _interpret(_, _cadr(obj), scope);
    assert(key.type === 'string');
    key = key.value[0];
    var def = _interpret(_, _cadr(_cdr(obj)), scope);

    if(_cadr(km) instanceof Array) { // sparse
      var l = km;
      while(true) {
        if(_is_nil(_cdr(l))) {
          l[1] = [[key, def], []];
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

  defgroup: function defgroup(_) { return []; },

  defun: function defun(_, obj, scope) {
    var name = _car(obj);
    var func = {
      name: name,
      type: 'function',
      args: _cadr(obj),
      body: _cddr(obj)
    };
    Functions[name] = func;
    return func;
  },

  defvar: function defvar(_, obj, scope) {
    var sym = _car(obj);
    Global.set(sym, _interpret(_, _cadr(obj), scope));
    return sym;
  },

  'delete-file': function delete_file(_, obj, scope) {
    var fn = _interpret(_, _car(obj), scope);
    assert(fn.type === 'string');
    fn = _array_to_string(fn.value);
    if(typeof localStorage !== 'undefined') {
      delete localStorage['DUNNET-JS-FILE-' + fn];
    }
    return [];
  },

  dolist: function dolist(_, obj, scope) {
    var arg = _car(obj);
    assert(arg instanceof Array);
    var v = _car(arg);
    assert(typeof v === 'string');
    var list = _interpret(_, _cadr(arg), scope);
    if(!(list instanceof Array)) console.log(list);
    assert(list instanceof Array);
    var s = new Scope(scope);
    _list_for_each(_, list, function(_, item) {
      s.set(v, item);
      _list_for_each(_, _cdr(obj), function(_, item) {
        _interpret(_, item, s);
      });
    });
    return s.get(_cadr(_cdr(arg)));
  },

  downcase: function downcase(_, obj, scope) {
    var v = _interpret(_, _car(obj), scope);
    assert(typeof v === 'number' || v.type === 'string');
    if(v.type === 'string') {
      return {
        type: 'string',
        value: v.value.map(function(v) {
          return String.fromCharCode(v).toLowerCase().charCodeAt(0);
        })
      };
    } else {
      return String.fromCharCode(v).toLowerCase().charCodeAt(0);
    }
  },

  eq: function eq(_, obj, scope) {
    var v1 = _interpret(_, _car(obj), scope);
    var v2 = _interpret(_, _cadr(obj), scope);
    return _eq(v1, v2);
  },

  'erase-buffer': function erase_buffer(_, obj, scope) {
    _cur_buffer.value = [];
    return [];
  },

  eval: function eval(_, obj, scope) {
    return _interpret(_, _interpret(_, _car(obj), scope), scope);
  },

  'eval-and-compile': function eval_and_compile(_) { return []; },

  'eval-current-buffer': function eval_current_buffer(_, obj, scope) {
    return _interpret(_, new Parser(_array_to_string(_cur_buffer.value)).tokenize(), scope);
  },

  'eval-when-compile': function eval_when_compile(_) { return []; },

  'file-exists-p': function file_exists_p(_, obj, scope) {
    var fn = _interpret(_, _car(obj), scope);
    assert(fn.type === 'string');
    fn = _array_to_string(fn.value);
    if(typeof localStorage !== 'undefined') {
      var data = localStorage['DUNNET-JS-FILE-' + fn];
      if(typeof data !== 'undefined') {
        return 't';
      }
    }
    return [];
  },

  fset: function fset(_, obj, scope) {
    var fn = _interpret(_, _car(obj), scope);
    assert(typeof fn === 'string');
    var fn2 = _interpret(_, _cadr(obj), scope);
    assert(typeof fn2 === 'string');

    Functions[fn] = Functions[fn2];
    return fn2;
  },

  'get-buffer-create': function get_buffer_create(_, obj, scope) {
    var s = _interpret(_, _car(obj), scope);
    assert(s.type === 'string');
    return _get_or_create_buffer(_array_to_string(s.value));
  },

  'goto-char': function goto_char(_) { return []; }, 

  if: function IF(_, obj, scope) {
    if(_is_nil(_interpret(_, _car(obj), scope))) {
      var r = [];
      _list_for_each(_, _cddr(obj), function(_, item) {
        r = _interpret(_, item, scope);
      });
      return r;
    } else {
      return _interpret(_, _cadr(obj), scope);
    }
  },

  insert: function insert(_, obj, scope) {
    var s = _interpret(_, _car(obj), scope);
    assert(s.type === 'string');
    _cur_buffer.value = _cur_buffer.value.concat(s.value);
    return [];
  },

  'insert-file-contents': function insert_file_contents(_, obj, scope) {
    var fn = _interpret(_, _car(obj), scope);
    assert(fn.type === 'string');
    filename = _array_to_string(fn.value);
    if(typeof localStorage !== 'undefined') {
      var data = localStorage['DUNNET-JS-FILE-' + filename];
      if(typeof data !== 'undefined') {
        _cur_buffer.value = _cur_buffer.value.concat(_string_to_array(data));
        return [{ type: 'string', value: fn.value }, [data.length, []]];
      }
    }
    throw new Error("Cannot find file: " + filename);
  },

  interactive: function interactive(_) { return []; },

  intern: function intern(_, obj, scope) {
    var s = _interpret(_, _car(obj), scope);
    assert(s.type === 'string');
    return _array_to_string(s.value);
  },

  'kill-buffer': function kill_buffer(_, obj, scope) {
    var b = _interpret(_, _car(obj), scope);
    assert(b.type === 'buffer');
    var r = [];
    if(b.name in Buffers) {
      if(b.name === _default_buffer_name) Buffers[_default_buffer_name].value.length = 0;
      else delete Buffers[b.name];
      r = 't';
      if(b.name === _cur_buffer.name) _cur_buffer = Buffers[_default_buffer_name];
    }
    return r;
  },

  length: function length(_, obj, scope) {
    var s = _interpret(_, _car(obj), scope);
    if(s.type === 'string') return s.value.length;
    if(s instanceof Array) {
      var l = 0;
      while(!_is_nil(s)) {
        s = _cdr(s);
        ++l;
      }
      return l;
    }
    assert(false);
  },

  let: function LET(_, obj, scope) {
    var let_scope = new Scope(scope);
    _list_for_each(_, _car(obj), function(_, item) {
      if(typeof item === 'string') let_scope.set(item, []);
      else let_scope.set(_car(item), _interpret(_, _cadr(item), let_scope));
    });
    var r = [];
    _list_for_each(_, _cdr(obj), function(_, item) {
      r = _interpret(_, item, let_scope);
    });
    return r;
  },

  list: function list(_, obj, scope) {
    var result = [];
    var l = result;
    _list_for_each(_, obj, function(_, item) {
      l.push(_interpret(_, item, scope), []);
      l = l[1];
    });
    return result;
  },

  listp: function listp(_, obj, scope) {
    var l = _interpret(_, _car(obj), scope);
    return (l instanceof Array) ? 't' : [];
  },

  'make-sparse-keymap': function make_sparse_keymap(_, obj, scope) {
    return ["keymap", []];
  },

  'make-keymap': function make_keymap(_, obj, scope) {
    var km = [];
    for(var i = 0; i < 256; ++i)
      km.push([]);
    return ["keymap", [{
      type: 'vector',
      value: km
    }, []]];
  },

  'make-vector': function make_vector(_, obj, scope) {
    var r = [];
    var len = _interpret(_, _car(obj), scope);
    assert(typeof len === 'number');
    var o = _interpret(_, _cadr(obj), scope);
    for(var i = 0; i < len; ++i)
      r.push(o);
    return {
      type: 'vector',
      value: r
    }
  },

  member: function member(_, obj, scope) {
    var e = _interpret(_, _car(obj), scope);
    var l = _interpret(_, _cadr(obj), scope);
    assert(l instanceof Array);
    while(true) {
      if(_is_nil(l)) return [];
      if(!_is_nil(_equal(e, _car(l)))) return l;
      l = _cdr(l);
    }
  },

  not: function not(_, obj, scope) {
    return (_is_nil(_interpret(_, _car(obj), scope)) ? 't' : []);
  },

  nth: function nth(_, obj, scope) {
    var n = _interpret(_, _car(obj), scope);
    assert(typeof n === 'number');
    var l = _interpret(_, _cadr(obj), scope);
    assert(l instanceof Array);
    for(var i = 0; i < n; ++i) {
      if(_is_nil(l)) return [];
      l = _cdr(l);
    }
    return _car(l);
  },

  nthcdr: function nthcdr(_, obj, scope) {
    var n = _interpret(_, _car(obj), scope);
    assert(typeof n === 'number');
    var l = _interpret(_, _cadr(obj), scope);
    assert(l instanceof Array);
    for(var i = 0; i < n; ++i) {
      if(_is_nil(l)) return [];
      l = _cdr(l);
    }
    return l;
  },

  or: function or(_, obj, scope) {
    while(true) {
      if(_is_nil(obj)) return [];
      var r = _interpret(_, _car(obj), scope);
      if(!_is_nil(r)) return r;
      obj = _cdr(obj);
    }
  },

  'point-min': function point_min(_, obj, scope) {
    return 1;
  },

  'point-max': function point_max(_, obj, scope) {
    return 1 + _cur_buffer.value.length;
  },

  'prin1-to-string': function prin1_to_string(_, obj, scope) {
    var v = _interpret(_, _car(obj), scope);
    return { 
      type: 'string', 
      value: _string_to_array(_repr(v))
    };
  },
 
  princ: function princ(_, obj, scope) {
    var o = _interpret(_, _car(obj), scope);
    _print(_repr(o, true));
    return o;
  },

  progn: function progn(_, obj, scope) {
    var r = [];
    _list_for_each(_, obj, function(_, item){ 
      r = _interpret(_, item, scope); 
    });
    return r;
  },

  provide: function provide(_) { return []; },

  quote: function quote(_, obj, scope) {
    return _car(obj);
  },

  random: function random(_, obj, scope) {
    var n = _interpret(_, _car(obj), scope);
    assert(_is_nil(n) || n === 't' || typeof n === 'number');
    var N = (typeof n === 'number') ? n : (1 << 31);
    return Math.floor(Math.random() * N);
  },

  'read-from-minibuffer': function read_from_minibuffer(_, obj, scope) {
    var prmpt = _interpret(_, _car(obj), scope);
    assert(prmpt.type === 'string');
    assert(_array_to_string(prmpt.value) === '');
    var init = _interpret(_, _cadr(obj), scope);
    assert(_is_nil(init));
    var keymap = _interpret(_, _car(_cddr(obj)), scope);      
    assert(keymap[0] === 'keymap');
    var line = (function(callback) {
      _readline(function(input) {
        callback(null, input); // streamline interface
      });
    })(_);
    _print(line + '\n');
    return { type: 'string', value: _string_to_array(line) };
  },

  require: function require(_) { return []; },

  rplaca: function rplaca(_, obj, scope) {
    var l = _interpret(_, _car(obj), scope);
    assert(l instanceof Array);
    var newcar = _interpret(_, _cadr(obj), scope);
    l[0] = newcar;
    return newcar;
  },

  'send-string-to-terminal': function send_string_to_terminal(_, obj, scope) {
    var s = _interpret(_, _car(obj), scope);
    assert(s.type === 'string');
    _print(_array_to_string(s.value));
    return [];
  },

  setq: function setq(_, obj, scope) {
    var sym = _car(obj);
    var s = scope.get_containing_scope(sym) || Global;
    var r = _interpret(_, _cadr(obj), scope);
    s.set(sym, r);
    return r;
  },

  'sleep-for': function sleep_for(_, obj, scope) {
    var s = _interpret(_, _car(obj), scope);
    assert(typeof s === 'number');
    setTimeout(_, s * 1000);
    return [];
  },

  'string-match': function string_match(_, obj, scope) {
    var regexp = _interpret(_, _car(obj), scope);
    assert(regexp.type === 'string');
    regexp = _array_to_string(regexp.value);
    if(regexp === ')') regexp = '\\)'; // hack
    var s = _interpret(_, _cadr(obj), scope);
    assert(s.type === 'string');
    var idx = _array_to_string(s.value).search(new RegExp(regexp));
    return (idx === -1) ? [] : idx;
  },

  'string=': function string_EQUAL_TO(_, obj, scope) {
    var v1 = _interpret(_, _car(obj), scope);
    assert((typeof v1 === 'string') || (v1.type === 'string'));
    if(v1.type === 'string') v1 = _array_to_string(v1.value);
    var v2 = _interpret(_, _cadr(obj), scope);
    assert((typeof v2 === 'string') || (v2.type === 'string'));
    if(v2.type === 'string') v2 = _array_to_string(v2.value);
    return (v1 === v2) ? 't' : [];
  },

  stringp: function stringp(_, obj, scope) {
    var s = _interpret(_, _car(obj), scope);
    return (s.type === 'string') ? 't' : [];
  },

  substring: function substring(_, obj, scope) {
    var v1 = _interpret(_, _car(obj), scope);
    assert(v1.type === 'string');
    var v2 = _interpret(_, _cadr(obj), scope);
    assert(typeof v2 === 'number');
    var v3 = _interpret(_, _cadr(_cdr(obj)), scope);
    assert(_is_nil(v3) || typeof v3 === 'number');
    if(_is_nil(v3)) v3 = v1.value.length;
    return {
      type: 'string',
      value: v1.value.slice(v2, v3)
    };
  },

  'switch-to-buffer': function switch_to_buffer(_, obj, scope) {
    var s = _interpret(_, _car(obj), scope);
    assert(s.type === 'string' || s.type === 'buffer');
    if(s.type === 'buffer') _cur_buffer = s;
    else _cur_buffer = _get_or_create_buffer(s.value);
    return _cur_buffer;
  },

  symbolp: function symbolp(_, obj, scope) {
    var s = _interpret(_, _car(obj), scope);
    return (typeof s === 'string') ? 't' : [];           
  },

  unless: function unless(_, obj, scope) {
    if(_is_nil(_interpret(_, _car(obj), scope))) {
      var r = [];
      _list_for_each(_, _cdr(obj), function(_, item){ 
        r = _interpret(_, item, scope); 
      });
      return r;
    } else {
      return [];
    }
  },

  upcase: function upcase(_, obj, scope) {
    var v = _interpret(_, _car(obj), scope);
    assert(typeof v === 'number' || v.type === 'string');
    if(v.type === 'string') {
      return {
        type: 'string',
        value: v.value.map(function(v) {
          return String.fromCharCode(v).toUpperCase().charCodeAt(0);
        })
      };
    } else {
      return String.fromCharCode(v).toUpperCase().charCodeAt(0);
    }
  },

  'user-login-name': function user_login_name(_, obj, scope) {
    return { type: 'string', value: _string_to_array('root') };
  },

  when: function when(_, obj, scope) {
    if(!_is_nil(_interpret(_, _car(obj), scope))) {
      var r = [];
      _list_for_each(_, _cdr(obj), function(_, item){ 
        r = _interpret(_, item, scope); 
      });
      return r;
    } else {
      return [];
    }
  },

  while: function WHILE(_, obj, scope) {
    var r  = [];
    while(!_is_nil(_interpret(_, _car(obj), scope))) {
      _list_for_each(_, _cdr(obj), function(_, item) {
        r = _interpret(_, item, scope);
      });
    }
    return r;
  },

  'write-region': function write_region(_, obj, scope) {
    var start = _interpret(_, _car(obj), scope);
    assert(typeof start === 'number');
    var end = _interpret(_, _cadr(obj), scope);
    assert(typeof end === 'number');
    var fn = _interpret(_, _car(_cddr(obj)), scope);
    assert(fn.type === 'string');
    fn = _array_to_string(fn.value);
    var append = _interpret(_, _cadr(_cddr(obj)), scope);
    assert(_is_nil(append));
    if(typeof localStorage !== 'undefined') {
      localStorage['DUNNET-JS-FILE-' + fn] = _array_to_string(_cur_buffer.value.slice(start-1, end-1));
    }
    return [];
  },

  yow: function yow(_, obj, scope) {
    return { type: 'string', value: _string_to_array('Yow!!') };
  },
};

return {
  eval: function eval(input, options) {
    options = options || {};
    if(options.readline) _readline = options.readline;
    if(options.print) _print = options.print;
    _interpret(function(ex, ret) {
      if(ex) {
        console.log('lisp stack:',Stack);
        console.log(ex.message);
        console.log(ex.stack);
      } else if (options.exit) {
        options.exit(ret);
      }
    }, new Parser(input).tokenize(), Global);
  },

  scan_missing: function scan_missing(input, ignore_func) {
    var tokens = new Parser(input).tokenize();
    var missing = {};
    (function scan(tokens, first) {
      if(!(tokens instanceof Array)) return;
      while(!_is_nil(tokens)) {
        if(_is_nil(x)) return;
        var x = _car(tokens);
        if(x instanceof Array) scan(x, true);
        else if (typeof x === 'string' && first) {
          if(!(ignore_func && ignore_func(x))) {
            if(!(x in Functions) && !(x in missing))
              missing[x] = 1;         
          }
        }
        if(first && _car(tokens) === 'quote') return;
        else if(first && _car(tokens) === 'defun') tokens = _cdr(_cddr(tokens));
        else if(first && _car(tokens) === 'let') tokens = _cddr(tokens);
        else if(first && _car(tokens) === 'dolist') {
          scan(_cadr(_cadr(tokens)));
          tokens = _cddr(tokens);
        } else tokens = _cdr(tokens);
        first = false;
        if(!(tokens instanceof Array)) return;
      }
    })(tokens, true);
    for(var k in missing) console.log('missing ',k);
  },

  readline_callback: function readline_callback(s) {
    if(_readline_callback) {
      var cb = _readline_callback;
      _readline_callback = null;
      cb(s);
      return true;
    }
    return false;
  }
};

})();
