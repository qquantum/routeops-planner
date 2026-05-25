import { NextRequest, NextResponse } from "next/server";
import { buildOptimizedWorkbook } from "@/lib/excel";
import { OptimizationResult } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const result = (await request.json()) as OptimizationResult;
    const workbook = await buildOptimizedWorkbook(result);

    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="optimized-routes-${result.jobId}.xlsx"`
      }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
