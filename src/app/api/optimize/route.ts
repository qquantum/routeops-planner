import { NextRequest, NextResponse } from "next/server";
import { parseVendorWorkbook } from "@/lib/excel";
import { optimizeRoutes } from "@/lib/optimizer";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload an XLSX or CSV file." }, { status: 400 });
    }

    const dispatch = {
      name: String(formData.get("dispatchName") || "Main Dispatch"),
      latitude: Number(formData.get("dispatchLatitude")),
      longitude: Number(formData.get("dispatchLongitude"))
    };
    const routeCount = Number(formData.get("routeCount") || 3);
    const maxStopsPerRoute = Number(formData.get("maxStopsPerRoute") || 0);

    if (!Number.isFinite(dispatch.latitude) || !Number.isFinite(dispatch.longitude)) {
      return NextResponse.json({ error: "Dispatch latitude and longitude are required." }, { status: 400 });
    }

    const parsed = await parseVendorWorkbook(file);
    if (parsed.vendors.length === 0) {
      return NextResponse.json(
        {
          error: "No active, valid vendors were found.",
          issues: parsed.issues,
          columnMapping: parsed.columnMapping
        },
        { status: 422 }
      );
    }

    const result = optimizeRoutes({
      dispatch,
      vendors: parsed.vendors,
      totalVendors: parsed.totalRows,
      inactiveVendors: parsed.inactiveVendors,
      invalidRows: parsed.issues.filter((issue) => issue.severity === "error").length,
      routeCount,
      maxStopsPerRoute: maxStopsPerRoute > 0 ? maxStopsPerRoute : undefined,
      issues: parsed.issues,
      columnMapping: parsed.columnMapping
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Optimization failed. Check the uploaded file format." }, { status: 500 });
  }
}
