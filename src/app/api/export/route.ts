import { NextRequest, NextResponse } from "next/server";
import * as excel from "@/lib/excel";
import { getTodayStr } from "@/lib/date";

export async function GET(req: NextRequest) {
  const user = excel.getUser(req);
  return excel.withUser(user, () => {
    try {
      const buffer = excel.exportWorkbook();
      const date = getTodayStr();

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
  });
}
