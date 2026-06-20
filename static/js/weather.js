/*
 * weather.js — shared weather helpers: WMO code -> label/icon, wind direction,
 * and the API fetch. Keeps the views thin.
 */
(function () {
  const { url } = window.Skyward;

  // WMO weather interpretation codes (Open-Meteo) -> short label + glyph.
  const WMO = {
    0:  ["Clear", "☀"],
    1:  ["Mostly clear", "🌤"],
    2:  ["Partly cloudy", "⛅"],
    3:  ["Overcast", "☁"],
    45: ["Fog", "🌫"], 48: ["Rime fog", "🌫"],
    51: ["Light drizzle", "🌦"], 53: ["Drizzle", "🌦"], 55: ["Heavy drizzle", "🌧"],
    56: ["Freezing drizzle", "🌧"], 57: ["Freezing drizzle", "🌧"],
    61: ["Light rain", "🌦"], 63: ["Rain", "🌧"], 65: ["Heavy rain", "🌧"],
    66: ["Freezing rain", "🌧"], 67: ["Freezing rain", "🌧"],
    71: ["Light snow", "🌨"], 73: ["Snow", "🌨"], 75: ["Heavy snow", "❄"],
    77: ["Snow grains", "🌨"],
    80: ["Showers", "🌦"], 81: ["Showers", "🌧"], 82: ["Violent showers", "⛈"],
    85: ["Snow showers", "🌨"], 86: ["Snow showers", "❄"],
    95: ["Thunderstorm", "⛈"], 96: ["Thunderstorm + hail", "⛈"], 99: ["Severe thunderstorm", "⛈"],
  };

  function wx(code) { return WMO[code] || ["—", "·"]; }

  function compass(deg) {
    if (deg == null) return "";
    const dirs = ["N","NE","E","SE","S","SW","W","NW"];
    return dirs[Math.round(deg / 45) % 8];
  }

  // Investigate's point forecast comes from Open-Meteo (/api/weather), which
  // interpolates to the EXACT crosshair point at its real ground elevation.
  // (The Met Office Site-Specific API was trialled here but snaps to its nearest
  // named forecast site — often a mountain summit in the Highlands — so a
  // sea-level crosshair could return a summit forecast. Open-Meteo keeps the
  // crosshair honest about where it points. The Met Office remains the source on
  // the Forecast tab, where snapping to a named site is exactly what's wanted.)
  async function fetchWeather(lat, lon) {
    const res = await fetch(url(`api/weather?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`));
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `Weather request failed (${res.status})`);
    }
    return res.json();
  }

  window.Skyward.weather = { wx, compass, fetchWeather };
})();
