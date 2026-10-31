#!/usr/bin/env python3
"""Find modern, amenity-rich, non-garden 1-bedroom apartments in Fairfax
County blue-zone zip codes around McNair / Herndon / Reston under a strict
rent ceiling.

Data source: rent.com search + property detail pages (server-rendered JSON in
``__NEXT_DATA__``). These carry floor-plan and unit-level asking rents that
rent.com refreshes from each property's own feed; every property's
``updatedAt`` timestamp is written to the output so you can see how fresh a
price is. Aggregator prices can lag the property's own website, so always
confirm the final shortlist on the property's site or by phone (see README).

Building style (garden vs. mid/high-rise), year built and review ratings are
not reliably in the aggregator feed, so they come from ``building_facts.json``
(hand-verified, with sources). Properties with no verified facts and no
elevator listed are reported as "style unverified" instead of being trusted.

Usage:
    python finder.py                       # core zips, < $2,180
    python finder.py --include-nearby      # + Chantilly / Fair Lakes
    python finder.py --zips 20190 20171 --max-rent 2180 --out results
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import os
import re
import sys
import time
from dataclasses import asdict, dataclass, field

import requests

from zones import BLUE_ZONE_ZIPS, CORE_ZIPS, NEARBY_ZIPS, ZONE_LIMITS, zone_for_zip

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://www.rent.com"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
NEXT_DATA_RE = re.compile(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)

# Anchor points used to report "miles to the nearest of McNair/Herndon/Reston".
ANCHORS = {
    "McNair Farms": (38.9405, -77.4035),
    "Downtown Herndon": (38.9696, -77.3861),
    "Reston Town Center": (38.9586, -77.3570),
}

# Amenity keywords weighted 2 (premium); every other listed amenity counts 1.
PREMIUM_AMENITIES = (
    "rooftop", "concierge", "co-working", "coworking", "business center",
    "fitness center", "yoga", "pool", "package", "ev charging", "clubhouse",
    "club room", "lounge", "theater", "media room", "game room",
    "recreation room", "dog park", "pet spa", "pet washing", "grill",
    "barbecue", "fire pit", "bike", "garage", "storage", "controlled access",
    "on-site retail", "hospitality", "spa", "sauna", "valet", "24-hour", "smart",
)
# Signals of a modern unit with newer appliances / finishes.
MODERN_SIGNALS = {
    "stainless steel": 2, "quartz": 2, "granite": 1, "smart": 1, "washer": 1,
    "dryer": 1, "recently_updated": 2, "renovated": 2, "hardwood": 1,
    "plank": 1, "kitchen island": 1, "energy star": 1, "keyless": 1,
    "walk-in closet": 1, "tile backsplash": 1, "luxury": 1, "new construction": 2,
}
GARDEN_WORDS = re.compile(r"garden[- ]style|garden apartment|walk-?up", re.I)
TOWER_WORDS = re.compile(r"high[- ]rise|mid[- ]rise|tower|\b\d{1,2}[- ]stor(y|ies)", re.I)
# Fairfax County Workforce Dwelling Units / affordable set-asides show up in
# floor-plan names as "WDU", "ADU", "Income Limits Apply", "80% AMI", etc.
RESTRICTED_PLAN = re.compile(
    r"\bW?DU\b|\(WDU\)|-WDU|\bADU\b|income|afford|\bAMI\b|\d{2}\s*%|LIHTC|workforce", re.I
)
JUNIOR_PLAN = re.compile(r"\bjr\.?\b|junior|alcove|\bjr[-\d]", re.I)
DEAL_RE = re.compile(
    r"(?:up to\s*)?(\d+(?:\.\d+)?|one|two|three|four|six|eight)\s*"
    r"(month|week)s?\s*(?:of\s*)?(?:free|'s free)", re.I
)
WORD_NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "six": 6, "eight": 8}


def miles(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 3958.8 * 2 * math.asin(math.sqrt(h))


def money(s) -> int | None:
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return int(s)
    m = re.search(r"\$?\s*([\d,]+)", str(s))
    return int(m.group(1).replace(",", "")) if m else None


class Fetcher:
    """GETs rent.com pages, extracts __NEXT_DATA__, caches JSON on disk."""

    def __init__(self, cache_dir: str, delay: float = 3.0, max_age_h: float = 6):
        self.cache_dir = cache_dir
        self.delay = delay
        self.max_age = max_age_h * 3600
        self._new_session()
        os.makedirs(cache_dir, exist_ok=True)

    def _new_session(self) -> None:
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})

    def next_data(self, path: str) -> dict | None:
        key = re.sub(r"[^A-Za-z0-9]+", "_", path).strip("_") + ".json"
        fp = os.path.join(self.cache_dir, key)
        if os.path.exists(fp) and time.time() - os.path.getmtime(fp) < self.max_age:
            with open(fp) as f:
                return json.load(f)
        for attempt in range(5):
            try:
                r = self.s.get(BASE + path, timeout=(10, 30))
            except requests.RequestException as e:
                print(f"  ! {path}: {e}", file=sys.stderr)
                time.sleep(2 ** (attempt + 1))
                continue
            time.sleep(self.delay)
            if r.status_code == 404:
                return None
            if r.status_code == 202:
                # Bot challenge / rate limit: cool down and start a fresh session.
                wait = 30 * (attempt + 1)
                print(f"  ! {path}: rate-limited (202), cooling down {wait}s", file=sys.stderr)
                time.sleep(wait)
                self._new_session()
                continue
            if r.status_code != 200:
                print(f"  ! {path}: HTTP {r.status_code}", file=sys.stderr)
                time.sleep(2 ** (attempt + 1))
                continue
            m = NEXT_DATA_RE.search(r.text)
            if not m:
                return None
            data = json.loads(m.group(1))
            with open(fp, "w") as f:
                json.dump(data, f)
            return data
        print(f"  ! giving up on {path}", file=sys.stderr)
        return None


@dataclass
class Unit:
    unit: str | None
    floor_plan: str | None
    rent: int
    sqft: int | None
    available: str | None
    is_available_now: bool | None
    kind: str  # "market" | "income-restricted" | "junior"


@dataclass
class Property:
    id: str
    name: str
    address: str
    zip: str
    zone: str | None
    url: str
    lat: float | None
    lng: float | None
    miles_to_anchor: float | None
    nearest_anchor: str | None
    manager: str | None
    total_units: int | None
    updated_at: str | None
    has_elevator: bool
    garden_hint: bool
    tower_hint: bool
    restricted_property: bool
    senior: bool
    amenity_count: int
    amenity_score: int
    modern_score: int
    deal: str | None
    months_free: float | None
    amenities: list[str] = field(default_factory=list)
    one_bed_units: list[Unit] = field(default_factory=list)
    facts: dict = field(default_factory=dict)

    @property
    def style(self) -> str:
        """'garden', 'mid-rise', 'high-rise', ... or 'unverified'."""
        if self.facts.get("style"):
            return self.facts["style"]
        if self.garden_hint:
            return "garden"
        if self.has_elevator or self.tower_hint:
            return "elevator building (unverified)"
        return "unverified"


def search_paths(f: Fetcher, zip_code: str) -> list[str]:
    """All rent.com listing paths with 1-bedroom plans in one zip."""
    paths: list[str] = []
    page = 1
    while True:
        path = f"/zip-{zip_code}-apartments/1-bedroom" + ("" if page == 1 else f"/page-{page}")
        d = f.next_data(path)
        if not d:
            break
        ls = d["props"]["pageProps"]["pageData"]["location"]["listingSearch"]
        listings = ls.get("listings", [])
        for l in listings:
            if l.get("urlPathname"):
                p = "/" + l["urlPathname"].lstrip("/")
                if p not in paths:
                    paths.append(p)
        if len(listings) < 30 or len(paths) >= (ls.get("total") or 0):
            break
        page += 1
    return paths


def classify_plan(plan_name: str | None, sqft: int | None) -> str:
    name = plan_name or ""
    if RESTRICTED_PLAN.search(name):
        return "income-restricted"
    if JUNIOR_PLAN.search(name):
        return "junior"
    return "market"


def parse_property(d: dict, facts_db: dict) -> Property | None:
    L = d["props"]["pageProps"]["pageData"].get("listing")
    if not L or L.get("offMarket"):
        return None
    loc = L.get("location") or {}
    zip_code = (loc.get("zip") or "")[:5]
    lat, lng = loc.get("lat"), loc.get("lng")
    near, dist = None, None
    if lat and lng:
        near, dist = min(((n, miles((lat, lng), pt)) for n, pt in ANCHORS.items()),
                         key=lambda t: t[1])

    amen = sorted({a["amenity"] for a in L.get("amenitiesWithSubcategories") or []})
    search_fields = set(L.get("amenitySearchFields") or [])
    amen_l = " | ".join(amen).lower()
    desc = L.get("description") or ""
    blob = " | ".join([amen_l, desc.lower(), " ".join(search_fields).lower(),
                       " ".join(L.get("uniqueHighlights") or []).lower()])
    amenity_score = sum(2 if any(k in a.lower() for k in PREMIUM_AMENITIES) else 1 for a in amen)
    modern = sum(w for k, w in MODERN_SIGNALS.items() if k in blob)

    deal = L.get("dealsText") or None
    months_free = None
    if deal:
        m = DEAL_RE.search(deal)
        if m:
            n = m.group(1).lower()
            n = WORD_NUM.get(n) or float(n)
            months_free = n if m.group(2).lower() == "month" else round(n / 4.345, 2)

    name = L.get("name") or ""
    facts = facts_db.get(L["id"]) or facts_db.get(name) or {}
    p = Property(
        id=L["id"], name=name, address=L.get("addressFull") or L.get("address") or "",
        zip=zip_code, zone=zone_for_zip(zip_code), url=BASE + L["urlPathname"],
        lat=lat, lng=lng, miles_to_anchor=round(dist, 1) if dist is not None else None,
        nearest_anchor=near,
        manager=(L.get("propertyManagementCompany") or {}).get("name"),
        total_units=L.get("totalUnits") or None, updated_at=L.get("updatedAt"),
        has_elevator="ELEVATOR" in search_fields or "elevator" in amen_l,
        garden_hint=bool(GARDEN_WORDS.search(desc)),
        tower_hint=bool(TOWER_WORDS.search(desc)),
        restricted_property=bool(L.get("incomeRestrictions")) or bool(
            re.search(r"affordable|income[- ]restricted|LIHTC", name + " " + desc, re.I)),
        senior=bool(re.search(r"\bsenior|55\+|62\+|age[- ]restricted", name + " " + desc, re.I)),
        amenity_count=len(amen), amenity_score=amenity_score, modern_score=modern,
        deal=deal, months_free=months_free, amenities=amen, facts=facts,
    )

    for fp in L.get("floorPlans") or []:
        if fp.get("bedCount") != 1:
            continue
        units = fp.get("units") or []
        pr = fp.get("priceRange") or {}
        rows = [(u.get("unitId"), money(u.get("rent")), u.get("minSqft"),
                 u.get("dateAvailable"), u.get("isAvailable")) for u in units]
        if not units and pr.get("min"):
            # Plan advertises a price without an individual unit list.
            rows = [(None, pr["min"], fp.get("sqFt"), fp.get("availableDate"),
                     (fp.get("availabilityStatusCode") or "").startswith("AVAILABLE"))]
        for unit_id, rent, sqft, avail, now in rows:
            if not rent:
                continue
            sqft = sqft or fp.get("sqFt")
            p.one_bed_units.append(Unit(
                unit=unit_id, floor_plan=fp.get("name"), rent=rent, sqft=sqft,
                available=(avail or "")[:10] or None, is_available_now=now,
                kind=classify_plan(fp.get("name"), sqft),
            ))
    p.one_bed_units.sort(key=lambda u: u.rent)
    return p


def score(p: Property) -> float:
    """Higher is better: amenities + modern finishes + newness + reviews - distance."""
    s = p.amenity_score + 3 * p.modern_score
    yb = p.facts.get("year_built")
    if yb:
        s += max(0, yb - 2000)  # up to ~25 pts for brand-new
    if p.style in ("high-rise", "mid-rise", "podium mid-rise"):
        s += 5
    rating = p.facts.get("google_rating")
    if rating:
        s += (rating - 3.5) * 10
    s -= (p.miles_to_anchor or 0) * 2
    return round(s, 1)


def load_facts(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    with open(path) as fh:
        raw = json.load(fh)
    out = {}
    for name, f in raw.get("properties", {}).items():
        out[name] = f
        if f.get("rent_com_id"):
            out[f["rent_com_id"]] = f
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zips", nargs="*", help="zip codes to search (default: core blue-zone zips)")
    ap.add_argument("--include-nearby", action="store_true",
                    help="add Chantilly 20151 / Fair Lakes 22033")
    ap.add_argument("--max-rent", type=int, default=2180,
                    help="strict ceiling: rent must be BELOW this (default 2180)")
    ap.add_argument("--min-year", type=int, default=2005,
                    help="reject buildings verified as built before this year (default 2005)")
    ap.add_argument("--facts", default=os.path.join(HERE, "building_facts.json"))
    ap.add_argument("--out", default="results", help="output directory")
    ap.add_argument("--delay", type=float, default=3.0, help="seconds between requests")
    args = ap.parse_args()

    zips = args.zips or (CORE_ZIPS + (NEARBY_ZIPS if args.include_nearby else []))
    bad = [z for z in zips if z not in BLUE_ZONE_ZIPS]
    if bad:
        print(f"warning: not blue zone: {bad}", file=sys.stderr)
    os.makedirs(args.out, exist_ok=True)
    f = Fetcher(os.path.join(args.out, ".cache"), delay=args.delay)
    facts_db = load_facts(args.facts)

    paths: list[str] = []
    for z in zips:
        found = search_paths(f, z)
        print(f"{z}: {len(found)} listings with 1-bedroom plans")
        paths.extend(p for p in found if p not in paths)

    props: list[Property] = []
    for i, path in enumerate(paths, 1):
        d = f.next_data(path)
        p = parse_property(d, facts_db) if d else None
        if p:
            props.append(p)
        print(f"  [{i}/{len(paths)}] {p.name if p else path}")

    ceiling = args.max_rent
    keep, restricted, juniors, unverified, rejected = [], [], [], [], []
    for p in props:
        reasons = []
        if p.zone != "Blue":
            reasons.append(f"zip {p.zip} is {p.zone or 'not a listed'} zone")
        if p.style == "garden":
            reasons.append("garden-style / walk-up")
        yb = p.facts.get("year_built")
        if yb and yb < args.min_year and not p.facts.get("fully_renovated"):
            reasons.append(f"built {yb} (older than {args.min_year})")
        if p.senior or p.restricted_property:
            reasons.append("senior or income-restricted property")
        under = [u for u in p.one_bed_units if u.rent < ceiling]
        market = [u for u in under if u.kind == "market"]
        if not market:
            lo = next((u.rent for u in p.one_bed_units if u.kind == "market"), None)
            reasons.append(f"no market-rate 1BR under ${ceiling:,}"
                           + (f" (lowest ${lo:,})" if lo else ""))
        if not reasons:
            (keep if p.style != "unverified" else unverified).append(p)
        else:
            rejected.append((p, reasons))
        if p.zone == "Blue" and p.style != "garden" and not p.senior:
            if any(u.kind == "income-restricted" for u in under):
                restricted.append(p)
            if any(u.kind == "junior" for u in under):
                juniors.append(p)

    keep.sort(key=score, reverse=True)
    stamp = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    write_csv(os.path.join(args.out, "units.csv"), keep + unverified + restricted + juniors, ceiling)
    with open(os.path.join(args.out, "properties.json"), "w") as fh:
        json.dump({"generated": stamp, "max_rent_exclusive": ceiling, "zips": zips,
                   "kept": [asdict(p) | {"score": score(p), "style": p.style} for p in keep],
                   "style_unverified": [asdict(p) for p in unverified],
                   "rejected": [{"name": p.name, "zip": p.zip, "url": p.url, "reasons": r}
                                for p, r in rejected]}, fh, indent=1)
    write_report(os.path.join(args.out, "report.md"), stamp, zips, ceiling,
                 keep, unverified, restricted, juniors, rejected)

    print(f"\n{len(keep)} kept, {len(unverified)} style-unverified, {len(rejected)} rejected"
          f" -> {args.out}/report.md")
    for p in keep:
        m = [u for u in p.one_bed_units if u.kind == "market" and u.rent < ceiling]
        print(f"  {p.name:36s} {p.zip}  from ${m[0].rent:,}  {len(m)} unit(s)  score {score(p)}")
    return 0


def write_csv(path: str, props: list[Property], ceiling: int) -> None:
    seen = set()
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["property", "unit", "floor_plan", "kind", "rent", "sqft", "available",
                    "zip", "address", "style", "year_built", "miles_to_anchor",
                    "nearest_anchor", "special", "data_updated", "url"])
        for p in props:
            if p.id in seen:
                continue
            seen.add(p.id)
            for u in p.one_bed_units:
                if u.rent < ceiling:
                    w.writerow([p.name, u.unit or "", u.floor_plan or "", u.kind, u.rent,
                                u.sqft or "", u.available or "now", p.zip, p.address, p.style,
                                p.facts.get("year_built", ""), p.miles_to_anchor,
                                p.nearest_anchor, p.deal or "", p.updated_at, p.url])


def _unit_line(u: Unit) -> str:
    return (f"  - Unit {u.unit or '(plan)'} | {u.floor_plan} | **${u.rent:,}** | "
            f"{u.sqft or '?'} sf | available {u.available or 'now'}")


def write_report(path, stamp, zips, ceiling, keep, unverified, restricted, juniors, rejected):
    L = [f"# 1-BR search (rent < ${ceiling:,}) - generated {stamp}", "",
         f"Zips: {', '.join(zips)} (blue zone; county 1-BR limit ${ZONE_LIMITS['Blue'][1]:,}).",
         "Prices are rent.com asking rents (property feed) at run time; confirm on the "
         "property's own site before applying.", "", "## Market-rate shortlist", ""]
    for rank, p in enumerate(keep, 1):
        fx = p.facts
        units = [u for u in p.one_bed_units if u.kind == "market" and u.rent < ceiling]
        L += [f"### {rank}. {p.name} (score {score(p)})",
              f"- {p.address} - {p.miles_to_anchor} mi to {p.nearest_anchor}",
              f"- Style: {p.style}; built {fx.get('year_built', '?')}; "
              f"{fx.get('stories', '?')} stories; manager {p.manager or 'n/a'}",
              f"- Reviews: {fx.get('reviews', 'not verified')}",
              f"- Required fees: {fx.get('fees', 'not verified')}",
              *([f"- Note: {fx['notes']}"] if fx.get("notes") else []),
              f"- Special: {p.deal or 'none listed'}",
              f"- Amenities ({p.amenity_count}): {', '.join(p.amenities)}",
              f"- Feed updated {p.updated_at} - {p.url}"]
        L += [_unit_line(u) for u in units[:10]] + [""]
    if unverified:
        L += ["## Style unverified (no elevator listed, no facts on file)", ""]
        for p in unverified:
            m = [u for u in p.one_bed_units if u.kind == "market" and u.rent < ceiling]
            L.append(f"- {p.name} ({p.zip}) from ${m[0].rent:,} - {p.url}")
        L.append("")
    if restricted:
        L += ["## Income-restricted (WDU / affordable) 1BRs under the ceiling", "",
              "Fairfax County Workforce Dwelling Units: rent is capped, but household "
              "income must fall within the program limits. Ask the leasing office.", ""]
        for p in restricted:
            L.append(f"### {p.name} ({p.zip}, {p.style})")
            L += [_unit_line(u) for u in p.one_bed_units
                  if u.kind == "income-restricted" and u.rent < ceiling][:6]
            L.append("")
    if juniors:
        L += ["## Junior / alcove 1BRs under the ceiling (may count as studio)", ""]
        for p in juniors:
            L.append(f"### {p.name} ({p.zip})")
            L += [_unit_line(u) for u in p.one_bed_units
                  if u.kind == "junior" and u.rent < ceiling][:6]
            L.append("")
    L += ["## Rejected", ""]
    for p, r in sorted(rejected, key=lambda t: t[0].name):
        L.append(f"- {p.name} ({p.zip}): {'; '.join(r)}")
    with open(path, "w") as fh:
        fh.write("\n".join(L) + "\n")


if __name__ == "__main__":
    sys.exit(main())
