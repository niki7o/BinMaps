export const environment = {
  production: false,
  apiUrl: '/api',
  hubUrl: '/hubs/containers',
  mapboxToken: 'pk.eyJ1IjoibmlrMXQwIiwiYSI6ImNtbmtxdWJvNDB6czMycXFzNnc0a2Fxd28ifQ.bxYODozyflCzkERqZHxX7Q',
  // Default map center / zoom. Used by home.ts, map.ts and
  // analytics-dashboard.component.ts instead of hardcoded literals, so the
  // deployment can be re-pointed at a different city without code changes.
  region: {
    name: 'Sofia',
    center: [42.6977, 23.3219] as [number, number],
    defaultZoom: 13
  }
};
