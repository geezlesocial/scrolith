import api from './api';
import { LocationSuggestion } from '../types';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const toNullableNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapLocation = (value: any): LocationSuggestion => ({
  id: String(value?.id || value?.placeId || value?.place_id || `${value?.latitude || 'x'}:${value?.longitude || 'y'}`),
  label: String(value?.label || value?.formattedAddress || value?.formatted_address || value?.location || 'Selected place'),
  subtitle: value?.subtitle ? String(value.subtitle) : null,
  location: String(value?.location || value?.formattedAddress || value?.formatted_address || ''),
  formattedAddress: value?.formattedAddress ?? value?.formatted_address ?? value?.location ?? '',
  formatted_address: value?.formatted_address ?? value?.formattedAddress ?? value?.location ?? '',
  country: value?.country ?? '',
  countryCode: value?.countryCode ?? value?.country_code ?? '',
  country_code: value?.country_code ?? value?.countryCode ?? '',
  state: value?.state ?? '',
  city: value?.city ?? '',
  region: value?.region ?? '',
  postalCode: value?.postalCode ?? value?.postal_code ?? '',
  postal_code: value?.postal_code ?? value?.postalCode ?? '',
  latitude: toNullableNumber(value?.latitude),
  longitude: toNullableNumber(value?.longitude),
  placeId: value?.placeId ?? value?.place_id ?? '',
  place_id: value?.place_id ?? value?.placeId ?? '',
  locationSource: value?.locationSource ?? value?.location_source ?? '',
  location_source: value?.location_source ?? value?.locationSource ?? ''
});

export const LocationService = {
  async search(query: string, limit = 6): Promise<LocationSuggestion[]> {
    const response = await api.get('/location/search', {
      params: {
        q: query,
        limit
      }
    });
    const data = extractData<{ items?: any[] }>(response);
    const items = Array.isArray(data?.items) ? data.items : [];
    return items.map(mapLocation);
  },

  async reverse(latitude: number, longitude: number): Promise<LocationSuggestion | null> {
    const response = await api.get('/location/reverse', {
      params: {
        lat: latitude,
        lng: longitude
      }
    });
    const data = extractData<{ location?: any | null }>(response);
    return data?.location ? mapLocation(data.location) : null;
  },

  async resolve(payload: {
    query?: string;
    latitude?: number;
    longitude?: number;
  }): Promise<LocationSuggestion | null> {
    const response = await api.post('/location/resolve', payload);
    const data = extractData<{ location?: any | null }>(response);
    return data?.location ? mapLocation(data.location) : null;
  }
};
