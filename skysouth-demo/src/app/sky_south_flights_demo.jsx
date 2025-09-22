// SkySouthFlightsDemo.jsx (pure JSX)
// Dependencies: deck.gl, @deck.gl/layers, @deck.gl/geo-layers, react-map-gl, maplibre-gl

'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "deck.gl";
import { Map } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import { ArcLayer } from "@deck.gl/layers";
import { COORDINATE_SYSTEM } from "@deck.gl/core";

// Tokenless light basemap
const BASEMAP_STYLE = "/styles/darkblue.json";

export default function SkySouthFlightsDemo() {
  const [monthIndex, setMonthIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [allFlights, setAllFlights] = useState([]);
  const [flightsData, setFlightsData] = useState(null);
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
      return;
    }




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
      });

    return () => {
      cancelled = true;
    };
  }, [monthIndex]);




  useEffect(() => {
    if (!flightsData?.flights?.length) return;

    const startIndex = allFlights.length - flightsData.flights.length; 
    let i = 0;
    const step = 500 / flightsData.flights.length; // evenly spread across 1 second
    const id = setInterval(() => {
      i++;
      setVisibleCount(startIndex + i);
      if (i >= flightsData.flights.length) clearInterval(id);
    }, step);

    return () => clearInterval(id);
  }, [flightsData]);



  useEffect(() => {
    if (!playing) return; // only cycle when playing

    const id = setInterval(() => {
      setMonthIndex((idx) => {
        const next = (idx + 1) % 9; // adjust total months here
        if (next === 0) {
          setAllFlights([]);
          cacheRef.current = {};
        }
        return next;
      });
    }, 500); // every 5 seconds

    return () => clearInterval(id);
  }, [playing]);

  const arcLayer = new ArcLayer({
    data: allFlights.slice(0, visibleCount),
    getSourcePosition: d => [d.olng, d.olat],
    getTargetPosition: d => [d.dlng, d.dlat],
    getHeight: 0.2, // Angle of arc
    greatCircle: true, 
    getSourceColor: [194, 232, 255],  // white
    getTargetColor: [194, 232, 255],  // white
  });

  const initialViewState = useMemo(
    () => ({ longitude: -91, latitude: 34.5, zoom: 4.5, pitch: 40, bearing: -10 }),
    []
  );

  return (
    <div className="relative w-full h-[90vh] bg-black">
      {/* Map & DeckGL */}
      <DeckGL
        initialViewState={initialViewState}
        controller={true}
        layers={arcLayer}
      >
        <Map mapLib={maplibregl} mapStyle={BASEMAP_STYLE} />
      </DeckGL>

      {/* Big Title Overlay */}
      <div className="absolute top-24 left-18 z-20">
        <h1 className="text-6xl md:text-7xl font-bold font-sans text-white drop-shadow-lg">
          22,000+ Flights
        </h1>
        <h1 className="text-6xl md:text-7xl font-bold font-sans text-white drop-shadow-lg mt-12">
          23 Years
        </h1>
      </div>

      {/* Bottom Progress Bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[70%] h-18 flex items-center px-6 bg-white/8 backdrop-blur-sm rounded-full space-x-2">
      <button
        onClick={() => setPlaying((p) => !p)}
        className="w-28 h-10 flex items-center justify-center rounded-full bg-white/90 text-gray-800 font-medium shadow hover:bg-white left-0"
        style={{ background: "#d9d9d9ff" }}
      >
        {playing ? "Pause" : "Play"}
      </button>
      <input
        type="range"
        min={0}
        max={8}
        value={monthIndex}
        onChange={(e) => {
          setMonthIndex(Number(e.target.value));
        }}
        className="
          w-full cursor-pointer appearance-none h-5 rounded-full overflow-hidden ml-4 mr-1
          [&::-webkit-slider-thumb]:appearance-none
          [&::-moz-range-thumb]:appearance-none
          [&::-ms-thumb]:appearance-none
        "
        style={{
          background: `linear-gradient(to right, #d9d9d9ff ${(monthIndex / 8) * 100}%, #374151 ${(monthIndex / 8) * 100}%)`,
        }}
      />
      </div>
    </div>
  );
}
