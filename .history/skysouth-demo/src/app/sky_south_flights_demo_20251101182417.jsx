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
const BASEMAP_STYLE = "/styles/satellite.json";

export default function SkySouthFlightsDemo() {
  const [allFlights, setAllFlights] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [direction, setDirection] = useState(1); // 1 for forward, -1 for backward
  const [dots, setDots] = useState([]);
  const [dotPositions, setDotPositions] = useState(new Set()); // Track unique dot positions
  const [mapActivated, setMapActivated] = useState(false);
  const [hasEverActivated, setHasEverActivated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showArcs, setShowArcs] = useState(true);
  const [animationPhase, setAnimationPhase] = useState('showing'); // 'showing', 'removing', 'dots-only'
  const [uniqueAirports, setUniqueAirports] = useState(0);
  const [currentTitleIndex, setCurrentTitleIndex] = useState(0);
  const [titleVisible, setTitleVisible] = useState(true);
  const [hoveredAirport, setHoveredAirport] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  const titles = [
    "22,000+ Flights",
    "300+ Airports",
    "22 Years",
    "1000+ Organs Transported"
  ];

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load all flights at startup
  useEffect(() => {
    const loadAllFlights = async () => {
      setLoading(true);
      const allFlightData = [];

      try {
        // Try to load year-month format files first (new format)
        const years = [2020, 2021, 2022, 2023, 2024, 2025]; // Add more years as needed
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

        // Deduplicate flights based on route (origin and destination only)
        const uniqueFlights = [];
        const seen = new Set();

        for (const flight of allFlightData) {
          // Create unique key from coordinates only (route-based deduplication)
          const key = `${flight.olat},${flight.olng}-${flight.dlat},${flight.dlng}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueFlights.push(flight);
          }
        }

        console.log(`Unique routes after deduplication: ${uniqueFlights.length} (removed ${allFlightData.length - uniqueFlights.length} duplicate routes)`);
        setAllFlights(uniqueFlights);
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

  // Auto-play when flights finish loading and buttons are visible
  const hasAutoStarted = useRef(false);
  const buttonContainerRef = useRef(null);

  useEffect(() => {
    if (!loading && allFlights.length > 0 && !hasAutoStarted.current) {
      // Check if the play/reset buttons are in viewport
      const checkVisibility = () => {
        if (buttonContainerRef.current) {
          const rect = buttonContainerRef.current.getBoundingClientRect();
          const isVisible = rect.top >= 0 && rect.top < window.innerHeight;
          if (isVisible && !hasAutoStarted.current) {
            hasAutoStarted.current = true;
            setPlaying(true);
          }
        }
      };

      // Check immediately
      checkVisibility();

      // Also check on scroll
      const handleScroll = () => {
        checkVisibility();
      };

      window.addEventListener('scroll', handleScroll);
      return () => window.removeEventListener('scroll', handleScroll);
    }
  }, [loading, allFlights.length]);

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

          // Add dots when arcs appear (going forward)
          if (direction > 0 && newIndex >= 0 && newIndex < allFlights.length) {
            const appearingArc = allFlights[newIndex];

            const originKey = `${appearingArc.olng},${appearingArc.olat}`;
            const destKey = `${appearingArc.dlng},${appearingArc.dlat}`;

            setDotPositions((prevPositions) => {
              const newPositions = new Set(prevPositions);
              newPositions.add(originKey);
              newPositions.add(destKey);
              return newPositions;
            });

            setDots((prevDots) => {
              const newDots = [...prevDots];
              if (!prevDots.some(dot => dot.position[0] === appearingArc.olng && dot.position[1] === appearingArc.olat)) {
                newDots.push({
                  position: [appearingArc.olng, appearingArc.olat],
                  id: originKey,
                  code: appearingArc.meta?.o || ''
                });
              }
              if (!prevDots.some(dot => dot.position[0] === appearingArc.dlng && dot.position[1] === appearingArc.dlat)) {
                newDots.push({
                  position: [appearingArc.dlng, appearingArc.dlat],
                  id: destKey,
                  code: appearingArc.meta?.d || ''
                });
              }
              return newDots;
            });
          }

          // Remove dots when going backward
          if (direction < 0 && newIndex >= 0) {
            // Remove dots that are no longer needed based on visible arcs
            setDots((prevDots) => {
              const visibleAirports = new Set();
              // Get all airports from currently visible arcs
              for (let i = Math.max(0, newIndex - 149); i <= newIndex && i < allFlights.length; i++) {
                const arc = allFlights[i];
                visibleAirports.add(`${arc.olng},${arc.olat}`);
                visibleAirports.add(`${arc.dlng},${arc.dlat}`);
              }
              // Keep only dots that are in visible airports
              return prevDots.filter(dot => visibleAirports.has(dot.id));
            });

            setDotPositions((prevPositions) => {
              const newPositions = new Set();
              for (let i = Math.max(0, newIndex - 149); i <= newIndex && i < allFlights.length; i++) {
                const arc = allFlights[i];
                newPositions.add(`${arc.olng},${arc.olat}`);
                newPositions.add(`${arc.dlng},${arc.dlat}`);
              }
              return newPositions;
            });
          }

          return newIndex;
        }

        // PHASE 2: REMOVING - Remove the oldest arc from the sliding window (150 arcs remain at end of phase 1)
        if (animationPhase === 'removing') {
          // Dots are already present from when arcs appeared, no need to add them
          // Move the index forward to shrink the window from the left
          const newIndex = prevIndex + 1;

          // When we've removed all 150 arcs (index reaches allFlights.length + 150)
          if (newIndex >= allFlights.length + 150) {
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

  // Get the current window of 150 arcs (phase-aware)
  const visibleArcs = useMemo(() => {
    if (allFlights.length === 0) return [];

    // PHASE 1: SHOWING - sliding window of 150 arcs
    if (animationPhase === 'showing') {
      const start = Math.max(0, currentIndex - 149);
      const end = Math.min(allFlights.length, currentIndex + 1);
      return allFlights.slice(start, end);
    }

    // PHASE 2: REMOVING - shrink window from the left (oldest arcs disappear first)
    // currentIndex keeps moving forward, but we slice from (currentIndex - 149) onwards
    if (animationPhase === 'removing') {
      const start = Math.max(0, currentIndex - 149);
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
    getSourceColor: [220, 235, 230],
    getTargetColor: [220, 235, 230],
    getWidth: 2,
  });

  const dotsLayer = new ScatterplotLayer({
    id: 'dots-layer',
    data: dots,
    getPosition: d => d.position,
    getRadius: 10000,
    getFillColor: [255, 255, 255, 180],
    radiusUnits: 'meters',
    pickable: true,
    onHover: info => {
      if (info.object) {
        setHoveredAirport({
          code: info.object.code,
          x: info.x,
          y: info.y
        });
      } else {
        setHoveredAirport(null);
      }
    }
  });

  const layers = [dotsLayer, ...(showArcs ? [arcLayer] : [])];

  const initialViewState = useMemo(
    () => ({
      longitude: isMobile ? -83.5 : -96,
      latitude: isMobile ? 34.5 : 36.4,
      zoom: 4.05,
      pitch: 40,
      bearing: 0
    }),
    [isMobile]
  );

  // Format date as "Month Year"
  const formatDate = (flight) => {
    if (!flight) return 'Loading...';
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const monthIndex = (flight.month || 1) - 1;
    return `${monthNames[monthIndex]} ${flight.year}`;
  };

  return (
    <div className="relative w-full bg-black" style={{ height: '100vh', width: '100vw' }}>
      {/* Map & DeckGL */}
      <div
        style={{
          pointerEvents: (isMobile && !mapActivated) ? 'none' : 'auto',
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0
        }}
      >
        <DeckGL
          initialViewState={initialViewState}
          controller={
            isMobile
              ? (mapActivated ? true : false)
              : (mapActivated ? true : (hasEverActivated ? false : { scrollZoom: false }))
          }
          layers={layers}
          onClick={() => {
            // On desktop, clicking anywhere activates map
            // On mobile, only the explore button activates it
            if (!isMobile) {
              if (!hasEverActivated) {
                setHasEverActivated(true);
              }
              setMapActivated(true);
            }
          }}
          onViewStateChange={({ interactionState }) => {
            // If user tries to interact with map and hasn't activated yet, enable exploring
            // Only on desktop - mobile requires clicking explore button
            if (!isMobile && interactionState?.isDragging && !hasEverActivated) {
              setHasEverActivated(true);
              setMapActivated(true);
            }
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <Map
            mapLib={maplibregl}
            mapStyle={BASEMAP_STYLE}
            style={{ width: '100%', height: '100%' }}
            attributionControl={false}
          />
        </DeckGL>
      </div>

      {/* Click to zoom overlay - hidden but functionality remains */}

      {/* Cycling Title Overlay */}
      <div className="absolute top-12 md:top-24 left-12 md:left-24 pointer-events-none z-20">
        <h1
          className="text-3xl sm:text-4xl md:text-4xl lg:text-5xl font-bold text-white drop-shadow-2xl transition-opacity duration-500"
          style={{
            opacity: titleVisible ? 1 : 0,
          }}
        >
          {titles[currentTitleIndex]}
        </h1>
      </div>

      {/* Exit Explore Mode Button */}
      {mapActivated && (
        <button
          onClick={() => setMapActivated(false)}
          className="absolute top-12 md:top-24 right-12 md:right-24 z-20 text-white hover:text-white/70 transition-all duration-300 pointer-events-auto"
          aria-label="Exit explore mode"
        >
          <svg className="w-8 h-8 md:w-10 md:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Airport Code Tooltip */}
      {hoveredAirport && hoveredAirport.code && (
        <div
          className="absolute pointer-events-none z-30 text-white px-3 py-2 text-xl font-medium"
          style={{
            left: hoveredAirport.x,
            top: hoveredAirport.y - 45,
            transform: 'translateX(-50%)'
          }}
        >
          {hoveredAirport.code}
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/50">
          <div className="text-white text-xl">Loading flights...</div>
        </div>
      )}

      {/* Month and Year - Bottom Left on desktop, centered at bottom on mobile */}
      <div className="absolute bottom-4 md:bottom-10 left-1/2 md:left-24 -translate-x-1/2 md:translate-x-0 text-white text-lg md:text-2xl font-medium pointer-events-none">
        {formatDate(allFlights[Math.min(currentIndex, allFlights.length - 1)])}
      </div>

      {/* Animation Controls and Explore - Bottom Center */}
      <div ref={buttonContainerRef} className="absolute bottom-16 md:bottom-10 left-1/2 -translate-x-1/2 flex items-center space-x-4 md:space-x-6 z-10"
        style={{
          pointerEvents: 'auto'
        }}
      >
        {/* Play/Pause Button */}
        <button
          onClick={() => setPlaying((p) => !p)}
          className="text-white hover:text-white/70 transition-colors"
          disabled={loading || animationPhase === 'dots-only'}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg className="w-8 h-8 md:w-10 md:h-10" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 md:w-10 md:h-10" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Reset Button */}
        <button
          onClick={() => {
            setCurrentIndex(0);
            setDots([]);
            setDotPositions(new Set());
            setAnimationPhase('showing');
            setPlaying(true);
          }}
          className="text-white hover:text-white/70 transition-colors"
          disabled={loading}
          aria-label="Reset"
        >
          <svg className="w-8 h-8 md:w-10 md:h-10" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
          </svg>
        </button>

        {/* Explore Button */}
        <div
          className="text-white text-sm md:text-base font-light flex items-center space-x-2 cursor-pointer hover:text-white/70 transition-colors whitespace-nowrap"
          onClick={() => {
            if (!hasEverActivated) {
              setHasEverActivated(true);
              setMapActivated(true);
            } else {
              setMapActivated(!mapActivated);
            }
          }}
        >
          {!hasEverActivated ? (
            <>
              <svg className="w-8 h-8 md:w-10 md:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Explore</span>
            </>
          ) : mapActivated ? (
            <>
              <svg className="w-8 h-8 md:w-10 md:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Disable exploring</span>
            </>
          ) : (
            <>
              <svg className="w-8 h-8 md:w-10 md:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Explore</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
