/**
 * Excel 数据层 — 使用 SheetJS 读写健康数据
 *
 * v2 变更：
 *   - 新增：活动卡路里、力量训练、有氧训练 3 个 Sheet
 *   - 体重/体脂/睡眠记录新增「同步时间」字段
 *   - 饮食记录移除「图片URL」「AI原始回复」
 *   - 新增 syncRecord()、getSyncStatus()、getTrendData()
 */

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { formatDateBeijing } from "./date";

// ============================================================
// 配置
// ============================================================

const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATH = () => path.join(DATA_DIR, "health_data.xlsx");
const BACKUP_PATH = () => path.join(DATA_DIR, "health_data.xlsx.bak");

// Sheet 名称常量
export const SHEETS = {
  WEIGHT: "体重记录",
  BODY_FAT: "体脂率记录",
  DIET: "饮食记录",
  DIET_SUMMARY: "饮食汇总",
  SLEEP: "睡眠记录",
  ACTIVE_ENERGY: "活动卡路里",
  STRENGTH_TRAINING: "力量训练",
  CARDIO_TRAINING: "有氧训练",
  // v1 训练数据保留不删不迁移
  TRAINING_V1: "训练记录",
  GOAL: "目标设定",
  SUGGESTIONS: "智能建议日志",
} as const;

// 各 Sheet 的表头
const HEADERS: Record<string, string[]> = {
  [SHEETS.WEIGHT]: ["日期", "体重(kg)", "数据来源", "备注", "同步时间"],
  [SHEETS.BODY_FAT]: ["日期", "体脂率(%)", "数据来源", "备注", "同步时间"],
  [SHEETS.DIET]: [
    "日期",
    "记录时间",
    "餐次",
    "食物描述",
    "份量估计",
    "热量(kcal)",
    "蛋白质(g)",
    "碳水(g)",
    "脂肪(g)",
    "备注",
  ],
  [SHEETS.DIET_SUMMARY]: [
    "日期",
    "总热量",
    "总蛋白质",
    "总碳水",
    "总脂肪",
    "餐次数",
  ],
  [SHEETS.SLEEP]: [
    "日期",
    "睡眠时长(小时)",
    "卧床时长(小时)",
    "数据来源",
    "备注",
    "同步时间",
  ],
  [SHEETS.ACTIVE_ENERGY]: ["日期", "活动卡路里(kcal)", "数据来源", "同步时间"],
  [SHEETS.STRENGTH_TRAINING]: [
    "日期",
    "训练类型",
    "卡路里(kcal)",
    "疲劳度(RPE)",
    "备注",
  ],
  [SHEETS.CARDIO_TRAINING]: [
    "日期",
    "训练类型",
    "卡路里(kcal)",
    "疲劳度(RPE)",
    "备注",
  ],
  [SHEETS.TRAINING_V1]: [
    "日期",
    "训练标题",
    "训练部位",
    "动作名称",
    "组数",
    "每组详情",
    "总容量(kg)",
    "疲劳度(RPE)",
    "训练开始",
    "训练结束",
    "来源",
  ],
  [SHEETS.GOAL]: [
    "设定日期",
    "目标体重(kg)",
    "目标日期",
    "起始体重(kg)",
    "每周减重百分比(%)",
    "当前周应减(kg)",
    "每日热量目标(kcal)",
  ],
  [SHEETS.SUGGESTIONS]: [
    "日期",
    "建议类型",
    "触发条件",
    "建议内容",
    "是否已读",
  ],
};

// 并发控制（个人工具放宽至 100ms，仅防同进程竞态）
const LOCK_WINDOW_MS = 100;

// ============================================================
// 文件管理
// ============================================================

/** 确保 data 目录和 Excel 文件存在 */
export function ensureFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const filePath = FILE_PATH();
  if (!fs.existsSync(filePath)) {
    const wb = XLSX.utils.book_new();
    for (const [name, headers] of Object.entries(HEADERS)) {
      const ws = XLSX.utils.aoa_to_sheet([headers]);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    fs.writeFileSync(filePath, buf);
  } else {
    // 增量补齐 v2 新增的 Sheet / 列（兼容 v1 升级）
    const wb = readWorkbookRaw();
    let changed = false;
    for (const [name, headers] of Object.entries(HEADERS)) {
      if (!wb.Sheets[name]) {
        // 全新 Sheet
        const ws = XLSX.utils.aoa_to_sheet([headers]);
        XLSX.utils.book_append_sheet(wb, ws, name);
        changed = true;
      } else {
        // 已有 Sheet：检查表头是否与 v2 完全一致
        const sheetData = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, defval: "" });
        const existingHeaders: string[] = sheetData.length > 0 ? sheetData[0] : [];
        const headersMatch =
          existingHeaders.length === headers.length &&
          headers.every((h, i) => h === existingHeaders[i]);

        if (!headersMatch) {
          // 表头不一致 → 按 v2 表头重建整个 Sheet
          const oldDataRows = sheetData.slice(1); // 跳过旧表头行
          const newData = [headers];
          for (const oldRow of oldDataRows) {
            const newRow = headers.map((h, i) => {
              const idx = existingHeaders.indexOf(h);
              return idx >= 0 && idx < oldRow.length ? oldRow[idx] : "";
            });
            newData.push(newRow);
          }
          const newWs = XLSX.utils.aoa_to_sheet(newData);
          wb.Sheets[name] = newWs;
          changed = true;
        }
      }
    }
    if (changed) {
      writeWorkbook(wb);
    }
  }
}

function readWorkbookRaw(): XLSX.WorkBook {
  const buf = fs.readFileSync(FILE_PATH());
  return XLSX.read(buf, { type: "buffer" });
}

/** 读取整个 workbook */
function readWorkbook(): XLSX.WorkBook {
  ensureFile();
  return readWorkbookRaw();
}

/** 写入 workbook，带备份 */
function writeWorkbook(wb: XLSX.WorkBook): void {
  const filePath = FILE_PATH();

  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, BACKUP_PATH());
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  fs.writeFileSync(filePath, buf);
}

/** 检查并发写入冲突 */
function checkLock(): void {
  const filePath = FILE_PATH();
  if (!fs.existsSync(filePath)) return;

  const stat = fs.statSync(filePath);
  const now = Date.now();
  if (now - stat.mtimeMs < LOCK_WINDOW_MS) {
    throw new Error("文件正被其他进程使用，请稍后重试。");
  }
}

// ============================================================
// 读取操作
// ============================================================

/** 读取指定 Sheet 的所有行（不含表头） */
export function readSheet(sheetName: string): Record<string, unknown>[] {
  const wb = readWorkbook();
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
  });
  return data;
}

/** 读取指定 Sheet 的第一行 */
export function readFirstRow(
  sheetName: string
): Record<string, unknown> | null {
  const rows = readSheet(sheetName);
  return rows.length > 0 ? rows[0] : null;
}

/** 获取目标设定 */
export function getGoal(): Record<string, unknown> | null {
  return readFirstRow(SHEETS.GOAL);
}

// ============================================================
// 同步操作（Apple Health）
// ============================================================

/** 按日期 upsert 并记录同步时间 */
export function syncRecord(
  sheetName: string,
  date: string,
  valueField: string,
  value: number,
  source: string
): void {
  const rows = readSheet(sheetName);
  const existingIdx = rows.findIndex((r) => String(r["日期"]) === date);
  const syncTime = new Date().toISOString();

  if (sheetName === SHEETS.SLEEP) {
    // 睡眠：UPSERT（覆盖）模式 — Shortcut 端已汇总所有片段，服务端直接存储
    const sleepRows = rows as Record<string, unknown>[];
    if (existingIdx >= 0) {
      sleepRows[existingIdx] = {
        日期: date,
        "睡眠时长(小时)": value,
        "卧床时长(小时)": sleepRows[existingIdx]["卧床时长(小时)"] || 0,
        数据来源: source,
        备注: sleepRows[existingIdx]["备注"] || "",
        同步时间: syncTime,
      };
    } else {
      sleepRows.push({
        日期: date,
        "睡眠时长(小时)": value,
        "卧床时长(小时)": 0,
        数据来源: source,
        备注: "",
        同步时间: syncTime,
      });
    }
    writeSheet(sheetName, sleepRows);
  } else if (sheetName === SHEETS.ACTIVE_ENERGY) {
    const aeRows = rows as Record<string, unknown>[];
    if (existingIdx >= 0) {
      // 手动维护优先：如果已有手动维护值，Apple Health 同步不覆盖
      const prevSource = String(aeRows[existingIdx]["数据来源"] || "");
      if (prevSource === "手动维护" && source === "Apple Health") {
        return; // 保留手动维护值
      }
      aeRows[existingIdx] = {
        日期: date,
        "活动卡路里(kcal)": value,
        数据来源: source,
        同步时间: syncTime,
      };
    } else {
      aeRows.push({
        日期: date,
        "活动卡路里(kcal)": value,
        数据来源: source,
        同步时间: syncTime,
      });
    }
    writeSheet(sheetName, aeRows);
  } else {
    // 体重/体脂率通用处理
    const genericRows = rows as Record<string, unknown>[];
    if (existingIdx >= 0) {
      genericRows[existingIdx] = {
        ...genericRows[existingIdx],
        日期: date,
        [valueField]: value,
        数据来源: source,
        同步时间: syncTime,
      };
    } else {
      const newRow: Record<string, unknown> = {
        日期: date,
        [valueField]: value,
        数据来源: source,
        备注: "",
        同步时间: syncTime,
      };
      genericRows.push(newRow);
    }
    writeSheet(sheetName, genericRows);
  }
}

/** 获取各数据源的同步状态 */
export function getSyncStatus(): Record<
  string,
  { last_sync: string | null; status: "ok" | "warning" | "error" | "none"; latest_value: number | null }
> {
  const now = Date.now();
  const H24 = 24 * 60 * 60 * 1000;
  const H48 = 48 * 60 * 60 * 1000;

  function statusOf(
    sheetName: string,
    valueField: string
  ): {
    last_sync: string | null;
    status: "ok" | "warning" | "error" | "none";
    latest_value: number | null;
  } {
    const rows = readSheet(sheetName);
    if (rows.length === 0) return { last_sync: null, status: "none", latest_value: null };

    const lastRow = rows[rows.length - 1];
    const latest_value = parseFloat(String(lastRow[valueField] || "")) || null;
    const syncTime =
      (lastRow["同步时间"] as string) ||
      (lastRow["记录时间"] as string) ||
      "";
    if (!syncTime) return { last_sync: null, status: "none", latest_value };

    const elapsed = now - new Date(syncTime).getTime();
    if (elapsed < H24) return { last_sync: syncTime, status: "ok", latest_value };
    if (elapsed < H48) return { last_sync: syncTime, status: "warning", latest_value };
    return { last_sync: syncTime, status: "error", latest_value };
  }

  return {
    weight: statusOf(SHEETS.WEIGHT, "体重(kg)"),
    body_fat: statusOf(SHEETS.BODY_FAT, "体脂率(%)"),
    sleep: statusOf(SHEETS.SLEEP, "睡眠时长(小时)"),
    active_energy: statusOf(SHEETS.ACTIVE_ENERGY, "活动卡路里(kcal)"),
  };
}

// ============================================================
// 趋势数据聚合
// ============================================================

export interface TrendDataPoint {
  date: string;
  value: number;
}

export interface TrendStats {
  start: number;
  end: number;
  change: number;
  changePct: number;
  avg: number;
  min?: number;
  max?: number;
  trend: "rising" | "declining" | "stable";
  trendSlope: number;
}

export interface TrendData {
  period: { start: string; end: string; days: number };
  goal: { targetWeight: number; dailyCalories: number; weeklyPct: number } | null;
  weight: { unit: string; data: TrendDataPoint[]; stats: TrendStats | null };
  bodyFat: { unit: string; data: TrendDataPoint[]; stats: TrendStats | null };
  sleep: {
    unit: string;
    data: TrendDataPoint[];
    stats: (TrendStats & { daysBelow7h: number }) | null;
  };
  activeEnergy: {
    unit: string;
    data: TrendDataPoint[];
    stats: (TrendStats & { total: number }) | null;
  };
  diet: {
    unit: string;
    summary: Record<string, unknown>[];
    stats: {
      avgDailyCalories: number;
      avgProtein: number;
      avgCarbs: number;
      avgFat: number;
      calorieGoalHitDays: number;
      calorieGoalHitRate: number;
    } | null;
  };
  syncStatus: ReturnType<typeof getSyncStatus>;
}

/** 从 Excel 中聚合趋势数据 */
export function getTrendData(days: number = 7): TrendData {
  const weights = readSheet(SHEETS.WEIGHT);
  const fats = readSheet(SHEETS.BODY_FAT);
  const sleeps = readSheet(SHEETS.SLEEP);
  const activeEnergy = readSheet(SHEETS.ACTIVE_ENERGY);
  const dietSummary = readSheet(SHEETS.DIET_SUMMARY);
  const goal = getGoal();

  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const startStr = formatDateBeijing(start);
  const endStr = formatDateBeijing(end);

  // 过滤日期范围
  function filterByDate(
    rows: Record<string, unknown>[],
    valueField: string
  ): TrendDataPoint[] {
    return rows
      .filter((r) => String(r["日期"]) >= startStr && String(r["日期"]) <= endStr)
      .map((r) => ({
        date: String(r["日期"]),
        value: parseFloat(String(r[valueField])) || 0,
      }));
  }

  function calcStats(
    data: TrendDataPoint[],
    opts?: { extra?: Record<string, unknown> }
  ): TrendStats | null {
    if (data.length < 2) return null;
    const values = data.map((d) => d.value);
    const start = values[0];
    const end = values[values.length - 1];
    const change = end - start;
    const changePct = start !== 0 ? (change / start) * 100 : 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // 简单线性回归斜率
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = avg;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (values[i] - yMean);
      den += (i - xMean) ** 2;
    }
    const slope = den !== 0 ? num / den : 0;

    let trend: "rising" | "declining" | "stable";
    if (Math.abs(slope) < 0.01) trend = "stable";
    else if (slope > 0) trend = "rising";
    else trend = "declining";

    return { start, end, change, changePct, avg, min, max, trend, trendSlope: slope };
  }

  const weightData = filterByDate(weights, "体重(kg)");
  const fatData = filterByDate(fats, "体脂率(%)");
  const sleepData = filterByDate(sleeps, "睡眠时长(小时)");
  const aeData = filterByDate(activeEnergy, "活动卡路里(kcal)");

  const sleepStats = calcStats(sleepData) as (TrendStats & {
    daysBelow7h: number;
  }) | null;
  if (sleepStats) {
    sleepStats.daysBelow7h = sleepData.filter((d) => d.value < 7).length;
  }

  const aeStats = calcStats(aeData) as (TrendStats & { total: number }) | null;
  if (aeStats) {
    aeStats.total = aeData.reduce((s, d) => s + d.value, 0);
  }

  // 饮食汇总统计
  const dietInRange = dietSummary.filter(
    (r) => String(r["日期"]) >= startStr && String(r["日期"]) <= endStr
  );
  const dailyCalorieTarget = goal
    ? parseFloat(String(goal["每日热量目标(kcal)"])) || 2000
    : 2000;

  const dietStats = dietInRange.length > 0 ? {
    avgDailyCalories:
      dietInRange.reduce((s, r) => s + parseFloat(String(r["总热量"])) || 0, 0) /
      dietInRange.length,
    avgProtein:
      dietInRange.reduce((s, r) => s + parseFloat(String(r["总蛋白质"])) || 0, 0) /
      dietInRange.length,
    avgCarbs:
      dietInRange.reduce((s, r) => s + parseFloat(String(r["总碳水"])) || 0, 0) /
      dietInRange.length,
    avgFat:
      dietInRange.reduce((s, r) => s + parseFloat(String(r["总脂肪"])) || 0, 0) /
      dietInRange.length,
    calorieGoalHitDays: dietInRange.filter(
      (r) => parseFloat(String(r["总热量"])) <= dailyCalorieTarget
    ).length,
    calorieGoalHitRate:
      dietInRange.filter(
        (r) => parseFloat(String(r["总热量"])) <= dailyCalorieTarget
      ).length / dietInRange.length,
  } : null;

  return {
    period: { start: startStr, end: endStr, days },
    goal: goal
      ? {
          targetWeight: parseFloat(String(goal["目标体重(kg)"])) || 0,
          dailyCalories: dailyCalorieTarget,
          weeklyPct: parseFloat(String(goal["每周减重百分比(%)"])) || 0,
        }
      : null,
    weight: {
      unit: "kg",
      data: weightData,
      stats: calcStats(weightData),
    },
    bodyFat: {
      unit: "%",
      data: fatData,
      stats: calcStats(fatData),
    },
    sleep: {
      unit: "hours",
      data: sleepData,
      stats: sleepStats,
    },
    activeEnergy: {
      unit: "kcal",
      data: aeData,
      stats: aeStats,
    },
    diet: {
      unit: "kcal",
      summary: dietInRange,
      stats: dietStats,
    },
    syncStatus: getSyncStatus(),
  };
}

// ============================================================
// 写入操作 - 通用
// ============================================================

/** 向 Sheet 追加一行 */
export function appendRow(sheetName: string, row: Record<string, unknown>): void {
  const wb = readWorkbook();
  const ws = wb.Sheets[sheetName];

  if (!ws) {
    throw new Error(`Sheet "${sheetName}" 不存在`);
  }

  const existing = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
  });

  const headers = HEADERS[sheetName];
  if (!headers) throw new Error(`未知 Sheet: ${sheetName}`);

  const newRow = headers.map((h) => row[h] ?? "");
  existing.push(newRow);
  const newWs = XLSX.utils.aoa_to_sheet(existing);
  wb.Sheets[sheetName] = newWs;

  writeWorkbook(wb);
}

/** 覆盖写入整个 Sheet */
export function writeSheet(
  sheetName: string,
  rows: Record<string, unknown>[]
): void {
  const wb = readWorkbook();
  const headers = HEADERS[sheetName];
  if (!headers) throw new Error(`未知 Sheet: ${sheetName}`);

  const data = [headers, ...rows.map((row) => headers.map((h) => row[h] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  wb.Sheets[sheetName] = ws;

  writeWorkbook(wb);
}

// ============================================================
// 写入操作 - 饮食
// ============================================================

/** v2 饮食记录（简化版，无 AI 字段） */
export function addDietRecord(record: {
  日期: string;
  记录时间: string;
  餐次: string;
  食物描述: string;
  份量估计?: string;
  "热量(kcal)": number;
  "蛋白质(g)": number;
  "碳水(g)": number;
  "脂肪(g)": number;
  备注?: string;
}): void {
  const full: Record<string, unknown> = {
    日期: record["日期"],
    记录时间: record["记录时间"],
    餐次: record["餐次"],
    食物描述: record["食物描述"],
    份量估计: record["份量估计"] || "",
    "热量(kcal)": record["热量(kcal)"],
    "蛋白质(g)": record["蛋白质(g)"],
    "碳水(g)": record["碳水(g)"],
    "脂肪(g)": record["脂肪(g)"],
    备注: record["备注"] || "",
  };
  appendRow(SHEETS.DIET, full);
  recalculateDietSummary(record["日期"]);
}

function recalculateDietSummary(date: string): void {
  const dietRows = readSheet(SHEETS.DIET);
  const dayRows = dietRows.filter((r) => String(r["日期"]) === date);

  const totalCalories = dayRows.reduce(
    (sum, r) => sum + (parseFloat(String(r["热量(kcal)"])) || 0),
    0
  );
  const totalProtein = dayRows.reduce(
    (sum, r) => sum + (parseFloat(String(r["蛋白质(g)"])) || 0),
    0
  );
  const totalCarbs = dayRows.reduce(
    (sum, r) => sum + (parseFloat(String(r["碳水(g)"])) || 0),
    0
  );
  const totalFat = dayRows.reduce(
    (sum, r) => sum + (parseFloat(String(r["脂肪(g)"])) || 0),
    0
  );

  const summaryRows = readSheet(SHEETS.DIET_SUMMARY);
  const existingIdx = summaryRows.findIndex(
    (r) => String(r["日期"]) === date
  );

  const summary = {
    日期: date,
    总热量: Math.round(totalCalories),
    总蛋白质: Math.round(totalProtein),
    总碳水: Math.round(totalCarbs),
    总脂肪: Math.round(totalFat),
    餐次数: dayRows.length,
  };

  if (existingIdx >= 0) {
    summaryRows[existingIdx] = summary;
    writeSheet(SHEETS.DIET_SUMMARY, summaryRows);
  } else {
    appendRow(SHEETS.DIET_SUMMARY, summary);
  }
}

// ============================================================
// 写入操作 - 体重/体脂/睡眠（手动兜底保留）
// ============================================================

export function upsertWeight(
  date: string,
  weight: number,
  source: string,
  note: string = ""
): void {
  syncRecord(SHEETS.WEIGHT, date, "体重(kg)", weight, source);
  // 如果传入了备注也保留
  if (note) {
    const rows = readSheet(SHEETS.WEIGHT);
    const idx = rows.findIndex((r) => String(r["日期"]) === date);
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], 备注: note };
      writeSheet(SHEETS.WEIGHT, rows);
    }
  }
}

export function upsertBodyFat(
  date: string,
  bodyFat: number,
  source: string,
  note: string = ""
): void {
  syncRecord(SHEETS.BODY_FAT, date, "体脂率(%)", bodyFat, source);
  if (note) {
    const rows = readSheet(SHEETS.BODY_FAT);
    const idx = rows.findIndex((r) => String(r["日期"]) === date);
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], 备注: note };
      writeSheet(SHEETS.BODY_FAT, rows);
    }
  }
}

export function upsertSleep(
  date: string,
  hours: number,
  bedHours: number = 0,
  source: string = "手动录入",
  note: string = ""
): void {
  const rows = readSheet(SHEETS.SLEEP);
  const existingIdx = rows.findIndex((r) => String(r["日期"]) === date);
  const syncTime = new Date().toISOString();

  if (existingIdx >= 0) {
    rows[existingIdx] = {
      日期: date,
      "睡眠时长(小时)": hours,
      "卧床时长(小时)": bedHours,
      数据来源: source,
      备注: note,
      同步时间: syncTime,
    };
  } else {
    rows.push({
      日期: date,
      "睡眠时长(小时)": hours,
      "卧床时长(小时)": bedHours,
      数据来源: source,
      备注: note,
      同步时间: syncTime,
    });
  }
  writeSheet(SHEETS.SLEEP, rows);
}

// ============================================================
// 写入操作 - 训练（简化版）
// ============================================================

export function addStrengthTraining(record: {
  日期: string;
  训练类型?: string;
  "卡路里(kcal)": number;
  "疲劳度(RPE)": number;
  备注?: string;
}): void {
  appendRow(SHEETS.STRENGTH_TRAINING, {
    日期: record["日期"],
    训练类型: "力量训练",
    "卡路里(kcal)": record["卡路里(kcal)"],
    "疲劳度(RPE)": record["疲劳度(RPE)"],
    备注: record["备注"] || "",
  });
}

export function addCardioTraining(record: {
  日期: string;
  训练类型?: string;
  "卡路里(kcal)": number;
  "疲劳度(RPE)": number;
  备注?: string;
}): void {
  appendRow(SHEETS.CARDIO_TRAINING, {
    日期: record["日期"],
    训练类型: "有氧训练",
    "卡路里(kcal)": record["卡路里(kcal)"],
    "疲劳度(RPE)": record["疲劳度(RPE)"],
    备注: record["备注"] || "",
  });
}

// ============================================================
// 目标设定
// ============================================================

export function saveGoal(goal: {
  设定日期: string;
  "目标体重(kg)": number;
  目标日期: string;
  "起始体重(kg)": number;
  "每周减重百分比(%)": number;
  "当前周应减(kg)": number;
  "每日热量目标(kcal)": number;
}): void {
  writeSheet(SHEETS.GOAL, [goal]);
}

export function recalculateWeeklyTarget(): void {
  const goal = getGoal();
  if (!goal) return;

  const weights = readSheet(SHEETS.WEIGHT);
  const latestWeight =
    weights.length > 0
      ? parseFloat(String(weights[weights.length - 1]["体重(kg)"])) || 0
      : 0;

  const weeklyPct = parseFloat(String(goal["每周减重百分比(%)"])) || 0;
  const currentWeekTarget = latestWeight * weeklyPct / 100;

  saveGoal({
    设定日期: String(goal["设定日期"]),
    "目标体重(kg)": parseFloat(String(goal["目标体重(kg)"])) || 0,
    目标日期: String(goal["目标日期"]),
    "起始体重(kg)": latestWeight,
    "每周减重百分比(%)": weeklyPct,
    "当前周应减(kg)": Math.round(currentWeekTarget * 100) / 100,
    "每日热量目标(kcal)": parseFloat(String(goal["每日热量目标(kcal)"])) || 2000,
  });
}

// ============================================================
// 智能建议
// ============================================================

export function addSuggestion(suggestion: {
  日期: string;
  建议类型: string;
  触发条件: string;
  建议内容: string;
  是否已读: boolean;
}): void {
  appendRow(SHEETS.SUGGESTIONS, suggestion);
}

// ============================================================
// 导出
// ============================================================

export function exportWorkbook(): Buffer {
  ensureFile();
  return fs.readFileSync(FILE_PATH());
}
