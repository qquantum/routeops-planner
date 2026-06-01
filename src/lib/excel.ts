import ExcelJS from "exceljs";
import { ValidationIssue, VendorInput } from "@/lib/types";

type ParsedWorkbook = {
  vendors: VendorInput[];
  inactiveVendors: VendorInput[];
  issues: ValidationIssue[];
  totalRows: number;
  columnMapping: Record<string, string>;
};

const COLUMN_ALIASES = {
  name: ["name", "vendor_name", "vendor", "customer_name", "supplier_name", "outlet_name", "client_name"],
  latitude: ["latitude", "lat", "vendor_lat", "customer_lat", "gps_latitude"],
  longitude: ["longitude", "lng", "lon", "long", "vendor_lng", "vendor_long", "customer_lng", "gps_longitude"],
  active_flag: ["active_flag", "active", "is_active", "enabled", "status", "dispatch_active"],
  quantity_bundle: ["quantity_bundle", "qty_bundle", "quantity", "qty", "bundle", "bundles", "allocation", "supply_qty"],
  phone_number: ["phone_number", "phone", "mobile", "mobile_number", "contact", "contact_number", "vendor_phone"]
};

export async function parseVendorWorkbook(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer();
  const rows = file.name.toLowerCase().endsWith(".csv")
    ? parseCsvRows(await file.text())
    : await parseXlsxRows(buffer);
  const columnMapping = detectColumns(rows);
  const issues: ValidationIssue[] = [];
  const vendors: VendorInput[] = [];
  const inactiveVendors: VendorInput[] = [];

  if (!columnMapping.name || !columnMapping.latitude || !columnMapping.longitude || !columnMapping.active_flag) {
    issues.push({
      row: 1,
      severity: "error",
      message: "Required columns not found. Expected name, latitude, longitude, active_flag."
    });
  }

  rows.forEach((row, index) => {
    const sourceRow = index + 2;
    const name = String(row[columnMapping.name] ?? "").trim();
    const latitude = toNumber(row[columnMapping.latitude]);
    const longitude = toNumber(row[columnMapping.longitude]);
    const activeFlag = parseActiveFlag(row[columnMapping.active_flag]);
    const quantityBundle = optionalText(row[columnMapping.quantity_bundle]);
    const phoneNumber = optionalText(row[columnMapping.phone_number]);

    if (!name) {
      issues.push({ row: sourceRow, severity: "error", message: "Vendor name is missing.", raw: row });
      return;
    }

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      issues.push({ row: sourceRow, severity: "error", message: `Invalid latitude for ${name}.`, raw: row });
      return;
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      issues.push({ row: sourceRow, severity: "error", message: `Invalid longitude for ${name}.`, raw: row });
      return;
    }

    if (activeFlag === null) {
      issues.push({
        row: sourceRow,
        severity: "error",
        message: `active_flag could not be parsed for ${name}. Use TRUE/FALSE, Yes/No, 1/0, Active/Inactive.`,
        raw: row
      });
      return;
    }

    const vendor = { name, latitude, longitude, activeFlag, quantityBundle, phoneNumber, sourceRow };
    if (activeFlag) {
      vendors.push(vendor);
    } else {
      inactiveVendors.push(vendor);
    }
  });

  return {
    vendors,
    inactiveVendors,
    issues,
    totalRows: rows.length,
    columnMapping
  };
}

export async function buildOptimizedWorkbook(result: import("@/lib/types").OptimizationResult) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RouteOps Planner";
  workbook.created = new Date();

  addSheet(
    workbook,
    "Route Summary",
    [
      {
        job_id: result.jobId,
        created_at: result.createdAt,
        dispatch: result.dispatch.name,
        active_vendors: result.summary.activeVendors,
        inactive_vendors: result.summary.inactiveVendors,
        total_distance_km: result.summary.totalDistanceKm,
        estimated_delivery_time_min: result.summary.totalDurationMin,
        stoppage_rule: "10 minutes per active vendor stop",
        fuel_estimate_liters: result.summary.fuelEstimateLiters,
        route_efficiency_percent: result.summary.routeEfficiencyPercent
      }
    ]
  );

  const stopRows = result.routes.flatMap((route) => [
    {
      route_number: route.routeNumber,
      vehicle: route.vehicleName,
      stop_sequence: 0,
      vendor_name: `${result.dispatch.name} (START)`,
      latitude: result.dispatch.latitude,
      longitude: result.dispatch.longitude,
      active_flag: "N/A",
      quantity_bundle: "N/A",
      phone_number: "N/A",
      delivery_check: "[ ]",
      distance_from_previous_km: 0,
      drive_time_from_previous_min: 0,
      stoppage_min: 0,
      eta_from_dispatch_min: 0
    },
    ...route.stops.map((stop) => ({
      route_number: route.routeNumber,
      vehicle: route.vehicleName,
      stop_sequence: stop.stopSequence,
      vendor_name: stop.vendorName,
      latitude: stop.latitude,
      longitude: stop.longitude,
      active_flag: stop.activeFlag,
      quantity_bundle: stop.quantityBundle,
      phone_number: stop.phoneNumber,
      delivery_check: "[ ]",
      distance_from_previous_km: stop.distanceFromPreviousKm,
      drive_time_from_previous_min: stop.durationFromPreviousMin,
      stoppage_min: stop.stoppageMin,
      eta_from_dispatch_min: stop.etaFromDispatchMin
    })),
    {
      route_number: route.routeNumber,
      vehicle: route.vehicleName,
      stop_sequence: route.stops.length + 1,
      vendor_name: `${result.dispatch.name} (RETURN)`,
      latitude: result.dispatch.latitude,
      longitude: result.dispatch.longitude,
      active_flag: "N/A",
      quantity_bundle: "N/A",
      phone_number: "N/A",
      delivery_check: "[ ]",
      distance_from_previous_km: route.legs.at(-1)?.distanceKm ?? "",
      drive_time_from_previous_min: route.legs.at(-1)?.durationMin ?? "",
      stoppage_min: 0,
      eta_from_dispatch_min: route.totalDurationMin
    }
  ]);

  addSheet(workbook, "Stop Sequence", stopRows);

  addSheet(
    workbook,
    "Driver Links",
    result.routes.map((route) => ({
      route_number: route.routeNumber,
      vehicle: route.vehicleName,
      stop_count: route.stops.length,
      total_distance_km: route.totalDistanceKm,
      total_time_min: route.totalDurationMin,
      google_maps_navigation: mapsLinkCell(route.googleMapsUrl),
      navigation_note: route.driverNavigationNote
    }))
  );

  addSheet(
    workbook,
    "Driver Route",
    result.routes.flatMap((route) =>
      route.legs.map((leg) => ({
        route_number: route.routeNumber,
        vehicle: route.vehicleName,
        leg_number: leg.legNumber,
        instruction: leg.driverInstruction,
        from_name: leg.fromName,
        from_type: leg.fromType,
        from_latitude: leg.fromLatitude,
        from_longitude: leg.fromLongitude,
        to_name: leg.toName,
        to_type: leg.toType,
        to_latitude: leg.toLatitude,
        to_longitude: leg.toLongitude,
        to_active_flag: leg.toActiveFlag,
        to_quantity_bundle: leg.toQuantityBundle,
        to_phone_number: leg.toPhoneNumber,
        delivery_check: leg.toType === "vendor" ? "[ ]" : "N/A",
        distance_km: leg.distanceKm,
        estimated_drive_min: leg.durationMin,
        stoppage_min: leg.stoppageMin,
        cumulative_eta_min: leg.cumulativeEtaMin,
        google_maps_navigation: mapsLinkCell(route.googleMapsUrl)
      }))
    )
  );

  result.routes.forEach((route) => {
    addSheet(
      workbook,
      `Route ${route.routeNumber}`,
      route.legs.map((leg) => ({
        vehicle: route.vehicleName,
        leg_number: leg.legNumber,
        instruction: leg.driverInstruction,
        from_name: leg.fromName,
        from_latitude: leg.fromLatitude,
        from_longitude: leg.fromLongitude,
        to_name: leg.toName,
        to_latitude: leg.toLatitude,
        to_longitude: leg.toLongitude,
        to_active_flag: leg.toActiveFlag,
        to_quantity_bundle: leg.toQuantityBundle,
        to_phone_number: leg.toPhoneNumber,
        delivery_check: leg.toType === "vendor" ? "[ ]" : "N/A",
        distance_km: leg.distanceKm,
        estimated_drive_min: leg.durationMin,
        stoppage_min: leg.stoppageMin,
        cumulative_eta_min: leg.cumulativeEtaMin,
        google_maps_navigation: mapsLinkCell(route.googleMapsUrl)
      }))
    );
  });

  addSheet(
    workbook,
    "Active Vendors",
    result.routes.flatMap((route) =>
      route.stops.map((stop) => ({
        route_number: route.routeNumber,
        stop_sequence: stop.stopSequence,
          vendor_name: stop.vendorName,
          latitude: stop.latitude,
          longitude: stop.longitude,
          active_flag: stop.activeFlag,
          quantity_bundle: stop.quantityBundle,
          phone_number: stop.phoneNumber,
          delivery_check: "[ ]",
          source_row: stop.sourceRow
        }))
      )
  );

  addSheet(
    workbook,
    "Ignored Inactive",
    result.inactiveVendors.map((vendor) => ({
      vendor_name: vendor.name,
      latitude: vendor.latitude,
      longitude: vendor.longitude,
      active_flag: false,
      quantity_bundle: vendor.quantityBundle,
      phone_number: vendor.phoneNumber,
      source_row: vendor.sourceRow,
      dispatch_status: "Ignored"
    }))
  );

  addSheet(workbook, "Validation Issues", result.issues);

  const workbookBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(workbookBuffer);
}

function detectColumns(rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] ?? {});
  return Object.fromEntries(
    Object.entries(COLUMN_ALIASES).map(([canonical, aliases]) => {
      const match = headers.find((header) => aliases.includes(normalizeHeader(header)));
      return [canonical, match ?? ""];
    })
  );
}

async function parseXlsxRows(buffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const headerValues = worksheet.getRow(1).values;
  const headers = (Array.isArray(headerValues) ? headerValues.slice(1) : [])
    .map((value) => String(cellValue(value)).trim());
  const rows: Record<string, unknown>[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = cellValue(row.getCell(index + 1).value);
    });
    rows.push(record);
  });

  return rows;
}

function parseCsvRows(csv: string) {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvLine);
  const headers = lines[0] ?? [];

  return lines.slice(1).map((line) =>
    Object.fromEntries(headers.map((header, index) => [header, line[index] ?? ""]))
  );
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function cellValue(value: ExcelJS.CellValue | undefined) {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  if (typeof value === "object") {
    if ("text" in value) {
      return value.text;
    }
    if ("result" in value) {
      return value.result;
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
  }
  return value;
}

function addSheet(workbook: ExcelJS.Workbook, name: string, rows: Record<string, unknown>[]) {
  const worksheet = workbook.addWorksheet(name);
  const columns = Object.keys(rows[0] ?? { message: "" });
  worksheet.columns = columns.map((column) => ({
    header: column,
    key: column,
    width: Math.min(34, Math.max(14, column.length + 4))
  }));
  rows.forEach((row) => worksheet.addRow(row));
  worksheet.getRow(1).font = { bold: true, color: { argb: "FF172033" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF6F7F8" }
  };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
}

function mapsLinkCell(url: string) {
  return {
    text: "Open in Google Maps",
    hyperlink: url
  };
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function optionalText(value: unknown) {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  return String(value).trim();
}

function parseActiveFlag(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1", "active", "enabled"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "n", "0", "inactive", "disabled"].includes(normalized)) {
    return false;
  }
  return null;
}
