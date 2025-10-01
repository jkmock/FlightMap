import json
from pathlib import Path
import glob

import pandas as pd
from airportsdata import load as load_airports

# ---- settings you might change ----
INPUT_PATTERN = "Flight Logs *.xlsx"  # Pattern to match multiple Excel files
MAX_SHEETS = 3              # Only process first 2 sheets per file
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

def process_excel_file(xlsx_file):
    """Process a single Excel file, handling multiple sheets if present"""
    print(f"\nProcessing: {xlsx_file}")
    all_sheets_data = []

    try:
        # Get all sheet names
        xl_file = pd.ExcelFile(xlsx_file, engine="openpyxl")
        sheet_names = xl_file.sheet_names
        print(f"  Found {len(sheet_names)} sheet(s): {sheet_names}")

        for i, sheet_name in enumerate(sheet_names[:MAX_SHEETS]):  # Only first 2 sheets
            try:
                print(f"  Processing sheet: {sheet_name}")

                # Read sheet and drop first few rows
                df = pd.read_excel(xlsx_file, sheet_name=sheet_name, engine="openpyxl")
                if len(df) <= 5:
                    print(f"    Skipping {sheet_name} - too few rows")
                    continue

                df = df.drop(index=list(range(0, 4)) + [5])

                # Normalize headers (case-insensitive lookup)
                df.columns = [str(c).strip() for c in df.columns]
                cmap = {c.lower(): c for c in df.columns}

                ocol = cmap.get(ORIGIN_COL.lower())
                dcol = cmap.get(DEST_COL.lower())
                mcol = cmap.get(MONTH_COL.lower())
                ycol = cmap.get(YEAR_COL.lower())
                datecol = cmap.get(DATE_COL.lower())

                if not (ocol and dcol and mcol):
                    print(f"    Skipping {sheet_name} - missing required columns")
                    print(f"    Found columns: {list(df.columns)}")
                    print(f"    Need: '{ORIGIN_COL}', '{DEST_COL}', '{MONTH_COL}'")
                    continue

                # Clean month to 1..12 ints and drop invalid
                df[mcol] = pd.to_numeric(df[mcol], errors="coerce").astype("Int64")
                df = df[df[mcol].between(1, 12, inclusive="both")].copy()

                # Add source info for tracking
                df['source_file'] = xlsx_file
                df['source_sheet'] = sheet_name

                all_sheets_data.append(df)
                print(f"    Added {len(df)} valid flights from {sheet_name}")

            except Exception as e:
                print(f"    Error processing sheet {sheet_name}: {e}")
                continue

    except Exception as e:
        print(f"  Error reading {xlsx_file}: {e}")
        return []

    return all_sheets_data

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Find all matching Excel files
    xlsx_files = glob.glob(INPUT_PATTERN)
    if not xlsx_files:
        print(f"No files found matching pattern: {INPUT_PATTERN}")
        return

    print(f"Found {len(xlsx_files)} Excel files: {xlsx_files}")

    # Process all files and collect data
    all_data = []
    for xlsx_file in sorted(xlsx_files):
        sheets_data = process_excel_file(xlsx_file)
        all_data.extend(sheets_data)

    if not all_data:
        print("No valid data found in any files")
        return

    # Combine all data
    print(f"\nCombining data from {len(all_data)} sheets...")
    combined_df = pd.concat(all_data, ignore_index=True)
    print(f"Total combined flights: {len(combined_df)}")

    # Get column mappings from combined data
    cmap = {c.lower(): c for c in combined_df.columns}
    ocol = cmap.get(ORIGIN_COL.lower())
    dcol = cmap.get(DEST_COL.lower())
    mcol = cmap.get(MONTH_COL.lower())
    ycol = cmap.get(YEAR_COL.lower())
    datecol = cmap.get(DATE_COL.lower())

    # Build a grouping key - always use year-month format
    if ycol:
        # Year + Month (e.g., '2021-03')
        combined_df["key"] = combined_df[ycol].astype("Int64").astype("string").str.strip() + "-" + combined_df[mcol].astype(int).map(lambda x: f"{x:02d}")
    else:
        # Extract year from filename and combine with month (e.g., '2025-03')
        combined_df["extracted_year"] = combined_df['source_file'].str.extract(r'Flight Logs (\d{4})\.xlsx')[0]
        combined_df["key"] = combined_df["extracted_year"].astype(str) + "-" + combined_df[mcol].astype(int).map(lambda x: f"{x:02d}")

    print(f"\nGrouping by time periods...")
    print(f"Unique keys found: {sorted(combined_df['key'].unique())}")

    # For each month key, build flights and write a file
    for key, g in combined_df.groupby("key", sort=True):
        flights = []
        print(f"\nProcessing {key}: {len(g)} flights")

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
              "date": str(getattr(r, datecol)) if datecol and pd.notna(getattr(r, datecol)) else "",
              "source_file": getattr(r, 'source_file', ''),
              "source_sheet": getattr(r, 'source_sheet', ''),
            })

        if not flights:
            print(f"  No valid flights for {key}")
            continue

        # filename: flights_YYYY-MM.json or flights_mMM.json
        out_name = f"flights_{key}.json"
        out_path = OUT_DIR / out_name
        with out_path.open("w", encoding="utf-8") as f:
            json.dump({"month": key, "flights": flights}, f, ensure_ascii=False, indent=2)
        print(f"  Wrote {len(flights):4d} flights -> {out_path}")

if __name__ == "__main__":
    main()
