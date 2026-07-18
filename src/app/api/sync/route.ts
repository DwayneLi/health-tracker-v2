/**
 * Apple Health 数据同步 API
 *
 * POST /api/sync — 接收 Apple Health 快捷指令推送的批量数据
 *
 * 请求格式：
 * {
 *   "records": [
 *     { "type": "weight",       "value": 70.5, "unit": "kg",    "date": "2025-07-15", "source": "Apple Health" },
 *     { "type": "body_fat",     "value": 21.8, "unit": "%",     "date": "2025-07-15", "source": "Apple Health" },
 *     { "type": "sleep",        "value": 7.5,  "unit": "hours", "date": "2025-07-15", "source": "Apple Health" },
 *     { "type": "active_energy","value": 450,  "unit": "kcal",  "date": "2025-07-15", "source": "Apple Health" }
 *   ]
 * }
 *
 * 响应（partial success）：
 * {
 *   "status": "ok" | "partial" | "error",
 *   "synced": [{ "type": "weight", "date": "2025-07-15", "status": "ok" }],
 *   "failed": [{ "type": "body_fat", "date": "2025-07-15", "reason": "..." }],
 *   "sync_time": "2025-07-15T08:00:00Z"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import * as excel from "@/lib/excel";

interface SyncRecord {
  type: "weight" | "body_fat" | "sleep" | "active_energy";
  value: number;
  unit: string;
  date: string;
  source: string;
}

interface SyncResult {
  type: string;
  date: string;
  status: "ok" | "error";
  reason?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const records: SyncRecord[] = body.records;

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { status: "error", message: "请求体必须包含 records 数组" },
        { status: 400 }
      );
    }

    const synced: SyncResult[] = [];
    const failed: SyncResult[] = [];

    for (const record of records) {
      try {
        if (!record.type || record.value == null || !record.date) {
          failed.push({
            type: record.type || "unknown",
            date: record.date || "unknown",
            status: "error",
            reason: "缺少必填字段 (type, value, date)",
          });
          continue;
        }

        if (typeof record.value !== "number" || isNaN(record.value)) {
          failed.push({
            type: record.type,
            date: record.date,
            status: "error",
            reason: "value 必须是有效数字",
          });
          continue;
        }

        switch (record.type) {
          case "weight":
            excel.syncRecord(
              excel.SHEETS.WEIGHT,
              record.date,
              "体重(kg)",
              record.value,
              record.source || "Apple Health"
            );
            break;
          case "body_fat":
            excel.syncRecord(
              excel.SHEETS.BODY_FAT,
              record.date,
              "体脂率(%)",
              record.value,
              record.source || "Apple Health"
            );
            break;
          case "sleep":
            excel.syncRecord(
              excel.SHEETS.SLEEP,
              record.date,
              "睡眠时长(小时)",
              record.value,
              record.source || "Apple Health"
            );
            break;
          case "active_energy":
            excel.syncRecord(
              excel.SHEETS.ACTIVE_ENERGY,
              record.date,
              "活动卡路里(kcal)",
              record.value,
              record.source || "Apple Health"
            );
            break;
          default:
            failed.push({
              type: record.type,
              date: record.date,
              status: "error",
              reason: `未知 type: ${record.type}，支持 weight/body_fat/sleep/active_energy`,
            });
            continue;
        }

        synced.push({
          type: record.type,
          date: record.date,
          status: "ok",
        });
      } catch (err) {
        failed.push({
          type: record.type,
          date: record.date || "unknown",
          status: "error",
          reason: err instanceof Error ? err.message : "未知错误",
        });
      }
    }

    const overall = failed.length === 0 ? "ok" : synced.length === 0 ? "error" : "partial";

    return NextResponse.json({
      status: overall,
      synced,
      failed,
      sync_time: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Sync API error:", err);
    return NextResponse.json(
      { status: "error", message: "请求解析失败" },
      { status: 400 }
    );
  }
}
