#!/usr/bin/env python3
"""Сборка данных калькулятора в data/*.json.

Источники:
  * WFCD warframe-items — моды и мистификаторы (значения по рангам), русские названия (i18n/ru.json);
  * модули данных вики (Module:*/data, ?action=raw) — оружие (атаки, Инкарнон), фреймы, враги
    (базовый уровень, текущая система урона), типы урона и модификаторы фракций, UpgradeTypes модов.

Запуск:  python tools/build_data.py            (кэш скачанного — tools/.cache, живёт 12 ч)
         python tools/build_data.py --refresh  (скачать всё заново)
Только stdlib, Python 3.10+.
"""
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lualite import parse_module  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = Path(__file__).parent / ".cache"
CACHE_TTL = 12 * 3600
REFRESH = "--refresh" in sys.argv

WFCD = "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/"
WIKI = "https://wiki.warframe.com/w/"
UA = {"User-Agent": "warframe-calc-builder (github.com/JupiterDuGuard/warframe)"}

ENEMY_FACTIONS = ["grineer", "corpus", "infestation", "orokin", "sentient", "stalker", "narmer",
                  "themurmur", "techrot", "scaldra", "anarchs", "unaffiliated"]
WEAPON_SLOTS = {"primary": "primary", "secondary": "secondary", "melee": "melee", "archwing": "archwing"}

# группы модов: тип WFCD -> файл data/mods/<группа>.json
MOD_GROUPS = {
    "Primary Mod": "primary", "Shotgun Mod": "shotgun", "Secondary Mod": "secondary", "Melee Mod": "melee",
    "Stance Mod": "stance", "Warframe Mod": "warframe", "Arch-Gun Mod": "archgun", "Arch-Melee Mod": "archmelee",
}
ARCANE_GROUPS = {
    "Warframe Arcane": "warframe", "Primary Arcane": "primary", "Shotgun Arcane": "primary", "Bow Arcane": "primary",
    "Secondary Arcane": "secondary", "Melee Arcane": "melee", "Kitgun Arcane": "kitgun", "Zaw Arcane": "zaw",
    "Arcane": "warframe",
}

log_unparsed = []      # (вид, имя, ссылка, строка)
log_notes = []
log_skipped = []       # (вид, имя, uniqueName) — дубли без записи на вики


# ---------- загрузка ----------

def fetch(url, name):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if path.exists() and not REFRESH and time.time() - path.stat().st_mtime < CACHE_TTL:
        return path.read_text(encoding="utf-8")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                text = r.read().decode("utf-8")
            path.write_text(text, encoding="utf-8")
            return text
        except Exception as ex:  # сеть/лимиты — пробуем ещё
            print(f"  ! {url}: {ex}", file=sys.stderr)
            time.sleep(2 + attempt * 3)
    if path.exists():
        print(f"  ! беру старый кэш {name}", file=sys.stderr)
        return path.read_text(encoding="utf-8")
    raise RuntimeError(f"не удалось скачать {url}")


def wfcd(name):
    return json.loads(fetch(WFCD + name + ".json", "wfcd_" + name.replace("/", "_") + ".json"))


def wiki(module):
    return parse_module(fetch(WIKI + "Module:" + module.replace(" ", "_") + "?action=raw",
                              "wiki_" + module.replace("/", "_").replace(" ", "_") + ".lua"))


def wfcd_version():
    try:
        rel = json.loads(fetch("https://api.github.com/repos/WFCD/warframe-items/releases/latest", "wfcd_release.json"))
        return {"tag": rel.get("tag_name"), "date": (rel.get("published_at") or "")[:10]}
    except Exception:
        return {"tag": None, "date": None}


# ---------- разбор текстов эффектов ----------

NUM = r"([+-]?\d+(?:\.\d+)?)"
PCT = NUM + "%"
ELEMENTS = "Heat|Cold|Electricity|Toxin|Blast|Radiation|Gas|Magnetic|Viral|Corrosive|Void|Tau"
FACTIONS = r"Grineer|Corpus|Infested|Corrupted|Orokin|Murmur|The Murmur|Sentients?|Narmer|Techrot|Scaldra|Anarchs|Eximus"

# (regex, stat, bucket, вид значения) ; {1} в stat — подстановка второй группы
RULES = [
    (rf"^{PCT} Damage$", "damage", "base_damage", "pct"),
    (rf"^{PCT} Melee Damage$", "damage_class_melee", "base_damage", "pct"),
    # «Direct Damage» у новых Galvanized: отдельная корзина, пока не сверено с вики (TODO_VERIFY)
    (rf"^{PCT} Direct Damage$", "direct_damage", "direct_damage", "pct"),
    (rf"^{PCT} Weak Point Damage$", "weakpoint_damage", "weakpoint", "pct"),
    (rf"^{PCT} Weak Point Critical Chance$", "weakpoint_crit_chance", "weakpoint", "pct"),
    (rf"^{PCT} to Headshot Multiplier$", "headshot_multiplier", "weakpoint", "pct"),
    (rf"^{PCT} Blast Range$", "blast_range", "utility", "pct"),
    (rf"^{NUM}m Beam Range$", "beam_range", "utility", "flat"),
    (rf"^{PCT} Beam Range$", "beam_range_pct", "utility", "pct"),
    (rf"^{NUM} Bounce$", "bounce", "utility", "flat"),
    (rf"^{PCT} Throw Damage$", "throw_damage", "utility", "pct"),
    (rf"^{PCT} (?:Additional )?Combo Count Chance$", "combo_count_chance", "utility", "pct"),
    (rf"^{PCT} Combo Duration$", "combo_duration_pct", "utility", "pct"),
    (rf"^{PCT} Heavy Attack Wind Up Speed$", "heavy_windup", "utility", "pct"),
    (rf"^{PCT} Fire/Charge Rate$", "fire_rate", "fire_rate", "pct"),
    (rf"^{NUM} Final Status Chance$", "status_chance_flat", "status_chance_flat", "pct100"),
    # ауры («Squad receives/gains» срезается заранее)
    (rf"^{PCT} (Rifle|Pistol|Shotgun|Sniper Rifle|Melee) Damage$", "damage_class_{1}", "base_damage", "pct"),
    (rf"^{PCT} Weapon Damage$", "damage", "base_damage", "pct"),
    (rf"^{PCT} Maximum Health$", "health", "frame", "pct"),
    (rf"^Enemies lose -?{PCT} Armor$", "armor_strip", "enemy", "pct"),
    (rf"^Enemies lose -?{PCT} Shield Capacity$", "shield_strip", "enemy", "pct"),
    (rf"^{PCT} Weak Point Critical Chance$", "weakpoint_crit_chance", "weakpoint", "pct"),
    (rf"^{PCT} ({ELEMENTS})$", "element_{1}", "element", "pct"),
    (rf"^{PCT} (Impact|Puncture|Slash)$", "physical_{1}", "physical", "pct"),
    (rf"^{PCT} Multishot$", "multishot", "multishot", "pct"),
    (rf"^{PCT} Critical Chance$", "crit_chance", "crit_chance", "pct"),
    (rf"^{PCT} Critical Chance \(x(\d+(?:\.\d+)?) for Heavy Attacks\)$", "crit_chance", "crit_chance", "pct"),
    (rf"^{PCT} Critical Damage$", "crit_damage", "crit_damage", "pct"),
    (rf"^{PCT} Status Chance$", "status_chance", "status_chance", "pct"),
    (rf"^{PCT} Status Damage$", "status_damage", "status_damage", "pct"),
    (rf"^{PCT} Status Duration$", "status_duration", "status_duration", "pct"),
    (rf"^{PCT} Fire Rate(?: \(x\d+(?:\.\d+)? for Bows\))?$", "fire_rate", "fire_rate", "pct"),
    (rf"^{PCT} Attack Speed$", "attack_speed", "fire_rate", "pct"),
    (rf"^{PCT} Reload Speed$", "reload_speed", "reload", "pct"),
    (rf"^{PCT} Magazine Capacity$", "magazine", "magazine", "pct"),
    (rf"^{PCT} Ammo Maximum$", "ammo_max", "utility", "pct"),
    (rf"^{NUM} Punch Through$", "punch_through", "utility", "flat"),
    (rf"^{PCT} Projectile Speed$", "projectile_speed", "utility", "pct"),
    (rf"^{PCT} (Weapon Recoil|Zoom|Accuracy|Spread)$", "{1}", "utility", "pct"),
    (rf"^x{NUM} Damage to ({FACTIONS})$", "faction_{1}", "faction", "mult"),
    (rf"^{PCT} Heavy Attack Efficiency$", "heavy_efficiency", "utility", "pct"),
    (rf"^{NUM}s Combo Duration$", "combo_duration", "utility", "flat"),
    (rf"^{NUM} Initial Combo$", "initial_combo", "utility", "flat"),
    (rf"^{NUM} Range$", "melee_range", "utility", "flat"),
    (rf"^{PCT} Finisher Damage$", "finisher_damage", "utility", "pct"),
    # фрейм
    (rf"^{PCT} Health$", "health", "frame", "pct"),
    (rf"^{PCT} Shield Capacity$", "shield", "frame", "pct"),
    (rf"^{PCT} Armor$", "armor", "frame", "pct"),
    (rf"^{PCT} Energy Max$", "energy", "frame", "pct"),
    (rf"^{PCT} Ability (Strength|Duration|Range|Efficiency)$", "ability_{1}", "frame", "pct"),
    (rf"^{PCT} Sprint Speed$", "sprint_speed", "frame", "pct"),
    (rf"^{PCT} Shield Recharge$", "shield_recharge", "frame", "pct"),
    (rf"^{PCT} Casting Speed$", "casting_speed", "frame", "pct"),
    (rf"^{PCT} (?:to )?Parkour Velocity$", "parkour_velocity", "frame", "pct"),
]
RULES = [(re.compile(r, re.I), s, b, k) for r, s, b, k in RULES]

COND_PREFIX = re.compile(r"^(On [^:]+|While [^:]+|When [^:]+|After [^:]+|Every [^:]+|If [^:]+|Upon [^:]+):\s*", re.I)
COND_SUFFIX = re.compile(r"\s*for (\d+(?:\.\d+)?)s\.?(?:\s*Stacks up to (\d+)x\.?)?$", re.I)
# хвосты-условия внутри строки: «… when Aiming», «… per Status Type affecting the target» и т.п.
COND_PHRASES = [
    (re.compile(r"\s+when Aiming$", re.I), {"aiming": True}),
    (re.compile(r"\s+while Aiming$", re.I), {"aiming": True}),
    (re.compile(r"\s+while Invisible$", re.I), {"invisible": True}),
    (re.compile(r"\s+while Blocking$", re.I), {"blocking": True}),
    (re.compile(r"\s+(?:on|for) Slide Attacks?$", re.I), {"attack": "slide"}),
    (re.compile(r"\s+on Heavy Attacks?$", re.I), {"attack": "heavy"}),
    (re.compile(r"\s+on Lifted enemies$", re.I), {"target": "lifted"}),
    (re.compile(r"\s+on first shot in Magazine$", re.I), {"first_shot": True}),
    (re.compile(r"\s+per Status Type affecting the target$", re.I), {"per": "status_type"}),
    (re.compile(r"\s+stacks with Combo Multiplier$", re.I), {"per": "combo_multiplier"}),
]
AND_SPLIT = re.compile(rf"^({PCT} [^0-9]+?) and ({PCT} .+)$", re.I)
CHANCE = re.compile(r"^(\d+(?:\.\d+)?)% chance for (.+)$", re.I)
TO_WEAPONS = re.compile(r"\s+(?:to|for) (Primary|Secondary|Melee) Weapons?$", re.I)
TAG = re.compile(r"<DT_[A-Z_]+>|<[A-Z_]+>")
# строки, которые на урон и статы не влияют: в отчёт не попадают
IGNORE = re.compile(r"Arcane Revive|Converts .* ammo pickups|Chance to Explode|Gore Chance|Hush|"
                    r"chance an enemy will hear|Enemy Radar|Loot Radar|^Squadmates gain", re.I)


def clean(line):
    return re.sub(r"\s+", " ", TAG.sub("", line)).strip()


def split_lines(stats):
    """Строки эффектов одного ранга: элемент WFCD может содержать переносы (\\n буквально)."""
    blocks = []
    for s in stats or []:
        parts = [clean(p) for p in re.split(r"\\n|\n|\r", s) if clean(p)]
        if parts:
            blocks.append(parts)
    return blocks


def match_line(line):
    for rx, stat, bucket, kind in RULES:
        m = rx.match(line)
        if not m:
            continue
        v = float(m.group(1))
        if kind in ("pct", "pct100"):
            v = v / 100
        elif kind == "mult":
            v = round(v - 1, 6)          # x1.55 к фракции = +55% в корзину фракции
        if "{1}" in stat:
            g2 = m.group(2).lower().replace("the ", "").replace(" ", "_")
            stat = stat.replace("{1}", "sentient" if g2 == "sentients" else g2)
        eff = {"stat": stat, "value": round(v, 6), "bucket": bucket}
        if stat.startswith("damage_class_"):
            eff = {"stat": "damage", "value": round(v, 6), "bucket": bucket, "condition": {"weaponClass": stat[13:]}}
        if bucket == "faction":
            eff["condition"] = {"faction": stat.split("_", 1)[1]}
        return eff
    return None


def parse_rank(stats):
    """-> (эффекты, неразобранные строки). Условный блок «On Kill: ... for 4s. Stacks up to 12x.»
    разбирается с condition и пометкой auto (требует проверки)."""
    effects, bad = [], []
    for block in split_lines(stats):
        cond = None
        lines = []
        for line in block:                    # заголовок «On X:» может стоять и в середине блока
            m = COND_PREFIX.match(line)
            if m:
                lines.append(("cond", m.group(1)))
                line = line[m.end():].strip()
                if not line:
                    continue
            lines.append(("line", line))
        for kind, line in lines:
            if kind == "cond":
                cond = {"trigger": line}
                continue
            text, c = line.rstrip("."), (dict(cond) if cond else None)
            text = re.sub(r"^Squad (?:receives|gains) ", "", text)
            pd = re.match(rf"^You lose {NUM}% Ability Strength", text)   # Power Donation
            if pd:
                text = f"-{pd.group(1)}% Ability Strength"
            if re.search(r"\.?\s*Multishot cannot be modified$", text, re.I):   # Acuity-моды
                text = re.sub(r"\.?\s*Multishot cannot be modified$", "", text, flags=re.I)
                lock = {"stat": "multishot_locked", "value": 1, "bucket": "special"}
                if lock not in effects:
                    effects.append(lock)
            ch = CHANCE.match(text)           # «15% chance for +180% Damage to Primary Weapons for 24s»
            if ch:
                c = {**(c or {}), "chance": float(ch.group(1)) / 100}
                text = ch.group(2)
            had_suffix = False
            for _ in range(2):                # «… to Primary Weapons for 24s» — хвосты в любом порядке
                sm = COND_SUFFIX.search(text)
                if sm:
                    had_suffix = True
                    c = c or {}
                    c["duration"] = float(sm.group(1))
                    if sm.group(2):
                        c["stacks"] = int(sm.group(2))
                    text = text[:sm.start()].strip()
                wm = TO_WEAPONS.search(text)
                if wm:
                    c = {**(c or {}), "slot": wm.group(1).lower()}
                    text = text[:wm.start()].strip()
            for rx, extra in COND_PHRASES:
                pm = rx.search(text)
                if pm:
                    c = {**(c or {}), **extra}
                    text = text[:pm.start()].strip()
            am = AND_SPLIT.match(text)
            parts = [am.group(1), am.group(3)] if am else [text]
            # «+X% Critical Chance and Damage» -> шанс и урон крита
            cm = re.match(rf"^{PCT} Critical Chance and Damage$", text, re.I)
            if cm:
                parts = [f"{cm.group(1)}% Critical Chance", f"{cm.group(1)}% Critical Damage"]
            effs = [match_line(p) for p in parts]
            if None in effs:
                if not IGNORE.search(line):
                    bad.append(line)
            else:
                for eff in effs:
                    if c:
                        eff["condition"] = {**eff.get("condition", {}), **c}
                        eff["auto"] = True    # условие разобрано автоматически — сверить с вики
                    if eff not in effects:    # WFCD иногда дублирует строку (Merciless: Reload Speed)
                        effects.append(eff)
            if had_suffix:
                cond = None                   # строки после «for Ns. Stacks up to Nx.» — уже без условия
    return effects, bad


# ---------- сборка ----------

def ru_name(ru, uid):
    if not uid:
        return None
    return ((ru.get(uid) or {}).get("name") or "").strip() or None


def build_upgrades(items, ru, groups, wiki_map, kind, overrides):
    out = {}
    # одноимённые записи, которых нет на вики (скрытые Expert-версии, служебные Listener): берём ту, что есть на вики
    on_wiki = {it["name"] for it in items if it["uniqueName"] in wiki_map}
    for it in items:
        uid = it["uniqueName"]
        group = groups.get(it.get("type"))
        if not group or "/Beginner/" in uid or "/PvPMods/" in uid or "Riven" in it.get("type", ""):
            continue
        if not it.get("levelStats") or uid not in wiki_map and it["name"] in on_wiki:
            log_skipped.append((kind, it["name"], uid))
            continue
        ranks_en = [lv.get("stats", []) for lv in it.get("levelStats") or []]
        ranks_ru = [lv.get("stats", []) for lv in ((ru.get(uid) or {}).get("levelStats") or [])]
        ranks, bad_lines = [], []
        for st in ranks_en:
            eff, bad = parse_rank(st)
            ranks.append(eff)
            bad_lines = bad                    # в отчёт — строки максимального ранга
        w = wiki_map.get(uid, {})
        ov = overrides.get(uid) or overrides.get(it["name"])
        rec = {
            "id": uid, "name": w.get("Name") or it["name"], "ru": ru_name(ru, uid),
            "type": it.get("type"), "compat": it.get("compatName"),
            "polarity": it.get("polarity"), "rarity": it.get("rarity"),
            "drain": it.get("baseDrain"), "maxRank": it.get("fusionLimit", len(ranks) - 1 if ranks else 0),
            "exilus": bool(it.get("isExilus") or it.get("isUtility")), "augment": bool(it.get("isAugment")),
            "set": (it.get("modSet") or "").split("/")[-1] or None,
            "upgradeTypes": w.get("UpgradeTypes"),
            "text": [" / ".join(" ".join(b) for b in split_lines(ranks_en[-1]))] if ranks_en else [],
            "textRu": [clean(s) for s in ranks_ru[-1]] if ranks_ru else [],
            "ranks": ranks,
        }
        if ov:
            mx = ov.get("effectsMax")
            if mx:      # линейный рост по рангам: значение ранга r = максимум × (r+1)/(maxRank+1)
                n = rec["maxRank"] + 1
                ov = {**ov, "ranks": [[{**e, "value": round(e["value"] * (r + 1) / n, 6)} for e in mx] for r in range(n)]}
            rec.update({k: v for k, v in ov.items() if k not in ("source", "note", "effectsMax")})
            rec["override"] = {"source": ov.get("source"), "verified": ov.get("verified", False), "note": ov.get("note")}
        elif bad_lines:
            rec["unparsed"] = sorted(set(bad_lines))
            k = "augment" if it.get("isAugment") else kind
            log_unparsed.append((k, it["name"], it.get("wikiaUrl") or "", "; ".join(sorted(set(bad_lines)))))
        if any(e.get("auto") for r in ranks for e in r) and not ov:
            log_notes.append((kind, it["name"], it.get("wikiaUrl") or ""))
        rec = {k: v for k, v in rec.items() if v not in (None, [], False, "")}
        out.setdefault(group, []).append(rec)
    for g in out.values():
        g.sort(key=lambda r: r["name"])
    return out


def camel(k):
    return k[:1].lower() + k[1:]


ATTACK_SKIP = {"IsSilent", "MinSpread", "MaxSpread", "_TooltipAttackDisplay"}
WEAPON_KEYS = ["Class", "Slot", "Mastery", "Magazine", "Reload", "AmmoMax", "Disposition", "Polarities",
               "ExilusPolarity", "StancePolarity", "Traits", "Trigger", "CompatibilityTags", "Family",
               "IncarnonChargeGain", "DefaultUpgrades", "BlockAngle", "ComboDur", "FollowThrough", "HeavyAttack",
               "HeavySlamAttack", "HeavyRadialDmg", "SlamAttack", "SlamRadialDmg", "SlideAttack", "Range", "WindUp"]


def build_weapons(ru):
    out = {}
    for slot in WEAPON_SLOTS:
        data = wiki("Weapons/data/" + slot)
        rows = []
        for key, w in data.items():
            if not isinstance(w, dict) or w.get("_IgnoreEntry") or not w.get("Attacks") and not w.get("NormalAttack"):
                continue
            attacks = []
            for a in w.get("Attacks") or []:
                attacks.append({camel(k): v for k, v in a.items() if k not in ATTACK_SKIP})
            rec = {"id": w.get("InternalName"), "name": w.get("Name", key),
                   "ru": ru_name(ru, w.get("InternalName")), "attacks": attacks}
            for k in WEAPON_KEYS:
                if k in w:
                    rec[camel(k)] = w[k]
            group = slot
            if slot == "archwing":
                group = "archmelee" if "melee" in (w.get("Slot") or w.get("Class") or "").lower() else "archgun"
            out.setdefault(group, []).append({k: v for k, v in rec.items() if v not in (None, [], "")})
    for g in out.values():
        g.sort(key=lambda r: r["name"])
    return out


def build_warframes(ru, wf_wfcd):
    data = wiki("Warframes/data")
    abil_ru = {}
    for w in wf_wfcd:
        for a in w.get("abilities") or []:
            n = ru_name(ru, a.get("uniqueName"))
            if n:
                abil_ru[a["name"]] = n
    rows = []
    for key, w in (data.get("Warframes") or {}).items():
        if not isinstance(w, dict) or w.get("_IgnoreEntry"):
            continue
        rec = {"id": w.get("InternalName"), "name": w.get("Name", key), "ru": ru_name(ru, w.get("InternalName")),
               "health": w.get("Health"), "shield": w.get("Shield"), "armor": w.get("Armor"),
               # 30-й ранг: +100 здоровья, +100 щитов, +50 энергии; исключения заданы в данных вики полями *Rank30
               "rank30": {"health": w.get("HealthRank30", (w.get("Health") or 0) + 100),
                          "shield": w.get("ShieldRank30", (w.get("Shield") or 0) + 100 if w.get("Shield") else 0),
                          "energy": w.get("EnergyRank30", (w.get("Energy") or 0) + 50 if w.get("Energy") else 0),
                          "armor": w.get("ArmorRank30", w.get("Armor"))},
               "energy": w.get("Energy"), "energyRank30": w.get("EnergyRank30"), "initialEnergy": w.get("InitialEnergy"),
               "sprint": w.get("Sprint"), "auraPolarity": w.get("AuraPolarity"), "exilusPolarity": w.get("ExilusPolarity"),
               "polarities": w.get("Polarities"), "progenitor": w.get("Progenitor"), "subsumed": w.get("Subsumed"),
               "abilities": [{"name": a, "ru": abil_ru.get(a)} for a in w.get("Abilities") or []],
               "passive": w.get("Passive")}
        rows.append({k: v for k, v in rec.items() if v not in (None, [], "")})
    rows.sort(key=lambda r: r["name"])
    return rows


def parse_multis(lst):
    out = {}
    for s in lst or []:
        m = re.match(r"^(.+?):\s*([\d.]+)x", s)
        if m:
            out[m.group(1).strip()] = float(m.group(2))
    return out


def build_enemies(ru, overrides):
    rows, seen = [], set()
    for fac in ENEMY_FACTIONS:
        for key, e in wiki("Enemies/data/" + fac).items():
            if not isinstance(e, dict):
                continue
            g, s = e.get("General") or {}, e.get("Stats") or {}
            if s.get("Health") is None and s.get("Shield") is None:
                continue
            uid = g.get("InternalName")
            rec = {"id": uid, "name": g.get("Name", key), "ru": ru_name(ru, uid), "faction": g.get("Faction"),
                   "type": g.get("Type"), "health": s.get("Health"), "shield": s.get("Shield"), "armor": s.get("Armor"),
                   "overguard": s.get("Overguard"), "baseLevel": s.get("BaseLevel"),
                   "eximusHealth": s.get("EximusHealth"), "multis": parse_multis(s.get("Multis"))}
            ov = overrides.get(rec["name"])
            if ov:
                rec.update({k: v for k, v in ov.items() if k not in ("note",)})
            if (rec["name"], uid) in seen:     # одна запись может лежать в двух разделах фракций
                continue
            seen.add((rec["name"], uid))
            rows.append({k: v for k, v in rec.items() if v not in (None, [], {}, "")})
    rows.sort(key=lambda r: (r.get("faction") or "", r["name"]))
    return rows


def build_damage():
    dt = wiki("DamageTypes/data")
    types = {}
    for name, t in (dt.get("Types") or {}).items():
        if not isinstance(t, dict):
            continue
        types[name] = {"internal": t.get("InternalName"), "positives": t.get("Positives") or [],
                       "negatives": t.get("Negatives") or [], "combo": t.get("Types") or [],
                       "proc": t.get("ProcInternalName")}
    # фракции текущей системы урона (Damage 3.0); типы здоровья Damage 2.0 (Introduced = 11) не берём
    factions = sorted(k for k, v in (dt.get("Health") or {}).items()
                      if isinstance(v, dict) and v.get("Type") == "Health" and str(v.get("Introduced")) not in ("11", "None"))
    # матрица фракция -> тип -> множитель: «+» = ×1,5, «−» = ×0,5 (вики, Damage 3.0)
    matrix = {}
    for f in factions:
        row = {}
        for tn, t in types.items():
            if f in t["positives"]:
                row[tn] = 1.5
            elif f in t["negatives"]:
                row[tn] = 0.5
        matrix[f] = row
    return {"source": WIKI + "Damage", "types": types, "factions": factions, "matrix": matrix}


def load_overrides(name):
    p = DATA / "overrides" / f"{name}.json"
    if not p.exists():
        return {}
    d = json.loads(p.read_text(encoding="utf-8"))
    return {k: v for k, v in d.items() if not k.startswith("_")}


def write(rel, obj):
    p = DATA / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return p.stat().st_size


def main():
    t0 = time.time()
    print("Загрузка WFCD…")
    ru = wfcd("i18n/ru")
    mods, arcanes, wf_wfcd = wfcd("Mods"), wfcd("Arcanes"), wfcd("Warframes")
    print("Загрузка вики…")
    wmods = wiki("Mods/data")
    warc = wiki("Arcane/data")
    wiki_map = {}
    for d in list((wmods.get("Mods") or {}).values()) + list((warc.get("Arcanes") or {}).values()):
        if isinstance(d, dict) and d.get("InternalName"):
            wiki_map[d["InternalName"]] = d

    sizes = {}
    mod_groups = build_upgrades(mods, ru, MOD_GROUPS, wiki_map, "mod", load_overrides("mods"))
    for g, rows in mod_groups.items():
        sizes[f"mods/{g}.json"] = write(f"mods/{g}.json", rows)
    arc_groups = build_upgrades(arcanes, ru, ARCANE_GROUPS, wiki_map, "arcane", load_overrides("arcanes"))
    for g, rows in arc_groups.items():
        sizes[f"arcanes/{g}.json"] = write(f"arcanes/{g}.json", rows)

    weapons = build_weapons(ru)
    for g, rows in weapons.items():
        sizes[f"weapons/{g}.json"] = write(f"weapons/{g}.json", rows)
    frames = build_warframes(ru, wf_wfcd)
    sizes["warframes.json"] = write("warframes.json", frames)
    enemies = build_enemies(ru, load_overrides("enemies"))
    sizes["enemies.json"] = write("enemies.json", enemies)
    sizes["damage.json"] = write("damage.json", build_damage())

    counts = {"mods": sum(len(v) for v in mod_groups.values()), "arcanes": sum(len(v) for v in arc_groups.values()),
              "weapons": sum(len(v) for v in weapons.values()), "warframes": len(frames), "enemies": len(enemies)}
    meta = {"built": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "wfcd": wfcd_version(),
            "sources": {"wfcd": "https://github.com/WFCD/warframe-items", "wiki": "https://wiki.warframe.com"},
            "counts": counts, "files": sorted(sizes)}
    write("meta.json", meta)

    # отчёт о неразобранном
    rep = ["# Неразобранные эффекты", "", f"Сборка {meta['built']}. Строки, которые скрипт не смог превратить в "
           "{stat, value, bucket}. Правка — data/overrides/*.json (ключ — uniqueName или имя).", ""]
    titles = {"mod": "Моды", "arcane": "Мистификаторы", "augment": "Аугменты способностей (этап 6, баффы)"}
    for kind in ("mod", "arcane", "augment"):
        items = [x for x in log_unparsed if x[0] == kind]
        rep += [f"## {titles[kind]}: {len(items)}", ""]
        rep += [f"- [{n}]({u}) — {t}" for _, n, u, t in sorted(items, key=lambda x: x[1])]
        rep.append("")
    rep += [f"## Условные эффекты, разобранные автоматически: {len(log_notes)}", "",
            "Условие (триггер, длительность, стаки) взято из текста; корзину и механику сверить с вики.", ""]
    rep += [f"- [{n}]({u})" for _, n, u in sorted(log_notes, key=lambda x: x[1])]
    rep += ["", f"## Пропущены (одноимённые записи WFCD, которых нет на вики): {len(log_skipped)}", ""]
    rep += [f"- {n} — `{u}`" for _, n, u in sorted(log_skipped, key=lambda x: x[1])]
    (ROOT / "tools" / "unparsed.md").write_text("\n".join(rep) + "\n", encoding="utf-8")

    total = sum(sizes.values())
    print(f"Готово за {time.time() - t0:.1f} с: " + ", ".join(f"{k} {v}" for k, v in counts.items()))
    n = {k: sum(1 for x in log_unparsed if x[0] == k) for k in titles}
    print(f"Файлов {len(sizes)}, {total / 1024:.0f} КБ. Не разобрано: модов {n['mod']}, мистификаторов {n['arcane']}, "
          f"аугментов {n['augment']}; условных авторазборов {len(log_notes)} → tools/unparsed.md")


if __name__ == "__main__":
    main()
