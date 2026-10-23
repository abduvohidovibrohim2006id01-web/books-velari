"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Search, MapPin, Navigation, Check } from "lucide-react";
import { useStore } from "@/store/store";

interface YandexMapPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (address: string, coords: [number, number]) => void;
    apiKey?: string;
}

import { YANDEX_MAPS_API_KEY } from "@/lib/constants";

export default function YandexMapPicker({
    isOpen,
    onClose,
    onSelect,
    apiKey = YANDEX_MAPS_API_KEY
}: YandexMapPickerProps) {
    const { language } = useStore();
    const mapRef = useRef<HTMLDivElement>(null);
    const [ymaps, setYmaps] = useState<any>(null);
    const [selectedAddress, setSelectedAddress] = useState("");
    const [selectedCoords, setSelectedCoords] = useState<[number, number] | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const mapInstance = useRef<any>(null);
    const markerInstance = useRef<any>(null);

    // Load Yandex Maps Script
    useEffect(() => {
        if (!isOpen) return;

        const loadScript = () => {
            const ylang = language === "uz" ? "uz_UZ" : "ru_RU";

            // If the script already exists with a different language, we might need a full reload or just handle it
            // But usually, the app language doesn't change WHILE the picker is open.
            // If it does, we check if the current ymaps object matches the desired language
            if ((window as any).ymaps) {
                (window as any).ymaps.ready(() => setYmaps((window as any).ymaps));
                return;
            }

            const script = document.createElement("script");
            script.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=${ylang}`;
            script.type = "text/javascript";
            script.id = "yandex-maps-api-script";
            script.onload = () => {
                const y = (window as any).ymaps;
                if (y) {
                    y.ready(() => setYmaps(y));
                }
            };
            script.onerror = () => {
                console.error("Yandex Maps load error");
            };
            document.head.appendChild(script);
        };

        loadScript();
    }, [isOpen, language]);

    // Initialize Map
    useEffect(() => {
        if (!ymaps || !mapRef.current || mapInstance.current) return;

        const initMap = () => {
            // Small timeout to ensure modal animation is done and container has height
            setTimeout(() => {
                if (!mapRef.current || mapInstance.current) return;

                try {
                    const map = new ymaps.Map(mapRef.current, {
                        center: [41.2995, 69.2401], // Tashkent
                        zoom: 14,
                        controls: ["zoomControl", "fullscreenControl"]
                    }, {
                        searchControlProvider: 'yandex#search'
                    });

                    const marker = new ymaps.Placemark(map.getCenter(), {
                        balloonContent: 'Tanlangan manzil'
                    }, {
                        preset: "islands#redDotIconWithCaption",
                        draggable: true
                    });

                    map.geoObjects.add(marker);
                    mapInstance.current = map;
                    markerInstance.current = marker;

                    map.events.add("click", (e: any) => {
                        const coords = e.get("coords");
                        marker.geometry.setCoordinates(coords);
                        getAddress(coords);
                    });

                    marker.events.add("dragend", () => {
                        const coords = marker.geometry.getCoordinates();
                        getAddress(coords);
                    });
                } catch (error) {
                    console.error("Yandex Map initialization error:", error);
                }
            }, 100); // Adjust timeout if needed
        };

        initMap();
    }, [ymaps, isOpen]);

    // Custom Autocomplete Logic (Unbreakable & Geo-Biased)
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchQuery.length > 2) {
                try {
                    let biasParams = "";
                    // If map is initialized, bias results towards the current center
                    if (mapInstance.current) {
                        const center = mapInstance.current.getCenter();
                        const [lat, lon] = center;
                        // Create a small viewbox around current center (~50km) for prioritization
                        const offset = 0.5;
                        biasParams = `&viewbox=${lon - offset},${lat + offset},${lon + offset},${lat - offset}`;
                    }

                    const langCode = language === 'uz' ? 'uz' : 'ru';
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=6&accept-language=${langCode}&countrycodes=uz${biasParams}`);
                    const data = await res.json();
                    if (data && data.length > 0) {
                        setSuggestions(data);
                        setShowSuggestions(true);
                    } else {
                        setSuggestions([]);
                        setShowSuggestions(false);
                    }
                } catch (e) {
                    console.error("Suggest fetch error:", e);
                    setSuggestions([]);
                    setShowSuggestions(false);
                }
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }, 400); // Faster debounce for better feel

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const getAddress = useCallback(async (coords: [number, number]) => {
        setIsSearching(true);
        const langCode = language === 'uz' ? 'uz' : 'ru';

        try {
            // Priority 1: Nominatim (OpenStreetMap) - Supports per-request language override
            const osmRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords[0]}&lon=${coords[1]}&accept-language=${langCode}&countrycodes=uz`);
            const osmData = await osmRes.json();

            if (osmData && osmData.display_name) {
                setSelectedAddress(osmData.display_name);
                setSelectedCoords(coords);
                setIsSearching(false);
                return;
            }
            throw new Error("OSM address not found");
        } catch (osmError) {
            // Fallback: Yandex Geocoder
            try {
                if (ymaps && ymaps.geocode) {
                    const res = await ymaps.geocode(coords);
                    const firstGeoObject = res.geoObjects.get(0);
                    if (firstGeoObject) {
                        setSelectedAddress(firstGeoObject.getAddressLine() || "Tanlangan manzil");
                        setSelectedCoords(coords);
                        return;
                    }
                }
            } catch (yandexError) {
                console.error("Geocoding failed totally:", yandexError);
                setSelectedAddress(`Koordinatalar: ${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`);
            }
        } finally {
            setSelectedCoords(coords);
            setIsSearching(false);
        }
    }, [language, ymaps]);

    // Update address when language changes
    useEffect(() => {
        if (selectedCoords && isOpen) {
            getAddress(selectedCoords);
        }
    }, [language, isOpen, getAddress]); // Use selectedCoords in deps carefully to avoid infinite loops if it changes inside getAddress
    // Actually, getAddress only updates setSelectedAddress, not selectedCoords if it's already there and same.
    // To be safe, let's use a ref for the last geocoded coords or just depend on language.


    const handleSearchLogic = async (query: string) => {
        if (!query.trim() || !ymaps || !mapInstance.current || !markerInstance.current) return;

        setIsSearching(true);
        try {
            // Attempt 1: Yandex Geocoder
            try {
                const res = await ymaps.geocode(query, { results: 1 });
                const firstGeoObject = res.geoObjects.get(0);

                if (firstGeoObject) {
                    const coords = firstGeoObject.geometry.getCoordinates();
                    updateMapAndMarker(coords, firstGeoObject.getAddressLine());
                    setIsSearching(false);
                    return;
                }
            } catch (yandexError) {
                console.warn("Yandex Geocoder failed, falling back to OSM...", yandexError);
            }

            // Attempt 2: OSM Nominatim Fallback (Unbreakable Search)
            const langCode = language === 'uz' ? 'uz' : 'ru';
            const osmRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&accept-language=${langCode}`);
            const osmData = await osmRes.json();

            if (osmData && osmData.length > 0) {
                const result = osmData[0];
                const coords: [number, number] = [parseFloat(result.lat), parseFloat(result.lon)];
                updateMapAndMarker(coords, result.display_name);
            } else {
                alert(language === 'uz' ? "Afsuski, manzil topilmadi. Iltimos aniqroq yozib ko'ring." : "К сожалению, адрес не найден. Пожалуйста, попробуйте написать точнее.");
            }
        } catch (error) {
            console.error("Critical Search error:", error);
            alert(language === 'uz' ? "Qidiruv tizimida xatolik yuz berdi." : "Произошла ошибка в поисковой системе.");
        } finally {
            setIsSearching(false);
            setSuggestions([]); // Clear suggestions after search
            setShowSuggestions(false);
        }
    };

    const updateMapAndMarker = (coords: [number, number], address: string) => {
        if (!mapInstance.current || !markerInstance.current) return;

        mapInstance.current.setCenter(coords, 16, {
            checkZoomRange: true,
            duration: 1000,
            timingFunction: 'ease-in-out'
        });
        markerInstance.current.geometry.setCoordinates(coords);
        setSelectedAddress(address);
        setSelectedCoords(coords);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        handleSearchLogic(searchQuery);
    };

    const handleCurrentLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                mapInstance.current.setCenter(coords, 16);
                markerInstance.current.geometry.setCoordinates(coords);
                getAddress(coords);
            });
        }
    };

    const handleConfirm = () => {
        if (selectedCoords) {
            const finalAddress = selectedAddress || `Koordinatalar: ${selectedCoords[0].toFixed(5)}, ${selectedCoords[1].toFixed(5)}`;
            onSelect(finalAddress, selectedCoords);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

            <div className="bg-white w-full max-w-4xl h-full md:h-[80vh] rounded-none md:rounded-[48px] overflow-hidden shadow-2xl relative flex flex-col animate-in slide-in-from-bottom md:zoom-in-95 duration-300">
                {/* Header */}
                <div className="p-6 md:p-8 border-b border-gray-100 flex justify-between items-center bg-white shrink-0">
                    <div>
                        <h2 className="text-xl md:text-2xl font-black tracking-tight italic">
                            {language === 'uz' ? 'Manzilni tanlang' : 'Выберите адрес'}
                        </h2>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                            {language === 'uz' ? 'Yandex Maps integratsiyasi' : 'Интеграция Yandex Maps'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-3 md:p-4 bg-gray-50 rounded-2xl text-gray-400 hover:text-black transition-colors duration-150">
                        <X size={20} className="md:w-6 md:h-6" />
                    </button>
                </div>

                {/* Map Area */}
                <div className="flex-1 relative">
                    <div ref={mapRef} className="w-full h-full bg-gray-50" />

                    {/* Search Bar Overlay */}
                    <div className="absolute top-6 left-6 right-6 z-[60] flex flex-col gap-0 shadow-2xl rounded-3xl overflow-hidden bg-white/95 backdrop-blur-xl">
                        <form onSubmit={handleSearch} className="relative flex items-center h-14 md:h-16 group">
                            <input
                                type="text"
                                placeholder={language === 'uz' ? "Manzilni qidiring..." : "Поиск адреса..."}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                                className="w-full h-full pl-14 pr-28 bg-transparent border-none focus:ring-0 outline-none font-bold text-sm"
                            />
                            <div className="absolute left-5 text-gray-400 pointer-events-none">
                                <Search size={20} className="group-focus-within:text-black transition-colors" />
                            </div>
                            <div className="absolute right-2 flex items-center gap-1">
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                             setSearchQuery("");
                                            setSuggestions([]);
                                            setShowSuggestions(false);
                                        }}
                                        className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    className="px-5 py-2.5 velari-green-btn rounded-[20px] flex items-center justify-center transition-transform duration-150 will-change-transform shadow-xl active:scale-90"
                                >
                                    <Search size={18} strokeWidth={3} />
                                </button>
                            </div>
                        </form>

                        {/* Custom Suggestions List */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="border-t border-gray-100 max-h-[300px] overflow-y-auto w-full">
                                {suggestions.map((item, index) => (
                                    <button
                                        key={index}
                                        type="button"
                                        onClick={() => {
                                            const coords: [number, number] = [parseFloat(item.lat), parseFloat(item.lon)];
                                            updateMapAndMarker(coords, item.display_name);
                                            setSearchQuery(item.display_name);
                                            setShowSuggestions(false);
                                        }}
                                        className="w-full px-6 py-4 flex items-start gap-3 hover:bg-gray-50 border-b border-gray-50 last:border-none text-left transition-colors group"
                                    >
                                        <div className="mt-1 p-2 bg-gray-50 text-gray-400 rounded-lg group-hover:bg-red-50 group-hover:text-red-500 transition-colors">
                                            <MapPin size={14} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] font-black text-gray-900 leading-tight">
                                                {item.display_name.split(',')[0]}
                                            </p>
                                            <p className="text-[10px] text-gray-400 font-bold truncate mt-1">
                                                {item.display_name.split(',').slice(1).join(',').trim()}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Current Location Button */}
                    <button
                        onClick={handleCurrentLocation}
                        className="absolute bottom-6 md:bottom-8 right-6 md:right-8 p-5 md:p-6 bg-white rounded-2xl md:rounded-3xl shadow-2xl text-blue-500 hover:scale-110 active:scale-95 transition-transform duration-150 will-change-transform z-10 border border-gray-100"
                    >
                        <Navigation size={20} className="md:w-6 md:h-6" strokeWidth={3} />
                    </button>

                    {/* Marker overlay for precision */}
                    {!selectedCoords && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-10">
                            <MapPin size={48} className="text-red-500 animate-bounce" />
                        </div>
                    )}
                </div>

                {/* Footer and Address */}
                <div className="p-6 md:p-8 bg-gray-50/80 backdrop-blur-md border-t border-gray-100 shrink-0">
                    <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-center">
                        <div className="flex-1 min-w-0 w-full space-y-2">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 md:ml-2">
                                {language === 'uz' ? 'Tanlangan manzil:' : 'Выбранный адрес:'}
                            </p>
                            <div className="bg-white p-4 md:p-5 rounded-2xl md:rounded-[24px] border border-gray-200 shadow-sm flex items-center gap-3 md:gap-4 text-left overflow-hidden">
                                <div className="p-2 md:p-3 bg-red-50 text-red-500 rounded-xl shrink-0">
                                    <MapPin size={18} className="md:w-5 md:h-5" />
                                </div>
                                <div className="flex-1 min-w-0 overflow-hidden">
                                    {isSearching ? (
                                        <div className="flex items-center gap-2 text-gray-300 font-black italic text-xs md:text-sm">
                                            <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                                            {language === 'uz' ? 'Manzil aniqlanmoqda...' : 'Определение адреса...'}
                                        </div>
                                    ) : (
                                        <p className="font-black text-xs md:text-sm tracking-tight truncate block w-full">{selectedAddress || (language === 'uz' ? "Xaritadan tanlang" : "Выберите на карте")}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <button
                            disabled={!selectedCoords || isSearching}
                            onClick={handleConfirm}
                            className="w-full md:w-auto px-10 py-4 md:px-12 md:py-5 velari-green-btn rounded-full font-black text-base md:text-lg flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95 transition-transform duration-150 will-change-transform shrink-0"
                        >
                            <Check size={20} className="md:w-6 md:h-6" strokeWidth={3} />
                            {language === 'uz' ? 'Tasdiqlash' : 'Подтвердить'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
