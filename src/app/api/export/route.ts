import { NextResponse } from "next/server";
import * as excel from "@/lib/excel";

export async function GET() {
  try {
    const buffer = excel.exportWorkbook();
    const date = new Date().toISOString().split("T")[0];

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="健康数据_导出_${date}.xlsx"`,
      },
    });
  } catch (err) {
    console.error("Export error:", err);
    return NextResponse.json(
      { error: "Export failed" },
      { status: 500 }
    );
  }
}
