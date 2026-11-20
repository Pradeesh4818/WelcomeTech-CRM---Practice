import api from './api';

type GoogleMapsRuntimeConfig = {
  apiKey: string;
  mapId?: string;
  defaultCenter: { lat: number; lng: number };
  defaultZoom: number;
  enabled: boolean;
};

let scriptPromise: Promise<void> | null = null;
let settingsPromise: Promise<GoogleMapsRuntimeConfig | null> | null = null;

const SCRIPT_ID = 'welcometech-google-maps-script';

const toFiniteNumber = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const getGoogleMapsRuntimeConfig = async (): Promise<GoogleMapsRuntimeConfig | null> => {
  if (!settingsPromise) {
    settingsPromise = api
      .get('/settings')
      .then((res) => {
        const s = res?.data?.data || {};
        const key = String(s.googleMapsApiKey || '').trim();
        if (!key) return null;
        return {
          apiKey: key,
          mapId: String(s.googleMapsMapId || '').trim() || undefined,
          defaultCenter: {
            lat: toFiniteNumber(s.googleMapsDefaultCenterLat, 25.2854),
            lng: toFiniteNumber(s.googleMapsDefaultCenterLng, 51.531),
          },
          defaultZoom: toFiniteNumber(s.googleMapsDefaultZoom, 11),
          enabled: String(s.googleMapsStatus || 'inactive') === 'active',
        } as GoogleMapsRuntimeConfig;
      })
      .catch(() => null);
  }
  return settingsPromise;
};

export const resetGoogleMapsRuntimeCache = () => {
  settingsPromise = null;
};

export const loadGoogleMaps = async (apiKeyOverride?: string): Promise<void> => {
  const existingGoogle = (window as any).google;
  if (existingGoogle?.maps) return;

  if (!scriptPromise) {
    scriptPromise = (async () => {
      const cfg = await getGoogleMapsRuntimeConfig();
      const apiKey = String(apiKeyOverride || cfg?.apiKey || '').trim();
      if (!apiKey) {
        throw new Error('Google Maps is not configured or inactive in Settings.');
      }

      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (existing) {
        await new Promise<void>((resolve, reject) => {
          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script.')), { once: true });
        });
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Google Maps script.'));
        document.head.appendChild(script);
      });
    })();
  }

  try {
    await scriptPromise;
  } catch (err) {
    scriptPromise = null;
    throw err;
  }
};

export const reverseGeocodeLatLng = async (lat: number, lng: number): Promise<string | null> => {
  await loadGoogleMaps();
  const g = (window as any).google;
  if (!g?.maps?.Geocoder) return null;

  const geocoder = new g.maps.Geocoder();
  const result = await geocoder.geocode({ location: { lat, lng } });
  const first = result?.results?.[0];
  return first?.formatted_address || null;
};
