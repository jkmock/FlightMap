'use client';

import SkySouthFlightsDemo from "./sky_south_flights_demo";

// page.jsx or App.jsx


export default function Home() {
  return (
    <div className="min-h-screen flex flex-col font-sans bg-gray-50 text-gray-900">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-xl font-bold tracking-tight text-sky-600">SkySouth</div>
          <div className="flex gap-6 text-sm font-medium">
            <a href="#about" className="hover:text-sky-600 transition-colors">About</a>
            <a href="#map" className="hover:text-sky-600 transition-colors">Flights</a>
            <a href="#contact" className="hover:text-sky-600 transition-colors">Contact</a>
          </div>
        </div>
      </nav>

      {/* Hero / Intro Section */}
      <section id="about" className="bg-gray-50 py-24">
        <div className="max-w-4xl mx-auto text-center px-6">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900">
            Visualizing <span className="text-sky-600">12,000+</span> Flights
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
            Explore two decades of flight history across the South.  
            This interactive visualization maps every journey, month by month,  
            bringing aviation data to life.
          </p>
          <div className="mt-8">
            <a
              href="#map"
              className="px-6 py-3 rounded-full bg-sky-600 text-white font-semibold shadow hover:bg-sky-700 transition-colors"
            >
              Explore the Map
            </a>
          </div>
        </div>
      </section>

      {/* Map Section */}
      <section id="map" className="relative">
        <SkySouthFlightsDemo />
      </section>

      {/* Footer */}
      <footer id="contact" className="bg-gray-900 text-gray-300 py-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">SkySouth</h3>
            <p className="mt-2 text-sm text-gray-400">
              © {new Date().getFullYear()} SkySouth Visualization.  
              All rights reserved.
            </p>
          </div>
          <div className="flex gap-6 mt-6 md:mt-0 text-sm">
            <a href="#" className="hover:text-white">Twitter</a>
            <a href="#" className="hover:text-white">GitHub</a>
            <a href="#" className="hover:text-white">LinkedIn</a>
          </div>
        </div>
      </footer>
    </div>
  );
}