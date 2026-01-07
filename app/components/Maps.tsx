'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Trash2, Plus, Ruler, Loader2, ChevronLeft, ChevronRight, Edit2, Save, X } from 'lucide-react';
import type L from 'leaflet';

interface Titik {
  id: number;
  lat: number;
  lng: number;
  name: string;
  kapasitas: string;
  iconType: 'trafo' | 'dot';
}

interface UserLocation {
  lat: number;
  lng: number;
}

interface EditingTitik {
  id: number;
  name: string;
  lat: string;
  lng: string;
  kapasitas: string;
  iconType: 'trafo' | 'dot';
}

const Maps = () => {
  const [map, setMap] = useState<L.Map | null>(null);
  const [L, setL] = useState<typeof import('leaflet') | null>(null);
  const [titiks, setTitiks] = useState<Titik[]>([]);
  const [selectedTitiks, setSelectedTitiks] = useState<number[]>([]);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [inputLat, setInputLat] = useState('');
  const [inputLng, setInputLng] = useState('');
  const [inputName, setInputName] = useState('');
  const [inputKapasitas, setInputKapasitas] = useState('');
  const [inputIconType, setInputIconType] = useState<'trafo' | 'dot'>('dot');
  const [routeType, setRouteType] = useState<'straight' | 'route'>('straight');
  const [distance, setDistance] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [editingTitik, setEditingTitik] = useState<EditingTitik | null>(null);
  const [locationWatchId, setLocationWatchId] = useState<number | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<{ [key: number]: L.Marker }>({});
  const linesRef = useRef<L.Polyline[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);

  // Load Leaflet
  useEffect(() => {
    const loadLeaflet = async () => {
      if (typeof window !== 'undefined') {
        const leaflet = await import('leaflet');
        setL(leaflet);
        
        // Load CSS
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
    };
    loadLeaflet();
  }, []);

  // Get user location with high accuracy and continuous tracking
  useEffect(() => {
    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported by this browser');
      setUserLocation({ lat: 1.4748, lng: 124.8421 });
      setIsLoadingLocation(false);
      return;
    }

    // First, get initial position quickly
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(loc);
        setIsLoadingLocation(false);
      },
      (error: GeolocationPositionError) => {
        console.error('Initial location error:', error.message);
        setUserLocation({ lat: 1.4748, lng: 124.8421 });
        setIsLoadingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    // Then setup continuous tracking with watchPosition
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const newLoc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(newLoc);
        
        // Update user marker position if it exists
        if (userMarkerRef.current && L) {
          userMarkerRef.current.setLatLng([newLoc.lat, newLoc.lng]);
        }
      },
      (error: GeolocationPositionError) => {
        console.error('Watch position error:', error.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000, // Accept cached positions up to 5 seconds old
        timeout: 10000
      }
    );

    setLocationWatchId(watchId);

    // Cleanup: stop watching when component unmounts
    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [L]);

  // Initialize map
  useEffect(() => {
    if (L && userLocation && !map && mapRef.current) {
      const mapInstance = L.map(mapRef.current, {
        zoomControl: false
      }).setView([userLocation.lat, userLocation.lng], 16);

      // Add zoom control to top left
      L.control.zoom({ position: 'topleft' }).addTo(mapInstance);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(mapInstance);

      // Add user location marker with pulse effect
      const userMarker = L.marker([userLocation.lat, userLocation.lng], {
        icon: L.divIcon({
          className: 'user-location-marker',
          html: `
            <div style="position: relative;">
              <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(59, 130, 246, 0.2); width: 40px; height: 40px; border-radius: 50%; animation: pulse 2s infinite;"></div>
              <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>
            </div>
            <style>
              @keyframes pulse {
                0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
              }
            </style>
          `,
          iconSize: [40, 40]
        })
      }).addTo(mapInstance);
      
      userMarker.bindPopup('<b>Lokasi Anda</b>');
      userMarkerRef.current = userMarker;

      // Click to add titik
      mapInstance.on('click', (e: L.LeafletMouseEvent) => {
        const newTitik: Titik = {
          id: Date.now(),
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          name: `Titik ${titiks.length + 1}`,
          kapasitas: '',
          iconType: 'dot'
        };
        addTitikToMap(newTitik, mapInstance);
      });

      setMap(mapInstance);
    }
  }, [L, userLocation, map, titiks.length]);

  const addTitikToMap = (titik: Titik, mapInstance?: L.Map) => {
    const m = mapInstance || map;
    if (!m || !L) return;
    
    // Choose icon HTML based on iconType
    let iconHTML = '';
    if (titik.iconType === 'trafo') {
      iconHTML = `
        <div class="marker-trafo-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </div>
      `;
    } else {
      iconHTML = `<div class="marker-dot-simple"></div>`;
    }
    
    const marker = L.marker([titik.lat, titik.lng], {
      icon: L.divIcon({
        className: 'custom-marker',
        html: iconHTML,
        iconSize: [24, 24]
      }),
      draggable: true
    }).addTo(m);

    // Tooltip on hover
    const tooltipContent = `
      <div style="font-family: system-ui; padding: 8px;">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #1f2937;">${titik.name}</div>
        ${titik.kapasitas ? `<div style="color: #059669; font-size: 13px; font-weight: 500; margin-bottom: 4px;">⚡ ${titik.kapasitas}</div>` : ''}
        <div style="color: #6b7280; font-size: 11px; border-top: 1px solid #e5e7eb; padding-top: 4px; margin-top: 4px;">
          <div>Lat: ${titik.lat.toFixed(6)}</div>
          <div>Lng: ${titik.lng.toFixed(6)}</div>
        </div>
      </div>
    `;
    
    marker.bindTooltip(tooltipContent, {
      direction: 'top',
      offset: [0, -10],
      opacity: 0.95
    });

    marker.bindPopup(`
      <div style="font-family: system-ui; padding: 4px;">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${titik.name}</div>
        ${titik.kapasitas ? `<div style="color: #059669; font-size: 13px; font-weight: 500; margin-bottom: 4px;">⚡ Kapasitas: ${titik.kapasitas}</div>` : ''}
        <div style="color: #6b7280; font-size: 12px;">
          <div>Lat: ${titik.lat.toFixed(6)}</div>
          <div>Lng: ${titik.lng.toFixed(6)}</div>
        </div>
      </div>
    `);
    
    marker.on('click', () => {
      toggleSelectTitik(titik.id);
    });

    // Handle drag events
    marker.on('dragend', (e: L.DragEndEvent) => {
      const newLatLng = e.target.getLatLng();
      updateTitikLocation(titik.id, newLatLng.lat, newLatLng.lng);
    });

    markersRef.current[titik.id] = marker;
    setTitiks(prev => [...prev, titik]);
  };

  const updateTitikLocation = (id: number, lat: number, lng: number) => {
    setTitiks(prev => prev.map(t => 
      t.id === id ? { ...t, lat, lng } : t
    ));
    
    // Update marker popup and tooltip
    const marker = markersRef.current[id];
    if (marker) {
      const titik = titiks.find(t => t.id === id);
      if (titik) {
        const tooltipContent = `
          <div style="font-family: system-ui; padding: 8px;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #1f2937;">${titik.name}</div>
            ${titik.kapasitas ? `<div style="color: #059669; font-size: 13px; font-weight: 500; margin-bottom: 4px;">⚡ ${titik.kapasitas}</div>` : ''}
            <div style="color: #6b7280; font-size: 11px; border-top: 1px solid #e5e7eb; padding-top: 4px; margin-top: 4px;">
              <div>Lat: ${lat.toFixed(6)}</div>
              <div>Lng: ${lng.toFixed(6)}</div>
            </div>
          </div>
        `;
        
        marker.setTooltipContent(tooltipContent);
        
        marker.setPopupContent(`
          <div style="font-family: system-ui; padding: 4px;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${titik.name}</div>
            ${titik.kapasitas ? `<div style="color: #059669; font-size: 13px; font-weight: 500; margin-bottom: 4px;">⚡ Kapasitas: ${titik.kapasitas}</div>` : ''}
            <div style="color: #6b7280; font-size: 12px;">
              <div>Lat: ${lat.toFixed(6)}</div>
              <div>Lng: ${lng.toFixed(6)}</div>
            </div>
          </div>
        `);
      }
    }
  };

  const toggleSelectTitik = (id: number) => {
    setSelectedTitiks(prev => {
      if (prev.includes(id)) {
        return prev.filter(tid => tid !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Radius bumi dalam km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Fetch route from OSRM (OpenStreetMap routing)
  const fetchRoute = async (points: Titik[]) => {
    if (points.length < 2) return null;
    
    const coordinates = points.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.code === 'Ok' && data.routes && data.routes[0]) {
        return {
          coordinates: data.routes[0].geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]] as [number, number]),
          distance: data.routes[0].distance / 1000 // Convert to km
        };
      }
    } catch (error) {
      console.error('Error fetching route:', error);
    }
    return null;
  };

  useEffect(() => {
    const updateRoutes = async () => {
      if (!map || !L || selectedTitiks.length < 2) {
        linesRef.current.forEach(line => {
          if (map) {
            map.removeLayer(line);
          }
        });
        linesRef.current = [];
        setDistance(null);
        return;
      }

      // Clear previous lines
      linesRef.current.forEach(line => map.removeLayer(line));
      linesRef.current = [];

      const selectedPoints = titiks.filter(t => selectedTitiks.includes(t.id));
      
      if (routeType === 'straight') {
        // Draw straight lines between consecutive points
        let totalDist = 0;
        for (let i = 0; i < selectedPoints.length - 1; i++) {
          const p1 = selectedPoints[i];
          const p2 = selectedPoints[i + 1];
          
          const segmentDist = calculateDistance(p1.lat, p1.lng, p2.lat, p2.lng);
          
          const line = L.polyline(
            [[p1.lat, p1.lng], [p2.lat, p2.lng]],
            { 
              color: '#3b82f6', 
              weight: 4, 
              opacity: 0.8,
              lineJoin: 'round',
              lineCap: 'round'
            }
          ).addTo(map);
          
          line.on('mouseover', () => {
            line.bindTooltip(`${segmentDist.toFixed(2)} km`, {
              permanent: false,
              direction: 'center',
              className: 'distance-tooltip'
            }).openTooltip();
          });
          
          linesRef.current.push(line);
          totalDist += segmentDist;
        }
        setDistance(totalDist.toFixed(2));
      } else {
        // Route type - fetch real routing data
        setIsLoadingRoute(true);
        const routeData = await fetchRoute(selectedPoints);
        setIsLoadingRoute(false);
        
        if (routeData) {
          const line = L.polyline(routeData.coordinates, {
            color: '#10b981',
            weight: 5,
            opacity: 0.8,
            lineJoin: 'round',
            lineCap: 'round'
          }).addTo(map);
          
          // Add distance tooltips for each segment
          for (let i = 0; i < selectedPoints.length - 1; i++) {
            const p1 = selectedPoints[i];
            const p2 = selectedPoints[i + 1];
            const segmentDist = calculateDistance(p1.lat, p1.lng, p2.lat, p2.lng);
            
            const midLat = (p1.lat + p2.lat) / 2;
            const midLng = (p1.lng + p2.lng) / 2;
            
            const tooltipMarker = L.circleMarker([midLat, midLng], {
              radius: 0,
              opacity: 0
            }).addTo(map);
            
            tooltipMarker.bindTooltip(`${segmentDist.toFixed(2)} km`, {
              permanent: false,
              direction: 'center',
              className: 'distance-tooltip'
            });
            
            linesRef.current.push(tooltipMarker as unknown as L.Polyline);
          }
          
          linesRef.current.push(line);
          setDistance(routeData.distance.toFixed(2));
        } else {
          // Fallback to straight line if routing fails
          const coords: [number, number][] = selectedPoints.map(p => [p.lat, p.lng]);
          const line = L.polyline(coords, {
            color: '#10b981',
            weight: 5,
            opacity: 0.8,
            lineJoin: 'round',
            lineCap: 'round'
          }).addTo(map);
          
          linesRef.current.push(line);
          
          let totalDist = 0;
          for (let i = 0; i < selectedPoints.length - 1; i++) {
            const p1 = selectedPoints[i];
            const p2 = selectedPoints[i + 1];
            totalDist += calculateDistance(p1.lat, p1.lng, p2.lat, p2.lng);
          }
          setDistance(totalDist.toFixed(2));
        }
      }
    };

    updateRoutes();
  }, [selectedTitiks, routeType, titiks, map, L]);

  const handleAddTitikByInput = () => {
    if (!inputLat || !inputLng) return;
    
    const newTitik: Titik = {
      id: Date.now(),
      lat: parseFloat(inputLat),
      lng: parseFloat(inputLng),
      name: inputName || `Titik ${titiks.length + 1}`,
      kapasitas: inputKapasitas,
      iconType: inputIconType
    };
    
    addTitikToMap(newTitik, map || undefined);
    setInputLat('');
    setInputLng('');
    setInputName('');
    setInputKapasitas('');
    setInputIconType('dot');
  };

  const returnToUserLocation = () => {
    if (map && userLocation) {
      map.flyTo([userLocation.lat, userLocation.lng], 16, {
        duration: 1.5
      });
      userMarkerRef.current?.openPopup();
    }
  };

  const clearAllTitiks = () => {
    Object.values(markersRef.current).forEach(marker => {
      if (map) map.removeLayer(marker);
    });
    linesRef.current.forEach(line => {
      if (map) map.removeLayer(line);
    });
    markersRef.current = {};
    linesRef.current = [];
    setTitiks([]);
    setSelectedTitiks([]);
    setDistance(null);
  };

  const deleteTitik = (id: number) => {
    const marker = markersRef.current[id];
    if (marker && map) {
      map.removeLayer(marker);
    }
    delete markersRef.current[id];
    setTitiks(prev => prev.filter(t => t.id !== id));
    setSelectedTitiks(prev => prev.filter(tid => tid !== id));
  };

  const startEditTitik = (titik: Titik) => {
    setEditingTitik({
      id: titik.id,
      name: titik.name,
      lat: titik.lat.toString(),
      lng: titik.lng.toString(),
      kapasitas: titik.kapasitas,
      iconType: titik.iconType
    });
  };

  const cancelEditTitik = () => {
    setEditingTitik(null);
  };

  const saveEditTitik = () => {
    if (!editingTitik) return;
    
    const lat = parseFloat(editingTitik.lat);
    const lng = parseFloat(editingTitik.lng);
    
    if (isNaN(lat) || isNaN(lng)) {
      alert('Koordinat tidak valid!');
      return;
    }

    // Update titik data
    setTitiks(prev => prev.map(t => 
      t.id === editingTitik.id 
        ? { ...t, name: editingTitik.name, lat, lng, kapasitas: editingTitik.kapasitas, iconType: editingTitik.iconType } 
        : t
    ));

    // Update marker position, icon, popup and tooltip
    const marker = markersRef.current[editingTitik.id];
    if (marker && L && map) {
      marker.setLatLng([lat, lng]);
      
      // Update icon based on iconType
      let iconHTML = '';
      if (editingTitik.iconType === 'trafo') {
        iconHTML = `
          <div class="marker-trafo-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
        `;
      } else {
        iconHTML = `<div class="marker-dot-simple"></div>`;
      }
      
      marker.setIcon(L.divIcon({
        className: 'custom-marker',
        html: iconHTML,
        iconSize: [24, 24]
      }));
      
      const tooltipContent = `
        <div style="font-family: system-ui; padding: 8px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #1f2937;">${editingTitik.name}</div>
          ${editingTitik.kapasitas ? `<div style="color: #059669; font-size: 13px; font-weight: 500; margin-bottom: 4px;">⚡ ${editingTitik.kapasitas}</div>` : ''}
          <div style="color: #6b7280; font-size: 11px; border-top: 1px solid #e5e7eb; padding-top: 4px; margin-top: 4px;">
            <div>Lat: ${lat.toFixed(6)}</div>
            <div>Lng: ${lng.toFixed(6)}</div>
          </div>
        </div>
      `;
      
      marker.setTooltipContent(tooltipContent);
      
      marker.setPopupContent(`
        <div style="font-family: system-ui; padding: 4px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${editingTitik.name}</div>
          ${editingTitik.kapasitas ? `<div style="color: #059669; font-size: 13px; font-weight: 500; margin-bottom: 4px;">⚡ Kapasitas: ${editingTitik.kapasitas}</div>` : ''}
          <div style="color: #6b7280; font-size: 12px;">
            <div>Lat: ${lat.toFixed(6)}</div>
            <div>Lng: ${lng.toFixed(6)}</div>
          </div>
        </div>
      `);
      
      // Pan to updated location
      map.panTo([lat, lng]);
    }

    setEditingTitik(null);
  };

  return (
    <div className="w-full h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <MapPin className="text-red-500" size={24} />
            </div>
            <span>Interactive Maps</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Tandai lokasi dan ukur jarak dengan mudah</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <div 
          className={`bg-white shadow-xl border-r border-gray-200 flex flex-col transition-all duration-300 ${
            isSidebarOpen ? 'w-96' : 'w-0'
          } overflow-hidden`}
        >
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Add Titik by Coordinates */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2 text-base">
                <div className="p-1.5 bg-blue-500 rounded-lg">
                  <Plus size={16} className="text-white" />
                </div>
                Tambah Titik Baru
              </h3>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Nama lokasi (opsional)"
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
                <input
                  type="text"
                  placeholder="Kapasitas gardu (e.g., 50 kVA)"
                  value={inputKapasitas}
                  onChange={(e) => setInputKapasitas(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    step="any"
                    placeholder="Latitude"
                    value={inputLat}
                    onChange={(e) => setInputLat(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="Longitude"
                    value={inputLng}
                    onChange={(e) => setInputLng(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Pilih Ikon:</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setInputIconType('dot')}
                      className={`py-3 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        inputIconType === 'dot'
                          ? 'bg-red-500 text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <div className="w-3 h-3 rounded-full bg-current"></div>
                      Titik Bulat
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputIconType('trafo')}
                      className={`py-3 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        inputIconType === 'trafo'
                          ? 'bg-yellow-500 text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                      </svg>
                      Trafo
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleAddTitikByInput}
                  disabled={!inputLat || !inputLng}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Tambah Titik
                </button>
                <p className="text-xs text-gray-600 text-center">
                  💡 Atau klik langsung di peta untuk menambah titik
                </p>
              </div>
            </div>

            {/* Route Type */}
            {selectedTitiks.length >= 2 && (
              <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2 text-base">
                  <div className="p-1.5 bg-purple-500 rounded-lg">
                    <Ruler size={16} className="text-white" />
                  </div>
                  Tipe Garis
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setRouteType('straight')}
                    className={`py-3 px-4 rounded-lg text-sm font-semibold transition-all ${
                      routeType === 'straight'
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Garis Lurus
                  </button>
                  <button
                    onClick={() => setRouteType('route')}
                    disabled={isLoadingRoute}
                    className={`py-3 px-4 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                      routeType === 'route'
                        ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    } disabled:opacity-50`}
                  >
                    {isLoadingRoute && <Loader2 size={14} className="animate-spin" />}
                    Rute Jalan
                  </button>
                </div>
              </div>
            )}

            {/* Distance */}
            {distance && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200 shadow-sm">
                <h3 className="font-semibold text-green-800 mb-2 text-sm">Total Jarak</h3>
                <p className="text-4xl font-bold text-green-600">{distance} <span className="text-xl">km</span></p>
                <p className="text-xs text-green-700 mt-2">
                  {routeType === 'route' ? '🚗 Jarak via jalan' : '📏 Jarak lurus'}
                </p>
              </div>
            )}

            {/* Titik List */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-800 text-base">
                  Daftar Titik <span className="text-blue-500">({titiks.length})</span>
                </h3>
                {titiks.length > 0 && (
                  <button
                    onClick={clearAllTitiks}
                    className="text-red-500 hover:text-red-700 text-sm flex items-center gap-1.5 font-medium hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all"
                  >
                    <Trash2 size={14} />
                    Hapus Semua
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {titiks.map((titik, idx) => (
                  <div
                    key={titik.id}
                    className={`rounded-xl transition-all ${
                      selectedTitiks.includes(titik.id)
                        ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-400 shadow-md'
                        : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100 hover:shadow-sm'
                    }`}
                  >
                    {editingTitik?.id === titik.id ? (
                      // Edit Mode
                      <div className="p-4 space-y-3">
                        <input
                          type="text"
                          value={editingTitik.name}
                          onChange={(e) => setEditingTitik({ ...editingTitik, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                          placeholder="Nama lokasi"
                        />
                        <input
                          type="text"
                          value={editingTitik.kapasitas}
                          onChange={(e) => setEditingTitik({ ...editingTitik, kapasitas: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                          placeholder="Kapasitas gardu"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            step="any"
                            value={editingTitik.lat}
                            onChange={(e) => setEditingTitik({ ...editingTitik, lat: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                            placeholder="Latitude"
                          />
                          <input
                            type="number"
                            step="any"
                            value={editingTitik.lng}
                            onChange={(e) => setEditingTitik({ ...editingTitik, lng: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                            placeholder="Longitude"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-2">Ikon:</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingTitik({ ...editingTitik, iconType: 'dot' })}
                              className={`py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                                editingTitik.iconType === 'dot'
                                  ? 'bg-red-500 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              <div className="w-2 h-2 rounded-full bg-current"></div>
                              Titik
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTitik({ ...editingTitik, iconType: 'trafo' })}
                              className={`py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                                editingTitik.iconType === 'trafo'
                                  ? 'bg-yellow-500 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                              </svg>
                              Trafo
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={saveEditTitik}
                            className="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition-all text-sm font-medium flex items-center justify-center gap-1"
                          >
                            <Save size={14} />
                            Simpan
                          </button>
                          <button
                            onClick={cancelEditTitik}
                            className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-all text-sm font-medium flex items-center justify-center gap-1"
                          >
                            <X size={14} />
                            Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div 
                            onClick={() => toggleSelectTitik(titik.id)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 cursor-pointer ${
                              selectedTitiks.includes(titik.id) ? 'bg-blue-500' : 'bg-red-500'
                            }`}
                          >
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0" onClick={() => toggleSelectTitik(titik.id)}>
                            <p className="font-semibold text-sm text-gray-800 truncate cursor-pointer">{titik.name}</p>
                            {titik.kapasitas && (
                              <p className="text-xs text-green-600 font-medium mt-0.5">⚡ {titik.kapasitas}</p>
                            )}
                            <p className="text-xs text-gray-500 mt-0.5 cursor-pointer">
                              {titik.lat.toFixed(6)}, {titik.lng.toFixed(6)}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {titik.iconType === 'trafo' ? (
                                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                                  </svg>
                                  Trafo
                                </span>
                              ) : (
                                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-current"></div>
                                  Titik
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-blue-500 mt-1">🖱️ Drag marker di peta untuk pindah</p>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditTitik(titik);
                              }}
                              className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1.5 rounded-lg transition-all"
                              title="Edit titik"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteTitik(titik.id);
                              }}
                              className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"
                              title="Hapus titik"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {titiks.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <MapPin className="text-gray-400" size={32} />
                  </div>
                  <p className="text-sm text-gray-500">Belum ada titik</p>
                  <p className="text-xs text-gray-400 mt-1">Klik peta atau input koordinat untuk mulai</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Toggle Sidebar Button */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute left-0 top-1/2 -translate-y-1/2 bg-white p-2 rounded-r-lg shadow-lg hover:bg-gray-50 transition-all z-[1000] border-r border-t border-b border-gray-200"
          style={{ left: isSidebarOpen ? '384px' : '0' }}
        >
          {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>

        {/* Map Container */}
        <div className="flex-1 relative">
          {isLoadingLocation && (
            <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-[1001]">
              <div className="text-center">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-3" />
                <p className="text-gray-700 font-medium">Mencari lokasi Anda...</p>
                <p className="text-sm text-gray-500 mt-1">Mohon izinkan akses lokasi</p>
              </div>
            </div>
          )}
          
          <div ref={mapRef} className="w-full h-full" />
          
          {/* Return to Location Button */}
          <button
            onClick={returnToUserLocation}
            className="absolute top-6 right-6 bg-white p-4 rounded-xl shadow-lg hover:shadow-xl transition-all z-[1000] group hover:bg-blue-50 border border-gray-200"
            title="Kembali ke lokasi saya"
          >
            <Navigation size={24} className="text-blue-500 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </div>

      <style jsx>{`
        :global(.distance-tooltip) {
          background: rgba(0, 0, 0, 0.85) !important;
          border: none !important;
          border-radius: 8px !important;
          color: white !important;
          font-weight: 600 !important;
          font-size: 13px !important;
          padding: 6px 12px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2) !important;
        }
        :global(.distance-tooltip:before) {
          border-top-color: rgba(0, 0, 0, 0.85) !important;
        }
        :global(.marker-dot-simple) {
          background: #14b8a6;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 2px 8px rgba(20, 184, 166, 0.4);
          cursor: pointer;
          transition: transform 0.2s;
        }
        :global(.marker-dot-simple:hover) {
          transform: scale(1.2);
        }
        :global(.marker-trafo-icon) {
          background: #14b8a6;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 2px solid white;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(20, 184, 166, 0.4);
          cursor: pointer;
          transition: transform 0.2s;
        }
        :global(.marker-trafo-icon:hover) {
          transform: scale(1.2);
        }
      `}</style>
    </div>
  );
};

export default Maps;