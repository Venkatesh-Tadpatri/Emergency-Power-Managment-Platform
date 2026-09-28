// Open-Meteo (open-meteo.com) — free, no API key, no account required, up to 10,000
// calls/day. Chosen specifically so this feature has zero cost and no credential to manage.

export interface WeatherInfo {
  tempC: number;
  rainChancePct: number;
  windKmh: number;
  emoji: string;
  description: string;
}

// WMO weather codes (used by Open-Meteo's `weather_code`) collapsed to what this UI needs.
function describeWeatherCode(code: number): { emoji: string; description: string } {
  if (code === 0) return { emoji: "☀️", description: "Clear" };
  if (code <= 2) return { emoji: "🌤️", description: "Partly Cloudy" };
  if (code === 3) return { emoji: "☁️", description: "Cloudy" };
  if (code === 45 || code === 48) return { emoji: "🌫️", description: "Fog" };
  if (code >= 51 && code <= 67) return { emoji: "🌧️", description: "Rain" };
  if (code >= 71 && code <= 77) return { emoji: "🌨️", description: "Snow" };
  if (code >= 80 && code <= 82) return { emoji: "🌧️", description: "Rain Showers" };
  if (code >= 95) return { emoji: "⛈️", description: "Thunderstorm" };
  return { emoji: "☁️", description: "Cloudy" };
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { data: WeatherInfo; fetchedAt: number }>();
const inFlight = new Map<string, Promise<WeatherInfo | null>>();

// Round to ~1.1km precision so nearby facilities share one call instead of one each —
// weather doesn't meaningfully differ at that scale, and it keeps call volume trivial.
function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

export async function fetchWeather(lat: number, lng: number): Promise<WeatherInfo | null> {
  const key = cacheKey(lat, lng);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,weather_code&hourly=precipitation_probability&forecast_days=1&timezone=auto`;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const json = await resp.json();

      const current = json.current;
      const hourlyTimes: string[] = json.hourly?.time || [];
      const hourlyRainPct: number[] = json.hourly?.precipitation_probability || [];
      // Match the current hour's forecast slot for a "chance of rain" figure — Open-Meteo's
      // `current` block only reports precipitation actually falling right now, not a probability.
      const idx = hourlyTimes.indexOf(current.time.slice(0, 13) + ":00");
      const rainChancePct = idx >= 0 ? hourlyRainPct[idx] : 0;

      const { emoji, description } = describeWeatherCode(current.weather_code);
      const data: WeatherInfo = {
        tempC: Math.round(current.temperature_2m),
        rainChancePct: Math.round(rainChancePct ?? 0),
        windKmh: Math.round(current.wind_speed_10m),
        emoji,
        description,
      };
      cache.set(key, { data, fetchedAt: Date.now() });
      return data;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}
