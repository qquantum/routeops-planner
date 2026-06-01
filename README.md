# RouteOps Planner

Production-oriented route optimization and vendor delivery planning app for 70+ vendors.

## What Is Built

- XLSX/CSV upload with auto-detected columns.
- Required vendor fields: `name`, `latitude`, `longitude`, `active_flag`.
- Optional driver fields: `quantity_bundle`, `phone_number`.
- Automatic filtering so only `active_flag = TRUE` vendors are routed.
- Closed-loop routing: dispatch depot -> vendor stops -> same dispatch depot.
- Multi-vehicle route grouping.
- Nearest-neighbor + 2-opt route optimization.
- Leaflet/OpenStreetMap route visualization.
- Vendor stop sequence table with route filters.
- Optimized Excel export with route summary, stop sequence, active vendors, inactive vendors, and validation issues.
- Driver Excel sheets include quantity/bundle, phone number, delivery check column, and Google Maps navigation links.

## Run Locally

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:3000
```

If no file is uploaded, the app uses built-in sample vendor data so the full workflow can be tested immediately.

## Application Structure

```txt
src/app/page.tsx                 Main app page
src/app/api/optimize/route.ts    Upload, parse, validate, optimize
src/app/api/export/route.ts      XLSX export endpoint
src/components/RoutePlannerApp.tsx
src/components/RouteMap.tsx
src/lib/excel.ts                 Excel/CSV parsing and workbook export
src/lib/optimizer.ts             Clustering, TSP-style sequencing, route metrics
src/lib/types.ts                 Shared domain types
```

## Current Optimization Engine

The current implementation uses a free, self-contained optimizer:

- sweep clustering around the dispatch point,
- nearest-neighbor route construction,
- 2-opt improvement,
- Haversine distance matrix,
- closed-loop distance and ETA calculations.

This is suitable for early production use with 70+ vendors and no paid routing API.

## Production Upgrade Path

For road-accurate routing, replace the Haversine matrix in `src/lib/optimizer.ts` with:

- self-hosted OSRM for lowest operating cost,
- OpenRouteService for managed free/paid API usage,
- Google Maps, Mapbox, or HERE for traffic-aware production routing.

For larger jobs, move optimization into:

- FastAPI worker service,
- Redis queue,
- PostgreSQL job persistence,
- object storage for uploaded/exported workbooks.

## Suggested Database Schema

```sql
optimization_jobs (
  id uuid primary key,
  user_id uuid,
  file_name text,
  status text,
  dispatch_name text,
  dispatch_latitude numeric,
  dispatch_longitude numeric,
  total_vendors int,
  active_vendors int,
  inactive_vendors int,
  total_distance_km numeric,
  total_duration_min numeric,
  created_at timestamptz,
  completed_at timestamptz
);

vendors (
  id uuid primary key,
  job_id uuid references optimization_jobs(id),
  name text,
  latitude numeric,
  longitude numeric,
  active_flag boolean,
  validation_status text,
  validation_error text
);

routes (
  id uuid primary key,
  job_id uuid references optimization_jobs(id),
  route_number int,
  vehicle_name text,
  color text,
  total_distance_km numeric,
  total_duration_min numeric,
  geometry_json jsonb
);

route_stops (
  id uuid primary key,
  route_id uuid references routes(id),
  vendor_id uuid references vendors(id),
  stop_sequence int,
  distance_from_previous_km numeric,
  duration_from_previous_min numeric,
  eta_from_dispatch_min int
);
```

## Free Deployment Architecture

- Frontend/API: Vercel.
- Database: Supabase Postgres free tier.
- Routing: Haversine for MVP, self-hosted OSRM for production.
- Map: Leaflet with OpenStreetMap tiles.
- Storage: Supabase Storage or S3-compatible storage.

Note: heavy commercial OpenStreetMap tile usage should use a commercial tile provider or self-hosted tiles.

## Paid Upgrade Options

| Need | Option |
| --- | --- |
| Traffic-aware ETAs | Google Maps, HERE, Mapbox |
| Managed routing matrix | OpenRouteService, Mapbox Matrix |
| Enterprise database | Supabase Pro, AWS RDS, Cloud SQL |
| Large optimization jobs | Dedicated worker service, Kubernetes, Cloud Run |
| Live fleet tracking | Mapbox/HERE + mobile driver app |

## Verification

```bash
npm run build
```

The current build passes successfully.
