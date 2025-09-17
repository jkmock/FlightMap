// SkySouthFlightsDemo.jsx (pure JSX)
// Drop-in demo for CRA, Vite, or Next.js without TypeScript.
// Dependencies: deck.gl, @deck.gl/layers, @deck.gl/geo-layers, react-map-gl, maplibre-gl

'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "deck.gl";
import { Map } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import { ArcLayer } from "@deck.gl/layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import { COORDINATE_SYSTEM } from "@deck.gl/core";

// Tokenless light basemap
const BASEMAP_STYLE = "/styles/darkblue.json";



export default function SkySouthFlightsDemo() {
  const [monthIndex, setMonthIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [allFlights, setAllFlights] = useState([]);
  const [speed, setSpeed] = useState(2);
  const [mode, setMode] = useState("incremental");
  const [time, setTime] = useState(0);
  const [flightsData, setFlightsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(0);

  // fetch flights file for the current monthIndex (m01..m09)
  const cacheRef = useRef({});
  useEffect(() => {
    const month = String(monthIndex + 1).padStart(2, '0');
    const filename = `flights_m${month}.json`;
    const url = `/data/flights/${filename}`;
    let cancelled = false;

    if (cacheRef.current[filename]) {
      setFlightsData(cacheRef.current[filename]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        cacheRef.current[filename] = data;
        setFlightsData(data);

        setAllFlights((prev) => [...prev, ...data.flights]);
      })
      .catch((err) => console.error('Failed to load flights file', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [monthIndex]);

  useEffect(() => {
    if (!flightsData?.flights?.length) return;

    const startIndex = allFlights.length - flightsData.flights.length; // where this month's flights start
    let i = 0;
    const id = setInterval(() => {
      i++;
      setVisibleCount(startIndex + i);
      if (i >= flightsData.flights.length) clearInterval(id);
    }, 25); // 100ms per arc

    return () => clearInterval(id);
  }, [flightsData]);

  const flights = flightsData?.flights || [];

  // incremental = raw flights; cumulative = aggregated counts by origin/destination
  const incrFlights = allFlights;
  const cumFlights = useMemo(() => {
    const map = Object.create(null);
    for (const f of flights) {
      const key = `${f.olng},${f.olat},${f.dlng},${f.dlat}`;
      if (!map[key]) map[key] = { olng: f.olng, olat: f.olat, dlng: f.dlng, dlat: f.dlat, count: 0, meta: f.meta };
      map[key].count++;
    }
    return Object.values(map);
  }, [allFlights]);

  const rafRef = useRef(null);
  useEffect(() => {
    function loop() {
      setTime((t) => (playing ? t + 0.5 * speed : t));
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed]);

  useEffect(() => {
    if (!playing) return; // only cycle when playing

    const id = setInterval(() => {
      setMonthIndex((idx) => {
        const next = (idx + 1) % 9; // adjust total months here
        if (next === 0) {
          setAllFlights([]);
          cacheRef.current = {};
        }
        setTime(0);
        return next;
      });
    }, 5000); // every 5 seconds

    return () => clearInterval(id);
  }, [playing]);

  const arcData = allFlights.slice(0, visibleCount);

  const arcLayer = new ArcLayer({
    id: 'routes',
    data: arcData,
    greatCircle: true,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT, // FORCE meters for height

    // 2D lon/lat only
    getSourcePosition: d => [d.olng, d.olat],
    getTargetPosition: d => [d.dlng, d.dlat],
    positionFormat: 'XY',                       // explicit: we pass XY, not XYZ
    

    // Subtle 3D lift (meters). Try 2,000–10,000 for gentle arcs.
    getHeight: 0.2,
    getTilt: 0,                                 // keep tilt tiny to avoid “leaning up”
    parameters: { depthTest: false },

    getWidth: d => Math.max(1, (d.count || 1) * 0.8),
    // getSourceColor: [20, 120, 200],
    // getTargetColor: [200, 80, 40],
    getSourceColor: [194, 232, 255],  // white
    getTargetColor: [194, 232, 255],  // white
    pickable: true
  });

  const layers = arcLayer

  const initialViewState = useMemo(
    () => ({ longitude: -91, latitude: 34.5, zoom: 4.2, pitch: 40, bearing: -10 }),
    []
  );

  const [tooltip, setTooltip] = useState(null);

  return (
    <div className="relative w-full h-[90vh] bg-black">
      {/* Map & DeckGL */}
      <DeckGL
        initialViewState={initialViewState}
        controller={true}
        layers={layers}
        getTooltip={({ object }) =>
          object && object.meta ? `${object.meta.o} → ${object.meta.d}` : null
        }
        onHover={(info) => setTooltip(info?.object?.meta || null)}
      >
        <Map mapLib={maplibregl} mapStyle={BASEMAP_STYLE} />
      </DeckGL>

      {/* Tooltip */}
      {tooltip && (
        <div className="absolute bottom-20 left-4 text-sm bg-white/90 px-3 py-1.5 rounded-xl shadow">
          {tooltip.o} → {tooltip.d}
        </div>
      )}

      {/* Overlay: Play / Pause button */}
      <button
        onClick={() => setPlaying((p) => !p)}
        className="absolute top-4 left-4 z-10 px-4 py-2 rounded-full bg-white/90 text-gray-800 font-medium shadow hover:bg-white"
      >
        {playing ? "Pause" : "Play"}
      </button>

      {/* Bottom Progress Bar */}
      <div className="absolute bottom-0 left-0 w-full h-12 bg-black/60 backdrop-blur-sm flex items-center px-6">
        <input
          type="range"
          min={0}
          max={8}
          value={monthIndex}
          onChange={(e) => {
            setMonthIndex(Number(e.target.value));
            setTime(0);
          }}
          className="w-full accent-sky-400"
        />
        <span className="ml-4 text-sm text-white font-mono">
          {flightsData?.month || `m${String(monthIndex + 1).padStart(2, '0')}`}
        </span>
      </div>
    </div>
  );
}
