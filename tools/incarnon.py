"""Эволюции Инкарнона со страниц вики: перки по уровням и значения X для конкретного варианта оружия.

Страница — сама вики-страница оружия (Laetum, Phenmor, …) или «<База> Incarnon Genesis» для адаптеров.
Тексты перков разбираются тем же parse_rank, что и моды (передаётся из build_data).
"""
import re

INCARNON_NATIVE = {"Laetum", "Phenmor", "Felarx", "Innodem", "Praedos", "Onos", "Ruvox", "Thalys", "Torid"}
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


def parse_evolutions(text, weapon, parse_rank):
    i = text.find("Evolutions===")
    if i < 0:
        return None
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
        for var, (num, pc) in subs.items():
            lines = [re.sub(r"\b%s\b(%%?)" % var, lambda m, n=num, p=pc: n + ("%" if (m.group(1) or p) else ""), l) for l in lines]
        effects, bad = parse_rank(lines)
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
