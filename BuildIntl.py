import json
from pathlib import Path

import pandas as pd
from airportsdata import load as load_airports

# ---- settings you might change ----
INPUT_FILE = "intl.xlsx"         # Input Excel file
MAX_SHEETS = None                # Process all sheets (set to number to limit)
ORIGIN_COL = "From"              # column with origin airport code (e.g., "From", "BUY", etc.)
DEST_COL   = "To"                # column with destination airport code (e.g., "To", "FXE", etc.)
DATE_COL   = "Date"              # column with date (month/year will be extracted from this)
OUT_DIR    = Path("flights")
# NOTE: Month and Year will be automatically extracted from the Date column
# -----------------------------------

# offline airport DBs
IATA = {k.upper(): v for k, v in load_airports("IATA").items()}
ICAO = {k.upper(): v for k, v in load_airports("ICAO").items()}

def coord(code):
    """Look up airport coordinates by IATA or ICAO code"""
    if pd.isna(code):
        return None
    c = "K" + str(code).strip().upper() if len(str(code).strip()) == 3 else str(code).strip().upper()
    if c in IATA: return (IATA[c]["lat"], IATA[c]["lon"])
    if c in ICAO: return (ICAO[c]["lat"], ICAO[c]["lon"])
    return None

def process_sheet(xlsx_file, sheet_name):
    """Process a single sheet from the Excel file"""
    print(f"  Processing sheet: {sheet_name}")

    try:
        # Read sheet without dropping any rows initially
        df = pd.read_excel(xlsx_file, sheet_name=sheet_name, engine="openpyxl", header=None)
        if len(df) == 0:
            print(f"    Skipping {sheet_name} - no data")
            return None

        # For intl.xlsx, assume no headers - data starts at row 0
        # Assign column names based on position: TailNum, Date, Origin, Destination
        if len(df.columns) >= 4:
            df.columns = ['TailNum', 'Date', 'From', 'To'] + list(df.columns[4:])
        else:
            print(f"    Skipping {sheet_name} - expected at least 4 columns, found {len(df.columns)}")
            return None

        print(f"    First row sample: {df.iloc[0].to_dict()}")

        # Normalize headers (case-insensitive lookup)
        df.columns = [str(c).strip() for c in df.columns]
        cmap = {c.lower(): c for c in df.columns}

        ocol = cmap.get(ORIGIN_COL.lower())
        dcol = cmap.get(DEST_COL.lower())
        datecol = cmap.get(DATE_COL.lower())

        # For intl.xlsx, we extract month/year from the Date column
        if not (ocol and dcol and datecol):
            print(f"    Skipping {sheet_name} - missing required columns")
            print(f"    Found columns: {list(df.columns)}")
            print(f"    Need: '{ORIGIN_COL}', '{DEST_COL}', '{DATE_COL}'")
            return None

        # Convert date column to datetime and extract month/year
        df[datecol] = pd.to_datetime(df[datecol], errors="coerce")
        df = df[df[datecol].notna()].copy()  # Drop rows with invalid dates

        df['Month'] = df[datecol].dt.month
        df['Year'] = df[datecol].dt.year

        # Add source info for tracking
        df['source_file'] = INPUT_FILE
        df['source_sheet'] = sheet_name

        print(f"    Added {len(df)} valid flights from {sheet_name}")
        return df

    except Exception as e:
        print(f"    Error processing sheet {sheet_name}: {e}")
        return None

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Check if input file exists
    input_path = Path(INPUT_FILE)
    if not input_path.exists():
        print(f"Error: File not found: {INPUT_FILE}")
        return

    print(f"Processing: {INPUT_FILE}")

    # Get all sheet names
    try:
        xl_file = pd.ExcelFile(INPUT_FILE, engine="openpyxl")
        sheet_names = xl_file.sheet_names
        print(f"  Found {len(sheet_names)} sheet(s): {sheet_names}")
    except Exception as e:
        print(f"Error reading {INPUT_FILE}: {e}")
        return

    # Process all sheets
    all_sheets_data = []
    sheets_to_process = sheet_names if MAX_SHEETS is None else sheet_names[:MAX_SHEETS]

    for sheet_name in sheets_to_process:
        sheet_df = process_sheet(INPUT_FILE, sheet_name)
        if sheet_df is not None:
            all_sheets_data.append(sheet_df)

    if not all_sheets_data:
        print("No valid data found in any sheets")
        return

    # Combine all data
    print(f"\nCombining data from {len(all_sheets_data)} sheets...")
    combined_df = pd.concat(all_sheets_data, ignore_index=True)
    print(f"Total combined flights: {len(combined_df)}")

    # Get column mappings from combined data
    cmap = {c.lower(): c for c in combined_df.columns}
    ocol = cmap.get(ORIGIN_COL.lower())
    dcol = cmap.get(DEST_COL.lower())
    datecol = cmap.get(DATE_COL.lower())

    # Use the Month and Year columns we created from the date
    mcol = 'Month'
    ycol = 'Year'

    # Build a grouping key - year-month format (e.g., '2021-03')
    combined_df["key"] = combined_df[ycol].astype("Int64").astype("string").str.strip() + "-" + combined_df[mcol].astype(int).map(lambda x: f"{x:02d}")

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

        # filename: flights_YYYY-MM.json
        out_name = f"flights_{key}.json"
        out_path = OUT_DIR / out_name
        with out_path.open("w", encoding="utf-8") as f:
            json.dump({"month": key, "flights": flights}, f, ensure_ascii=False, indent=2)
        print(f"  Wrote {len(flights):4d} flights -> {out_path}")

    print("\nDone! Don't forget to copy files from /flights/ to skysouth-demo/public/data/flights/")

if __name__ == "__main__":
    main()
