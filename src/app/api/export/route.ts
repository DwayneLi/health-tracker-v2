import { NextRequest, NextResponse } from "next/server";
import * as excel from "@/lib/excel";
import { getTodayStr } from "@/lib/date";

export async function GET(req: NextRequest) {
  const user = excel.getUser(req);
  return excel.withUser(user, () => {
    try {
      const buffer = excel.exportWorkbook();
      const date = getTodayStr();

      // HTTP 响应头只允许 ASCII（ByteString），中文文件名不能直接放入 Content-Disposition。
      // 用 RFC 5987 的 filename* 编码中文名，现代浏览器会优先显示 filename* 的中文名。
      const asciiName = `health_data_${date}.xlsx`;
      const utf8Name = encodeURIComponent(`健康数据_导出_${date}.xlsx`);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
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
