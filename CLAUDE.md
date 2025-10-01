# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
FlightMap is a 3D animated flight visualization application displaying over 22,000 flights across 23 years of aviation data using React, Next.js, Tailwind CSS, and Deck.gl.

## Development Commands

All commands should be run from the `skysouth-demo/` directory:

```bash
# Development with Turbopack (faster builds)
npm run dev

# Production build with Turbopack
npm run build

# Production server
npm run start

# Linting
npm run lint
```

## Architecture

**Main Application:** Located in `skysouth-demo/` - Next.js 15 app with App Router
**Core Visualization:** `skysouth-demo/src/app/sky_south_flights_demo.jsx` - Main Deck.gl visualization component
**Data Processing:** `BuildFlightFiles.py` - Converts Excel flight logs to monthly JSON files

### Key Tech Stack
- Next.js 15.5.3 with React 19.1.0 (App Router)
- Deck.gl 9.1.14 for 3D data visualization
- MapLibre GL 5.7.1 with react-map-gl
- Tailwind CSS 4.1.13 for styling

## Data Pipeline

**Source Data:** Multiple Excel files matching pattern `Flight Logs *.xlsx` (e.g., `Flight Logs 2023.xlsx`, `Flight Logs 2024.xlsx`, etc.)
**Multi-Sheet Support:** Each Excel file can contain multiple sheets representing different planes active that year
**Processing Script:** `BuildFlightFiles.py` processes all matching Excel files and sheets into consolidated monthly JSON files
**Data Location:** Processed files live in both `/flights/` (root) and `skysouth-demo/public/data/flights/` (must be manually synced)

To reprocess flight data:
1. Place all flight log Excel files in root directory with pattern `Flight Logs YYYY.xlsx`
2. Run `python BuildFlightFiles.py` from project root (processes all matching files and sheets)
3. Copy generated files from `/flights/` to `skysouth-demo/public/data/flights/`

**Enhanced Features:**
- Processes multiple Excel files automatically
- Handles varying numbers of sheets per file (different planes per year)
- Consolidates all data by year-month across all sources
- Includes source tracking (`source_file`, `source_sheet`) in flight records
- Preserves existing IATA/ICAO airport coordinate lookup logic

## Core Components

**Entry Point:** `skysouth-demo/src/app/page.js` - Main landing page
**Visualization Engine:** `skysouth-demo/src/app/sky_south_flights_demo.jsx` - Core 3D flight visualization with:
- Progressive month-by-month animation loading
- Deck.gl ArcLayer for 3D flight paths
- Interactive controls (play/pause, month slider)
- Custom dark blue map style (`public/styles/darkblue.json`)
- Client-side caching system

## Development Patterns

**Client Components:** All visualization components use `'use client'` directive
**Animation System:** Interval-based sequential loading with proper cleanup in useEffect
**Data Fetching:** Client-side fetch with try-catch error handling
**Performance:** Memoized view states and cached data loading
**Responsive Design:** Mobile-friendly with Tailwind CSS

## Configuration

**Path Aliases:** `@/*` maps to `./src/*` (configured in `jsconfig.json`)
**Map Style:** Custom dark blue theme at `public/styles/darkblue.json`
**Build Tool:** Turbopack enabled for faster development and builds

## Data Structure

Flight data JSON format:
```json
[
  {
    "from": [longitude, latitude],
    "to": [longitude, latitude],
    "month": "m01"
  }
]
```

## Dependencies

**Python Requirements:** `pandas`, `openpyxl`, `airportsdata` for data processing
**Key JS Dependencies:**
- `@deck.gl/core`, `@deck.gl/geo-layers`, `@deck.gl/layers`
- `maplibre-gl`, `react-map-gl`
- Standard Next.js and React packages