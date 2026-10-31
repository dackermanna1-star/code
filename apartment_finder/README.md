# apartment_finder

Scrapes current 1-bedroom asking rents for apartment communities in Fairfax
County **blue-zone** zip codes around McNair / Herndon / Reston, then filters
for modern, amenity-rich, non-garden buildings under a strict rent ceiling
(default: rent **below $2,180**).

## Run

```bash
pip install requests
cd apartment_finder
python finder.py --include-nearby --out results
```

Outputs in `results/`:

| file | contents |
| --- | --- |
| `report.md` | ranked market-rate shortlist, then WDU/income-restricted units, junior 1BRs, and every rejected property with the reason |
| `units.csv` | every qualifying unit (unit #, plan, rent, sqft, availability, special, feed timestamp) |
| `properties.json` | full parsed data incl. amenity lists |

Options: `--zips 20190 20171` (custom zips), `--max-rent 2180` (strict, rent
must be below it), `--min-year 2005` (reject buildings verified older than
this unless fully renovated), `--delay 3` (seconds between requests).

## How it works

1. `zones.py` holds the county's Yellow/Green/Blue zip table and limits.
   Core zips: **20171** (Herndon south / McNair Farms / Dulles Station),
   **20190** (Reston Town Center / Wiehle), **20194** (North Reston).
   `--include-nearby` adds **20151** (Chantilly) and **22033** (Fair Lakes).
   20170 and 20191 look local but are *green* zone, so they're excluded.
2. For each zip it reads rent.com's 1-bedroom search results, then every
   property page, and pulls the JSON the page is rendered from: floor plans,
   unit numbers, asking rents, square footage, availability dates, amenities,
   specials and the feed's last-updated time.
3. Each 1BR unit is classified from its floor-plan name:
   - `income-restricted` - "WDU", "ADU", "Income Limits Apply", "80%"...
     (Fairfax County Workforce Dwelling Units: capped rent, income limits)
   - `junior` - "JR", "Junior", "Alcove" (often treated as a studio)
   - `market` - everything else
4. Buildings are matched against `building_facts.json` (hand-verified year
   built, stories, style, review ratings, with source links). Garden-style or
   pre-`--min-year` buildings are rejected; buildings with no facts on file
   and no elevator listed are reported as "style unverified" rather than
   trusted.
5. Ranking = amenity count (premium amenities weighted) + modern-finish
   signals (stainless, quartz, in-unit W/D, renovated...) + newness + review
   rating - distance to the nearest of McNair Farms / downtown Herndon /
   Reston Town Center.

## Accuracy notes

- Rents are what each property is feeding to rent.com at run time; the feed
  timestamp is in the output. Units and prices change daily.
- Always confirm on the property's own website or by phone before applying,
  and ask for the **total monthly cost**: many communities add mandatory
  monthly fees (amenity, trash, pest, package, utility billing) on top of
  base rent.
- Apartments.com, Zillow, Trulia, HotPads and ApartmentRatings block
  automated requests, so review ratings are collected by hand into
  `building_facts.json`.
- rent.com rate-limits bursts (HTTP 202). The fetcher backs off and caches
  pages for 6 hours, so re-running is cheap.
