import React, {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState
} from 'react';
import { Loader2, LocateFixed, MapPin, Search } from 'lucide-react';
import { LocationService } from '../../services/location';
import { LocationSuggestion, StructuredLocationFields } from '../../types';
import { getCurrentDeviceCoordinates } from '../../utils/deviceLocation';

type LocationPickerProps = {
  value?: StructuredLocationFields | null;
  onChange: (next: Partial<StructuredLocationFields>) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
};

const DEFAULT_LAT = Number(import.meta.env.VITE_MAP_DEFAULT_LAT || 40.7128);
const DEFAULT_LNG = Number(import.meta.env.VITE_MAP_DEFAULT_LNG || -74.006);
const DEFAULT_ZOOM = Number(import.meta.env.VITE_MAP_DEFAULT_ZOOM || 11);
const DEFAULT_TILE_URL =
  String(import.meta.env.VITE_MAP_TILE_URL || '').trim() ||
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_ATTRIBUTION =
  String(import.meta.env.VITE_MAP_ATTRIBUTION || '').trim() || '&copy; OpenStreetMap contributors';

let maplibreCssPromise: Promise<unknown> | null = null;

const loadMaplibre = async () => {
  maplibreCssPromise ||= import('maplibre-gl/dist/maplibre-gl.css');
  const [maplibre] = await Promise.all([
    import('maplibre-gl'),
    maplibreCssPromise
  ]);
  return maplibre;
};

const toNullableNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildMapStyle = () => {
  const styleUrl = String(import.meta.env.VITE_MAP_STYLE_URL || '').trim();
  if (styleUrl) return styleUrl;
  return {
    version: 8,
    sources: {
      openstreetmap: {
        type: 'raster',
        tiles: [DEFAULT_TILE_URL],
        tileSize: 256,
        attribution: DEFAULT_ATTRIBUTION
      }
    },
    layers: [
      {
        id: 'openstreetmap',
        type: 'raster',
        source: 'openstreetmap'
      }
    ]
  };
};

const emptyStructuredLocation = (location: string): Partial<StructuredLocationFields> => ({
  location,
  formattedAddress: location,
  formatted_address: location,
  country: '',
  countryCode: '',
  country_code: '',
  state: '',
  city: '',
  region: '',
  postalCode: '',
  postal_code: '',
  latitude: null,
  longitude: null,
  placeId: '',
  place_id: '',
  locationSource: location ? 'manual' : '',
  location_source: location ? 'manual' : ''
});

const toLocationPayload = (location: LocationSuggestion): Partial<StructuredLocationFields> => ({
  location: location.location || location.formattedAddress || location.label,
  formattedAddress: location.formattedAddress || location.location || location.label,
  formatted_address: location.formattedAddress || location.location || location.label,
  country: location.country || '',
  countryCode: location.countryCode || location.country_code || '',
  country_code: location.country_code || location.countryCode || '',
  state: location.state || '',
  city: location.city || '',
  region: location.region || '',
  postalCode: location.postalCode || location.postal_code || '',
  postal_code: location.postal_code || location.postalCode || '',
  latitude: toNullableNumber(location.latitude),
  longitude: toNullableNumber(location.longitude),
  placeId: location.placeId || location.place_id || '',
  place_id: location.place_id || location.placeId || '',
  locationSource: location.locationSource || location.location_source || 'nominatim',
  location_source: location.location_source || location.locationSource || 'nominatim'
});

const LocationPicker: React.FC<LocationPickerProps> = ({
  value,
  onChange,
  label = 'Location',
  placeholder = 'Search city, state, or country',
  disabled = false
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [query, setQuery] = useState(
    String(value?.formattedAddress || value?.formatted_address || value?.location || '').trim()
  );
  const [results, setResults] = useState<LocationSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const latitude = toNullableNumber(value?.latitude);
  const longitude = toNullableNumber(value?.longitude);
  const displayValue = useMemo(
    () => String(value?.formattedAddress || value?.formatted_address || value?.location || '').trim(),
    [value?.formattedAddress, value?.formatted_address, value?.location]
  );
  const resolvedCenter = useMemo<[number, number]>(
    () => [longitude ?? DEFAULT_LNG, latitude ?? DEFAULT_LAT],
    [latitude, longitude]
  );

  useEffect(() => {
    setQuery(displayValue);
  }, [displayValue]);

  const applySuggestion = useEffectEvent((location: LocationSuggestion) => {
    setErrorMessage('');
    setResults([]);
    setQuery(location.formattedAddress || location.location || location.label);
    onChange(toLocationPayload(location));
  });

  const reverseLookup = useEffectEvent(async (nextLatitude: number, nextLongitude: number) => {
    setResolving(true);
    setErrorMessage('');
    try {
      const resolved = await LocationService.reverse(nextLatitude, nextLongitude);
      if (!resolved) {
        onChange({
          ...emptyStructuredLocation(`${nextLatitude.toFixed(5)}, ${nextLongitude.toFixed(5)}`),
          latitude: nextLatitude,
          longitude: nextLongitude
        });
        return;
      }
      applySuggestion({
        ...resolved,
        latitude: nextLatitude,
        longitude: nextLongitude
      });
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to resolve that map position.');
    } finally {
      setResolving(false);
    }
  });

  useEffect(() => {
    let cancelled = false;
    const normalizedQuery = query.trim();
    const selectedValue = String(
      value?.formattedAddress || value?.formatted_address || value?.location || ''
    ).trim();
    if (!normalizedQuery || normalizedQuery.length < 2 || normalizedQuery === selectedValue) {
      setResults([]);
      setSearching(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const nextResults = await LocationService.search(normalizedQuery, 6);
        if (!cancelled) {
          setResults(nextResults);
        }
      } catch (error: any) {
        if (!cancelled) {
          setErrorMessage(error?.message || 'Unable to search locations right now.');
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    query,
    value?.formattedAddress,
    value?.formatted_address,
    value?.location
  ]);

  useEffect(() => {
    let cancelled = false;
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    const setupMap = async () => {
      const maplibre = await loadMaplibre();
      if (cancelled || !mapContainerRef.current) return;

      const map = new maplibre.Map({
        container: mapContainerRef.current,
        style: buildMapStyle() as any,
        center: resolvedCenter,
        zoom: latitude !== null && longitude !== null ? DEFAULT_ZOOM : 2
      });

      map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', () => {
        map.resize();
      });
      map.on('click', (event) => {
        if (disabled) return;
        void reverseLookup(event.lngLat.lat, event.lngLat.lng);
      });

      mapRef.current = map;
      markerRef.current = new maplibre.Marker({ color: '#0f766e' })
        .setLngLat(resolvedCenter)
        .addTo(map);
    };

    void setupMap();

    return () => {
      cancelled = true;
      markerRef.current?.remove?.();
      markerRef.current = null;
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, [disabled, latitude, longitude, resolvedCenter, reverseLookup]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setCenter(resolvedCenter);
    mapRef.current.setZoom(latitude !== null && longitude !== null ? DEFAULT_ZOOM : 2);
    if (markerRef.current) {
      markerRef.current.setLngLat(resolvedCenter);
    }
  }, [latitude, longitude, resolvedCenter]);

  const handleManualChange = (nextValue: string) => {
    setQuery(nextValue);
    setErrorMessage('');
    onChange(emptyStructuredLocation(nextValue));
  };

  const handleUseCurrentLocation = async () => {
    setResolving(true);
    setErrorMessage('');
    try {
      const coords = await getCurrentDeviceCoordinates();
      await reverseLookup(coords.latitude, coords.longitude);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to access your current location.');
      setResolving(false);
    }
  };

  const helperText = value?.city || value?.state || value?.country
    ? [value?.city, value?.state, value?.country].filter(Boolean).join(', ')
    : 'Choose a place from search, tap the map, or use your current location.';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">{label}</label>
          <p className="mt-1 text-xs text-slate-500">{helperText}</p>
        </div>
        <button
          type="button"
          onClick={() => void handleUseCurrentLocation()}
          disabled={disabled || resolving}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          Use current location
        </button>
      </div>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(event) => handleManualChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-800 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50"
        />
        {(searching || resolving) && (
          <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-slate-400" />
        )}
      </div>

      {results.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => applySuggestion(result)}
              className="flex w-full items-start gap-3 border-b border-slate-100 px-3 py-3 text-left transition last:border-b-0 hover:bg-slate-50"
            >
              <MapPin className="mt-0.5 h-4 w-4 text-teal-600" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-800">{result.label}</span>
                {result.subtitle && (
                  <span className="block truncate text-xs text-slate-500">{result.subtitle}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
        <div ref={mapContainerRef} className="h-64 w-full bg-slate-100" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {value?.city ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            City: {value.city}
          </span>
        ) : null}
        {value?.state ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            State: {value.state}
          </span>
        ) : null}
        {value?.region ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            Region: {value.region}
          </span>
        ) : null}
        {value?.country ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            Country: {value.country}
          </span>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="mt-3 text-xs font-medium text-rose-600">{errorMessage}</p>
      ) : null}
    </div>
  );
};

export default LocationPicker;
