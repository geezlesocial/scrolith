type LocationRecord = {
  location: string;
  formattedAddress: string | null;
  country: string | null;
  countryCode: string | null;
  state: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  locationSource: string | null;
};

export type LocationSearchResult = LocationRecord & {
  id: string;
  label: string;
  subtitle: string | null;
};

type SearchOptions = {
  limit?: number;
  language?: string | null;
};

const DEFAULT_GEOCODER_BASE_URL = 'https://nominatim.openstreetmap.org';
const DEFAULT_USER_AGENT = 'ScrolithLocationProxy/1.0 (+https://scrolith.com)';
const DEFAULT_TIMEOUT_MS = 8_000;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const trimText = (value: unknown, max = 255) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.slice(0, max);
};

const toNullableCoordinate = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(7));
};

const toCountryCode = (value: unknown) => {
  const text = trimText(value, 8);
  return text ? text.toUpperCase() : null;
};

const joinUnique = (values: Array<string | null | undefined>) => {
  const parts: string[] = [];
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    if (parts.some((entry) => entry.toLowerCase() === normalized.toLowerCase())) continue;
    parts.push(normalized);
  }
  return parts.join(', ');
};

const buildFallbackLocation = (input: Partial<LocationRecord>) =>
  joinUnique([input.city, input.state, input.country]) ||
  trimText(input.formattedAddress, 220) ||
  '';

const buildSubtitle = (input: Partial<LocationRecord>) =>
  joinUnique([input.city, input.state, input.country]) || null;

const getGeocoderBaseUrl = () =>
  String(process.env.LOCATION_GEOCODER_BASE_URL || DEFAULT_GEOCODER_BASE_URL).replace(/\/+$/, '');

const getRequestTimeoutMs = () => {
  const raw = Number(process.env.LOCATION_GEOCODER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isFinite(raw) ? clamp(Math.floor(raw), 2_000, 20_000) : DEFAULT_TIMEOUT_MS;
};

const getUserAgent = () => trimText(process.env.LOCATION_GEOCODER_USER_AGENT, 200) || DEFAULT_USER_AGENT;

const normalizeLanguage = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.split(',')[0]?.trim() || '';
};

const readGeocodingBag = (feature: any) => {
  const props = feature?.properties || {};
  const geocoding = props?.geocoding || {};
  const address = props?.address || feature?.address || {};
  return {
    geocoding,
    address,
    properties: props
  };
};

const inferCity = (source: Record<string, any>) =>
  trimText(
    source.city ||
      source.town ||
      source.village ||
      source.municipality ||
      source.locality ||
      source.hamlet ||
      source.county,
    120
  );

const inferState = (source: Record<string, any>) =>
  trimText(source.state || source.region || source.province || source.county, 120);

const inferRegion = (source: Record<string, any>) =>
  trimText(source.county || source.district || source.region || source.state, 120);

const mapFeatureToLocation = (feature: any): LocationSearchResult | null => {
  if (!feature) return null;
  const { geocoding, address, properties } = readGeocodingBag(feature);
  const coords = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : null;
  const longitude = toNullableCoordinate(coords?.[0] ?? feature?.lon ?? properties?.lon);
  const latitude = toNullableCoordinate(coords?.[1] ?? feature?.lat ?? properties?.lat);
  const country = trimText(geocoding.country || address.country, 120);
  const state = inferState({ ...address, ...geocoding });
  const city = inferCity({ ...address, ...geocoding });
  const region = inferRegion({ ...address, ...geocoding });
  const formattedAddress =
    trimText(geocoding.label || properties?.display_name || feature?.display_name, 220) ||
    joinUnique([
      trimText(geocoding.name || address.road, 120),
      city,
      state,
      country
    ]) ||
    null;
  const location = buildFallbackLocation({
    formattedAddress,
    city,
    state,
    country
  });
  const placeId =
    trimText(geocoding.osm_id || properties?.place_id || feature?.place_id || geocoding.id, 120) ||
    null;

  return {
    id: placeId || `${latitude ?? 'x'}:${longitude ?? 'y'}`,
    label: formattedAddress || location || 'Selected place',
    subtitle: buildSubtitle({ city, state, country }),
    location,
    formattedAddress,
    country,
    countryCode: toCountryCode(geocoding.countrycode || address.country_code),
    state,
    city,
    region,
    postalCode: trimText(geocoding.postcode || address.postcode, 40),
    latitude,
    longitude,
    placeId,
    locationSource: 'nominatim'
  };
};

const fetchGeocoderJson = async (pathname: string, params: URLSearchParams, language?: string | null) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getRequestTimeoutMs());
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': getUserAgent()
  };
  const normalizedLanguage = normalizeLanguage(language);
  if (normalizedLanguage) headers['Accept-Language'] = normalizedLanguage;

  try {
    const url = `${getGeocoderBaseUrl()}${pathname}?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Location provider request failed (${response.status})`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
};

export const searchLocations = async (query: string, options: SearchOptions = {}) => {
  const normalizedQuery = String(query || '').trim();
  if (normalizedQuery.length < 2) return [] as LocationSearchResult[];

  const params = new URLSearchParams({
    q: normalizedQuery,
    format: 'geocodejson',
    addressdetails: '1',
    limit: String(clamp(Number(options.limit || 6), 1, 10))
  });
  const payload = (await fetchGeocoderJson('/search', params, options.language)) as any;
  const features = Array.isArray(payload?.features) ? payload.features : [];
  return features
    .map((feature: any) => mapFeatureToLocation(feature))
    .filter((entry: LocationSearchResult | null): entry is LocationSearchResult => Boolean(entry));
};

export const reverseGeocodeLocation = async (
  latitude: number,
  longitude: number,
  options: SearchOptions = {}
) => {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'geocodejson',
    addressdetails: '1',
    zoom: '18'
  });
  const payload = (await fetchGeocoderJson('/reverse', params, options.language)) as any;
  const feature = Array.isArray(payload?.features) ? payload.features[0] : payload?.features?.[0];
  return mapFeatureToLocation(feature) || null;
};

const pickPayloadValue = (payload: Record<string, any>, camel: string, snake: string) => {
  if (payload[camel] !== undefined) return payload[camel];
  if (payload[snake] !== undefined) return payload[snake];
  return undefined;
};

export const extractLocationMutation = (
  payload: Record<string, any>,
  options?: { locationMaxLength?: number }
): { hasChanges: boolean; data: Partial<LocationRecord> } => {
  const data: Partial<LocationRecord> = {};
  let hasChanges = false;

  const assignText = (field: keyof LocationRecord, camel: string, snake: string, max: number, transform?: (value: unknown) => string | null) => {
    const raw = pickPayloadValue(payload, camel, snake);
    if (raw === undefined) return;
    hasChanges = true;
    const nextValue = transform ? transform(raw) : trimText(raw, max);
    (data as any)[field] = nextValue;
  };

  assignText('location', 'location', 'location', options?.locationMaxLength || 140, (value) => trimText(value, options?.locationMaxLength || 140) || '');
  assignText('formattedAddress', 'formattedAddress', 'formatted_address', 220);
  assignText('country', 'country', 'country', 120);
  assignText('countryCode', 'countryCode', 'country_code', 8, toCountryCode);
  assignText('state', 'state', 'state', 120);
  assignText('city', 'city', 'city', 120);
  assignText('region', 'region', 'region', 120);
  assignText('postalCode', 'postalCode', 'postal_code', 40);
  assignText('placeId', 'placeId', 'place_id', 120);
  assignText('locationSource', 'locationSource', 'location_source', 40);

  const latitude = pickPayloadValue(payload, 'latitude', 'latitude');
  if (latitude !== undefined) {
    hasChanges = true;
    data.latitude = toNullableCoordinate(latitude);
  }
  const longitude = pickPayloadValue(payload, 'longitude', 'longitude');
  if (longitude !== undefined) {
    hasChanges = true;
    data.longitude = toNullableCoordinate(longitude);
  }

  if (hasChanges) {
    if (data.formattedAddress === undefined && data.location !== undefined) {
      data.formattedAddress = trimText(data.location, 220);
    }
    if (data.location === undefined) {
      data.location = buildFallbackLocation(data);
    }
  }

  return { hasChanges, data };
};

export const toLocationResponse = (location: Partial<LocationRecord> | null | undefined) => {
  if (!location) return null;
  const resolvedLocation = buildFallbackLocation(location);
  const formattedAddress = trimText(location.formattedAddress ?? resolvedLocation, 220);
  const response = {
    location: resolvedLocation,
    formattedAddress,
    formatted_address: formattedAddress,
    country: trimText(location.country, 120),
    countryCode: toCountryCode(location.countryCode),
    country_code: toCountryCode(location.countryCode),
    state: trimText(location.state, 120),
    city: trimText(location.city, 120),
    region: trimText(location.region, 120),
    postalCode: trimText(location.postalCode, 40),
    postal_code: trimText(location.postalCode, 40),
    latitude: toNullableCoordinate(location.latitude),
    longitude: toNullableCoordinate(location.longitude),
    placeId: trimText(location.placeId, 120),
    place_id: trimText(location.placeId, 120),
    locationSource: trimText(location.locationSource, 40),
    location_source: trimText(location.locationSource, 40)
  };
  return response;
};
