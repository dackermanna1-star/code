#!/usr/bin/env python3
"""
Job Finder - entry-level office jobs near Reston / Herndon / Fairfax, VA.

Searches the career sites of large employers (Workday boards for ~50 big
companies, Amazon, Microsoft, Carahsoft), Fairfax County / Loudoun / City of
Fairfax government boards, Northern Virginia Community College, and
(optionally) USAJOBS. Filters for entry-level white-collar office work,
then writes jobs.html and opens it in your browser.

Only uses the Python standard library - nothing to install.
Run:  python3 jobfinder.py            (or double-click "Find Jobs.command")
      python3 jobfinder.py --help     (options)
"""

# =============================================================================
# SETTINGS - change these with any text editor, then run again.
# =============================================================================

# Where you want to work. A job is kept if its estimated driving distance to
# ANY of these places is within MAX_DRIVE_MILES.
CENTERS = {
    "Reston": (38.9586, -77.3570),
    "Herndon": (38.9696, -77.3861),
    "Fairfax": (38.8462, -77.3064),
}
MAX_DRIVE_MILES = 15

# Hide jobs whose pay STARTS above this (per year; hourly pay is x2080).
# Jobs that don't list pay are kept and marked "pay not listed".
MAX_STARTING_PAY = 58000

# Hide jobs that ask for more than this many years of experience.
MAX_YEARS_EXPERIENCE = 2

# Hide jobs posted more than this many days ago (when the posting date is known).
MAX_AGE_DAYS = 45

# Hide jobs that need a security clearance you must ALREADY have.
# ("Ability to obtain a clearance" jobs are kept, but flagged.)
HIDE_CLEARANCE_REQUIRED = True

# Hide jobs whose title is clearly phone/front-desk/sales heavy
# (call center, receptionist, customer service rep, sales...).
HIDE_TALK_HEAVY_TITLES = True

# Keep internships? (Usually for current students.)
INCLUDE_INTERNSHIPS = False

# Keep fully-remote jobs that don't list a local office?
INCLUDE_REMOTE_ONLY = False

# USAJOBS (federal jobs) needs a free API key: https://developer.usajobs.gov/apirequest/
# Paste the key and the email you registered with to turn it on.
USAJOBS_API_KEY = ""
USAJOBS_EMAIL = ""

# Workday career sites to search: (company name, host, tenant, site).
# Add more by finding a company's "...myworkdayjobs.com/<site>" careers URL.
WORKDAY_SITES = [
    ("Capital One", "capitalone.wd12.myworkdayjobs.com", "capitalone", "Capital_One"),
    ("Freddie Mac", "freddiemac.wd5.myworkdayjobs.com", "freddiemac", "External"),
    ("Fannie Mae", "fanniemae.wd1.myworkdayjobs.com", "fanniemae", "FannieMaeCareers"),
    ("Booz Allen Hamilton", "bah.wd1.myworkdayjobs.com", "bah", "BAH_Jobs"),
    ("Leidos", "leidos.wd5.myworkdayjobs.com", "leidos", "External"),
    ("CACI", "caci.wd1.myworkdayjobs.com", "caci", "External"),
    ("General Dynamics IT (GDIT)", "gdit.wd5.myworkdayjobs.com", "gdit", "External_Career_Site"),
    ("Northrop Grumman", "ngc.wd1.myworkdayjobs.com", "ngc", "Northrop_Grumman_External_Site"),
    ("RTX (Raytheon)", "globalhr.wd5.myworkdayjobs.com", "globalhr", "REC_RTX_Ext_Gateway"),
    ("Boeing", "boeing.wd1.myworkdayjobs.com", "boeing", "EXTERNAL_CAREERS"),
    ("Parsons", "parsons.wd5.myworkdayjobs.com", "parsons", "Search"),
    ("KBR", "kbr.wd5.myworkdayjobs.com", "kbr", "KBR_Careers"),
    ("ICF", "icf.wd5.myworkdayjobs.com", "icf", "ICFExternal_Career_Site"),
    ("Guidehouse", "guidehouse.wd1.myworkdayjobs.com", "guidehouse", "External"),
    ("Unisys", "unisys.wd5.myworkdayjobs.com", "unisys", "External"),
    ("The Aerospace Corporation", "aero.wd5.myworkdayjobs.com", "aero", "External"),
    ("Iron Mountain", "ironmountain.wd5.myworkdayjobs.com", "ironmountain", "iron-mountain-jobs"),
    ("Equinix", "equinix.wd1.myworkdayjobs.com", "equinix", "External"),
    ("Verizon", "verizon.wd12.myworkdayjobs.com", "verizon", "verizon-careers"),
    ("AT&T", "att.wd1.myworkdayjobs.com", "att", "ATTGeneral"),
    ("T-Mobile", "tmobile.wd1.myworkdayjobs.com", "tmobile", "External"),
    ("Cisco", "cisco.wd5.myworkdayjobs.com", "cisco", "Cisco_Careers"),
    ("Hewlett Packard Enterprise", "hpe.wd5.myworkdayjobs.com", "hpe", "Jobsathpe"),
    ("Red Hat", "redhat.wd5.myworkdayjobs.com", "redhat", "jobs"),
    ("Workday", "workday.wd5.myworkdayjobs.com", "workday", "Workday"),
    ("Ciena", "ciena.wd5.myworkdayjobs.com", "ciena", "careers"),
    ("Gartner", "gartner.wd5.myworkdayjobs.com", "gartner", "EXT"),
    ("PwC", "pwc.wd3.myworkdayjobs.com", "pwc", "Global_Experienced_Careers"),
    ("PwC (Entry Level)", "pwc.wd3.myworkdayjobs.com", "pwc", "US_Entry_Level_Careers"),
    ("Thomson Reuters", "thomsonreuters.wd5.myworkdayjobs.com", "thomsonreuters", "External_Career_Site"),
    ("RELX / LexisNexis", "relx.wd3.myworkdayjobs.com", "relx", "Relx"),
    ("Mastercard", "mastercard.wd1.myworkdayjobs.com", "mastercard", "CorporateCareers"),
    ("Visa", "visa.wd5.myworkdayjobs.com", "visa", "Visa"),
    ("FIS", "fis.wd5.myworkdayjobs.com", "fis", "SearchJobs"),
    ("Fiserv", "fiserv.wd5.myworkdayjobs.com", "fiserv", "EXT"),
    ("Truist", "truist.wd1.myworkdayjobs.com", "truist", "Careers"),
    ("PNC", "pnc.wd5.myworkdayjobs.com", "pnc", "External"),
    ("GEICO", "geico.wd1.myworkdayjobs.com", "geico", "External"),
    ("Cigna", "cigna.wd5.myworkdayjobs.com", "cigna", "cignaCareers"),
    ("Elevance Health", "elevancehealth.wd1.myworkdayjobs.com", "elevancehealth", "ANT"),
    ("JLL", "jll.wd1.myworkdayjobs.com", "jll", "jllcareers"),
    ("Cushman & Wakefield", "cw.wd1.myworkdayjobs.com", "cw", "External"),
    ("Greystar", "greystar.wd1.myworkdayjobs.com", "greystar", "External"),
    ("HNTB", "hntb.wd5.myworkdayjobs.com", "hntb", "HNTB_Careers"),
    ("STV", "stvinc.wd5.myworkdayjobs.com", "stvinc", "stv"),
    ("HD Supply", "hdsupply.wd1.myworkdayjobs.com", "hdsupply", "External"),
    ("Comscore", "comscore.wd5.myworkdayjobs.com", "comscore", "External"),
    ("Amentum", "pae.wd1.myworkdayjobs.com", "pae", "Amentum_Careers"),
    ("Salesforce", "salesforce.wd12.myworkdayjobs.com", "salesforce", "External_Career_Site"),
    ("M&T Bank", "mtb.wd5.myworkdayjobs.com", "mtb", "MTB"),
    ("State Street", "statestreet.wd1.myworkdayjobs.com", "statestreet", "Global"),
    ("BlackRock", "blackrock.wd1.myworkdayjobs.com", "blackrock", "BlackRock_Professional"),
    ("Nationwide", "nationwide.wd1.myworkdayjobs.com", "nationwide", "Nationwide_Career"),
    ("Marsh McLennan", "mmc.wd1.myworkdayjobs.com", "mmc", "MMC"),
    ("Federal Reserve", "rb.wd5.myworkdayjobs.com", "rb", "FRS"),
    ("Metropolitan Washington Airports Authority", "mwaa.wd1.myworkdayjobs.com", "mwaa", "MWAA"),
    ("DXC Technology", "dxctechnology.wd1.myworkdayjobs.com", "dxctechnology", "DXCJobs"),
    ("Vantage Data Centers", "vantagedc.wd1.myworkdayjobs.com", "vantagedc", "Vantage"),
    ("NTT Global Data Centers", "nttglobaldatacenters.wd501.myworkdayjobs.com", "nttglobaldatacenters", "External"),
    ("Cubic", "cubic.wd1.myworkdayjobs.com", "cubic", "cubic_USA_careers"),
    ("Micron (Manassas)", "micron.wd1.myworkdayjobs.com", "micron", "External"),
    ("Intel", "intel.wd1.myworkdayjobs.com", "intel", "External"),
    ("NVIDIA", "nvidia.wd5.myworkdayjobs.com", "nvidia", "NVIDIAExternalCareerSite"),
    ("Cardinal Health", "cardinalhealth.wd1.myworkdayjobs.com", "cardinalhealth", "EXT"),
    ("Labcorp", "labcorp.wd1.myworkdayjobs.com", "labcorp", "External"),
    ("Georgetown University", "georgetown.wd1.myworkdayjobs.com", "georgetown", "Georgetown_Admin_Careers"),
    ("American University", "american.wd1.myworkdayjobs.com", "american", "AU"),
    ("DLA Piper (law firm)", "dlapiper.wd1.myworkdayjobs.com", "dlapiper", "dlapiper"),
    ("Stride / K12", "strideinc.wd1.myworkdayjobs.com", "strideinc", "SK"),
    ("FHI 360", "fhi.wd1.myworkdayjobs.com", "fhi", "FHI_360_External_Career_Portal"),
    ("Sentara Health", "sentara.wd1.myworkdayjobs.com", "sentara", "SCS"),
]

# Greenhouse job boards: (company name, board id from boards.greenhouse.io/<id>).
GREENHOUSE_BOARDS = [
    ("Appian", "appian"),
    ("Alarm.com", "alarmcom"),
    ("Verisign", "verisign"),
    ("EdgeConneX (data centers)", "edgeconnex"),
    ("Capital Bank", "capitalbank"),
    ("Okta", "okta"),
    ("Zscaler", "zscaler"),
    ("HawkEye 360", "hawkeye360"),
    ("BlackSky", "blacksky"),
    ("ID.me", "idme"),
    ("Spire Global", "spire"),
    ("Axios", "axios"),
    ("Databricks", "databricks"),
    ("Scale AI", "scaleai"),
]

# Lever job boards: (company name, board id from jobs.lever.co/<id>).
LEVER_BOARDS = [
    ("Palantir", "palantir"),
    ("FiscalNote", "fiscalnote"),
]

# Local government job boards on governmentjobs.com: (name, agency id).
GOVJOBS_AGENCIES = [
    ("Fairfax County Government", "fairfaxcounty"),
    ("Loudoun County Government", "loudoun"),
    ("City of Fairfax", "fairfaxva"),
    ("Fairfax Water", "fairfaxwater"),
    ("Prince William County", "pwcgov"),
    ("City of Manassas", "manassas"),
    ("City of Alexandria", "alexandria"),
]

# =============================================================================
# (Nothing below needs changing.)
# =============================================================================

import argparse
import csv
import datetime as dt
import html
import io
import json
import math
import os
import re
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "output")
TODAY = dt.date.today()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

_print_lock = threading.Lock()


def log(*a):
    with _print_lock:
        print(*a, flush=True)


# -----------------------------------------------------------------------------
# HTTP
# -----------------------------------------------------------------------------

def _ssl_context():
    """Default certificates; on a Mac python.org install without certificates,
    fall back to the macOS system root certificates."""
    ctx = ssl.create_default_context()
    if os.environ.get("SSL_CERT_FILE") or sys.platform != "darwin":
        return ctx
    try:
        urllib.request.urlopen("https://www.amazon.jobs/", timeout=15, context=ctx).close()
        return ctx
    except Exception as e:
        if "CERTIFICATE_VERIFY_FAILED" not in str(e):
            return ctx
    try:
        pem = subprocess.run(
            ["security", "find-certificate", "-a", "-p",
             "/System/Library/Keychains/SystemRootCertificates.keychain"],
            capture_output=True, text=True, timeout=30).stdout
        path = os.path.join(OUT_DIR, ".mac-root-certs.pem")
        os.makedirs(OUT_DIR, exist_ok=True)
        with open(path, "w") as f:
            f.write(pem)
        return ssl.create_default_context(cafile=path)
    except Exception:
        return ctx


SSL_CTX = None


def http(url, data=None, headers=None, timeout=40, tries=3):
    """GET (or POST JSON when data is a dict). Returns text, or None on failure."""
    hdrs = {"User-Agent": UA, "Accept": "application/json, text/html;q=0.9, */*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9"}
    if headers:
        hdrs.update(headers)
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        hdrs["Content-Type"] = "application/json"
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=body, headers=hdrs)
            with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            return None
        except Exception:
            if attempt < tries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            return None


def http_json(url, data=None, headers=None, timeout=40):
    t = http(url, data=data, headers=headers, timeout=timeout)
    if not t:
        return None
    try:
        return json.loads(t)
    except ValueError:
        return None


def strip_html(s):
    if not s:
        return ""
    s = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", s)
    s = re.sub(r"(?i)<br\s*/?>|</p>|</li>|</div>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t ]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


# -----------------------------------------------------------------------------
# Geography: place names -> coordinates, and "is this near me?"
# -----------------------------------------------------------------------------

# Northern Virginia + nearby places. (lat, lon)
PLACES_VA = {
    "reston": (38.9586, -77.3570), "herndon": (38.9696, -77.3861),
    "fairfax": (38.8462, -77.3064), "fairfax city": (38.8462, -77.3064),
    "fairfax county": (38.8462, -77.3064), "fair lakes": (38.8532, -77.3886),
    "chantilly": (38.8943, -77.4311), "centreville": (38.8404, -77.4289),
    "vienna": (38.9012, -77.2653), "oakton": (38.8809, -77.3008),
    "tysons": (38.9187, -77.2311), "tysons corner": (38.9187, -77.2311),
    "mclean": (38.9339, -77.1773), "falls church": (38.8823, -77.1711),
    "merrifield": (38.8743, -77.2269), "dunn loring": (38.8932, -77.2216),
    "annandale": (38.8304, -77.1964), "burke": (38.7935, -77.2717),
    "springfield": (38.7893, -77.1872), "sterling": (39.0062, -77.4286),
    "dulles": (38.9531, -77.4565), "ashburn": (39.0437, -77.4875),
    "great falls": (38.9982, -77.2883), "manassas": (38.7509, -77.4753),
    "manassas park": (38.7840, -77.4697), "clifton": (38.7804, -77.3864),
    "fairfax station": (38.8007, -77.3255), "lorton": (38.7043, -77.2278),
    "arlington": (38.8816, -77.0910), "alexandria": (38.8048, -77.0469),
    "leesburg": (39.1157, -77.5636), "south riding": (38.9209, -77.5039),
    "gainesville": (38.7957, -77.6139), "woodbridge": (38.6582, -77.2497),
    "lansdowne": (39.0815, -77.4836), "franconia": (38.7821, -77.1464),
    "newington": (38.7385, -77.1850), "fort belvoir": (38.7119, -77.1459),
    "bailey's crossroads": (38.8506, -77.1297), "baileys crossroads": (38.8506, -77.1297),
    "west falls church": (38.8901, -77.1890), "idylwood": (38.8951, -77.2111),
    "loudoun": (39.0062, -77.4286), "loudoun county": (39.0062, -77.4286),
    "pentagon": (38.8719, -77.0563),
    "crystal city": (38.8565, -77.0513), "ballston": (38.8823, -77.1110),
    "rosslyn": (38.8964, -77.0717), "potomac falls": (39.0437, -77.4086),
    "cascades": (39.0437, -77.4086), "broadlands": (39.0190, -77.5170),
    "aldie": (38.9757, -77.6411), "haymarket": (38.8121, -77.6364),
    "bristow": (38.7229, -77.5386), "dale city": (38.6371, -77.3111),
    "quantico": (38.5221, -77.2934), "dumfries": (38.5676, -77.3280),
    "sully": (38.8943, -77.4311), "wiehle": (38.9473, -77.3400),
}
PLACES_DC = {"washington": (38.9072, -77.0369), "washington dc": (38.9072, -77.0369)}
PLACES_MD = {
    "bethesda": (38.9847, -77.0947), "rockville": (39.0840, -77.1528),
    "potomac": (39.0182, -77.2086), "gaithersburg": (39.1434, -77.2014),
    "germantown": (39.1732, -77.2717), "silver spring": (38.9907, -77.0261),
    "chevy chase": (38.9810, -77.0833), "college park": (38.9897, -76.9378),
    "annapolis junction": (39.1190, -76.7769), "fort meade": (39.1087, -76.7438),
    "lanham": (38.9688, -76.8636), "suitland": (38.8487, -76.9239),
}
# Names unique enough to trust even when no state is written.
UNAMBIGUOUS = {"reston", "herndon", "tysons", "tysons corner", "mclean", "chantilly",
               "merrifield", "dunn loring", "oakton", "annandale", "lorton", "manassas",
               "dulles", "falls church", "fair lakes", "fairfax station", "centreville",
               "fort belvoir", "south riding", "lansdowne", "wiehle"}

_VA_RE = re.compile(r"(?<![A-Za-z])(VA|Va)(?![A-Za-z])|Virgini?a")
_WV_RE = re.compile(r"West Virgini?a|(?<![A-Za-z])WV(?![A-Za-z])")
_DC_RE = re.compile(r"(?<![A-Za-z])D\.?C\.?(?![A-Za-z])|District of Columbia")
_MD_RE = re.compile(r"(?<![A-Za-z])MD(?![A-Za-z])|Maryland")


def _haversine(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(h))


def drive_miles(coord):
    """Estimated driving miles (straight line x 1.2) to the nearest center."""
    best = None
    for name, c in CENTERS.items():
        d = _haversine(coord, c) * 1.2
        if best is None or d < best[0]:
            best = (d, name)
    return best


def _norm_loc(s):
    s = s.replace("-", " ").replace("_", " ").replace("|", " ").replace("/", " ")
    s = re.sub(r"\s+", " ", s)
    return s


def find_place(text, assume_state=None):
    """Return (place_name, (lat, lon)) for the first local place in text, else None."""
    if not text:
        return None
    t = _norm_loc(text)
    low = t.lower()
    has_va = bool(_VA_RE.search(t)) and not _WV_RE.search(t)
    if assume_state == "VA":
        has_va = True
    tables = []
    if has_va:
        tables.append(PLACES_VA)
    if _DC_RE.search(t) or "washington dc" in low:
        tables.append(PLACES_DC)
    if _MD_RE.search(t):
        tables.append(PLACES_MD)
    # McleanVAUSA style (no spaces)
    squashed = re.sub(r"[^a-z]", "", low)
    for tbl in tables + [None]:
        names = PLACES_VA if tbl is None else tbl
        for name in sorted(names, key=len, reverse=True):
            if tbl is None and name not in UNAMBIGUOUS:
                continue
            if re.search(r"(?<![a-z])" + re.escape(name) + r"(?![a-z])", low) or \
                    (tbl is None and len(name) > 6 and name.replace(" ", "") in squashed):
                return name, names[name]
    return None


def nearby(texts, assume_state=None):
    """Best local match among location strings -> (place, miles, center) or None."""
    best = None
    for tx in texts:
        p = find_place(tx, assume_state)
        if not p:
            continue
        miles, center = drive_miles(p[1])
        if best is None or miles < best[1]:
            best = (p[0].title(), miles, center)
    if best and best[1] <= MAX_DRIVE_MILES:
        return best
    return None


# -----------------------------------------------------------------------------
# Job filtering and scoring
# -----------------------------------------------------------------------------

# A title must contain one of these office/business words...
TITLE_GOOD = re.compile(
    r"administrat|\badmin\b|office|clerk|secretar|data entry|\bdata\b|records?\b|"
    r"document|accounts? (payable|receivable)|accounting|accountant|bookkeep|billing|"
    r"payroll|procure|purchas|buyer|contract|inventory|logistic|operations|scheduler|"
    r"scheduling|processor|processing|paralegal|legal assistant|budget|fiscal|financ|"
    r"treasury|\btax\b|audit|compliance|human resources|\bhr\b|personnel|"
    r"recruiting coordinator|onboarding|benefits|facilities|property|asset|"
    r"project (coordinator|assistant|support|analyst)|program (assistant|coordinator|support|analyst|specialist)|"
    r"executive assistant|management (assistant|analyst)|staff assistant|mail|shipping|"
    r"receiving|data ?center|reporting|research assistant|business (analyst|associate|"
    r"operations|support|systems)|claims|underwrit|loan|credit|knowledge management|"
    r"supply chain|order management|revenue|invoice|grants?\b|proposal|marketing coordinator|"
    r"market research|quality (assurance|control) (specialist|analyst|associate)|"
    r"training coordinator|it asset|configuration management|information management|"
    r"trainee|development program|rotational|apprentice|general clerk|file room|"
    r"imaging|digitiz|scanning|cost (analyst|accountant)|actuarial assistant|"
    r"pricing|bid|capture coordinator|subcontract|vendor|sourcing|elections?\b", re.I)

# ...and none of these.
TITLE_BAD = re.compile(
    r"\bsenior\b|\bsr\.?\b|\blead\b|leader|\bmid\b|mid-level|midlevel|journeyman|"
    r"experienced|principal|manager|\bmgr\b|director|\bchief\b|"
    r"head of|\bvp\b|vice president|president|supervisor|superintendent|architect|"
    r"engineer|developer|programmer|scientist|devops|\bsre\b|software|cyber|penetration|"
    r"nurse|\brn\b|\blpn\b|physician|medical assistant|clinical|therapist|pharmac|"
    r"dental|counselor|psycholog|psychiatr|social worker|social services|case manag|"
    r"eligibility|navigator|peer|recovery|probation|pretrial|parole|jail|correction|"
    r"detention|human development|developmental|disabilit|behavioral|mental health|"
    r"substance|health specialist|community health|public health|epidemiolog|"
    r"day ?care|child ?care|preschool|recreation|aquatic|inclusion|camp\b|\btrip\b|"
    r"animal|youth|teacher|instructor|professor|faculty|\bcoach\b|tutor|"
    r"lab(oratory)? (assistant|technician|aide)|attorney|counsel\b|lawyer|investigator|"
    r"consultant|\bdriver\b|mechanic|hvac|plumb|electrician|maintenance|custodian|"
    r"janitor|housekeep|\bcook\b|chef|server|bartender|retail|store\b|cashier|"
    r"\bsales\b|account executive|business development|call center|contact center|"
    r"teller|police|sheriff|deputy|firefight|fire and rescue|\bemt\b|paramedic|"
    r"\bguard\b|security (officer|specialist|analyst)|\behs\b|safety|linguist|"
    r"translator|interpreter|intelligence|targeting|polygraph|ts/sci|top secret|"
    r"clearance|\bsme\b|subject matter expert|expert|\b(iii|iv|v|vi)\b|level\s*[3-9]|"
    r"\b[3-9]\b(?!\d)|\bfellowship\b|system(s)? administrator|network|database|"
    r"\bdba\b|cloud|linux|windows|sharepoint|salesforce|\bsap\b|oracle|servicenow|"
    r"machine learning|\bai\b|genai|\bsa\b|solutions? architect|\bgtm\b|product|"
    r"\bux\b|designer|actuar|surgeon|veterinar|crossing guard|lifeguard|seasonal|"
    r"transit|truck|forklift|welder|carpenter|painter|crew|laborer|groundskeeper|"
    r"equipment operator|inspector|appraiser|dietitian|nutrition|chaplain|planner|"
    r"dispatcher|911|emergency|librarian|library page|nanny|caregiver|"
    r"interventionist|therap|technologist|radiolog|phlebotom|sterile|"
    r"partner\b", re.I)

TITLE_TALKY = re.compile(
    r"call center|contact center|customer service|customer care|customer support|"
    r"receptionist|front desk|concierge|\bsales\b|telemarket|collections?|"
    r"member service|client service|guest service|patient access|help ?desk|"
    r"service desk|outreach|ambassador|recruiter|admissions counselor|\btours?\b|"
    r"account representative|account manager|business development",
    re.I)

TITLE_INTERN = re.compile(r"\bintern\b|internship|co-?op\b|student worker|summer analyst", re.I)

TECH_ADMIN_OK = re.compile(r"data ?center|record|imaging|inventory|asset|document|"
                           r"payroll|office|accounting|finance|scanning|digitiz|"
                           r"operations technician|service delivery", re.I)

ENTRY_SIGNALS = re.compile(
    r"entry[- ]level|recent (college )?grad|new grad|no (prior )?experience|"
    r"0\s*(-|to)\s*[12]\s*years|will train|on[- ]the[- ]job training|"
    r"training (is |will be )?provided|early career|career starter|"
    r"bachelor'?s degree in business|business administration", re.I)

TALK_WORDS = re.compile(
    r"phone|telephone|calls?\b|front desk|greet|receptionist|walk[- ]in|in person|"
    r"customer service|customer[- ]facing|client[- ]facing|public[- ]facing|"
    r"point of contact|inbound|outbound|cold call|sales|presentations?|"
    r"interact(ing|ion)? with (the public|customers|clients|patients|students|visitors)|"
    r"visitors|members of the public|high[- ]volume", re.I)

CLEAR_REQUIRED = [
    re.compile(r"clearance required (to|for) start:?\s*(?!none|no\b)(secret|top secret|ts)", re.I),
    re.compile(r"must currently possess:?\s*(?!none)(secret|top secret|ts|t3|t5)", re.I),
    re.compile(r"(active|current|existing)\s+(dod\s+)?(ts/sci|top secret|secret|ts)\b[^.]{0,40}clearance", re.I),
    re.compile(r"(must|required to)\s+(have|possess|hold)\s+(an?\s+)?(active\s+|current\s+)?(dod\s+)?(ts/sci|top secret|secret|ts)\b", re.I),
    re.compile(r"clearance level required:?\s*(?!none)(secret|top secret|ts)", re.I),
    re.compile(r"(ts/sci|top secret)\s+(clearance\s+)?with\s+(full[- ]scope\s+|ci\s+)?poly", re.I),
    re.compile(r"requires? an? (active )?(ts/sci|top secret|secret) (security )?clearance", re.I),
]
CLEAR_OBTAIN = re.compile(r"(ability|able|eligib\w*) to obtain[^.]{0,60}clearance|"
                          r"public trust|background investigation|security clearance", re.I)

_NUM = r"(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
PAY_RANGE = re.compile(
    r"\$\s?" + _NUM + r"\s*([kK])?\s*(?:-|–|—|to|and)\s*\$?\s?" + _NUM + r"\s*([kK])?"
    r"(\s*(?:/|per|an|a)?\s*(hour|hr|hourly|year|yr|annual|annually|annum))?", re.I)
PAY_SINGLE = re.compile(
    r"\$\s?" + _NUM + r"\s*([kK])?\s*(?:/|per|an|a)?\s*(hour|hr|year|yr)\b", re.I)
PAY_BARE = re.compile(r"^\s*\$\s?" + _NUM + r"\s*([kK])?\s*$")


def _money(v, k):
    x = float(v.replace(",", ""))
    if k:
        x *= 1000
    return x


def _annual(x, unit_hint):
    if unit_hint and unit_hint.lower().startswith(("hour", "hr")):
        return x * 2080
    if x < 200:          # looks like an hourly wage
        return x * 2080
    if x < 10000:        # bonus, monthly, etc. - ignore
        return None
    return x


def parse_pay(text):
    """Return (min_annual, max_annual, label) or (None, None, '')."""
    if not text:
        return None, None, ""
    found = []
    for m in PAY_RANGE.finditer(text):
        lo = _annual(_money(m.group(1), m.group(2)), m.group(6))
        hi = _annual(_money(m.group(3), m.group(4)), m.group(6))
        if lo and hi and 15000 <= lo <= hi < 600000:
            found.append((lo, hi, m.group(0).strip()))
    if not found:
        for m in PAY_SINGLE.finditer(text):
            v = _annual(_money(m.group(1), m.group(2)), m.group(3))
            if v and 15000 <= v < 600000:
                found.append((v, v, m.group(0).strip()))
    if not found:
        m = PAY_BARE.match(text.split("\n", 1)[0])
        if m:
            v = _annual(_money(m.group(1), m.group(2)), None)
            if v and 15000 <= v < 600000:
                found.append((v, v, m.group(0).strip()))
    if not found:
        return None, None, ""
    lo = min(f[0] for f in found)
    hi = max(f[1] for f in found if f[0] == lo)
    label = next(f[2] for f in found if f[0] == lo)
    return lo, hi, label


YEARS_RE = [
    re.compile(r"(\d{1,2})\s*(?:\+|or more)?\s*(?:-|–|to)?\s*(\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b[^.;\n]{0,70}experience", re.I),
    re.compile(r"experience[^.;\n]{0,25}?(?:of\s+)?(?:at least\s+|minimum (?:of\s+)?)?(\d{1,2})\s*(?:\+|or more)?\s*(?:years?|yrs?)", re.I),
    re.compile(r"experience:?\s*(\d{1,2})\s*\+?\s*years?", re.I),
]


def min_years(text):
    """Smallest number of years of experience the posting asks for (None if not stated)."""
    if not text:
        return None
    vals = []
    for rx in YEARS_RE:
        for m in rx.finditer(text):
            try:
                v = int(m.group(1))
            except (TypeError, ValueError):
                continue
            if 0 <= v <= 25:
                vals.append(v)
    return min(vals) if vals else None


def clearance_status(text):
    if not text:
        return None
    for rx in CLEAR_REQUIRED:
        if rx.search(text):
            return "required"
    if CLEAR_OBTAIN.search(text):
        return "obtainable"
    return None


def count_duties(desc_html):
    return len(re.findall(r"(?i)<li[\s>]", desc_html or ""))


def title_ok(title):
    """Quick screen on the job title only."""
    if not title:
        return False
    if TITLE_INTERN.search(title) and not INCLUDE_INTERNSHIPS:
        return False
    if HIDE_TALK_HEAVY_TITLES and TITLE_TALKY.search(title):
        return False
    if TITLE_BAD.search(title):
        return False
    if re.search(r"\bofficer\b", title, re.I) and \
            not re.search(r"administrative|support|records|property|contract", title, re.I):
        return False
    # Technicians only when the work is office/records/data-center type.
    if re.search(r"technician", title, re.I) and not TECH_ADMIN_OK.search(title):
        return False
    return bool(TITLE_GOOD.search(title))


def parse_age_days(s):
    """'Posted 3 Days Ago' / 'Posted Today' / ISO date / 'October 29, 2026' -> days."""
    if not s:
        return None
    s = str(s).strip()
    low = s.lower()
    if "today" in low or "just posted" in low or "hours ago" in low or "hour ago" in low:
        return 0
    if "yesterday" in low:
        return 1
    m = re.search(r"(\d+)\+?\s*days?\s*ago", low)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)\+?\s*weeks?\s*ago", low)
    if m:
        return int(m.group(1)) * 7
    m = re.search(r"(\d+)\+?\s*months?\s*ago", low)
    if m:
        return int(m.group(1)) * 30
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    if m:
        return (TODAY - dt.date.fromisoformat(m.group(1))).days
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%m/%d/%Y", "%d %B %Y"):
        try:
            return (TODAY - dt.datetime.strptime(s, fmt).date()).days
        except ValueError:
            pass
    return None


def evaluate(job):
    """Fill in pay/experience/clearance/talk flags and decide whether to keep it.
    Returns the job (with job['drop'] set to a reason when it should be hidden)."""
    text = job.get("text", "")
    lo, hi, label = parse_pay(job.get("pay_text", "") + "\n" + text)
    job["pay_min"], job["pay_max"], job["pay_label"] = lo, hi, label
    job["years"] = min_years(text)
    job["clearance"] = clearance_status(text)
    talk_hits = len(TALK_WORDS.findall(text))
    job["talk"] = "high" if talk_hits >= 8 else ("some" if talk_hits >= 3 else "low")
    job["entry"] = bool(ENTRY_SIGNALS.search(text) or ENTRY_SIGNALS.search(job["title"]))
    job["duties"] = job.get("duties") or count_duties(job.get("desc_html", ""))
    tt = (job.get("time_type") or "").lower().strip()
    if "full" in tt or tt.startswith("ft "):
        job["part_time"] = False
    elif "part" in tt or tt.startswith("pt "):
        job["part_time"] = True
    else:
        job["part_time"] = bool(re.search(r"part[- ]time", job["title"] + " " + text[:600], re.I))
    if job.get("age") is None:
        job["age"] = parse_age_days(job.get("posted"))

    reason = None
    if lo and lo > MAX_STARTING_PAY:
        reason = f"pay starts at ${lo:,.0f}"
    elif job["years"] is not None and job["years"] > MAX_YEARS_EXPERIENCE:
        reason = f"asks for {job['years']}+ years"
    elif HIDE_CLEARANCE_REQUIRED and job["clearance"] == "required":
        reason = "needs an existing clearance"
    elif job["age"] is not None and job["age"] > MAX_AGE_DAYS:
        reason = f"posted {job['age']} days ago"
    elif job.get("closed"):
        reason = "closed"
    job["drop"] = reason

    # Score 0-100: higher = better fit.
    sc = 50
    sc += 15 if job["entry"] else 0
    sc += {"low": 10, "some": 0, "high": -15}[job["talk"]]
    if job["years"] is not None:
        sc += {0: 10, 1: 8, 2: 3}.get(job["years"], 0)
    if lo:
        sc += 5
    if job["clearance"] == "obtainable":
        sc -= 5
    if job["duties"] and job["duties"] > 18:
        sc -= 8
    if job["age"] is not None:
        sc += 10 if job["age"] <= 7 else (5 if job["age"] <= 14 else 0)
    if job.get("miles") is not None:
        sc += 5 if job["miles"] <= 8 else 0
    job["score"] = max(0, min(100, sc))
    return job


def new_job(**kw):
    j = dict(company="", title="", url="", location="", place="", miles=None, center="",
             posted="", age=None, closes="", pay_text="", text="", desc_html="",
             time_type="", source="", duties=0, closed=False)
    j.update(kw)
    return j


# -----------------------------------------------------------------------------
# Source: Workday career sites
# -----------------------------------------------------------------------------

def _walk_facets(facets, out):
    for f in facets or []:
        param = f.get("facetParameter") or ""
        vals = f.get("values") or []
        if vals and isinstance(vals[0], dict) and "facetParameter" in vals[0]:
            _walk_facets(vals, out)
            continue
        if re.search(r"location", param, re.I) and not re.search(r"country|region|state|group", param, re.I):
            for v in vals:
                out.append((param, v.get("id"), v.get("descriptor", "")))


def workday_source(company, host, tenant, site):
    base = f"https://{host}/wday/cxs/{tenant}/{site}"
    jobs_url = base + "/jobs"
    first = http_json(jobs_url, {"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": ""})
    if not first:
        log(f"  ! {company}: site did not respond")
        return []
    locs = []
    _walk_facets(first.get("facets"), locs)
    local = {}
    for param, fid, desc in locs:
        if nearby([desc]):
            local.setdefault(param, []).append(fid)

    postings = {}

    def page_through(applied, search_text=""):
        offset, total = 0, None
        while True:
            d = http_json(jobs_url, {"appliedFacets": applied, "limit": 20,
                                     "offset": offset, "searchText": search_text})
            if not d:
                break
            if total is None:
                total = d.get("total") or 0
            jp = d.get("jobPostings") or []
            for p in jp:
                if p.get("externalPath"):
                    postings.setdefault(p["externalPath"], p)
            offset += 20
            if not jp or offset >= min(total, 2000):
                break

    for param, ids in local.items():
        for i in range(0, len(ids), 50):
            page_through({param: ids[i:i + 50]})
    if not postings:
        # No usable location filter on this site: search by town names instead.
        for town in ("Reston", "Herndon", "Fairfax", "Chantilly", "McLean", "Vienna",
                     "Falls Church", "Sterling", "Tysons", "Ashburn", "Dulles", "Centreville"):
            page_through({}, town)

    cands = [p for p in postings.values() if title_ok(p.get("title", ""))]
    results = []

    def detail(p):
        d = http_json(base + p["externalPath"])
        info = (d or {}).get("jobPostingInfo") or {}
        loc_texts = [p.get("locationsText", ""), info.get("location", "")] + \
                    list(info.get("additionalLocations") or [])
        near = nearby(loc_texts)
        if not near:
            return None
        if not INCLUDE_REMOTE_ONLY and re.search(r"remote", " ".join(loc_texts), re.I) \
                and not any(find_place(x) for x in loc_texts if not re.search("remote", x, re.I)):
            return None
        desc = info.get("jobDescription", "")
        url = info.get("externalUrl") or f"https://{host}/en-US/{site}{p['externalPath']}"
        return new_job(
            company=company, title=info.get("title") or p.get("title", ""), url=url,
            location="; ".join(x for x in loc_texts if x and not re.match(r"^\d+ Locations$", x))[:160],
            place=near[0], miles=round(near[1], 1), center=near[2],
            posted=info.get("startDate") or p.get("postedOn", ""),
            age=parse_age_days(info.get("startDate")) if info.get("startDate") else parse_age_days(p.get("postedOn")),
            closes=info.get("endDate", "") or "",
            text=strip_html(desc), desc_html=desc, time_type=info.get("timeType", ""),
            source="Workday", closed=not info.get("canApply", True))

    with ThreadPoolExecutor(4) as ex:
        for r in ex.map(detail, cands):
            if r:
                results.append(r)
    log(f"  {company}: {len(postings)} local postings, {len(cands)} office-type titles, {len(results)} nearby")
    return results


# -----------------------------------------------------------------------------
# Source: governmentjobs.com (counties / cities)
# -----------------------------------------------------------------------------

# Where to assume a county job is when the listing doesn't say.
GOVJOBS_DEFAULT_PLACE = {"fairfaxcounty": "Fairfax", "fairfaxva": "Fairfax",
                         "fairfaxwater": "Fairfax", "loudoun": "Ashburn"}


def govjobs_source(name, agency):
    results, seen = [], set()
    for page in range(1, 60):
        t = http(f"https://www.governmentjobs.com/careers/home/index?agency={agency}"
                 f"&sort=PostingDate&isDescendingSort=true&page={page}",
                 headers={"X-Requested-With": "XMLHttpRequest", "Accept": "text/html"})
        if not t:
            break
        items = re.split(r'(?=<li class="list-item")', t)[1:]
        new = 0
        for it in items:
            m = re.search(r'data-job-id="(\d+)"', it)
            if not m or m.group(1) in seen:
                continue
            seen.add(m.group(1))
            new += 1
            a = re.search(r'class="item-details-link"[^>]*href="([^"]+)"[^>]*>([^<]+)</a>', it)
            if not a:
                continue
            href, title = a.group(1), html.unescape(a.group(2)).strip()
            metas = [strip_html(x) for x in re.findall(r"<li(?: [^>]*)?>(.*?)</li>", it, re.S)]
            loc = next((x for x in metas if "$" not in x and not x.startswith(("Category", "Department"))), "")
            pay = next((x for x in metas if "$" in x), "")
            posted = strip_html((re.search(r'list-entry-starts">(.*?)</span>\s*</span>', it, re.S) or [None, ""])[1])
            closes = strip_html((re.search(r'list-entry-ends">(.*?)</span>', it, re.S) or [None, ""])[1])
            if not title_ok(title):
                continue
            if find_place(loc, "VA"):
                near = nearby([loc], "VA")
            elif agency in GOVJOBS_DEFAULT_PLACE:
                near = nearby([GOVJOBS_DEFAULT_PLACE[agency]], "VA")
                loc = (loc + " - " if loc else "") + "location varies, check posting"
            else:
                near = None
            if not near:
                continue
            url = "https://www.governmentjobs.com" + href
            results.append(new_job(company=name, title=title, url=url, location=loc,
                                   place=near[0], miles=round(near[1], 1), center=near[2],
                                   posted=posted, closes=closes, pay_text=pay,
                                   time_type=pay, source="GovernmentJobs"))
        if new == 0 or len(items) < 10:
            break

    def detail(j):
        t = http(j["url"], headers={"Accept": "text/html"})
        if t:
            body = re.search(r'(?is)class="tab-pane active fr-view"[^>]*>(.*?)<div[^>]+class="[^"]*tab-pane', t)
            raw = body.group(1) if body else t
            j["desc_html"] = raw[:60000]
            j["text"] = strip_html(raw)[:20000]
            sal = re.search(r"(?is)salary offer will be in the minimum to midpoint \(([^)]*)\)", j["text"])
            if sal:
                j["pay_text"] = sal.group(1) + " " + j["pay_text"]
        return j

    with ThreadPoolExecutor(4) as ex:
        results = list(ex.map(detail, results))
    log(f"  {name}: {len(seen)} postings, {len(results)} office-type nearby")
    return results


# -----------------------------------------------------------------------------
# Source: Northern Virginia Community College (VCCS PeopleAdmin)
# -----------------------------------------------------------------------------

def nova_source():
    links = {}
    for page in range(1, 15):
        t = http(f"https://jobs.vccs.edu/postings/search?page={page}"
                 f"&query_organizational_tier_1_id%5B%5D=7897", headers={"Accept": "text/html"})
        if not t:
            break
        found = re.findall(r'<a href="(/postings/\d+)">([^<]+)</a>', t)
        if not found:
            break
        before = len(links)
        for href, title in found:
            links.setdefault(href, html.unescape(title).strip())
        if len(links) == before:
            break
    cands = {h: tt for h, tt in links.items() if title_ok(tt) and not re.search(r"adjunct", tt, re.I)}

    def detail(item):
        href, title = item
        t = http("https://jobs.vccs.edu" + href, headers={"Accept": "text/html"})
        if not t:
            return None
        rows = {}
        for k, v in re.findall(r"<tr[^>]*>\s*<th[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>", t, re.S):
            rows[strip_html(k)] = v
        g = lambda k: strip_html(rows.get(k, ""))
        loc = g("Work Location")
        near = nearby([loc], "VA") if find_place(loc, "VA") else nearby(["Annandale"], "VA")
        if not near:
            return None
        close = g("Job Close Date")
        closed = False
        try:
            closed = dt.datetime.strptime(close, "%m/%d/%Y").date() < TODAY
        except ValueError:
            pass
        desc = rows.get("Job Description", "") + rows.get("KSA&#39;s/Required Qualifications", "") + \
            rows.get("KSA's/Required Qualifications", "") + rows.get("Additional Considerations", "")
        return new_job(company="Northern Virginia Community College (NOVA)", title=title,
                       url="https://jobs.vccs.edu" + href, location=f"NOVA - {loc}",
                       place=near[0], miles=round(near[1], 1), center=near[2],
                       posted=g("Job Open Date"), age=parse_age_days(g("Job Open Date")),
                       closes=close, pay_text=g("Hiring Range"),
                       time_type=g("Full Time or Part Time"),
                       text=strip_html(desc), desc_html=desc, source="NOVA", closed=closed)

    with ThreadPoolExecutor(4) as ex:
        res = [r for r in ex.map(detail, cands.items()) if r]
    log(f"  NOVA: {len(links)} postings, {len(res)} office-type")
    return res


# -----------------------------------------------------------------------------
# Source: Amazon
# -----------------------------------------------------------------------------

def amazon_source():
    res, seen, offset, hits = [], set(), 0, None
    while True:
        d = http_json("https://www.amazon.jobs/en/search.json?result_limit=100&sort=recent"
                      f"&offset={offset}&latitude=38.9200&longitude=-77.3500"
                      "&loc_query=Reston%2C%20VA&radius=40km")
        if not d:
            break
        if hits is None:
            hits = d.get("hits", 0)
        jobs = d.get("jobs") or []
        for j in jobs:
            if j["id"] in seen:
                continue
            seen.add(j["id"])
            if not title_ok(j.get("title", "")):
                continue
            locs = [j.get("normalized_location", ""), j.get("location", "")]
            raw_locs = j.get("locations") or []
            try:
                if isinstance(raw_locs, str):
                    raw_locs = json.loads(raw_locs)
                for l in raw_locs:
                    l = json.loads(l) if isinstance(l, str) else l
                    locs.append(f"{l.get('city', '')}, {l.get('normalizedStateName', '')}")
            except (ValueError, AttributeError):
                pass
            near = nearby(locs)
            if not near:
                continue
            desc = (j.get("description", "") + "<br>" + j.get("basic_qualifications", "") +
                    "<br>" + j.get("preferred_qualifications", ""))
            res.append(new_job(company="Amazon / AWS", title=j["title"],
                               url="https://www.amazon.jobs" + j.get("job_path", ""),
                               location=j.get("normalized_location", ""), place=near[0],
                               miles=round(near[1], 1), center=near[2],
                               posted=j.get("posted_date", ""), text=strip_html(desc),
                               desc_html=desc, time_type=j.get("job_schedule_type") or "",
                               source="Amazon"))
        offset += 100
        if not jobs or offset >= min(hits or 0, 3000):
            break
    log(f"  Amazon: {len(seen)} postings in area, {len(res)} office-type nearby")
    return res


# -----------------------------------------------------------------------------
# Source: Microsoft
# -----------------------------------------------------------------------------

def microsoft_source():
    pos = {}
    for town in ("Reston, VA", "Herndon, VA", "Sterling, VA", "Chantilly, VA",
                 "Fairfax, VA", "Ashburn, VA", "Manassas, VA", "Arlington, VA"):
        start = 0
        while start < 500:
            d = http_json("https://apply.careers.microsoft.com/api/pcsx/search?domain=microsoft.com"
                          f"&query=&location={urllib.parse.quote(town)}&start={start}&num=10&sort_by=timestamp")
            ps = ((d or {}).get("data") or {}).get("positions") or []
            for p in ps:
                pos.setdefault(p["id"], p)
            start += 10
            if len(ps) < 10:
                break
    cands = [p for p in pos.values() if title_ok(p.get("name", ""))]

    def detail(p):
        near = nearby(p.get("standardizedLocations", []) + p.get("locations", []))
        if not near:
            return None
        d = http_json(f"https://apply.careers.microsoft.com/api/pcsx/position_details?"
                      f"position_id={p['id']}&domain=microsoft.com&hl=en")
        info = (d or {}).get("data") or {}
        desc = info.get("jobDescription", "")
        ts = p.get("postedTs")
        posted = dt.date.fromtimestamp(ts).isoformat() if ts else ""
        return new_job(company="Microsoft", title=p["name"],
                       url="https://apply.careers.microsoft.com" + p.get("positionUrl", ""),
                       location="; ".join(p.get("standardizedLocations", [])), place=near[0],
                       miles=round(near[1], 1), center=near[2], posted=posted,
                       text=strip_html(desc), desc_html=desc, source="Microsoft")

    with ThreadPoolExecutor(4) as ex:
        res = [r for r in ex.map(detail, cands) if r]
    log(f"  Microsoft: {len(pos)} postings in area, {len(res)} office-type nearby")
    return res


# -----------------------------------------------------------------------------
# Source: Carahsoft (Reston HQ; posts its entry-level roles with pay)
# -----------------------------------------------------------------------------

def carahsoft_source():
    t = http("https://www.carahsoft.com/careers", headers={"Accept": "text/html"})
    if not t:
        log("  ! Carahsoft: site did not respond")
        return []
    links = sorted(set(re.findall(r'href="((?:https://www\.carahsoft\.com)?/careers/[A-Za-z0-9_-]+)"', t)))
    res = []

    def detail(href):
        url = href if href.startswith("http") else "https://www.carahsoft.com" + href
        if url.rstrip("/").endswith(("apply-now", "careers")):
            return None
        p = http(url, headers={"Accept": "text/html"})
        if not p:
            return None
        title = strip_html((re.search(r"(?is)<h1[^>]*>(.*?)</h1>", p) or [None, ""])[1])
        if not title or len(title) > 90:
            title = url.rsplit("/", 1)[-1].replace("-", " ").title()
        i = p.find("content--left")
        ends = [k for k in (p.find("content--right", i), p.find("<footer", i)) if k > i]
        raw = p[i:min(ends)] if i > 0 and ends else p
        text = strip_html(raw)
        if not re.search(r"responsibilit|qualification|starting range", text, re.I):
            return None
        if not title_ok(title):
            return None
        near = nearby(["Reston, VA"])
        return new_job(company="Carahsoft", title=title, url=url, location="Reston, VA (HQ)",
                       place=near[0], miles=round(near[1], 1), center=near[2],
                       posted="rolling", text=text[:20000], desc_html=raw[:60000],
                       source="Carahsoft")

    with ThreadPoolExecutor(4) as ex:
        res = [r for r in ex.map(detail, links) if r]
    log(f"  Carahsoft: {len(links)} pages, {len(res)} office-type")
    return res


# -----------------------------------------------------------------------------
# Source: Greenhouse job boards
# -----------------------------------------------------------------------------

def greenhouse_source(company, board):
    d = http_json(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true")
    if not d:
        log(f"  ! {company}: site did not respond")
        return []
    res = []
    for j in d.get("jobs") or []:
        title = j.get("title", "")
        locs = [(j.get("location") or {}).get("name", "")] + \
               [o.get("name", "") for o in j.get("offices") or []]
        near = nearby(locs)
        if not near or not title_ok(title):
            continue
        desc = html.unescape(j.get("content") or "")
        posted = j.get("first_published") or j.get("updated_at") or ""
        res.append(new_job(company=company, title=title, url=j.get("absolute_url", ""),
                           location="; ".join(x for x in locs if x)[:160], place=near[0],
                           miles=round(near[1], 1), center=near[2], posted=posted[:10],
                           age=parse_age_days(posted[:10]), text=strip_html(desc),
                           desc_html=desc, source="Greenhouse"))
    log(f"  {company}: {len(d.get('jobs') or [])} postings, {len(res)} office-type nearby")
    return res


def lever_source(company, board):
    d = http_json(f"https://api.lever.co/v0/postings/{board}?mode=json")
    if not isinstance(d, list):
        log(f"  ! {company}: site did not respond")
        return []
    res = []
    for j in d:
        title = j.get("text", "")
        cat = j.get("categories") or {}
        locs = [cat.get("location", "")] + list(cat.get("allLocations") or [])
        near = nearby(locs)
        if not near or not title_ok(title):
            continue
        desc = (j.get("description") or "") + "".join(
            f"<h4>{x.get('text', '')}</h4><ul>{x.get('content', '')}</ul>" for x in j.get("lists") or []) + \
            (j.get("additional") or "")
        sal = j.get("salaryRange") or {}
        pay = ""
        if sal.get("min"):
            per = "per hour" if "hour" in str(sal.get("interval", "")).lower() else "per year"
            pay = f"${sal['min']:,} - ${sal.get('max', sal['min']):,} {per}"
        created = j.get("createdAt")
        posted = dt.date.fromtimestamp(created / 1000).isoformat() if created else ""
        res.append(new_job(company=company, title=title, url=j.get("hostedUrl", ""),
                           location="; ".join(x for x in locs if x)[:160], place=near[0],
                           miles=round(near[1], 1), center=near[2], posted=posted,
                           age=parse_age_days(posted), pay_text=pay, text=strip_html(desc),
                           desc_html=desc, time_type=cat.get("commitment", ""), source="Lever"))
    log(f"  {company}: {len(d)} postings, {len(res)} office-type nearby")
    return res


# -----------------------------------------------------------------------------
# Source: USAJOBS (federal) - needs a free API key (see SETTINGS)
# -----------------------------------------------------------------------------

def usajobs_source():
    if not (USAJOBS_API_KEY and USAJOBS_EMAIL):
        log("  USAJOBS: skipped (add a free API key in SETTINGS to include federal jobs)")
        return []
    hdr = {"Host": "data.usajobs.gov", "User-Agent": USAJOBS_EMAIL,
           "Authorization-Key": USAJOBS_API_KEY}
    items = {}
    for town in CENTERS:
        page = 1
        while page <= 10:
            d = http_json("https://data.usajobs.gov/api/search?" + urllib.parse.urlencode({
                "LocationName": f"{town}, Virginia", "Radius": MAX_DRIVE_MILES,
                "ResultsPerPage": 500, "Page": page}), headers=hdr)
            sr = (d or {}).get("SearchResult") or {}
            got = sr.get("SearchResultItems") or []
            for it in got:
                items.setdefault(it.get("MatchedObjectId"), it.get("MatchedObjectDescriptor") or {})
            if len(got) < 500:
                break
            page += 1
    res = []
    for m in items.values():
        title = m.get("PositionTitle", "")
        if not title_ok(title):
            continue
        locs = m.get("PositionLocation") or []
        best = None
        for l in locs:
            try:
                c = (float(l["Latitude"]), float(l["Longitude"]))
            except (KeyError, TypeError, ValueError):
                continue
            mi, center = drive_miles(c)
            if best is None or mi < best[1]:
                best = (l.get("CityName", "").split(",")[0], mi, center)
        if not best or best[1] > MAX_DRIVE_MILES:
            continue
        ua = (m.get("UserArea") or {}).get("Details") or {}
        rem = (m.get("PositionRemuneration") or [{}])[0]
        try:
            lo = float(rem.get("MinimumRange", 0))
            hi = float(rem.get("MaximumRange", 0))
            if rem.get("RateIntervalCode") == "PH":
                lo, hi = lo * 2080, hi * 2080
            pay = f"${lo:,.0f} - ${hi:,.0f} per year" if lo else ""
        except (TypeError, ValueError):
            pay = ""
        duties = ua.get("MajorDuties") or []
        desc = (ua.get("JobSummary", "") + "<ul>" + "".join(f"<li>{x}</li>" for x in duties) +
                "</ul>" + m.get("QualificationSummary", ""))
        if ua.get("SecurityClearance"):
            desc += f"<p>Security clearance: {ua.get('SecurityClearance')}</p>"
        res.append(new_job(company=f"{m.get('OrganizationName', '')} (Federal)", title=title,
                           url=m.get("PositionURI", ""), location=m.get("PositionLocationDisplay", ""),
                           place=best[0], miles=round(best[1], 1), center=best[2],
                           posted=(m.get("PublicationStartDate") or "")[:10],
                           closes=(m.get("ApplicationCloseDate") or "")[:10], pay_text=pay,
                           text=strip_html(desc), desc_html=desc,
                           time_type=", ".join(s.get("Name", "") for s in m.get("PositionSchedule") or []),
                           source="USAJOBS"))
    log(f"  USAJOBS: {len(items)} postings, {len(res)} office-type nearby")
    return res


# -----------------------------------------------------------------------------
# Report
# -----------------------------------------------------------------------------

def load_seen():
    try:
        with open(os.path.join(OUT_DIR, "seen.json")) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_seen(seen):
    with open(os.path.join(OUT_DIR, "seen.json"), "w") as f:
        json.dump(seen, f)


def snippet(text, n=420):
    t = re.sub(r"\s+", " ", text or "").strip()
    return t[:n] + ("…" if len(t) > n else "")


def write_report(kept, dropped, stats):
    seen = load_seen()
    now = dt.datetime.now().isoformat(timespec="minutes")
    rows = []
    for j in kept:
        first = seen.get(j["url"])
        if not first:
            seen[j["url"]] = now
        rows.append({
            "id": j["url"], "title": j["title"], "company": j["company"], "url": j["url"],
            "location": j["location"], "place": j["place"], "miles": j["miles"], "center": j["center"],
            "posted": j["posted"] if isinstance(j["posted"], str) else str(j["posted"]),
            "age": j["age"], "closes": j["closes"], "payMin": j["pay_min"], "payMax": j["pay_max"],
            "payLabel": j["pay_label"], "years": j["years"], "clearance": j["clearance"],
            "talk": j["talk"], "entry": j["entry"], "duties": j["duties"], "partTime": j["part_time"],
            "score": j["score"], "isNew": not first or first == now, "firstSeen": first or now,
            "snippet": snippet(j["text"]), "source": j["source"],
        })
    save_seen(seen)
    rows.sort(key=lambda r: (-r["score"], r["age"] if r["age"] is not None else 999))
    data = {"generated": dt.datetime.now().strftime("%A, %B %d, %Y at %I:%M %p"),
            "jobs": rows, "stats": stats, "dropped": len(dropped),
            "settings": {"maxPay": MAX_STARTING_PAY, "maxMiles": MAX_DRIVE_MILES,
                         "maxAge": MAX_AGE_DAYS, "maxYears": MAX_YEARS_EXPERIENCE,
                         "centers": list(CENTERS)}}
    with open(os.path.join(HERE, "report_template.html"), encoding="utf-8") as f:
        tpl = f.read()
    blob = json.dumps(data).replace("</", "<\\/")
    out = tpl.replace("/*__JOB_DATA__*/null", blob)
    path = os.path.join(OUT_DIR, "jobs.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(out)
    # Also a spreadsheet-friendly copy.
    with open(os.path.join(OUT_DIR, "jobs.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Score", "New", "Title", "Company", "Location", "Est. drive miles", "Pay",
                    "Posted", "Closes", "Years exp", "Talking", "Clearance", "Link"])
        for r in rows:
            pay = r["payLabel"] or "not listed"
            w.writerow([r["score"], "NEW" if r["isNew"] else "", r["title"], r["company"],
                        r["location"], r["miles"], pay, r["posted"], r["closes"],
                        "" if r["years"] is None else r["years"], r["talk"], r["clearance"] or "",
                        r["url"]])
    return path


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

def main():
    global SSL_CTX, MAX_DRIVE_MILES, MAX_STARTING_PAY, MAX_AGE_DAYS
    ap = argparse.ArgumentParser(description="Find entry-level office jobs near Reston/Herndon/Fairfax VA.")
    ap.add_argument("--no-open", action="store_true", help="don't open the report in a browser")
    ap.add_argument("--only", help="comma list of sources: workday,greenhouse (incl. Lever),gov,nova,amazon,microsoft,carahsoft,usajobs")
    ap.add_argument("--company", help="only Workday companies whose name contains this text")
    ap.add_argument("--miles", type=float, help=f"max drive miles (default {MAX_DRIVE_MILES})")
    ap.add_argument("--max-pay", type=int, help=f"max starting pay (default {MAX_STARTING_PAY})")
    ap.add_argument("--days", type=int, help=f"max posting age in days (default {MAX_AGE_DAYS})")
    ap.add_argument("--debug", action="store_true", help="also save every checked job to output/debug.json")
    args = ap.parse_args()
    if args.miles:
        MAX_DRIVE_MILES = args.miles
    if args.max_pay:
        MAX_STARTING_PAY = args.max_pay
    if args.days:
        MAX_AGE_DAYS = args.days

    os.makedirs(OUT_DIR, exist_ok=True)
    SSL_CTX = _ssl_context()
    only = set((args.only or "workday,greenhouse,gov,nova,amazon,microsoft,carahsoft,usajobs").split(","))

    t0 = time.time()
    log("Searching job sites - this usually takes 3-6 minutes.")
    log("Your job list will open in your web browser when it's done.\n")
    tasks = []
    if "workday" in only:
        for c in WORKDAY_SITES:
            if args.company and args.company.lower() not in c[0].lower():
                continue
            tasks.append((c[0], workday_source, c))
    if "greenhouse" in only:
        for name, board in GREENHOUSE_BOARDS:
            if args.company and args.company.lower() not in name.lower():
                continue
            tasks.append((name, greenhouse_source, (name, board)))
        for name, board in LEVER_BOARDS:
            if args.company and args.company.lower() not in name.lower():
                continue
            tasks.append((name, lever_source, (name, board)))
    if "gov" in only:
        for name, agency in GOVJOBS_AGENCIES:
            tasks.append((name, govjobs_source, (name, agency)))
    if "nova" in only:
        tasks.append(("NOVA", nova_source, ()))
    if "amazon" in only:
        tasks.append(("Amazon", amazon_source, ()))
    if "microsoft" in only:
        tasks.append(("Microsoft", microsoft_source, ()))
    if "carahsoft" in only:
        tasks.append(("Carahsoft", carahsoft_source, ()))
    if "usajobs" in only:
        tasks.append(("USAJOBS", usajobs_source, ()))

    found, stats = [], []
    with ThreadPoolExecutor(6) as ex:
        futs = {ex.submit(fn, *a): name for name, fn, a in tasks}
        for f in as_completed(futs):
            name = futs[f]
            try:
                r = f.result()
            except Exception as e:  # one broken site shouldn't stop the run
                log(f"  ! {name}: error {e!r}")
                r = []
            stats.append({"source": name, "found": len(r)})
            found.extend(r)

    # De-duplicate (same company + title + place).
    uniq = {}
    for j in found:
        k = (j["company"].lower(), re.sub(r"\W+", " ", j["title"].lower()).strip(), j["place"])
        if k not in uniq:
            uniq[k] = j
    jobs = [evaluate(j) for j in uniq.values()]
    kept = [j for j in jobs if not j["drop"]]
    dropped = [j for j in jobs if j["drop"]]

    path = write_report(kept, dropped, sorted(stats, key=lambda s: -s["found"]))
    if args.debug:
        with open(os.path.join(OUT_DIR, "debug.json"), "w") as f:
            json.dump([{k: v for k, v in j.items() if k not in ("desc_html",)} for j in jobs], f, indent=1)
    mins = (time.time() - t0) / 60
    log(f"\nDone in {mins:.1f} min. {len(kept)} jobs match "
        f"({len(dropped)} more were hidden for pay/experience/clearance/age).")
    log(f"Report: {path}")
    if not args.no_open:
        log("\nOpening your job list in your web browser...")
        log("(If it doesn't appear, double-click 'Open Last Report' in the jobfinder folder.)")
        opened = False
        if sys.platform == "darwin":
            opened = subprocess.run(["open", path]).returncode == 0
        if not opened:
            webbrowser.open("file://" + urllib.parse.quote(path))


if __name__ == "__main__":
    main()
