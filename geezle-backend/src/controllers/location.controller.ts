import { Request, Response } from 'express';
import {
  reverseGeocodeLocation,
  searchLocations,
  toLocationResponse
} from '../services/location/location.service';

const parseLimit = (value: unknown, fallback = 6) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(10, Math.floor(parsed)));
};

const parseCoordinate = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveLanguage = (req: Request) =>
  String(req.headers['accept-language'] || req.query.language || '').trim() || null;

export const searchLocationOptions = async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) {
      return res.status(400).json({ success: false, error: 'Query must be at least 2 characters.' });
    }
    const items = await searchLocations(query, {
      limit: parseLimit(req.query.limit, 6),
      language: resolveLanguage(req)
    });
    return res.json({ success: true, data: { items } });
  } catch (error: any) {
    console.error('searchLocationOptions error:', error);
    return res.status(502).json({ success: false, error: error?.message || 'Failed to search locations.' });
  }
};

export const reverseLocationLookup = async (req: Request, res: Response) => {
  try {
    const latitude = parseCoordinate(req.query.lat ?? req.query.latitude);
    const longitude = parseCoordinate(req.query.lng ?? req.query.lon ?? req.query.longitude);
    if (latitude === null || longitude === null) {
      return res.status(400).json({ success: false, error: 'lat and lng are required.' });
    }
    const location = await reverseGeocodeLocation(latitude, longitude, {
      language: resolveLanguage(req)
    });
    return res.json({ success: true, data: { location: toLocationResponse(location) } });
  } catch (error: any) {
    console.error('reverseLocationLookup error:', error);
    return res.status(502).json({ success: false, error: error?.message || 'Failed to reverse geocode location.' });
  }
};

export const resolveLocation = async (req: Request, res: Response) => {
  try {
    const latitude = parseCoordinate(req.body?.lat ?? req.body?.latitude);
    const longitude = parseCoordinate(req.body?.lng ?? req.body?.lon ?? req.body?.longitude);
    if (latitude !== null && longitude !== null) {
      const location = await reverseGeocodeLocation(latitude, longitude, {
        language: resolveLanguage(req)
      });
      return res.json({ success: true, data: { location: toLocationResponse(location) } });
    }

    const query = String(req.body?.query || req.body?.q || '').trim();
    if (query.length < 2) {
      return res.status(400).json({ success: false, error: 'Provide a query or coordinates.' });
    }

    const [bestMatch] = await searchLocations(query, {
      limit: 1,
      language: resolveLanguage(req)
    });
    return res.json({ success: true, data: { location: toLocationResponse(bestMatch) } });
  } catch (error: any) {
    console.error('resolveLocation error:', error);
    return res.status(502).json({ success: false, error: error?.message || 'Failed to resolve location.' });
  }
};
