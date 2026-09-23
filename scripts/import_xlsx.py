"""Konverterer kjøreplanen (Excel) til data/schedule.json.

Bruk:  python3 scripts/import_xlsx.py [sti/til/Kj_replan.xlsx]
Krever: pip install openpyxl

Leser bufrede verdier (data_only), så Excel-filen må være lagret etter siste endring.
"""
import datetime as dt
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "Kj_replan.xlsx"
OUT = ROOT / "data" / "schedule.json"

# Rettelser som ikke er ført inn i Excel ennå: tittel -> felt som overstyres.
OVERRIDES = {
    "Deja Vu - Dans": {"start": "21:05"},  # står som 20:05 i Excel, riktig er 21:05
}


def minutes(v):
    """Excel-tid / 'hh:mm'-tekst -> minutter etter midnatt (eller varighet i minutter)."""
    if v is None or v == "":
        return None
    if isinstance(v, dt.time):
        return v.hour * 60 + v.minute
    if isinstance(v, dt.datetime):
        return v.hour * 60 + v.minute
    if isinstance(v, (int, float)):
        return round(v * 24 * 60)
    m = re.match(r"^\s*(\d{1,2}):(\d{2})", str(v))
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def clean(v):
    if v is None:
        return None
    s = re.sub(r"\s+", " ", str(v)).strip()
    return s or None


def fmt(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def kind(title):
    t = title.lower()
    for key, words in [
        ("bumper", ["bumper"]),
        ("host", ["introduserer", "velkommen"]),
        ("pause", ["pause"]),
        ("keynote", ["keynote", "presentasjon"]),
        ("case", ["kundecase"]),
        ("talk", ["intervju", "prat", "sofaprat"]),
        ("doors", ["dørene", "countdown"]),
        ("film", ["film"]),
        ("changeover", ["omrigg", "slutt"]),
        ("act", ["dans", "trapes", "psycho", "bordbummer", "tryllenummer", "nettverkslek"]),
    ]:
        if any(w in t for w in words):
            return key
    return "host"


def main():
    ws = openpyxl.load_workbook(SRC, data_only=True).active
    header = [clean(c.value) for c in ws[1]]
    idx = {h: i for i, h in enumerate(header) if h}
    items, block = [], "dag"
    for row in ws.iter_rows(min_row=2, values_only=True):
        title = clean(row[idx["Post"]])
        if not title:
            continue
        fix = OVERRIDES.get(title, {})
        start = minutes(fix.get("start", row[idx["Start"]]))
        dur = minutes(row[idx["Varighet"]]) or 0
        if start is None:
            continue
        k = kind(title)
        items.append({
            "id": f"r{len(items) + 1:02d}",
            "title": title,
            "start": start,
            "duration": dur,
            "block": block,
            "kind": k,
            "sound": clean(row[idx["Lyd"]]),
            "light": clean(row[idx["Lys"]]),
            "av": clean(row[idx["AV"]]),
            "note": clean(row[idx["Kommentar"]]),
        })
        if k == "changeover":
            items[-1]["block"] = "omrigg"
            block = "kveld"
    # Kjøreplanen følger klokka: sorter på starttid og varsle om avvik fra radrekkefølgen i Excel.
    warnings = []
    for a, b in zip(items, items[1:]):
        if b["start"] < a["start"]:
            warnings.append(f"«{b['title']}» ({fmt(b['start'])}) står etter «{a['title']}» ({fmt(a['start'])}) i Excel – sortert på klokkeslett.")
    items.sort(key=lambda i: i["start"])
    for a, b in zip(items, items[1:]):
        if a["block"] == b["block"] and a["start"] + a["duration"] > b["start"]:
            warnings.append(f"«{a['title']}» overlapper med «{b['title']}».")
    OUT.write_text(json.dumps({"source": SRC.name, "warnings": warnings, "items": items}, ensure_ascii=False, indent=2) + "\n")
    print(f"Skrev {len(items)} poster til {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
