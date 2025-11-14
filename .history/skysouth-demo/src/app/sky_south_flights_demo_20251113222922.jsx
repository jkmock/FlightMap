// Dependencies: deck.gl, @deck.gl/layers, @deck.gl/geo-layers, react-map-gl, maplibre-gl

'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "deck.gl";
import { Map } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import { ArcLayer, ScatterplotLayer } from "@deck.gl/layers";

// Basemap JSON file
const BASEMAP_STYLE = "/styles/satellite.json";

export default function SkySouthFlightsDemo() {

  // 
  const [allFlights, setAllFlights] = useState([]);
  const [dots, setDots] = useState([]);
  const [hoveredAirport, setHoveredAirport] = useState(null);
  const [displayDate, setDisplayDate] = useState({ month: 1, year: 2020 });

  // Animation phases
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [animationPhase, setAnimationPhase] = useState('showing'); // 'showing', 'removing', 'dots-only'
  const [currentIndex, setCurrentIndex] = useState(0);

  // 
  const [mapActivated, setMapActivated] = useState(false);
  const [hasEverActivated, setHasEverActivated] = useState(false);

  // Cycle title
  const [currentTitleIndex, setCurrentTitleIndex] = useState(0);
  const [titleVisible, setTitleVisible] = useState(true);
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

  // Cleanup airport tooltip timeout
  useEffect(() => {
    return () => {
      if (airportTooltipTimeout.current) {
        clearTimeout(airportTooltipTimeout.current);
      }
    };
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

        // Initialize display date to first flight's date
        if (uniqueFlights.length > 0) {
          setDisplayDate({ month: uniqueFlights[0].month, year: uniqueFlights[0].year });
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to load flights data', err);
        setLoading(false);
      }
    };

    loadAllFlights();
  }, []);

  // Update display date based on current flight (only during showing phase)
  useEffect(() => {
    if (allFlights.length === 0 || animationPhase !== 'showing') return;

    const flightIndex = Math.min(currentIndex, allFlights.length - 1);
    const currentFlight = allFlights[flightIndex];

    if (currentFlight) {
      setDisplayDate({ month: currentFlight.month, year: currentFlight.year });
    }
  }, [currentIndex, allFlights, animationPhase]);

  // Continue incrementing date after flights end until current month/year
  useEffect(() => {
    if (animationPhase !== 'removing' || !playing || allFlights.length === 0) return;

    // Set to last flight's date when entering removing phase
    const lastFlight = allFlights[allFlights.length - 1];
    if (lastFlight) {
      setDisplayDate({ month: lastFlight.month, year: lastFlight.year });
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();

    const interval = setInterval(() => {
      setDisplayDate(prevDate => {
        // Check if we've reached current month/year
        if (prevDate.year > currentYear ||
            (prevDate.year === currentYear && prevDate.month >= currentMonth)) {
          return prevDate; // Stop incrementing
        }

        // Increment month
        let newMonth = prevDate.month + 1;
        let newYear = prevDate.year;

        if (newMonth > 12) {
          newMonth = 1;
          newYear += 1;
        }

        return { month: newMonth, year: newYear };
      });
    }, 15); // Same speed as animation

    return () => clearInterval(interval);
  }, [animationPhase, playing, allFlights]);

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
        const newIndex = prevIndex + 1;

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
          if (newIndex >= 0 && newIndex < allFlights.length) {
            const appearingArc = allFlights[newIndex];

            const originKey = `${appearingArc.olng},${appearingArc.olat}`;
            const destKey = `${appearingArc.dlng},${appearingArc.dlat}`;

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
    }, 15);

    return () => clearInterval(id);
  }, [playing, allFlights, animationPhase]);

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

  const layers = [dotsLayer, arcLayer];

  const initialViewState = useMemo(
    () => ({
      longitude: isMobile ? -83.5 : -96,
      latitude: isMobile ? 34.5 : 36.4,
      zoom: isMobile ? 4 : 4.05,
      pitch: 40,
      bearing: 0
    }),
    [isMobile]
  );

  // Format date as "Month Year"
  const formatDate = (dateObj) => {
    if (!dateObj || !dateObj.month || !dateObj.year) return 'Loading...';
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const monthIndex = (dateObj.month || 1) - 1;
    return `${monthNames[monthIndex]} ${dateObj.year}`;
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
          style={{ width: '100%', height: '100%' }}
          controller={
            mapActivated ? true : { scrollZoom: false }
          }
          layers={layers}
          onClick={() => {
            // On desktop, clicking anywhere activates map
            // On mobile, only the explore button activates it
            if (!isMobile) {
              setMapActivated(true);
            }
          }}
          onViewStateChange={({ interactionState }) => {
            // On mobile, hide airport tooltip when map is moved or zoomed
            if (isMobile) {
              setHoveredAirport(null)
            } else if (!isMobile && interactionState?.isDragging) {
              setMapActivated(true);
            }
          }}
        >
          <Map
            mapLib={maplibregl}
            mapStyle={BASEMAP_STYLE}
            style={{ width: '100%', height: '100%' }}
            attributionControl={false}
          />
        </DeckGL>
      </div>

      {/* Cycling Title Overlay */}
      <div className="absolute top-12 md:top-24 left-12 md:left-24 pointer-events-none z-20 max-w-[60%] md:max-w-none">
        <h1
          className="text-2xl sm:text-4xl md:text-4xl lg:text-5xl font-bold text-white drop-shadow-2xl transition-opacity duration-500 leading-tight"
          style={{
            opacity: titleVisible ? 1 : 0,
          }}
        >
          {titles[currentTitleIndex]}
        </h1>
      </div>

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
        {formatDate(displayDate)}
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
            setAnimationPhase('showing');
            setPlaying(true);
            if (allFlights.length > 0) {
              setDisplayDate({ month: allFlights[0].month, year: allFlights[0].year });
            }
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
          className={`text-white text-sm md:text-base font-light flex items-center cursor-pointer hover:text-white/70 transition-colors whitespace-nowrap ${mapActivated ? 'space-x-1' : 'space-x-2'}`}
          onClick={() => {
            setMapActivated(!mapActivated);
          }}
        >
          {mapActivated ? (
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
