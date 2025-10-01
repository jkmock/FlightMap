// SkySouthFlightsDemo.jsx (pure JSX)
// Dependencies: deck.gl, @deck.gl/layers, @deck.gl/geo-layers, react-map-gl, maplibre-gl

'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "deck.gl";
import { Map } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import { ArcLayer, ScatterplotLayer } from "@deck.gl/layers";
import { COORDINATE_SYSTEM } from "@deck.gl/core";

// Tokenless light basemap
const BASEMAP_STYLE = "/styles/darkblue.json";

export default function SkySouthFlightsDemo() {
  const [allFlights, setAllFlights] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [direction, setDirection] = useState(1); // 1 for forward, -1 for backward
  const [dots, setDots] = useState([]);
  const [mapActivated, setMapActivated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showArcs, setShowArcs] = useState(true);

  // Load all flights at startup
  useEffect(() => {
    const loadAllFlights = async () => {
      setLoading(true);
      const allFlightData = [];

      try {
        // Try to load year-month format files first (new format)
        const years = [2023, 2024, 2025]; // Add more years as needed
        const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

        let filesFound = 0;

        for (const year of years) {
          for (const month of months) {
            const monthStr = String(month).padStart(2, '0');
            const filename = `flights_${year}-${monthStr}.json`;
            const url = `/data/flights/${filename}`;

            try {
              const response = await fetch(url);
              if (response.ok) {
                const data = await response.json();
                // Add month and year information to each flight
                const flightsWithMetadata = data.flights.map(flight => ({
                  ...flight,
                  month: month,
                  year: year,
                  timeKey: `${year}-${monthStr}`
                }));
                allFlightData.push(...flightsWithMetadata);
                filesFound++;
                console.log(`Loaded ${data.flights.length} flights from ${filename}`);
              }
            } catch (fileErr) {
              // File doesn't exist, continue
            }
          }
        }

        // Fallback: if no year-month files found, try old format
        if (filesFound === 0) {
          console.log('No year-month files found, trying old format...');
          for (let i = 1; i <= 12; i++) {
            const month = String(i).padStart(2, '0');
            const filename = `flights_m${month}.json`;
            const url = `/data/flights/${filename}`;

            try {
              const response = await fetch(url);
              if (response.ok) {
                const data = await response.json();
                const flightsWithMetadata = data.flights.map(flight => ({
                  ...flight,
                  month: i,
                  year: 2025, // Default year for old format
                  timeKey: `m${month}`
                }));
                allFlightData.push(...flightsWithMetadata);
                filesFound++;
                console.log(`Loaded ${data.flights.length} flights from ${filename}`);
              }
            } catch (fileErr) {
              // File doesn't exist, continue
            }
          }
        }

        console.log(`Total flights loaded: ${allFlightData.length} from ${filesFound} files`);
        setAllFlights(allFlightData);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load flights data', err);
        setLoading(false);
      }
    };

    loadAllFlights();
  }, []);


  // Animation logic - sliding window of 10 arcs
  useEffect(() => {
    if (!playing || allFlights.length === 0) return;

    const id = setInterval(() => {
      setCurrentIndex((prevIndex) => {
        const newIndex = prevIndex + direction;

        // Handle boundary conditions
        if (newIndex < 0) {
          return 0;
        }
        if (newIndex >= allFlights.length) {
          return allFlights.length - 1;
        }

        // Add dots when arcs disappear (going forward)
        if (direction > 0 && newIndex > 199) {
          const disappearingArcIndex = newIndex - 200;
          const disappearingArc = allFlights[disappearingArcIndex];
          setDots((prevDots) => [
            ...prevDots,
            { position: [disappearingArc.olng, disappearingArc.olat], id: `${disappearingArcIndex}-origin` },
            { position: [disappearingArc.dlng, disappearingArc.dlat], id: `${disappearingArcIndex}-dest` },
          ]);
        }

        // Remove dots when going backward and arc reappears
        if (direction < 0) {
          const reappearingArcIndex = newIndex + 200;
          if (reappearingArcIndex < allFlights.length) {
            setDots((prevDots) =>
              prevDots.filter(
                (dot) => !dot.id.startsWith(`${reappearingArcIndex}-`)
              )
            );
          }
        }

        return newIndex;
      });
    }, 25); // Even faster animation speed

    return () => clearInterval(id);
  }, [playing, direction, allFlights]);

  // Get the current window of 200 arcs
  const visibleArcs = useMemo(() => {
    if (allFlights.length === 0) return [];
    const start = Math.max(0, currentIndex - 199);
    const end = Math.min(allFlights.length, currentIndex + 1);
    return allFlights.slice(start, end);
  }, [allFlights, currentIndex]);

  const arcLayer = new ArcLayer({
    id: 'arc-layer',
    data: visibleArcs,
    getSourcePosition: d => [d.olng, d.olat],
    getTargetPosition: d => [d.dlng, d.dlat],
    getHeight: 0.2,
    greatCircle: true,
    getSourceColor: [194, 232, 255],
    getTargetColor: [194, 232, 255],
    getWidth: 2,
  });

  const dotsLayer = new ScatterplotLayer({
    id: 'dots-layer',
    data: dots,
    getPosition: d => d.position,
    getRadius: 6000,
    getFillColor: [255, 255, 255, 180],
    radiusUnits: 'meters',
  });

  const layers = [dotsLayer, ...(showArcs ? [arcLayer] : [])];

  const initialViewState = useMemo(
    () => ({ longitude: -91, latitude: 34.5, zoom: 4.5, pitch: 40, bearing: -10 }),
    []
  );

  return (
    <div className="relative w-full h-[90vh] bg-black">
      {/* Map & DeckGL */}
      <DeckGL
        initialViewState={initialViewState}
        controller={mapActivated ? true : { scrollZoom: false }}
        layers={layers}
        onClick={() => setMapActivated(true)}
      >
        <Map mapLib={maplibregl} mapStyle={BASEMAP_STYLE} />
      </DeckGL>

      {/* Click to zoom overlay */}
      {!loading && !mapActivated && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="bg-black/50 text-white px-4 py-2 rounded-lg backdrop-blur-sm">
            Click to enable zoom
          </div>
        </div>
      )}

      {/* Big Title Overlay */}
      {/* <div className="absolute top-24 left-18 z-20">
        <h1 className="text-6xl md:text-7xl font-bold font-sans text-white drop-shadow-lg">
          22,000+ Flights
        </h1>
        <h1 className="text-6xl md:text-7xl font-bold font-sans text-white drop-shadow-lg mt-12">
          23 Years
        </h1>
      </div> */}

      {/* Loading indicator */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/50">
          <div className="text-white text-xl">Loading flights...</div>
        </div>
      )}

      {/* Animation Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[70%] h-18 flex items-center px-6 bg-white/8 backdrop-blur-sm rounded-full space-x-2">
        <button
          onClick={() => setDirection(-1)}
          className="w-12 h-10 flex items-center justify-center rounded-full bg-white/90 text-gray-800 font-medium shadow hover:bg-white"
          style={{ background: "#d9d9d9ff" }}
          disabled={loading}
        >
          ←
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          className="w-28 h-10 flex items-center justify-center rounded-full bg-white/90 text-gray-800 font-medium shadow hover:bg-white"
          style={{ background: "#d9d9d9ff" }}
          disabled={loading}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => setDirection(1)}
          className="w-12 h-10 flex items-center justify-center rounded-full bg-white/90 text-gray-800 font-medium shadow hover:bg-white"
          style={{ background: "#d9d9d9ff" }}
          disabled={loading}
        >
          →
        </button>
        <button
          onClick={() => setShowArcs(!showArcs)}
          className="w-20 h-10 flex items-center justify-center rounded-full bg-white/90 text-gray-800 font-medium shadow hover:bg-white text-xs"
          style={{ background: "#d9d9d9ff" }}
          disabled={loading}
        >
          {showArcs ? "Hide" : "Show"} Arcs
        </button>
        <div className="flex-1 text-center text-white text-sm">
          Arc {Math.max(1, currentIndex + 1)} of {allFlights.length} | {allFlights[currentIndex]?.timeKey || allFlights[currentIndex]?.year + '-' + String(allFlights[currentIndex]?.month || 1).padStart(2, '0') || 'Loading...'} | {dots.length} dots
        </div>
      </div>
    </div>
  );
}
