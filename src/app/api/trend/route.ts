/**
 * 趋势分析 JSON API
 *
 * GET /api/trend?days=7
 *
 * 返回完整趋势数据 + 告警 flags，可直接复制到外部大模型分析。
 */

import { NextRequest, NextResponse } from "next/server";
import * as excel from "@/lib/excel";
import { evaluateFlags, DEFAULT_THRESHOLDS } from "@/lib/trend";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "7");

    if (days < 3 || days > 90) {
      return NextResponse.json(
        { error: "days 参数范围 3-90" },
        { status: 400 }
      );
    }

    const data = excel.getTrendData(days);
    const flags = evaluateFlags(data);

    return NextResponse.json({
      ...data,
      flags,
    });
  } catch (err) {
    console.error("Trend API error:", err);
    return NextResponse.json(
      { error: "趋势数据获取失败" },
      { status: 500 }
    );
  }
}
