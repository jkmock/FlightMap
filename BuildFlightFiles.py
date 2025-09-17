import json
from pathlib import Path

import pandas as pd
from airportsdata import load as load_airports

# ---- settings you might change ----
XLSX_FILE  = "Flight Logs 2025.xlsx"
ORIGIN_COL = "From"        # column with origin airport code
DEST_COL   = "To"
DATE_COL   = "Date"   # column with destination airport code
MONTH_COL  = "Month"         # numeric month 1..12
YEAR_COL   = "Year"           # e.g., "year" if you have a year column; else leave None
OUT_DIR    = Path("flights")
# -----------------------------------

# offline airport DBs
IATA = {k.upper(): v for k, v in load_airports("IATA").items()}
ICAO = {k.upper(): v for k, v in load_airports("ICAO").items()}

def coord(code):
    if pd.isna(code):
        return None
    c = "K" + str(code).strip().upper() if len(str(code).strip()) == 3 else str(code).strip().upper()
    if c in IATA: return (IATA[c]["lat"], IATA[c]["lon"])
    if c in ICAO: return (ICAO[c]["lat"], ICAO[c]["lon"])
    return None

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Read and drop first 6 columns (A–F)
    df = pd.read_excel(XLSX_FILE, engine="openpyxl")
    df = df.drop(index=list(range(0, 4)) + [5])

    # Normalize headers (case-insensitive lookup)
    df.columns = [str(c).strip() for c in df.columns]
    cmap = {c.lower(): c for c in df.columns}

    ocol = cmap.get(ORIGIN_COL.lower())
    dcol = cmap.get(DEST_COL.lower())
    mcol = cmap.get(MONTH_COL.lower())
    ycol = cmap.get(YEAR_COL.lower())
    tailcol = df.columns[0]
    datecol = cmap.get(DATE_COL.lower())

    if not (ocol and dcol and mcol):
        raise SystemExit(f"Missing required columns. Found: {list(df.columns)} "
                         f"(need '{ORIGIN_COL}', '{DEST_COL}', '{MONTH_COL}')")

    # Clean month to 1..12 ints and drop invalid
    df[mcol] = pd.to_numeric(df[mcol], errors="coerce").astype("Int64")
    df = df[df[mcol].between(1, 12, inclusive="both")].copy()

    # Build a grouping key
    if ycol:
        # Year + Month (e.g., '2021-03')
        df["key"] = df[ycol].astype("Int64").astype("string").str.strip() + "-" + df[mcol].astype(int).map(lambda x: f"{x:02d}")
    else:
        # Month only (e.g., 'm03')
        df["key"] = df[mcol].astype(int).map(lambda x: f"m{x:02d}")

    # For each month key, build flights and write a file
    for key, g in df.groupby("key", sort=True):
        flights = []
        # simple stagger for animation: 0, 600, 1200, ...
        for i, r in enumerate(g.itertuples(index=False)):
            ocode = str(getattr(r, ocol)).strip().upper() if pd.notna(getattr(r, ocol)) else ""
            dcode = str(getattr(r, dcol)).strip().upper() if pd.notna(getattr(r, dcol)) else ""
            if not ocode or not dcode:
                continue
            oc = coord(ocode); dc = coord(dcode)
            if not oc or not dc:
                continue
            flights.append({
              "olat": float(oc[0]), "olng": float(oc[1]),
              "dlat": float(dc[0]), "dlng": float(dc[1]),
              "meta": {"o": ocode, "d": dcode},
              "tailNum": str(r[0]) if pd.notna(r[0]) else "",     # first column
              "date": str(getattr(r, datecol)) if pd.notna(getattr(r, datecol)) else "",
            })

        if not flights:
            continue

        # filename: flights_YYYY-MM.json or flights_mMM.json
        out_name = f"flights_{key}.json"
        out_path = OUT_DIR / out_name
        with out_path.open("w", encoding="utf-8") as f:
            json.dump({"month": key, "flights": flights}, f, ensure_ascii=False, indent=2)
        print(f"Wrote {len(flights):4d} flights -> {out_path}")

if __name__ == "__main__":
    main()
