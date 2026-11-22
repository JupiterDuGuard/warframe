"""Эволюции Инкарнона со страниц вики: перки по уровням и значения X для конкретного варианта оружия.

Страница — сама вики-страница оружия (Laetum, Phenmor, …) или «<База> Incarnon Genesis» для адаптеров.
Тексты перков разбираются тем же parse_rank, что и моды (передаётся из build_data).
"""
import re

INCARNON_NATIVE = {"Laetum", "Phenmor", "Felarx", "Innodem", "Praedos", "Onos", "Ruvox", "Thalys"}
BOLD = "'" * 3


def genesis_page(name):
    if name in INCARNON_NATIVE:
        return name
    base = re.sub(r"^(Mk1-|Prisma |Rakta |Telos |Synoid |Dex |Kuva |Tenet )", "", name)
    base = re.sub(r" (Prime|Vandal|Wraith)$", "", base)
    return f"{base} Incarnon Genesis"


def wiki_clean(t):
    t = re.sub(r"\{\{(?:D|M|A|WF|Weapon|Arcane|E|Resource|Text|Proc|Focus|Stat)\|([^}|]+)[^}]*\}\}", r"\1", t)
    t = re.sub(r"\[\[File:[^\]]*\]\]", "", t)
    t = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", t)
    t = t.replace(BOLD, " ").replace("''", " ")
    t = re.sub(r"<br\s*/?>|&nbsp;", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"([+-])\s+(\d)", lambda m: m.group(1) + m.group(2), t)
    return re.sub(r"\s+([.,:;])", lambda m: m.group(1), t)


def table_cells(row):
    """Ячейки строки вики-таблицы: строка с «|» в начале открывает ячейку; атрибуты (style/colspan) срезаются.
    -> [(текст, colspan)]"""
    cells = []
    for line in row.split("\n"):
        if line.startswith("|") and not line.startswith(("|-", "|}", "|+")):
            body = line[1:]
            span = 1
            head = body.split("|", 1)
            if len(head) == 2 and re.search(r"(style|colspan|rowspan)\s*=", head[0]):
                m = re.search(r'colspan\s*=\s*"?(\d)', head[0])
                span = int(m.group(1)) if m else 1
                body = head[1]
            cells.append([body.strip(), span])
        elif cells:
            cells[-1][0] += "\n" + line
    return cells


# Формулировки перков на вики -> вид, который понимают правила build_data (RULES, COND_*).
NORMALIZE = [
    (r"^\*+\s*", ""),                                                     # вложенные пункты «** …»
    (r"([+-])\s+(\d)", r"\1\2"),                                          # «+ 15%» -> «+15%»
    (r"^Multishot consumes ammo directly from Capacity and ", ""),
    (r"^does (\+\d+(?:\.\d+)?%) Damage", r"\1 Damage"),                  # Munitions Grit — TODO_VERIFY: корзина урона
    (r"^Increase Base Status by ", "Increase Base Status Chance by "),
    (r"^Increase Status Chance by ", "Increase Base Status Chance by "),  # Despair — TODO_VERIFY
    (r"^(?:Increase|increases) Damage by (\+\d+(?:\.\d+)?)\.?$", r"Increase Base Damage by \1"),
    (r"^increases Damage by (\+\d+(?:\.\d+)?%)", r"\1 Damage"),
    (r"(Critical Damage Multiplier by \+?\d+(?:\.\d+)?)(?![\d.]|x)", r"\1x"),
    (r"^\+(\d+(?:\.\d+)?) (?:Base )?Multishot\.?$", r"Increase Base Multishot by +\1"),
    (r"^(.+?) on (last shot in magazine|final magazine burst)\.?$", r"On \2: \1"),
    (r"^(.+?) to enemies below half Health\.?$", r"While enemy below 50% Health: \1"),
    (r"^(.+?), resets on Reload\.?$", r"While not reloaded: \1"),
    (r"^(.+?) if (no enemies are within \d+m)\.?$", r"If \2: \1"),
    (r"^Enemies (.+?) will receive:\s*(.+)$", r"While enemies \1: \2"),
]


def normalize(lines):
    """Строки перка: формулировки по NORMALIZE, «A. B» -> две строки, «Effect doubles in Incarnon Form» -> копия для формы."""
    out = []
    for line in lines:
        for part in re.split(r"\.\s+(?=[+-]?\d|Increase|x\d)|\s+(?=Effect doubles in Incarnon Form)", line):
            part = part.strip()
            if re.match(r"Effect doubles in Incarnon Form", part, re.I):
                if out:
                    out.append(out[-1].rstrip(".") + " for Incarnon Form")
                continue
            for rx, rep in NORMALIZE:
                part = re.sub(rx, rep, part).strip()
            cm = re.match(r"^([^:]+:\s*)(.+)$", part)          # «On X: +3 Multishot» — значение после условия ещё раз
            if cm:
                tail = cm.group(2)
                for rx, rep in NORMALIZE:
                    tail = re.sub(rx, rep, tail).strip()
                part = cm.group(1) + tail
            if part:
                out.append(part)
    return out


def parse_evolutions(text, weapon, parse_rank):
    m = re.search(r"=+\s*Evolutions\s*=+", text)       # «===Evolutions===» и «=== Evolutions ===»
    if not m:
        return None
    i = m.start()
    j = text.find("\n|}", i)
    table = text[i:j]
    first = table.find("EVO")
    variants = re.findall(r"\{\{Weapon\|([^}|]+)", table[:first])
    vidx = variants.index(weapon) if weapon in variants else 0
    tiers, cur = [], None
    for row in re.split(r"\n\|-[^\n]*\n", table):
        m = re.search(r"^!.*EVO\s*(\d)", row, re.M)
        if m:
            cur = {"tier": int(m.group(1)), "perks": []}
            tiers.append(cur)
            row = re.sub(r"^!.*EVO\s*\d[^\n]*\n?", "", row, flags=re.M)
        if cur is None or "Challenge" in row:
            continue
        cells = table_cells(row)
        if len(cells) < 2:
            continue
        mb = re.search(BOLD + r"([^']+)" + BOLD, cells[0][0])
        name = (mb.group(1) if mb else wiki_clean(cells[0][0])).strip()
        lines = [wiki_clean(l.strip()[1:]) for l in cells[1][0].split("\n") if l.strip().startswith("*")]
        subs = {}
        if variants and len(cells) > 2:
            vals = []
            for body, span in cells[2:]:
                vals += [body] * span
            if vidx < len(vals):
                for var, num, pc in re.findall(r"\b([XYZ])\s*=\s*([\d.]+)\s*(%?)", vals[vidx]):
                    subs[var] = (num, pc)
        for var, (num, pc) in subs.items():          # «+Y%», «+Yx», «+Y.» -> число варианта
            lines = [re.sub(r"(?<![A-Za-z])%s(?=x\b|\b)(%%?)" % var, lambda m, n=num, p=pc: n + ("%" if (m.group(1) or p) else ""), l) for l in lines]
        effects, bad = parse_rank(normalize(lines))
        perk = {"name": name, "text": lines, "effects": effects}
        if bad:
            perk["unparsed"] = bad
        cur["perks"].append(perk)
    return tiers


def build_incarnon(weapons, overrides, fetch, wiki_url, parse_rank, log_unparsed, log_notes):
    out = {}
    names = sorted({w["name"] for g in weapons.values() for w in g
                    if w["name"] in INCARNON_NATIVE or any("Incarnon" in (a.get("attackName") or "") for a in w["attacks"])})
    for name in names:
        page = genesis_page(name)
        url = wiki_url + page.replace(" ", "_")
        try:
            text = fetch(url + "?action=raw", "wiki_page_" + re.sub(r"\W", "_", page) + ".txt")
        except Exception:
            log_notes.append(("incarnon", f"{name}: страница {page} не загрузилась", url))
            continue
        tiers = parse_evolutions(text, name, parse_rank)
        tr = re.search(r"\{\{Transclude\|([^#|}]*Incarnon Genesis)", text)
        if not tiers and tr:                                   # страница оружия подключает таблицу со страницы Genesis
            page = tr.group(1).strip()
            url = wiki_url + page.replace(" ", "_")
            try:
                text = fetch(url + "?action=raw", "wiki_page_" + re.sub(r"\W", "_", page) + ".txt")
                tiers = parse_evolutions(text, name, parse_rank)
            except Exception:
                log_notes.append(("incarnon", f"{name}: страница {page} не загрузилась", url))
                continue
        if not tiers:
            log_notes.append(("incarnon", f"{name}: нет таблицы эволюций на {page}", url))
            continue
        for t in tiers:
            for pk in t["perks"]:
                ov = overrides.get(pk["name"])
                if ov:
                    pk["effects"] = ov["effects"]
                    pk["override"] = ov.get("source", True)
                    pk.pop("unparsed", None)
                elif pk.get("unparsed") and t["tier"] > 1:
                    log_unparsed.append(("incarnon", f"{name}: {pk['name']}", url, "; ".join(pk["unparsed"])))
        out[name] = {"page": url, "tiers": [t for t in tiers if t["tier"] > 1]}
    return out
