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
  const [dotPositions, setDotPositions] = useState(new Set()); // Track unique dot positions
  const [mapActivated, setMapActivated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showArcs, setShowArcs] = useState(true);
  const [animationPhase, setAnimationPhase] = useState('showing'); // 'showing', 'removing', 'dots-only'
  const [uniqueAirports, setUniqueAirports] = useState(0);
  const [currentTitleIndex, setCurrentTitleIndex] = useState(0);
  const [titleVisible, setTitleVisible] = useState(true);

  const titles = [
    "22,000 Flights",
    "310 Airports",
    "22 Years",
    "500 organs transported"
  ];

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

  // Calculate unique airports when flights are loaded
  useEffect(() => {
    if (allFlights.length > 0) {
      const airportSet = new Set();
      allFlights.forEach(flight => {
        airportSet.add(`${flight.olng},${flight.olat}`);
        airportSet.add(`${flight.dlng},${flight.dlat}`);
      });
      setUniqueAirports(airportSet.size);
    }
  }, [allFlights]);

  // Cycling title animation
  useEffect(() => {
    const cycleDuration = 6000; // 3 seconds per title
    const fadeOutDuration = 1000; // 0.5 seconds fade out

    const interval = setInterval(() => {
      // Fade out current title
      setTitleVisible(false);

      // After fade out, change to next title and fade in
      setTimeout(() => {
        setCurrentTitleIndex((prev) => (prev + 1) % titles.length);
        setTitleVisible(true);
      }, fadeOutDuration);
    }, cycleDuration);

    return () => clearInterval(interval);
  }, [titles.length]);

  // Animation logic - three phases: showing, removing arcs, dots-only
  useEffect(() => {
    if (!playing || allFlights.length === 0) return;

    const id = setInterval(() => {
      setCurrentIndex((prevIndex) => {
        const newIndex = prevIndex + direction;

        // PHASE 1: SHOWING - Forward progression showing all flights
        if (animationPhase === 'showing') {
          // Handle boundary conditions
          if (newIndex < 0) {
            return 0;
          }

          // When we reach the end, transition to removing phase
          if (newIndex >= allFlights.length) {
            setAnimationPhase('removing');
            return allFlights.length - 1;
          }

          // Add dots when arcs disappear (going forward)
          if (direction > 0 && newIndex > 199) {
            const disappearingArcIndex = newIndex - 200;
            const disappearingArc = allFlights[disappearingArcIndex];

            const originKey = `${disappearingArc.olng},${disappearingArc.olat}`;
            const destKey = `${disappearingArc.dlng},${disappearingArc.dlat}`;

            setDotPositions((prevPositions) => {
              const newPositions = new Set(prevPositions);
              newPositions.add(originKey);
              newPositions.add(destKey);
              return newPositions;
            });

            setDots((prevDots) => {
              const newDots = [...prevDots];
              if (!prevDots.some(dot => dot.position[0] === disappearingArc.olng && dot.position[1] === disappearingArc.olat)) {
                newDots.push({ position: [disappearingArc.olng, disappearingArc.olat], id: originKey });
              }
              if (!prevDots.some(dot => dot.position[0] === disappearingArc.dlng && dot.position[1] === disappearingArc.dlat)) {
                newDots.push({ position: [disappearingArc.dlng, disappearingArc.dlat], id: destKey });
              }
              return newDots;
            });
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
        }

        // PHASE 2: REMOVING - Remove the oldest arc from the sliding window (200 arcs remain at end of phase 1)
        if (animationPhase === 'removing') {
          // Start from the oldest arc in the window (currentIndex - 199)
          // and work forward, removing one at a time
          const oldestArcIndex = prevIndex - 199;

          // Add dots for the oldest arc being removed
          if (oldestArcIndex >= 0 && oldestArcIndex < allFlights.length) {
            const removingArc = allFlights[oldestArcIndex];

            const originKey = `${removingArc.olng},${removingArc.olat}`;
            const destKey = `${removingArc.dlng},${removingArc.dlat}`;

            setDotPositions((prevPositions) => {
              const newPositions = new Set(prevPositions);
              newPositions.add(originKey);
              newPositions.add(destKey);
              return newPositions;
            });

            setDots((prevDots) => {
              const newDots = [...prevDots];
              if (!prevDots.some(dot => dot.position[0] === removingArc.olng && dot.position[1] === removingArc.olat)) {
                newDots.push({ position: [removingArc.olng, removingArc.olat], id: originKey });
              }
              if (!prevDots.some(dot => dot.position[0] === removingArc.dlng && dot.position[1] === removingArc.dlat)) {
                newDots.push({ position: [removingArc.dlng, removingArc.dlat], id: destKey });
              }
              return newDots;
            });
          }

          // Move the index forward to shrink the window from the left
          const newIndex = prevIndex + 1;

          // When we've removed all 200 arcs (index reaches allFlights.length + 200)
          if (newIndex >= allFlights.length + 200) {
            setAnimationPhase('dots-only');
            setPlaying(false); // Stop animation
            return allFlights.length - 1;
          }

          return newIndex;
        }

        // PHASE 3: DOTS-ONLY - Animation complete, only dots visible
        if (animationPhase === 'dots-only') {
          setPlaying(false);
          return 0;
        }

        return prevIndex;
      });
    }, 15); // Even faster animation speed

    return () => clearInterval(id);
  }, [playing, direction, allFlights, animationPhase]);

  // Get the current window of 200 arcs (phase-aware)
  const visibleArcs = useMemo(() => {
    if (allFlights.length === 0) return [];

    // PHASE 1: SHOWING - sliding window of 200 arcs
    if (animationPhase === 'showing') {
      const start = Math.max(0, currentIndex - 199);
      const end = Math.min(allFlights.length, currentIndex + 1);
      return allFlights.slice(start, end);
    }

    // PHASE 2: REMOVING - shrink window from the left (oldest arcs disappear first)
    // currentIndex keeps moving forward, but we slice from (currentIndex - 199) onwards
    if (animationPhase === 'removing') {
      const start = Math.max(0, currentIndex - 199);
      const end = Math.min(allFlights.length, currentIndex + 1);
      return allFlights.slice(start, end);
    }

    // PHASE 3: DOTS-ONLY - no arcs visible
    return [];
  }, [allFlights, currentIndex, animationPhase]);

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
    () => ({ longitude: -93, latitude: 35, zoom: 4.1, pitch: 40, bearing: -10 }),
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

      {/* Cycling Title Overlay */}
      <div className="absolute top-24 left-24 pointer-events-none z-20">
        <h1
          className="text-5xl md:text-6xl font-bold text-white drop-shadow-2xl transition-opacity duration-500"
          style={{
            opacity: titleVisible ? 1 : 0,
          }}
        >
          {titles[currentTitleIndex]}
        </h1>
      </div>

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
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[75%] h-18 flex items-center px-6 bg-white/8 backdrop-blur-sm rounded-full space-x-2">
        <button
          onClick={() => {
            setDirection(-1);
            if (animationPhase === 'dots-only') {
              setAnimationPhase('removing');
              setCurrentIndex(allFlights.length - 1);
            }
          }}
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
          disabled={loading || animationPhase === 'dots-only'}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => {
            setDirection(1);
            if (animationPhase === 'dots-only') {
              setAnimationPhase('removing');
              setCurrentIndex(allFlights.length - 1);
            }
          }}
          className="w-12 h-10 flex items-center justify-center rounded-full bg-white/90 text-gray-800 font-medium shadow hover:bg-white"
          style={{ background: "#d9d9d9ff" }}
          disabled={loading}
        >
          →
        </button>
        <button
          onClick={() => {
            setCurrentIndex(0);
            setDots([]);
            setDotPositions(new Set());
            setAnimationPhase('showing');
            setPlaying(false);
          }}
          className="w-20 h-10 flex items-center justify-center rounded-full bg-white/90 text-gray-800 font-medium shadow hover:bg-white text-xs"
          style={{ background: "#d9d9d9ff" }}
          disabled={loading}
        >
          Reset
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
          {animationPhase === 'showing' && `Arc ${Math.max(1, currentIndex + 1)} of ${allFlights.length}`}
          {animationPhase === 'removing' && `Removing arcs: ${Math.max(0, allFlights.length + 200 - currentIndex - 1)} remaining`}
          {animationPhase === 'dots-only' && `Animation complete`}
          {' | '}
          {allFlights[Math.min(currentIndex, allFlights.length - 1)]?.timeKey || (allFlights[Math.min(currentIndex, allFlights.length - 1)] ? allFlights[Math.min(currentIndex, allFlights.length - 1)].year + '-' + String(allFlights[Math.min(currentIndex, allFlights.length - 1)].month || 1).padStart(2, '0') : 'Loading...')}
          {' | '}
          {uniqueAirports} unique airports
        </div>
      </div>
    </div>
  );
}
