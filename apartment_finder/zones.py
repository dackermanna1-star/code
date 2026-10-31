"""Fairfax County rent zones and 2026 payment-standard table.

Transcribed from the fairfaxcounty.gov zone table (zip codes grouped into
Yellow / Green / Blue zones). The per-bedroom dollar amounts are the county's
published limits for each zone; this tool uses its own, stricter budget
(see ``finder.py --max-rent``).
"""

YELLOW_ZONE_ZIPS = {
    "22003", "22044", "22046", "22060", "22306", "22307", "22309", "22312",
}

GREEN_ZONE_ZIPS = {
    "20041", "20120", "20121", "20122", "20153", "20170", "20172", "20191",
    "20195", "22009", "22027", "22031", "22035", "22039", "22040", "22041",
    "22042", "22043", "22067", "22081", "22103", "22106", "22116", "22121",
    "22122", "22124", "22150", "22160", "22180", "22183", "22185", "22199",
    "22303",
}

BLUE_ZONE_ZIPS = {
    "20124", "20151", "20171", "20190", "20194", "22015", "22030", "22032",
    "22033", "22066", "22079", "22101", "22102", "22151", "22152", "22153",
    "22181", "22182", "22308", "22310", "22315",
}

# County limits by zone and bedroom count (0 = studio).
ZONE_LIMITS = {
    "Yellow": {0: 1740, 1: 1790, 2: 2070, 3: 2600, 4: 3135, 5: 3620, 6: 4100},
    "Green": {0: 1850, 1: 1910, 2: 2200, 3: 2770, 4: 3330, 5: 3850, 6: 4360},
    "Blue": {0: 2240, 1: 2310, 2: 2650, 3: 3330, 4: 4010, 5: 4630, 6: 5340},
}

# Blue-zone zips that are in / next to the McNair - Herndon - Reston corridor.
#   20171  Herndon south of the Toll Rd: McNair Farms, Dulles Station,
#          Innovation Center, Oak Hill
#   20190  Reston: Reston Town Center, Wiehle-Reston East / Reston Station
#   20194  North Reston (Baron Cameron / North Point)
CORE_ZIPS = ["20171", "20190", "20194"]

# Next ring out, still blue zone: Chantilly (20151) and Fair Lakes (22033).
NEARBY_ZIPS = ["20151", "22033"]

# Note: 20170 (Herndon town) and 20191 (south Reston / Reston Heights) are
# GREEN zone, not blue, even though they sit in the same area.


def zone_for_zip(zip_code: str) -> str | None:
    z = (zip_code or "")[:5]
    if z in BLUE_ZONE_ZIPS:
        return "Blue"
    if z in GREEN_ZONE_ZIPS:
        return "Green"
    if z in YELLOW_ZONE_ZIPS:
        return "Yellow"
    return None
