export type VendorInput = {
  name: string;
  latitude: number;
  longitude: number;
  activeFlag: boolean;
  sourceRow: number;
};

export type ValidationIssue = {
  row: number;
  severity: "error" | "warning";
  message: string;
  raw?: Record<string, unknown>;
};

export type DispatchPoint = {
  name: string;
  latitude: number;
  longitude: number;
};

export type RouteStop = {
  vendorName: string;
  latitude: number;
  longitude: number;
  activeFlag: boolean;
  sourceRow: number;
  stopSequence: number;
  distanceFromPreviousKm: number;
  durationFromPreviousMin: number;
  stoppageMin: number;
  etaFromDispatchMin: number;
};

export type RouteLeg = {
  legNumber: number;
  fromName: string;
  fromLatitude: number;
  fromLongitude: number;
  fromType: "dispatch" | "vendor";
  toName: string;
  toLatitude: number;
  toLongitude: number;
  toType: "dispatch" | "vendor";
  toActiveFlag: boolean | "N/A";
  distanceKm: number;
  durationMin: number;
  stoppageMin: number;
  cumulativeEtaMin: number;
  driverInstruction: string;
};

export type OptimizedRoute = {
  id: string;
  routeNumber: number;
  vehicleName: string;
  color: string;
  stops: RouteStop[];
  legs: RouteLeg[];
  path: Array<[number, number]>;
  totalDistanceKm: number;
  totalDurationMin: number;
  fuelEstimateLiters: number;
};

export type OptimizationSummary = {
  totalVendors: number;
  activeVendors: number;
  inactiveVendors: number;
  invalidRows: number;
  totalDistanceKm: number;
  totalDurationMin: number;
  routeEfficiencyPercent: number;
  fuelEstimateLiters: number;
};

export type OptimizationResult = {
  jobId: string;
  createdAt: string;
  dispatch: DispatchPoint;
  summary: OptimizationSummary;
  routes: OptimizedRoute[];
  inactiveVendors: VendorInput[];
  issues: ValidationIssue[];
  columnMapping: Record<string, string>;
};
