# Job Finder: entry-level office jobs near Reston, Herndon and Fairfax, VA

Double-click **Find Jobs**. A few minutes later your browser opens a report of fresh
entry-level, white-collar office jobs at big employers within about 15 miles' drive of
Reston, Herndon or Fairfax. You review the postings and apply yourself; the program
never applies for you.

## Two modes

- **Find Jobs**: entry-level office jobs, up to $58K a year. Most of this README is about this mode.
- **Find Easy Jobs**: easy hourly jobs that start at **$18/hr or more**. It skips fast food,
  restaurant, warehouse and stocking jobs. By default it also skips cashier, customer service,
  sales, front desk and bank teller jobs. Examples of what it finds: vet/kennel assistants,
  visual merchandisers, lifeguards, locker-room and pickleball attendants, daycare and preschool
  aides, recreation assistants, and lab assistants. It searches Target, TJ Maxx/Marshalls/HomeGoods,
  Wegmans, Whole Foods, Life Time, Michaels, Burlington, Five Below, Dollar Tree, Uniqlo,
  Nordstrom, Coach, Ann Taylor/LOFT, Kay/Zales, Vans, CarMax, AAA, WeWork, hotels, Banfield,
  banks, JLL, Greystar, Dulles airport (MWAA), Labcorp, Sunrise Senior Living, and the county
  and NOVA job boards. Its report opens as `output/easy-jobs.html`.
  Its settings are in the **"EASY JOBS" MODE** section of `jobfinder.py`: `EASY_MIN_HOURLY`,
  `EASY_MAX_STARTING_HOURLY`, `EASY_MAX_YEARS_EXPERIENCE`, `EASY_HIDE_CUSTOMER_FACING`
  and `EASY_WORKDAY_SITES`. To allow cashier and customer service jobs again, set
  `EASY_HIDE_CUSTOMER_FACING = False`.

## What it searches (about 100 employers)

- **Big companies' own career sites:**
  - **Defense and government contractors:** Booz Allen, Leidos, CACI, GDIT, Northrop Grumman, RTX, Boeing, Parsons, KBR, Amentum, ICF, Guidehouse, Aerospace Corp, Cubic, Unisys, DXC, Palantir
  - **Finance:** Capital One, Freddie Mac, Fannie Mae, Truist, PNC, M&T Bank, State Street, BlackRock, Federal Reserve, Visa, Mastercard, FIS, Fiserv, Capital Bank, GEICO, Nationwide, Marsh McLennan
  - **Tech and telecom:** Amazon/AWS, Microsoft, Salesforce, Verizon, AT&T, T-Mobile, Cisco, HPE, Red Hat, Workday, Ciena, Intel, NVIDIA, Micron (Manassas), Appian, Alarm.com, Verisign, Okta, Zscaler, Databricks, Scale AI, ID.me, HawkEye 360, BlackSky, Spire, Carahsoft
  - **Data centers:** Equinix, Iron Mountain, Vantage, NTT, EdgeConneX
  - **Consulting, law and other:** PwC, Gartner, Thomson Reuters, LexisNexis, DLA Piper, JLL, Cushman & Wakefield, Greystar, HNTB, STV, Comscore, FHI 360, Axios, FiscalNote, Stride/K12
  - **Health:** Cigna, Elevance, Cardinal Health, Labcorp, Sentara
  - **Other:** Metropolitan Washington Airports Authority (Dulles), Georgetown University, American University
- **Local government:** Fairfax County, Loudoun County, City of Fairfax, Fairfax Water, Prince William County, Manassas, Alexandria
- **Northern Virginia Community College (NOVA)**
- **Federal jobs (USAJOBS):** off until you add a free API key (see Settings below)

## What it keeps

- **Office and business job titles:** administrative, accounting/AP/AR, billing, payroll, procurement, contracts, records, data, HR, operations, coordinators, data center technicians, and similar.
- **No senior titles:** it drops senior, lead, manager, director, engineer, mid-level and similar titles. It also drops medical, teaching, trades, sales and call-center jobs.
- **Pay:** the starting pay must be **$58,000 or less**. Jobs that don't list pay are kept and labeled "Pay not listed".
- **Experience:** the posting must ask for **2 years of experience or less**.
- **Clearance:** jobs that need a security clearance you must **already have** are dropped.
- **Freshness:** the posting must be from the **last 45 days** when its date is known.

Each job in the report shows the estimated drive distance, pay, posted date, years of
experience asked, how much talking it involves (phones, front desk, customers), the number
of listed duties, and a 0–100 match score.

**Report filters:** new since last run, says entry-level, little talking only, max pay,
max drive, posted within, full or part time, and company. You can mark jobs **Applied**
or **Hide** them; those clicks are saved in your browser. **Download spreadsheet** saves a
CSV file.

## Setting it up on a Mac (one time)

1. Download this folder and put it somewhere easy, such as Documents.
2. Double-click **Find Jobs.command**.
   - If macOS says it "cannot be opened because it is from an unidentified developer",
     **right-click (or Control-click) the file → Open → Open**. You only need to do this once.
   - If a window offers to install "Command Line Developer Tools", click **Install**. This
     gives your Mac Python 3, which is free. When it finishes, double-click
     **Find Jobs** again.
   - If double-clicking does nothing, open the **Terminal** app and run these two
     commands (drag the jobfinder folder onto the Terminal window to fill in its path):

     ```bash
     cd /path/to/jobfinder
     ```

     ```bash
     chmod +x "Find Jobs.command" "Find Easy Jobs.command" "Open Last Report.command"
     ```

3. A Terminal window shows progress for each site. When it's done (usually 3–6
   minutes), the report opens in your browser.

Run it every day or two. Jobs you haven't seen before are marked **NEW**.
**Open Last Report** reopens the latest report from each mode without searching again.

## Settings

Open `jobfinder.py` in TextEdit. The **SETTINGS** section at the top lets you change:

- `CENTERS`: the towns to measure distance from.
- `MAX_DRIVE_MILES`: the drive limit (default 15).
- `MAX_STARTING_PAY`: the starting-pay limit (default 58000).
- `MAX_YEARS_EXPERIENCE`, `MAX_AGE_DAYS`, `HIDE_CLEARANCE_REQUIRED`, `HIDE_TALK_HEAVY_TITLES`, `INCLUDE_INTERNSHIPS`.
- `USAJOBS_API_KEY` and `USAJOBS_EMAIL`: request a free key at
  <https://developer.usajobs.gov/apirequest/> to add federal jobs (for example USGS in Reston).
  This source hasn't been test-run yet.
- `WORKDAY_SITES`, `GREENHOUSE_BOARDS`, `LEVER_BOARDS`: the employers to search. To add a
  company, find its careers site address:
  - `https://<id>.wd5.myworkdayjobs.com/<site>`: add a `WORKDAY_SITES` line.
  - `boards.greenhouse.io/<id>`: add a `GREENHOUSE_BOARDS` line.
  - `jobs.lever.co/<id>`: add a `LEVER_BOARDS` line.

Command-line options (in Terminal):

```bash
python3 jobfinder.py --miles 10 --max-pay 55000 --days 14
```

```bash
python3 jobfinder.py --only workday --company "Booz"
```

## Good to know

- **Not covered:** Indeed, LinkedIn, Glassdoor and ZipRecruiter block automated searching,
  and a few employers do too (SAIC, Peraton, Navy Federal, Inova), so they aren't included.
  Check those sites by hand now and then.
- **Estimates:** pay, experience, "talking" and drive distance are read automatically from
  each posting. They're good estimates but not perfect, so always read the full posting.
- **Location matters:** Arlington and McLean are near the edge of the 15-mile range.
  Lower the drive limit in the report if you want closer jobs only.
- **Requirements:** everything runs on your Mac with the Python that comes with Apple's
  developer tools, so there's nothing else to install.
