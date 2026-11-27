/**
 * Reads a location out of whatever a user copies from Google Maps (or types by hand), with no
 * network call and no API key:
 *   - plain coordinates:            "17.4484, 78.4295"  /  "17.4484 78.4295"
 *   - a place link:                 https://www.google.com/maps/place/Mepstra+Power/@17.44,78.42,17z/data=...!3d17.4485!4d78.4297...
 *   - a map view link:              https://www.google.com/maps/@17.4484765,78.4295541,17z
 *   - search / pin links:           ...maps?q=17.44,78.42   ...?ll=...   ...?query=...   ...?destination=...
 * Short links (maps.app.goo.gl / goo.gl/maps) only redirect and contain no coordinates, so they are
 * reported as such and the user is asked to open the link and copy the full URL instead.
 */
export type MapLinkResult =
  | { ok: true; lat: number; lng: number; placeName?: string; source: string }
  | { ok: false; error: string };

const NUMBER = String.raw`-?\d{1,3}(?:\.\d+)?`;

const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

const round = (value: number) => Number(value.toFixed(6));

function placeNameFrom(url: string): string | undefined {
  const match = url.match(/\/maps\/place\/([^/@?]+)/i);
  if (!match) return undefined;
  try {
    const name = decodeURIComponent(match[1].replace(/\+/g, " ")).trim();
    // A place segment that is itself just coordinates is not a name.
    return name && !new RegExp(`^${NUMBER}\\s*,\\s*${NUMBER}$`).test(name) ? name : undefined;
  } catch {
    return undefined;
  }
}

export function parseMapLink(raw: string): MapLinkResult {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Paste a Google Maps link or coordinates such as 17.4484, 78.4295." };

  // 1. Plain coordinates typed or copied from Google Maps' right-click menu.
  const plain = text.match(new RegExp(`^\\(?\\s*(${NUMBER})\\s*[,\\s]\\s*(${NUMBER})\\s*\\)?$`));
  if (plain) {
    const lat = Number(plain[1]);
    const lng = Number(plain[2]);
    return valid(lat, lng)
      ? { ok: true, lat: round(lat), lng: round(lng), source: "coordinates" }
      : { ok: false, error: "Latitude must be between -90 and 90 and longitude between -180 and 180." };
  }

  if (!/^https?:\/\//i.test(text) && !/google\.[a-z.]+\/maps|maps\.google\./i.test(text)) {
    return { ok: false, error: "That doesn't look like a Google Maps link or a pair of coordinates." };
  }

  if (/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(text)) {
    return { ok: false, error: "Short links (maps.app.goo.gl) don't contain the location. Open the link in your browser, then copy the full address from the address bar and paste it here." };
  }

  let decoded = text;
  try { decoded = decodeURIComponent(text); } catch { /* keep the raw text */ }
  const placeName = placeNameFrom(text);

  // 2. The pin of a selected place: "!3d<lat>!4d<lng>" — the most accurate value in a place link.
  const pin = [...decoded.matchAll(new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`, "g"))].pop();
  if (pin && valid(Number(pin[1]), Number(pin[2]))) {
    return { ok: true, lat: round(Number(pin[1])), lng: round(Number(pin[2])), placeName, source: "place pin" };
  }

  // 3. Explicit coordinates in a query parameter.
  const query = decoded.match(new RegExp(`[?&](?:q|query|ll|sll|center|destination|daddr|saddr)=(?:loc:)?\\s*(${NUMBER})\\s*,\\s*(${NUMBER})`, "i"));
  if (query && valid(Number(query[1]), Number(query[2]))) {
    return { ok: true, lat: round(Number(query[1])), lng: round(Number(query[2])), placeName, source: "link coordinates" };
  }

  // 4. The map view centre: "@<lat>,<lng>,<zoom>z". Close to, but not exactly on, a selected place.
  const view = decoded.match(new RegExp(`@(${NUMBER}),(${NUMBER})(?:,|$)`));
  if (view && valid(Number(view[1]), Number(view[2]))) {
    return { ok: true, lat: round(Number(view[1])), lng: round(Number(view[2])), placeName, source: placeName ? "map view" : "map centre" };
  }

  return { ok: false, error: "No location found in this link. In Google Maps, click the place (or right-click the exact spot and copy its coordinates), then copy the link again." };
}

export const googleMapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
