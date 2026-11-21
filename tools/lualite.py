"""Разбор Lua-таблиц из модулей данных вики (Module:*/data) в обычные dict/list.

Понимает только то, что встречается в этих модулях: таблицы, строки (в т.ч. [[длинные]]),
числа, true/false/nil, комментарии. Код Lua не исполняет: берёт первую таблицу после
`return` или `local x =` и разбирает её.
"""
import re

_TOKEN = re.compile(r"""
    (?P<ws>\s+)
  | (?P<lcomment>--\[(?P<leq>=*)\[.*?\](?P=leq)\])
  | (?P<comment>--[^\n]*)
  | (?P<lstr>\[(?P<seq>=*)\[.*?\](?P=seq)\])
  | (?P<str>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')
  | (?P<num>0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)
  | (?P<name>[A-Za-z_][A-Za-z0-9_]*)
  | (?P<sym>[{}\[\]=,;\-])
  | (?P<other>.)
""", re.S | re.X)

_ESC = {"n": "\n", "r": "\r", "t": "\t", "\\": "\\", '"': '"', "'": "'", "a": "\a", "b": "\b", "f": "\f", "v": "\v", "\n": "\n"}


def _unescape(s):
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c != "\\":
            out.append(c)
            i += 1
            continue
        n = s[i + 1]
        if n.isdigit():
            j = i + 1
            while j < len(s) and j < i + 4 and s[j].isdigit():
                j += 1
            out.append(chr(int(s[i + 1:j])))
            i = j
        else:
            out.append(_ESC.get(n, n))
            i += 2
    return "".join(out)


def _tokens(text):
    for m in _TOKEN.finditer(text):
        kind = m.lastgroup
        if kind in ("ws", "comment", "lcomment"):
            continue
        val = m.group(kind)
        if kind == "lstr":
            eq = m.group("seq")
            val = val[2 + len(eq):-(2 + len(eq))]
            if val.startswith("\n"):
                val = val[1:]
            kind = "str"
        elif kind == "str":
            val = _unescape(val[1:-1])
        elif kind == "num":
            val = int(val, 16) if val.lower().startswith("0x") else (float(val) if re.search(r"[.eE]", val) else int(val))
        elif kind == "seq" or kind == "leq":
            continue
        yield kind, val


class _Parser:
    def __init__(self, text):
        self.t = list(_tokens(text))
        self.i = 0

    def peek(self, k=0):
        j = self.i + k
        return self.t[j] if j < len(self.t) else (None, None)

    def take(self, kind=None, val=None):
        tok = self.peek()
        if kind and tok[0] != kind or val is not None and tok[1] != val:
            raise ValueError(f"ожидалось {kind} {val!r}, получено {tok!r} (токен {self.i})")
        self.i += 1
        return tok

    def value(self):
        kind, val = self.peek()
        if kind == "sym" and val == "{":
            return self.table()
        if kind == "sym" and val == "-":
            self.take()
            return -self.take("num")[1]
        if kind in ("str", "num"):
            self.take()
            return val
        if kind == "name" and val in ("true", "false", "nil"):
            self.take()
            return {"true": True, "false": False, "nil": None}[val]
        if kind == "name" and val == "math" and self.peek(1) == ("other", ".") and self.peek(2) == ("name", "huge"):
            self.i += 3
            return 1e9          # math.huge (мгновенный выстрел); JSON не умеет Infinity
        raise ValueError(f"не значение: {self.peek()!r} (токен {self.i})")

    def table(self):
        self.take("sym", "{")
        arr, obj = [], {}
        while self.peek() != ("sym", "}"):
            kind, val = self.peek()
            if kind == "sym" and val == "[":
                self.take()
                key = self.value()
                self.take("sym", "]")
                self.take("sym", "=")
                obj[key] = self.value()
            elif kind == "name" and self.peek(1) == ("sym", "="):
                self.take()
                self.take()
                obj[val] = self.value()
            else:
                arr.append(self.value())
            if self.peek()[0] == "sym" and self.peek()[1] in (",", ";"):
                self.take()
        self.take("sym", "}")
        if obj and arr:
            obj.update({i + 1: v for i, v in enumerate(arr)})
            return obj
        return obj if obj else arr


def parse_module(text):
    """Первая таблица модуля: `return { ... }` или `local data = { ... }`."""
    p = _Parser(text)
    while p.i < len(p.t):
        kind, val = p.peek()
        if kind == "sym" and val == "{":
            return p.table()
        p.i += 1
    raise ValueError("в модуле нет таблицы")
