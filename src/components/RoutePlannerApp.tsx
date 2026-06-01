"use client";

import dynamic from "next/dynamic";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Fuel,
  Lock,
  MapPinned,
  Navigation,
  Route,
  Upload,
  Warehouse
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { OptimizationResult } from "@/lib/types";

const RouteMap = dynamic(() => import("@/components/RouteMap").then((mod) => mod.RouteMap), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map...</div>
});

const FIXED_DISPATCH = {
  name: "Dispatch Location",
  latitude: "12.973702",
  longitude: "80.254002"
};

const sampleCsv = `name,latitude,longitude,active_flag
Adyar Store,13.0067,80.2570,TRUE
Velachery Vendor,12.9756,80.2207,TRUE
Taramani Outlet,12.9869,80.2435,TRUE
Besant Nagar Store,12.9982,80.2668,TRUE
Inactive Old Vendor,12.9600,80.2400,FALSE
Guindy Hub,13.0102,80.2157,TRUE
Thiruvanmiyur Shop,12.9830,80.2594,TRUE
Pallikaranai Vendor,12.9349,80.2137,TRUE
Madipakkam Store,12.9647,80.1961,TRUE`;

export function RoutePlannerApp() {
  const [file, setFile] = useState<File | null>(null);
  const [routeCount, setRouteCount] = useState("1");
  const [maxStopsPerRoute, setMaxStopsPerRoute] = useState("10");
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<number | "all">("all");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState("");

  const visibleRoutes = useMemo(() => {
    if (!result) {
      return [];
    }
    return selectedRoute === "all"
      ? result.routes
      : result.routes.filter((route) => route.routeNumber === selectedRoute);
  }, [result, selectedRoute]);

  async function handleOptimize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsOptimizing(true);

    try {
      const activeFile = file ?? csvToFile(sampleCsv);
      const formData = new FormData();
      formData.append("file", activeFile);
      formData.append("dispatchName", FIXED_DISPATCH.name);
      formData.append("dispatchLatitude", FIXED_DISPATCH.latitude);
      formData.append("dispatchLongitude", FIXED_DISPATCH.longitude);
      formData.append("routeCount", routeCount);
      formData.append("maxStopsPerRoute", maxStopsPerRoute);

      const response = await fetch("/api/optimize", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Optimization failed.");
      }
      setResult(payload);
      setSelectedRoute("all");
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Optimization failed.");
    } finally {
      setIsOptimizing(false);
    }
  }

  async function handleExport() {
    if (!result) {
      return;
    }

    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result)
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `optimized-routes-${result.jobId}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <nav className="topbar">
        <div>
          <div className="brand">
            <span className="brand-icon">
              <Route size={19} />
            </span>
            RouteOps Planner
          </div>
          <p>Vendor delivery planning, active-route filtering, and closed-loop optimization.</p>
        </div>
        <button className="secondary-button" onClick={handleExport} disabled={!result}>
          <Download size={16} />
          Export Excel
        </button>
      </nav>

      <section className="workspace-grid">
        <aside className="sidebar">
          <form className="panel" onSubmit={handleOptimize}>
            <div className="panel-heading">
              <FileSpreadsheet size={18} />
              <div>
                <h2>Upload vendors</h2>
                <p>XLSX or CSV with name, latitude, longitude, active_flag.</p>
              </div>
            </div>

            <label className="upload-zone">
              <Upload size={20} />
              <span>{file ? file.name : "Choose Excel / CSV file"}</span>
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <div className={file ? "upload-status uploaded" : "upload-status"}>
              {file ? <CheckCircle2 size={15} /> : <FileSpreadsheet size={15} />}
              <span>
                {file
                  ? `Excel uploaded on platform: ${file.name}`
                  : "No Excel uploaded yet. Sample file will be used for testing."}
              </span>
            </div>
            <p className="helper">No file selected? The app runs with a sample vendor file for quick testing.</p>

            <div className="field-group">
              <label>
                Dispatch name
                <input value={FIXED_DISPATCH.name} readOnly />
              </label>
              <div className="two-col">
                <label>
                  Latitude
                  <input value={FIXED_DISPATCH.latitude} readOnly />
                </label>
                <label>
                  Longitude
                  <input value={FIXED_DISPATCH.longitude} readOnly />
                </label>
              </div>
              <div className="locked-note">
                <Lock size={14} />
                Fixed dispatch point used for every route.
              </div>
              <div className="two-col">
                <label>
                  Vehicles
                  <input value={routeCount} onChange={(event) => setRouteCount(event.target.value)} />
                </label>
                <label>
                  Max stops
                  <input
                    placeholder="Auto"
                    value={maxStopsPerRoute}
                    onChange={(event) => setMaxStopsPerRoute(event.target.value)}
                  />
                </label>
              </div>
            </div>

            <button className="primary-button" disabled={isOptimizing}>
              <MapPinned size={16} />
              {isOptimizing ? "Optimizing..." : "Optimize Routes"}
            </button>

            {error ? (
              <div className="error-box">
                <AlertCircle size={16} />
                {error}
              </div>
            ) : null}
          </form>

          <div className="panel">
            <div className="panel-heading">
              <Warehouse size={18} />
              <div>
                <h2>Route filters</h2>
                <p>Show one vehicle route or the full dispatch plan.</p>
              </div>
            </div>
            <div className="route-filter">
              <button
                className={selectedRoute === "all" ? "chip active" : "chip"}
                onClick={() => setSelectedRoute("all")}
                disabled={!result}
              >
                All routes
              </button>
              {result?.routes.map((route) => (
                <button
                  key={route.id}
                  className={selectedRoute === route.routeNumber ? "chip active" : "chip"}
                  onClick={() => setSelectedRoute(route.routeNumber)}
                  style={{ borderColor: route.color }}
                >
                  Route {route.routeNumber}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="main-area">
          <div className="metrics-grid">
            <Metric icon={<Warehouse size={18} />} label="Total vendors" value={result?.summary.totalVendors ?? 0} />
            <Metric icon={<CheckCircle2 size={18} />} label="Active vendors" value={result?.summary.activeVendors ?? 0} />
            <Metric icon={<Route size={18} />} label="Distance" value={`${result?.summary.totalDistanceKm ?? 0} km`} />
            <Metric icon={<Fuel size={18} />} label="Fuel estimate" value={`${result?.summary.fuelEstimateLiters ?? 0} L`} />
          </div>

          <div className="map-panel">
            <RouteMap result={result} routes={visibleRoutes} />
          </div>

          <section className="panel driver-panel">
            <div className="panel-heading row-between">
              <div className="panel-heading compact-heading">
                <Navigation size={18} />
                <div>
                  <h2>Driver navigation</h2>
                  <p>Drivers should open this on their phone at dispatch; Google Maps uses current location and shows Start.</p>
                </div>
              </div>
              <span className="status-pill">Free Google Maps links</span>
            </div>
            <div className="driver-link-grid">
              {result?.routes.map((route) => (
                <article className="driver-route-card" key={route.id} style={{ borderLeftColor: route.color }}>
                  <div>
                    <strong>Route {route.routeNumber}</strong>
                    <span>
                      {route.stops.length} vendors - {route.totalDistanceKm} km - {route.totalDurationMin} min
                    </span>
                    <small>{route.driverNavigationNote}</small>
                  </div>
                  <a href={route.googleMapsUrl} target="_blank" rel="noreferrer" className="maps-button">
                    <ExternalLink size={15} />
                    Open Maps
                  </a>
                </article>
              ))}
              {!result ? (
                <div className="empty-driver-state">
                  Optimize routes to generate one-tap Google Maps links for drivers.
                </div>
              ) : null}
            </div>
          </section>

          <div className="content-grid">
            <section className="panel table-panel">
              <div className="panel-heading row-between">
                <div>
                  <h2>Vendor stop sequence</h2>
                  <p>Every route starts and returns to the dispatch location.</p>
                </div>
                <span className="status-pill">Closed-loop VRP</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Stop</th>
                      <th>Vendor</th>
                      <th>Distance</th>
                      <th>ETA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRoutes.flatMap((route) =>
                      route.stops.map((stop) => (
                        <tr key={`${route.id}-${stop.stopSequence}`}>
                          <td>
                            <span className="route-dot" style={{ background: route.color }} />
                            {route.routeNumber}
                          </td>
                          <td>{stop.stopSequence}</td>
                          <td>{stop.vendorName}</td>
                          <td>{stop.distanceFromPreviousKm} km</td>
                          <td>{stop.etaFromDispatchMin} min</td>
                        </tr>
                      ))
                    )}
                    {!result ? (
                      <tr>
                        <td colSpan={5}>Upload a vendor sheet or run the sample data to see route sequencing.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <AlertCircle size={18} />
                <div>
                  <h2>Validation report</h2>
                  <p>Inactive vendors are ignored automatically.</p>
                </div>
              </div>
              <div className="report-list">
                <ReportRow label="Inactive ignored" value={result?.summary.inactiveVendors ?? 0} />
                <ReportRow label="Invalid rows" value={result?.summary.invalidRows ?? 0} />
                <ReportRow label="Efficiency gain" value={`${result?.summary.routeEfficiencyPercent ?? 0}%`} />
                <ReportRow label="Delivery time" value={`${result?.summary.totalDurationMin ?? 0} min`} />
                <ReportRow label="Store stoppage" value="10 min / stop" />
              </div>
              <div className="architecture-note">
                <strong>Production path:</strong> replace the current Haversine matrix with OSRM/OpenRouteService
                road matrices, then persist jobs in Postgres and run optimization in a worker.
              </div>
            </section>
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="metric-card">
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function ReportRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="report-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function csvToFile(csv: string) {
  return new File([csv], "sample-vendors.csv", { type: "text/csv" });
}
