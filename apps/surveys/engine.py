"""
موتور پرسشنامه — ساختار (schema)، انواع سؤال، اعتبارسنجی پاسخ، شرط‌ها، پرش، متغیرها و صفحه‌ی پایان.
همین منطق در static/js/runner.js هم پیاده شده؛ هر تغییری اینجا، آنجا هم لازم است.

ساختار:
{
  "questions": [{"id": "q_x", "type": "choice", "title": "...", "description": "", "required": true, "image": "",
                 "opt": {...نوع‌محور}, "show_if": {"match": "all", "conds": [...]} | null,
                 "jumps": [{"match": "all", "conds": [...], "goto": "q_y" | "end" | "ending:e_1"}]}],
  "variables": [{"name": "level", "label": "سطح درآمد", "type": "text", "initial": ""}],
  "calcs": [{"match": "all", "conds": [...], "var": "level", "op": "set", "value": "A+"}],
  "welcome": {"enabled": true, "title": "", "text": "", "button": "شروع", "image": ""},
  "endings": [{"id": "e_1", "title": "", "text": "", "button_text": "", "button_url": "", "redirect_url": "",
               "show_score": false, "when": {"match": "all", "conds": [...]} | null}],
  "theme": {...}, "settings": {...}
}
شرط: {"src": "q_x" | "var:name" | "hidden:name", "op": "eq|neq|gt|gte|lt|lte|contains|not_contains|in|answered|not_answered", "value": ...}
"""
import re
import secrets

from apps.common.fa import to_en, valid_mobile, valid_national_code

TYPES = {
    # کلید: (برچسب، گروه، پاسخ‌دار؟)
    "short_text": ("متن کوتاه", "text", True),
    "long_text": ("متن بلند", "text", True),
    "number": ("عدد", "text", True),
    "price": ("مبلغ (تومان)", "text", True),
    "email": ("ایمیل", "contact", True),
    "mobile": ("موبایل", "contact", True),
    "phone": ("تلفن ثابت", "contact", True),
    "national_code": ("کد ملی", "contact", True),
    "url": ("آدرس وب‌سایت", "contact", True),
    "date": ("تاریخ شمسی", "text", True),
    "choice": ("چندگزینه‌ای", "choice", True),
    "dropdown": ("لیست کشویی", "choice", True),
    "yes_no": ("بله / خیر", "choice", True),
    "rating": ("امتیازدهی (ستاره)", "scale", True),
    "scale": ("طیف عددی / NPS", "scale", True),
    "matrix": ("ماتریسی (جدولی)", "choice", True),
    "ranking": ("رتبه‌بندی", "choice", True),
    "location": ("استان و شهر", "contact", True),
    "file": ("آپلود فایل", "other", True),
    "signature": ("امضا", "other", True),
    "consent": ("تأیید و رضایت", "other", True),
    "statement": ("متن توضیحی", "other", False),
}
ANSWERABLE = {k for k, v in TYPES.items() if v[2]}
OPS = {"eq", "neq", "gt", "gte", "lt", "lte", "contains", "not_contains", "in", "answered", "not_answered"}
NUMERIC = {"number", "price", "rating", "scale"}

DEFAULT_THEME = {"primary": "#1E9E7B", "bg": "#F6F7F4", "card": "#FFFFFF", "text": "#16303A", "bg_image": "",
                 "font_size": "md", "radius": "lg", "layout": "one", "logo": "", "align": "right"}
DEFAULT_SETTINGS = {"progress": True, "allow_back": True, "numbering": True, "shuffle": False, "show_branding": True}


def uid(prefix="q"):
    return f"{prefix}_{secrets.token_hex(3)}"


def default_schema():
    return {
        "questions": [],
        "variables": [],
        "calcs": [],
        "welcome": {"enabled": True, "title": "", "text": "", "button": "شروع", "image": ""},
        "endings": [{"id": "e_default", "title": "ممنون از وقتی که گذاشتید!", "text": "پاسخ شما ثبت شد.",
                     "button_text": "", "button_url": "", "redirect_url": "", "show_score": False, "when": None}],
        "theme": dict(DEFAULT_THEME),
        "settings": dict(DEFAULT_SETTINGS),
    }


# ───────────────────────── پاک‌سازی ساختار ورودی از فرم‌ساز ─────────────────────────
def _s(v, n=500):
    return str(v or "")[:n]


def _num(v, default=None):
    try:
        if v in (None, ""):
            return default
        f = float(to_en(str(v)))  # str(): to_en(0) خالی برمی‌گرداند و صفر گم می‌شد
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return default


def _items(lst, extra=("score", "image"), n=200):
    out, seen = [], set()
    for it in (lst or [])[:n]:
        if not isinstance(it, dict):
            continue
        i = _s(it.get("id"), 40) or uid("c")
        if i in seen:
            i = uid("c")
        seen.add(i)
        d = {"id": i, "label": _s(it.get("label"), 300)}
        if "score" in extra:
            d["score"] = _num(it.get("score"), 0)
        if "image" in extra and it.get("image"):
            d["image"] = _s(it.get("image"), 500)
        out.append(d)
    return out


def _cond(c):
    if not isinstance(c, dict):
        return None
    src, op = _s(c.get("src"), 60), _s(c.get("op"), 20)
    if not src or op not in OPS:
        return None
    v = c.get("value")
    if isinstance(v, list):
        v = [_s(x, 200) for x in v[:50]]
    elif isinstance(v, (int, float)):
        pass
    else:
        v = _s(v, 300)
    return {"src": src, "op": op, "value": v}


def _group(g):
    if not isinstance(g, dict):
        return None
    conds = [c for c in (_cond(x) for x in (g.get("conds") or [])[:20]) if c]
    if not conds:
        return None
    return {"match": "any" if g.get("match") == "any" else "all", "conds": conds}


def clean_schema(data, allow_logic=True, allow_calcs=True):
    """هر چیزی که از مرورگر می‌آید از این صافی رد می‌شود."""
    base = default_schema()
    if not isinstance(data, dict):
        return base
    qs, ids = [], set()
    for q in (data.get("questions") or [])[:300]:
        if not isinstance(q, dict) or q.get("type") not in TYPES:
            continue
        qid = _s(q.get("id"), 40)
        if not re.fullmatch(r"[A-Za-z0-9_-]{2,40}", qid or "") or qid in ids:
            qid = uid()
        ids.add(qid)
        o = q.get("opt") or {}
        t = q["type"]
        opt = {}
        if t in ("short_text", "long_text", "email", "url", "phone", "mobile", "national_code", "number", "price"):
            opt["placeholder"] = _s(o.get("placeholder"), 120)
        if t in ("short_text", "long_text"):
            opt["min_len"] = _num(o.get("min_len"))
            opt["max_len"] = _num(o.get("max_len"))
        if t in ("number", "price"):
            opt["min"], opt["max"] = _num(o.get("min")), _num(o.get("max"))
            opt["unit"] = _s(o.get("unit"), 30)
            opt["decimals"] = bool(o.get("decimals"))
            opt["add_to_score"] = bool(o.get("add_to_score"))
        if t == "date":
            opt["min"], opt["max"] = _s(o.get("min"), 10), _s(o.get("max"), 10)
            opt["birth"] = bool(o.get("birth"))
        if t in ("choice", "dropdown"):
            opt["choices"] = _items(o.get("choices"))
            opt["multiple"] = bool(o.get("multiple")) and t == "choice"
            opt["min_select"], opt["max_select"] = _num(o.get("min_select")), _num(o.get("max_select"))
            opt["other"] = bool(o.get("other"))
            opt["other_label"] = _s(o.get("other_label") or "سایر", 60)
            opt["shuffle"] = bool(o.get("shuffle"))
            opt["layout"] = o.get("layout") if o.get("layout") in ("list", "grid", "inline") else "list"
        if t == "yes_no":
            opt["yes_label"] = _s(o.get("yes_label") or "بله", 40)
            opt["no_label"] = _s(o.get("no_label") or "خیر", 40)
        if t == "rating":
            opt["max"] = max(3, min(10, _num(o.get("max"), 5)))
            opt["shape"] = o.get("shape") if o.get("shape") in ("star", "heart", "like", "number") else "star"
            opt["add_to_score"] = bool(o.get("add_to_score"))
        if t == "scale":
            opt["min"] = 0 if _num(o.get("min"), 1) == 0 else 1
            opt["max"] = max(3, min(10, _num(o.get("max"), 10)))
            opt["min_label"], opt["max_label"] = _s(o.get("min_label"), 60), _s(o.get("max_label"), 60)
            opt["nps"] = bool(o.get("nps")) and opt["min"] == 0 and opt["max"] == 10
            opt["add_to_score"] = bool(o.get("add_to_score"))
        if t == "matrix":
            opt["rows"] = _items(o.get("rows"), extra=())
            opt["cols"] = _items(o.get("cols"), extra=("score",), n=12)
            opt["multiple"] = bool(o.get("multiple"))
        if t == "ranking":
            opt["items"] = _items(o.get("items"), extra=(), n=30)
        if t == "file":
            opt["max_mb"] = max(1, min(50, _num(o.get("max_mb"), 5)))
            allowed = {"pdf", "jpg", "jpeg", "png", "webp", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip", "rar", "txt", "mp3", "mp4"}
            types = [x for x in (o.get("types") or []) if x in allowed]
            opt["types"] = types or ["pdf", "jpg", "jpeg", "png", "docx", "xlsx", "zip"]
        if t == "location":
            opt["ask_city"] = o.get("ask_city", True) is not False
        if t == "consent":
            opt["label"] = _s(o.get("label") or "شرایط را خواندم و می‌پذیرم.", 300)
        if t == "statement":
            opt["button"] = _s(o.get("button") or "ادامه", 40)
        item = {"id": qid, "type": t, "title": _s(q.get("title"), 1000), "description": _s(q.get("description"), 2000),
                "required": bool(q.get("required")) and t in ANSWERABLE, "image": _s(q.get("image"), 500), "opt": opt,
                "show_if": _group(q.get("show_if")) if allow_logic else None, "jumps": []}
        if allow_logic:
            for j in (q.get("jumps") or [])[:20]:
                g = _group(j)
                goto = _s((j or {}).get("goto"), 50)
                if g and goto:
                    item["jumps"].append({**g, "goto": goto})
        qs.append(item)
    base["questions"] = qs

    if allow_calcs:
        vs, names = [], {"score"}
        for v in (data.get("variables") or [])[:30]:
            name = _s((v or {}).get("name"), 30)
            if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,29}", name or "") or name in names:
                continue
            names.add(name)
            typ = "number" if v.get("type") == "number" else "text"
            vs.append({"name": name, "label": _s(v.get("label"), 80) or name, "type": typ,
                       "initial": _num(v.get("initial"), 0) if typ == "number" else _s(v.get("initial"), 100)})
        base["variables"] = vs
        cs = []
        for c in (data.get("calcs") or [])[:100]:
            if not isinstance(c, dict) or _s(c.get("var"), 30) not in names:
                continue
            op = c.get("op") if c.get("op") in ("set", "add", "sub", "mul", "div") else "set"
            g = _group(c) if c.get("conds") else None
            cs.append({"match": (g or {}).get("match", "all"), "conds": (g or {}).get("conds", []), "var": c["var"],
                       "op": op, "value": c.get("value") if isinstance(c.get("value"), (int, float)) else _s(c.get("value"), 100)})
        base["calcs"] = cs

    w = data.get("welcome") or {}
    base["welcome"] = {"enabled": bool(w.get("enabled", True)), "title": _s(w.get("title"), 300), "text": _s(w.get("text"), 3000),
                       "button": _s(w.get("button") or "شروع", 40), "image": _s(w.get("image"), 500)}
    ends = []
    for e in (data.get("endings") or [])[:20]:
        if not isinstance(e, dict):
            continue
        eid = _s(e.get("id"), 40) or uid("e")
        ends.append({"id": eid, "title": _s(e.get("title"), 300), "text": _s(e.get("text"), 3000),
                     "button_text": _s(e.get("button_text"), 40), "button_url": _s(e.get("button_url"), 500),
                     "redirect_url": _s(e.get("redirect_url"), 500), "show_score": bool(e.get("show_score")),
                     "when": _group(e.get("when")) if allow_logic else None})
    base["endings"] = ends or default_schema()["endings"]
    th = {**DEFAULT_THEME, **{k: _s(v, 500) for k, v in (data.get("theme") or {}).items() if k in DEFAULT_THEME}}
    for k in ("primary", "bg", "card", "text"):
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", th[k]):
            th[k] = DEFAULT_THEME[k]
    if th["layout"] not in ("one", "all"):
        th["layout"] = "one"
    base["theme"] = th
    st = data.get("settings") or {}
    base["settings"] = {k: bool(st.get(k, v)) for k, v in DEFAULT_SETTINGS.items()}
    return base


# ───────────────────────── اعتبارسنجی پاسخ ─────────────────────────
def is_empty(v):
    return v is None or v == "" or v == [] or v == {} or v is False


def validate_answer(q, v):
    """(مقدار تمیز، پیام خطا یا None)"""
    t, o = q["type"], q.get("opt") or {}
    if is_empty(v):
        if q.get("required"):
            return None, "پاسخ به این سؤال الزامی است."
        return None, None
    try:
        if t in ("short_text", "long_text"):
            v = str(v).strip()[:5000 if t == "long_text" else 500]
            if o.get("min_len") and len(v) < o["min_len"]:
                return v, f"دست‌کم {o['min_len']} کاراکتر بنویسید."
            if o.get("max_len") and len(v) > o["max_len"]:
                return v, f"حداکثر {o['max_len']} کاراکتر مجاز است."
            return v, None
        if t in ("number", "price"):
            n = _num(str(v).replace(",", "").replace("٬", ""))
            if n is None:
                return None, "عدد معتبر وارد کنید."
            if t == "price" or not o.get("decimals"):
                n = int(n)
            if o.get("min") is not None and n < o["min"]:
                return n, f"عدد باید دست‌کم {o['min']} باشد."
            if o.get("max") is not None and n > o["max"]:
                return n, f"عدد باید حداکثر {o['max']} باشد."
            return n, None
        if t == "email":
            v = str(v).strip()[:200]
            return v, None if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v) else "ایمیل معتبر نیست."
        if t == "mobile":
            v = to_en(v).strip().replace(" ", "")
            if v.startswith("+98"):
                v = "0" + v[3:]
            return v, None if valid_mobile(v) else "شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود."
        if t == "phone":
            v = to_en(v).strip().replace(" ", "").replace("-", "")
            return v, None if re.fullmatch(r"0\d{7,11}", v) else "شماره تلفن را با کد شهر وارد کنید."
        if t == "national_code":
            v = to_en(v).strip()
            return v, None if valid_national_code(v) else "کد ملی معتبر نیست."
        if t == "url":
            v = str(v).strip()[:500]
            if v and not v.startswith(("http://", "https://")):
                v = "https://" + v
            return v, None if re.fullmatch(r"https?://[^\s/$.?#][^\s]*\.[^\s]{2,}", v) else "آدرس معتبر نیست."
        if t == "date":
            v = to_en(v).strip().replace("-", "/")
            from apps.common.fa import parse_jalali
            if not parse_jalali(v):
                return v, "تاریخ معتبر نیست."
            y, m, d = (int(x) for x in v.split("/")[:3])
            v = f"{y:04d}/{m:02d}/{d:02d}"
            if o.get("min") and _dkey(v) < _dkey(o["min"]):
                return v, "تاریخ قبل از بازه‌ی مجاز است."
            if o.get("max") and _dkey(v) > _dkey(o["max"]):
                return v, "تاریخ بعد از بازه‌ی مجاز است."
            return v, None
        if t in ("choice", "dropdown"):
            ids = {c["id"] for c in o.get("choices", [])}
            if o.get("other"):
                ids.add("__other__")
            if o.get("multiple"):
                vals = [x for x in (v if isinstance(v, list) else [v]) if x in ids]
                if not vals:
                    return None, "پاسخ به این سؤال الزامی است." if q.get("required") else None
                if o.get("min_select") and len(vals) < o["min_select"]:
                    return vals, f"دست‌کم {o['min_select']} گزینه انتخاب کنید."
                if o.get("max_select") and len(vals) > o["max_select"]:
                    return vals, f"حداکثر {o['max_select']} گزینه مجاز است."
                return vals, None
            v = v[0] if isinstance(v, list) and v else v
            return (v, None) if v in ids else (None, "گزینه‌ی معتبری انتخاب کنید.")
        if t == "yes_no":
            return (v, None) if v in ("yes", "no") else (None, "بله یا خیر را انتخاب کنید.")
        if t == "rating":
            n = _num(v)
            return (int(n), None) if n is not None and 1 <= n <= o.get("max", 5) else (None, "امتیاز معتبر نیست.")
        if t == "scale":
            n = _num(v)
            ok = n is not None and o.get("min", 1) <= n <= o.get("max", 10)
            return (int(n), None) if ok else (None, "مقدار معتبر نیست.")
        if t == "matrix":
            if not isinstance(v, dict):
                return None, "پاسخ معتبر نیست."
            rows = {r["id"] for r in o.get("rows", [])}
            cols = {c["id"] for c in o.get("cols", [])}
            out = {}
            for r, c in v.items():
                if r not in rows:
                    continue
                if o.get("multiple"):
                    cc = [x for x in (c if isinstance(c, list) else [c]) if x in cols]
                    if cc:
                        out[r] = cc
                elif c in cols:
                    out[r] = c
            if q.get("required") and len(out) < len(rows):
                return out, "به همه‌ی ردیف‌ها پاسخ دهید."
            return out or None, None
        if t == "ranking":
            items = [i["id"] for i in o.get("items", [])]
            vals = [x for x in (v if isinstance(v, list) else []) if x in items]
            if sorted(vals) != sorted(items):
                return None, "همه‌ی موارد را مرتب کنید."
            return vals, None
        if t == "location":
            if not isinstance(v, dict):
                return None, "استان را انتخاب کنید."
            from apps.common.iran_geo import PROVINCES
            p, c = str(v.get("province", "")), str(v.get("city", ""))[:80]
            if p not in PROVINCES:
                return None, "استان را انتخاب کنید."
            if o.get("ask_city", True) and q.get("required") and not c:
                return {"province": p, "city": ""}, "شهر را وارد کنید."
            return {"province": p, "city": c}, None
        if t in ("file", "signature"):
            if isinstance(v, dict) and v.get("id"):
                return {"id": str(v["id"])[:40], "name": str(v.get("name", ""))[:200], "url": str(v.get("url", ""))[:500]}, None
            return None, "فایل معتبر نیست."
        if t == "consent":
            return (True, None) if v in (True, "true", "1", "on", 1) else (None, "برای ادامه باید تأیید کنید.")
    except (TypeError, ValueError, AttributeError, KeyError):
        return None, "پاسخ معتبر نیست."
    return None, None


def _dkey(s):
    try:
        y, m, d = (int(x) for x in to_en(s).replace("-", "/").split("/")[:3])
        return y * 10000 + m * 100 + d
    except (ValueError, TypeError):
        return 0


# ───────────────────────── شرط، متغیر، مسیر ─────────────────────────
def _qmap(schema):
    return {q["id"]: q for q in schema.get("questions", [])}


def _value(src, answers, variables, hidden, qmap):
    if src.startswith("var:"):
        return variables.get(src[4:]), "number" if isinstance(variables.get(src[4:]), (int, float)) else "text"
    if src.startswith("hidden:"):
        return hidden.get(src[7:], ""), "text"
    q = qmap.get(src)
    if not q:
        return None, "text"
    v = answers.get(src)
    if q["type"] in NUMERIC:
        return _num(v), "number"
    if q["type"] == "date":
        return (_dkey(v) if v else None), "date"
    if q["type"] == "choice" and (q.get("opt") or {}).get("multiple"):
        return (v if isinstance(v, list) else []), "list"
    if q["type"] == "location":
        return (v or {}).get("province", "") if isinstance(v, dict) else "", "text"
    if q["type"] == "ranking":
        return (v or []), "list"
    return v, "text"


def eval_cond(c, answers, variables, hidden, qmap):
    v, kind = _value(c["src"], answers, variables, hidden, qmap)
    op, target = c["op"], c.get("value")
    if op == "answered":
        return not is_empty(v)
    if op == "not_answered":
        return is_empty(v)
    if kind == "list":
        tl = target if isinstance(target, list) else [target]
        if op in ("eq", "contains", "in"):
            return any(x in v for x in tl)
        if op in ("neq", "not_contains"):
            return not any(x in v for x in tl)
        return False
    if op in ("gt", "gte", "lt", "lte"):
        a = v
        b = _dkey(target) if kind == "date" else _num(target)
        if kind not in ("date",):
            a = _num(v)
        if a is None or b is None:
            return False
        return {"gt": a > b, "gte": a >= b, "lt": a < b, "lte": a <= b}[op]
    if kind == "number" and _num(target) is not None and v is not None and op in ("eq", "neq"):
        eq = float(v) == float(_num(target))
        return eq if op == "eq" else not eq
    sv = "" if v is None else str(v).strip().lower()
    if op == "in":
        tl = target if isinstance(target, list) else [x.strip() for x in str(target).split(",")]
        return sv in [str(x).strip().lower() for x in tl]
    st = "" if target is None else str(target).strip().lower()
    if kind == "date" and op in ("eq", "neq"):
        st = str(_dkey(target))
    if op == "eq":
        return sv == st
    if op == "neq":
        return sv != st
    if op == "contains":
        return st in sv
    if op == "not_contains":
        return st not in sv
    return False


def eval_group(g, answers, variables, hidden, qmap):
    if not g or not g.get("conds"):
        return True
    res = (eval_cond(c, answers, variables, hidden, qmap) for c in g["conds"])
    return any(res) if g.get("match") == "any" else all(res)


def compute_variables(schema, answers, visited, hidden=None):
    hidden = hidden or {}
    qmap = _qmap(schema)
    var = {"score": 0}
    for v in schema.get("variables", []):
        var[v["name"]] = v.get("initial", 0 if v["type"] == "number" else "")
    for qid in visited:
        q, a = qmap.get(qid), answers.get(qid)
        if not q or is_empty(a):
            continue
        o = q.get("opt") or {}
        if q["type"] in ("choice", "dropdown"):
            scores = {c["id"]: c.get("score") or 0 for c in o.get("choices", [])}
            for x in (a if isinstance(a, list) else [a]):
                var["score"] += scores.get(x, 0)
        elif q["type"] == "matrix" and isinstance(a, dict):
            scores = {c["id"]: c.get("score") or 0 for c in o.get("cols", [])}
            for c in a.values():
                for x in (c if isinstance(c, list) else [c]):
                    var["score"] += scores.get(x, 0)
        elif q["type"] in NUMERIC and o.get("add_to_score"):
            var["score"] += _num(a, 0) or 0
    vis = {k: answers[k] for k in visited if k in answers}
    for c in schema.get("calcs", []):
        if c.get("conds") and not eval_group(c, vis, var, hidden, qmap):
            continue
        name, op, val = c["var"], c["op"], c.get("value")
        if isinstance(val, str) and val.startswith("@"):
            ref = val[1:]
            val = vis.get(ref) if ref in qmap else var.get(ref.replace("var:", ""))
        cur = var.get(name)
        if op == "set":
            var[name] = val
        else:
            a, b = _num(cur, 0) or 0, _num(val, 0) or 0
            var[name] = {"add": a + b, "sub": a - b, "mul": a * b, "div": (a / b if b else a)}[op]
            if isinstance(var[name], float) and var[name].is_integer():
                var[name] = int(var[name])
    return var


def walk(schema, answers, hidden=None, stop_at=None):
    """مسیر طی‌شده را از اول بازسازی می‌کند: (visited, ending_id_forced)."""
    hidden = hidden or {}
    qs = schema.get("questions", [])
    qmap = _qmap(schema)
    index = {q["id"]: i for i, q in enumerate(qs)}
    visited, forced, i, guard = [], None, 0, 0
    while i < len(qs) and guard < 1000:
        guard += 1
        q = qs[i]
        var = compute_variables(schema, answers, visited, hidden)
        vis_answers = {k: answers.get(k) for k in visited}
        if q.get("show_if") and not eval_group(q["show_if"], vis_answers, var, hidden, qmap):
            i += 1
            continue
        visited.append(q["id"])
        if stop_at and q["id"] == stop_at:
            break
        if q["type"] in ANSWERABLE and is_empty(answers.get(q["id"])) and q.get("required"):
            break  # هنوز پاسخ نداده؛ ادامه‌ی مسیر معلوم نیست
        nxt = i + 1
        vis_answers = {k: answers.get(k) for k in visited}
        var = compute_variables(schema, answers, visited, hidden)
        for j in q.get("jumps", []):
            if eval_group(j, vis_answers, var, hidden, qmap):
                g = j["goto"]
                if g == "end":
                    nxt = len(qs)
                elif g.startswith("ending:"):
                    forced, nxt = g[7:], len(qs)
                elif g in index and index[g] > i:
                    nxt = index[g]
                break
        i = nxt
    return visited, forced


def choose_ending(schema, answers, variables, hidden, forced=None):
    ends = schema.get("endings") or default_schema()["endings"]
    if forced:
        for e in ends:
            if e["id"] == forced:
                return e
    qmap = _qmap(schema)
    for e in ends:
        if e.get("when") and eval_group(e["when"], answers, variables, hidden, qmap):
            return e
    for e in ends:
        if not e.get("when"):
            return e
    return ends[0]


def finalize(schema, raw_answers, hidden=None):
    """اعتبارسنجی نهایی سمت سرور. خروجی: (answers, variables, path, ending, errors{qid: msg})"""
    hidden = hidden or {}
    qmap = _qmap(schema)
    clean, errors = {}, {}
    for qid, q in qmap.items():
        if q["type"] not in ANSWERABLE:
            continue
        v, err = validate_answer({**q, "required": False}, raw_answers.get(qid))
        if v is not None and not err:
            clean[qid] = v
            if q["type"] in ("choice", "dropdown"):
                other = str(raw_answers.get(qid + "__other", ""))[:500].strip()
                if other:
                    clean[qid + "__other"] = other
        elif err and not is_empty(raw_answers.get(qid)):
            errors[qid] = err
    path, forced = walk(schema, clean, hidden)
    for qid in path:
        q = qmap[qid]
        if q.get("required") and q["type"] in ANSWERABLE and is_empty(clean.get(qid)):
            errors.setdefault(qid, "پاسخ به این سؤال الزامی است.")
    final = {k: v for k, v in clean.items() if k.split("__")[0] in path}
    variables = compute_variables(schema, final, path, hidden)
    ending = choose_ending(schema, final, variables, hidden, forced)
    return final, variables, path, ending, errors


# ───────────────────────── نمایش پاسخ ─────────────────────────
def display(q, v, answers=None):
    if is_empty(v):
        return ""
    t, o = q["type"], q.get("opt") or {}
    if t in ("choice", "dropdown"):
        labels = {c["id"]: c["label"] for c in o.get("choices", [])}
        other = (answers or {}).get(q["id"] + "__other", "")
        labels["__other__"] = f"{o.get('other_label', 'سایر')}: {other}" if other else o.get("other_label", "سایر")
        return "، ".join(labels.get(x, x) for x in (v if isinstance(v, list) else [v]))
    if t == "yes_no":
        return o.get("yes_label", "بله") if v == "yes" else o.get("no_label", "خیر")
    if t == "matrix" and isinstance(v, dict):
        rows = {r["id"]: r["label"] for r in o.get("rows", [])}
        cols = {c["id"]: c["label"] for c in o.get("cols", [])}
        return " | ".join(f"{rows.get(r, r)}: {'، '.join(cols.get(x, x) for x in (c if isinstance(c, list) else [c]))}" for r, c in v.items())
    if t == "ranking":
        items = {i["id"]: i["label"] for i in o.get("items", [])}
        return " ← ".join(items.get(x, x) for x in v)
    if t == "location" and isinstance(v, dict):
        return "، ".join(x for x in (v.get("province"), v.get("city")) if x)
    if t in ("file", "signature") and isinstance(v, dict):
        return v.get("name") or "فایل"
    if t == "consent":
        return "تأیید شد"
    if t == "price":
        return f"{int(v):,}".replace(",", "٬") + " تومان"
    if t == "number" and o.get("unit"):
        return f"{v} {o['unit']}"
    return str(v)


def pipe(text, schema, answers, variables, hidden):
    qmap = _qmap(schema)

    def rep(m):
        kind, key = m.group(1), m.group(2)
        if kind == "q" and key in qmap:
            return display(qmap[key], answers.get(key), answers)
        if kind == "var":
            return str(variables.get(key, ""))
        if kind == "hidden":
            return str(hidden.get(key, ""))
        return ""
    return re.sub(r"\{\{\s*(q|var|hidden):([A-Za-z0-9_-]+)\s*\}\}", rep, text or "")
