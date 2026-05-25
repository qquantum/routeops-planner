"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";
import { OptimizedRoute, OptimizationResult } from "@/lib/types";

const dispatchIcon = L.divIcon({
  className: "dispatch-marker",
  html: "<span>H</span>",
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

export function RouteMap({
  result,
  routes
}: {
  result: OptimizationResult | null;
  routes: OptimizedRoute[];
}) {
  const center: [number, number] = result
    ? [result.dispatch.latitude, result.dispatch.longitude]
    : [28.6139, 77.209];

  return (
    <MapContainer center={center} zoom={10} scrollWheelZoom className="route-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {result ? (
        <>
          <Marker position={[result.dispatch.latitude, result.dispatch.longitude]} icon={dispatchIcon}>
            <Popup>
              <strong>{result.dispatch.name}</strong>
              <br />
              Dispatch start and return point
            </Popup>
          </Marker>
          {routes.map((route) => (
            <RouteLayer key={route.id} route={route} />
          ))}
          <FitBounds result={result} routes={routes} />
        </>
      ) : null}
    </MapContainer>
  );
}

function RouteLayer({ route }: { route: OptimizedRoute }) {
  return (
    <>
      <Polyline positions={route.path} pathOptions={{ color: route.color, weight: 5, opacity: 0.78 }}>
        <Tooltip sticky className="route-hover-tooltip">
          <strong>Route {route.routeNumber}</strong>
          <span>{route.vehicleName}</span>
          <span>{route.stops.length} active vendor stops</span>
          <span>{route.totalDistanceKm} km, {route.totalDurationMin} min</span>
          <span>Closed loop: dispatch return included</span>
        </Tooltip>
      </Polyline>
      {route.stops.map((stop) => (
        <Marker
          key={`${route.id}-${stop.stopSequence}`}
          position={[stop.latitude, stop.longitude]}
          icon={numberedStopIcon(stop.stopSequence, route.color)}
        >
          <Tooltip direction="top" offset={[0, -14]} opacity={1} className="vendor-hover-tooltip">
            <strong>{stop.vendorName}</strong>
            <span>Route {route.routeNumber}, stop {stop.stopSequence}</span>
            <span>Lat: {stop.latitude}</span>
            <span>Lon: {stop.longitude}</span>
            <span>Active flag: {String(stop.activeFlag).toUpperCase()}</span>
            <span>From previous: {stop.distanceFromPreviousKm} km</span>
            <span>ETA from dispatch: {stop.etaFromDispatchMin} min</span>
          </Tooltip>
          <Popup>
            <strong>{stop.vendorName}</strong>
            <br />
            Route {route.routeNumber}, stop {stop.stopSequence}
            <br />
            Lat: {stop.latitude}, Lon: {stop.longitude}
            <br />
            Active flag: {String(stop.activeFlag).toUpperCase()}
            <br />
            ETA: {stop.etaFromDispatchMin} min
            <br />
            From previous: {stop.distanceFromPreviousKm} km
          </Popup>
        </Marker>
      ))}
    </>
  );
}

function numberedStopIcon(sequence: number, color: string) {
  return L.divIcon({
    className: "numbered-stop-marker",
    html: `<span style="border-color:${color};color:${color}">${sequence}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
}

function FitBounds({ result, routes }: { result: OptimizationResult; routes: OptimizedRoute[] }) {
  const map = useMap();

  useEffect(() => {
    const points = [
      [result.dispatch.latitude, result.dispatch.longitude] as [number, number],
      ...routes.flatMap((route) => route.stops.map((stop) => [stop.latitude, stop.longitude] as [number, number]))
    ];
    if (points.length > 1) {
      map.fitBounds(points, { padding: [36, 36] });
    }
  }, [map, result, routes]);

  return null;
}
