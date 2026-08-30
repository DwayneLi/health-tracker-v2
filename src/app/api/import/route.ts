/**
 * 健康数据导入 API
 *
 * POST /api/import
 *
 * ── replace 模式（全量，用于存量数据一次性导入）──
 * {
 *   "mode": "replace",
 *   "sheets": {
 *     "体重记录": [{ "日期": "2026-05-11", "体重(kg)": 87.3, ... }, ...],
 *     "睡眠记录": [...], ...
 *   }
 * }
 *
 * ── merge 模式（增量，快捷指令每日直推）──
 * {
 *   "mode": "merge",
 *   "user": "admin",              // 可选，预留多用户路由
 *   "sleep":    [{ "start": "...", "end": "...", "value": "Core", "source": "..." }],
 *   "activity": [{ "start": "...", "value": 571, "source": "..." }],
 *   "weight":   [{ "start": "...", "value": 79.5, "source": "..." }],
 *   "bodyFat":  [{ "start": "...", "value": 22.5, "source": "..." }]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import * as excel from "@/lib/excel";

// ============================================================
// 日期解析
// ============================================================

function parseDate(s: unknown): Date | null {
  if (!s) return null;
  const str = String(s).trim();
  if (!str) return null;

  // 中文日期: 2026年8月29日 上午12:35 / 下午11:25
  const cn = str.match(
    /(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(上午|下午|凌晨|中午|晚上)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (cn) {
    const year = +cn[1], month = +cn[2], day = +cn[3];
    const ampm = cn[4], h = cn[5] ? +cn[5] : 0, m = cn[6] ? +cn[6] : 0, sec = cn[7] ? +cn[7] : 0;
    let hour = h;
    if ((ampm === "下午" || ampm === "晚上") && hour < 12) hour += 12;
    if (ampm === "上午" && hour === 12) hour = 0;
    if (ampm === "中午" && hour < 12) hour += 12;
    const d = new Date(year, month - 1, day, hour, m, sec);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/** Date → 北京时间 YYYY-MM-DD */
function bjDate(d: Date): string {
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  return bj.toISOString().slice(0, 10);
}

/** 睡眠日期归属：中午 12 点前归前一晚 */
function sleepDate(d: Date): string {
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  if (bj.getUTCHours() < 12) {
    return new Date(bj.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  }
  return bj.toISOString().slice(0, 10);
}

// ============================================================
// 睡眠分期归一化
// ============================================================

const CN_STAGE: Record<string, string> = {
  核心睡眠: "core", 浅睡: "core", 核心: "core",
  深度睡眠: "deep", 深睡: "deep", 深度: "deep",
  快速眼动: "rem",
  入睡: "unspecified", 未分级: "unspecified",
  在床上: "inbed", 在床: "inbed",
  清醒: "awake", 醒来: "awake",
};

function normStage(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  for (const [k, v] of Object.entries(CN_STAGE)) {
    if (raw.includes(k)) return v;
  }
  let s = raw.toLowerCase().replace(/[_\-\s]/g, "");
  for (const p of ["hkcategoryvaluesleepanalysis", "asleep"]) {
    if (s.startsWith(p)) {
      s = s.slice(p.length);
      break;
    }
  }
  if (!s) return "unspecified";
  return s;
}

const ASLEEP = new Set(["core", "deep", "rem", "unspecified"]);

// ============================================================
// merge 解析
// ============================================================

interface MergeBody {
  mode?: string;
  user?: string;
  sleep?: { start?: string; end?: string; value?: unknown; source?: string }[];
  activity?: { start?: string; value?: unknown; source?: string }[];
  weight?: { start?: string; value?: unknown; source?: string }[];
  bodyFat?: { start?: string; value?: unknown; source?: string }[];
}

function isWatch(src: string): boolean {
  const s = src.toLowerCase();
  return s.includes("watch") || s.includes("apple");
}

function parseSleep(samples: MergeBody["sleep"]): Map<string, number> {
  const daily = new Map<string, number>();
  if (!Array.isArray(samples)) return daily;

  const anySource = samples.some((s) => String(s?.source ?? "").trim() !== "");

  for (const s of samples) {
    const start = parseDate(s?.start);
    const value = s?.value;
    const source = String(s?.source ?? "").trim();

    if (!start) continue;
    if (anySource && !isWatch(source)) continue;

    const end = parseDate(s?.end);
    // 简化：end 缺失或无效时跳过（服务端不推算，避免误算；快捷指令应带 end）
    if (!end || end <= start) continue;

    const minutes = (end.getTime() - start.getTime()) / 60000;
    if (minutes <= 0 || minutes > 24 * 60) continue;

    const stage = normStage(value);
    if (!ASLEEP.has(stage)) continue; // 排除 awake / inbed / 未知

    const date = sleepDate(start);
    daily.set(date, (daily.get(date) || 0) + minutes);
  }
  return daily;
}

function parseSum(
  samples: { start?: string; value?: unknown }[]
): Map<string, number> {
  const daily = new Map<string, number>();
  if (!Array.isArray(samples)) return daily;
  for (const s of samples) {
    const start = parseDate(s?.start);
    if (!start) continue;
    const val = Number(s?.value);
    if (isNaN(val) || val <= 0) continue;
    const date = bjDate(start);
    daily.set(date, (daily.get(date) || 0) + val);
  }
  return daily;
}

function parseLatest(
  samples: { start?: string; value?: unknown; source?: string }[]
): Map<string, { val: number; src: string }> {
  const map = new Map<string, { dt: number; val: number; src: string }>();
  if (!Array.isArray(samples)) return new Map();
  for (const s of samples) {
    const start = parseDate(s?.start);
    if (!start) continue;
    const val = Number(s?.value);
    if (isNaN(val)) continue;
    const date = bjDate(start);
    const cur = map.get(date);
    if (!cur || start.getTime() > cur.dt) {
      map.set(date, { dt: start.getTime(), val, src: String(s?.source ?? "").trim() || "Apple Health" });
    }
  }
  const out = new Map<string, { val: number; src: string }>();
  for (const [date, d] of map) out.set(date, { val: d.val, src: d.src });
  return out;
}

// ============================================================
// POST
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as MergeBody & {
      sheets?: Record<string, Record<string, unknown>[]>;
    };

    // ── replace 模式：存量数据全量导入 ──
    if (body.mode === "replace") {
      const sheets = body.sheets;
      if (!sheets || typeof sheets !== "object") {
        return NextResponse.json(
          { status: "error", message: "replace 模式需要 sheets 对象" },
          { status: 400 }
        );
      }
      const replaced = excel.replaceAllData(sheets);
      return NextResponse.json({
        status: "ok",
        mode: "replace",
        replaced,
      });
    }

    // ── merge 模式：快捷指令增量直推 ──
    if (body.mode === "merge") {
      const sleepDaily = parseSleep(body.sleep);
      const activityDaily = parseSum(body.activity);
      const weightMap = parseLatest(body.weight);
      const bodyFatMap = parseLatest(body.bodyFat);

      const result = {
        sleep: 0,
        activity: 0,
        weight: 0,
        bodyFat: 0,
      };

      for (const [date, minutes] of sleepDaily) {
        excel.syncRecord(excel.SHEETS.SLEEP, date, "睡眠时长(小时)", Math.round((minutes / 60) * 10) / 10, "Apple Health");
        result.sleep++;
      }
      for (const [date, cal] of activityDaily) {
        excel.syncRecord(excel.SHEETS.ACTIVE_ENERGY, date, "活动卡路里(kcal)", Math.round(cal), "Apple Health");
        result.activity++;
      }
      for (const [date, d] of weightMap) {
        excel.syncRecord(excel.SHEETS.WEIGHT, date, "体重(kg)", Math.round(d.val * 10) / 10, d.src);
        result.weight++;
      }
      for (const [date, d] of bodyFatMap) {
        excel.syncRecord(excel.SHEETS.BODY_FAT, date, "体脂率(%)", Math.round(d.val * 10) / 10, d.src);
        result.bodyFat++;
      }

      return NextResponse.json({
        status: "ok",
        mode: "merge",
        user: body.user || "admin",
        synced: result,
      });
    }

    return NextResponse.json(
      { status: "error", message: "mode 必须为 replace 或 merge" },
      { status: 400 }
    );
  } catch (err) {
    console.error("Import API error:", err);
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : "解析失败",
      },
      { status: 400 }
    );
  }
}
