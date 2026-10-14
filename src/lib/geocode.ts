// Geocodificación con OpenStreetMap Nominatim (gratis, sin API key).
export async function geocode(address: string): Promise<{ lat: number; lng: number; label: string } | null> {
  if (!address || address.trim().length < 3) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "LiveProductionsGT/1.0 (admin@liveproductionsgt.com)" },
    });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
  } catch {
    return null;
  }
}
