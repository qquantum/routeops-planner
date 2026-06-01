import {
  DispatchPoint,
  OptimizedRoute,
  OptimizationResult,
  RouteLeg,
  RouteStop,
  VendorInput
} from "@/lib/types";

const ROUTE_COLORS = [
  "#2563eb",
  "#059669",
  "#dc2626",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#be123c",
  "#4f46e5"
];

const AVERAGE_CITY_SPEED_KMH = 28;
const FUEL_LITERS_PER_KM = 0.105;
const STORE_STOPPAGE_MIN = 10;
const DRIVER_FRIENDLY_STOP_LIMIT = 10;

export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radiusKm = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * radiusKm * Math.asin(Math.sqrt(h));
}

export function optimizeRoutes(params: {
  dispatch: DispatchPoint;
  vendors: VendorInput[];
  totalVendors: number;
  inactiveVendors: VendorInput[];
  invalidRows: number;
  routeCount: number;
  maxStopsPerRoute?: number;
  issues: OptimizationResult["issues"];
  columnMapping: Record<string, string>;
}): OptimizationResult {
  const maxStopsPerRoute = params.maxStopsPerRoute && params.maxStopsPerRoute > 0
    ? params.maxStopsPerRoute
    : DRIVER_FRIENDLY_STOP_LIMIT;
  const minimumRoutesForDriverLinks = Math.ceil(params.vendors.length / maxStopsPerRoute) || 1;
  const requestedRouteCount = Math.max(params.routeCount, minimumRoutesForDriverLinks);
  const routeCount = Math.max(1, Math.min(requestedRouteCount, params.vendors.length || 1));
  const clustered = clusterBySweep(params.dispatch, params.vendors, routeCount, maxStopsPerRoute);
  const naiveDistance = closedLoopDistance(params.dispatch, params.vendors);

  const routes = clustered
    .filter((cluster) => cluster.length > 0)
    .map((cluster, index) => buildOptimizedRoute(params.dispatch, cluster, index));

  const totalDistanceKm = sum(routes.map((route) => route.totalDistanceKm));
  const totalDurationMin = sum(routes.map((route) => route.totalDurationMin));
  const fuelEstimateLiters = sum(routes.map((route) => route.fuelEstimateLiters));
  const routeEfficiencyPercent =
    naiveDistance > 0 ? Math.max(0, Math.min(100, ((naiveDistance - totalDistanceKm) / naiveDistance) * 100)) : 0;

  return {
    jobId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    dispatch: params.dispatch,
    summary: {
      totalVendors: params.totalVendors,
      activeVendors: params.vendors.length,
      inactiveVendors: params.inactiveVendors.length,
      invalidRows: params.invalidRows,
      totalDistanceKm: round(totalDistanceKm),
      totalDurationMin: Math.round(totalDurationMin),
      routeEfficiencyPercent: round(routeEfficiencyPercent),
      fuelEstimateLiters: round(fuelEstimateLiters)
    },
    routes,
    inactiveVendors: params.inactiveVendors,
    issues: params.issues,
    columnMapping: params.columnMapping
  };
}

function buildOptimizedRoute(dispatch: DispatchPoint, cluster: VendorInput[], index: number): OptimizedRoute {
  const ordered = twoOpt(dispatch, nearestNeighbor(dispatch, cluster));
  let previous = dispatch;
  let cumulativeMinutes = 0;
  const legs: RouteLeg[] = [];

  const stops: RouteStop[] = ordered.map((vendor, stopIndex) => {
    const distanceFromPreviousKm = haversineKm(previous, vendor);
    const durationFromPreviousMin = travelMinutes(distanceFromPreviousKm);
    cumulativeMinutes += durationFromPreviousMin + STORE_STOPPAGE_MIN;

    legs.push({
      legNumber: stopIndex + 1,
      fromName: previous.name,
      fromLatitude: previous.latitude,
      fromLongitude: previous.longitude,
      fromType: "activeFlag" in previous ? "vendor" : "dispatch",
      toName: vendor.name,
      toLatitude: vendor.latitude,
      toLongitude: vendor.longitude,
      toType: "vendor",
      toActiveFlag: vendor.activeFlag,
      distanceKm: round(distanceFromPreviousKm),
      durationMin: Math.round(durationFromPreviousMin),
      stoppageMin: STORE_STOPPAGE_MIN,
      cumulativeEtaMin: Math.round(cumulativeMinutes),
      driverInstruction: `Go from ${previous.name} to stop ${stopIndex + 1}: ${vendor.name}. Stop for ${STORE_STOPPAGE_MIN} minutes.`
    });

    previous = vendor;

    return {
      vendorName: vendor.name,
      latitude: vendor.latitude,
      longitude: vendor.longitude,
      activeFlag: vendor.activeFlag,
      sourceRow: vendor.sourceRow,
      stopSequence: stopIndex + 1,
      distanceFromPreviousKm: round(distanceFromPreviousKm),
      durationFromPreviousMin: Math.round(durationFromPreviousMin),
      stoppageMin: STORE_STOPPAGE_MIN,
      etaFromDispatchMin: Math.round(cumulativeMinutes)
    };
  });

  const returnDistanceKm = ordered.length > 0 ? haversineKm(previous, dispatch) : 0;
  const returnDurationMin = travelMinutes(returnDistanceKm);
  if (ordered.length > 0) {
    cumulativeMinutes += returnDurationMin;
    legs.push({
      legNumber: ordered.length + 1,
      fromName: previous.name,
      fromLatitude: previous.latitude,
      fromLongitude: previous.longitude,
      fromType: "vendor",
      toName: dispatch.name,
      toLatitude: dispatch.latitude,
      toLongitude: dispatch.longitude,
      toType: "dispatch",
      toActiveFlag: "N/A",
      distanceKm: round(returnDistanceKm),
      durationMin: Math.round(returnDurationMin),
      stoppageMin: 0,
      cumulativeEtaMin: Math.round(cumulativeMinutes),
      driverInstruction: `Return from ${previous.name} to dispatch: ${dispatch.name}.`
    });
  }

  const totalDistanceKm = closedLoopDistance(dispatch, ordered);
  const totalDurationMin = travelMinutes(totalDistanceKm) + ordered.length * STORE_STOPPAGE_MIN;
  const googleMapsUrl = buildGoogleMapsDirectionsUrl(dispatch, ordered);
  const path: Array<[number, number]> = [
    [dispatch.latitude, dispatch.longitude],
    ...ordered.map((vendor) => [vendor.latitude, vendor.longitude] as [number, number]),
    [dispatch.latitude, dispatch.longitude]
  ];

  return {
    id: `route-${index + 1}`,
    routeNumber: index + 1,
    vehicleName: `Vehicle ${index + 1}`,
    color: ROUTE_COLORS[index % ROUTE_COLORS.length],
    stops,
    legs,
    googleMapsUrl,
    googleMapsWaypointCount: ordered.length,
    driverNavigationNote:
      ordered.length <= DRIVER_FRIENDLY_STOP_LIMIT
        ? "Ready for one-tap Google Maps navigation."
        : `This route has ${ordered.length} stops. Split to ${DRIVER_FRIENDLY_STOP_LIMIT} stops or fewer for the easiest Google Maps driver experience.`,
    path,
    totalDistanceKm: round(totalDistanceKm),
    totalDurationMin: Math.round(totalDurationMin),
    fuelEstimateLiters: round(totalDistanceKm * FUEL_LITERS_PER_KM)
  };
}

function buildGoogleMapsDirectionsUrl(dispatch: DispatchPoint, ordered: VendorInput[]) {
  const params = new URLSearchParams({
    api: "1",
    origin: coordinate(dispatch),
    destination: coordinate(dispatch),
    travelmode: "driving"
  });

  if (ordered.length > 0) {
    params.set("waypoints", ordered.map(coordinate).join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function coordinate(point: { latitude: number; longitude: number }) {
  return `${point.latitude},${point.longitude}`;
}

function clusterBySweep(
  dispatch: DispatchPoint,
  vendors: VendorInput[],
  routeCount: number,
  maxStopsPerRoute?: number
) {
  const sorted = [...vendors].sort((a, b) => bearing(dispatch, a) - bearing(dispatch, b));
  const limit = maxStopsPerRoute && maxStopsPerRoute > 0 ? maxStopsPerRoute : Math.ceil(sorted.length / routeCount);
  const clusters = Array.from({ length: routeCount }, () => [] as VendorInput[]);

  sorted.forEach((vendor, index) => {
    const preferred = Math.min(routeCount - 1, Math.floor(index / limit));
    const targetIndex = findClusterWithRoom(clusters, preferred, limit);
    clusters[targetIndex].push(vendor);
  });

  return clusters;
}

function findClusterWithRoom(clusters: VendorInput[][], preferred: number, limit: number) {
  if (clusters[preferred].length < limit) {
    return preferred;
  }

  let bestIndex = preferred;
  let fewestStops = Number.MAX_SAFE_INTEGER;
  clusters.forEach((cluster, index) => {
    if (cluster.length < fewestStops) {
      fewestStops = cluster.length;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function nearestNeighbor(dispatch: DispatchPoint, vendors: VendorInput[]) {
  const remaining = [...vendors];
  const ordered: VendorInput[] = [];
  let current: DispatchPoint | VendorInput = dispatch;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.MAX_VALUE;
    remaining.forEach((vendor, index) => {
      const distance = haversineKm(current, vendor);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    current = next;
  }

  return ordered;
}

function twoOpt(dispatch: DispatchPoint, route: VendorInput[]) {
  if (route.length < 4) {
    return route;
  }

  let improved = true;
  let best = [...route];
  let bestDistance = closedLoopDistance(dispatch, best);
  let passes = 0;

  while (improved && passes < 60) {
    improved = false;
    passes += 1;

    for (let i = 0; i < best.length - 2; i += 1) {
      for (let j = i + 2; j < best.length; j += 1) {
        const candidate = [
          ...best.slice(0, i + 1),
          ...best.slice(i + 1, j + 1).reverse(),
          ...best.slice(j + 1)
        ];
        const candidateDistance = closedLoopDistance(dispatch, candidate);
        if (candidateDistance + 0.001 < bestDistance) {
          best = candidate;
          bestDistance = candidateDistance;
          improved = true;
        }
      }
    }
  }

  return best;
}

function closedLoopDistance(dispatch: DispatchPoint, route: Array<VendorInput | DispatchPoint>) {
  if (route.length === 0) {
    return 0;
  }

  let distance = haversineKm(dispatch, route[0]);
  for (let index = 0; index < route.length - 1; index += 1) {
    distance += haversineKm(route[index], route[index + 1]);
  }
  distance += haversineKm(route[route.length - 1], dispatch);
  return distance;
}

function bearing(dispatch: DispatchPoint, vendor: VendorInput) {
  const y = Math.sin(toRad(vendor.longitude - dispatch.longitude)) * Math.cos(toRad(vendor.latitude));
  const x =
    Math.cos(toRad(dispatch.latitude)) * Math.sin(toRad(vendor.latitude)) -
    Math.sin(toRad(dispatch.latitude)) *
      Math.cos(toRad(vendor.latitude)) *
      Math.cos(toRad(vendor.longitude - dispatch.longitude));

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function travelMinutes(distanceKm: number) {
  return (distanceKm / AVERAGE_CITY_SPEED_KMH) * 60;
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function toDeg(value: number) {
  return (value * 180) / Math.PI;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
