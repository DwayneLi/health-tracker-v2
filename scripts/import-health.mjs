/**
 * Apple Health 数据导入脚本 v2 — 修复睡眠解析 + 体脂率单位
 *
 * 用法：
 *   1. iPhone → 健康 App → 右上角头像 → 底部「导出所有健康数据」
 *   2. 把 export.zip 解压，得到 apple_health_export/export.xml
 *   3. 把 export.xml 放到项目的 data/ 目录下
 *   4. 运行：node scripts/import-health.mjs
 */

import { createReadStream, writeFileSync, existsSync, mkdirSync } from "fs";
import { createInterface } from "readline";
import { createRequire } from "module";
import * as path from "path";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const DATA_DIR = path.join(process.cwd(), "data");
const XML_PATH = path.join(DATA_DIR, "export.xml");
const OUTPUT_PATH = path.join(DATA_DIR, "health_data.xlsx");

// 两个正则：一种匹配有 unit 属性的（体重/体脂/活动能量），一种匹配无 unit 的（睡眠）
const RECORD_WITH_UNIT = /<Record\s+type="([^"]+)"[^>]*\s+unit="([^"]*)"[^>]*\s+startDate="([^"]+)"\s+endDate="([^"]+)"[^>]*\s+value="([^"]*)"/;
const RECORD_NO_UNIT   = /<Record\s+type="([^"]+)"[^>]*\s+startDate="([^"]+)"\s+endDate="([^"]+)"[^>]*\s+value="([^"]*)"/;

// 数据类型
const TYPES = {
  BODY_MASS:     "HKQuantityTypeIdentifierBodyMass",
  BODY_FAT:      "HKQuantityTypeIdentifierBodyFatPercentage",
  SLEEP:         "HKCategoryTypeIdentifierSleepAnalysis",
  ACTIVE_ENERGY: "HKQuantityTypeIdentifierActiveEnergyBurned",
};

// Sheet 表头
const HEADERS = {
  "体重记录":   ["日期", "体重(kg)",          "数据来源", "备注", "同步时间"],
  "体脂率记录": ["日期", "体脂率(%)",        "数据来源", "备注", "同步时间"],
  "睡眠记录":   ["日期", "睡眠时长(小时)",    "卧床时长(小时)", "数据来源", "备注", "同步时间"],
  "活动卡路里": ["日期", "活动卡路里(kcal)",  "数据来源", "同步时间"],
};

// ============================================================
// 存储结构
// ============================================================
const weightData     = new Map(); // date → { value, source }
const bodyFatData    = new Map(); // date → { value, source }
const activeData     = new Map(); // date → { value, source }

// 睡眠：先收集所有片段，再按日期聚合
const sleepRaw = []; // [{ date, hours, sourceName }]

let count = 0;
let skippedOld = 0;

// 只导入过去 90 天的数据
const nowDate = new Date();
const cutoffDate = new Date(nowDate.getTime() - 90 * 24 * 3600000);
const cutoffDateStr = cutoffDate.toISOString().split("T")[0];
console.log(`📅 只导入 ${cutoffDateStr} 之后的数据（过去90天）`);

console.log("📖 正在解析 export.xml（可能很大，请耐心等待）...");

if (!existsSync(XML_PATH)) {
  console.error(`❌ 找不到 ${XML_PATH}`);
  console.error("   请把 Apple Health 导出的 export.xml 放到 data/ 目录下");
  process.exit(1);
}

mkdirSync(DATA_DIR, { recursive: true });

const stream = createReadStream(XML_PATH, { encoding: "utf-8" });
const rl = createInterface({ input: stream });

for await (const line of rl) {
  if (!line.includes("<Record ")) continue;

  // 先试有 unit 的格式
  let match = line.match(RECORD_WITH_UNIT);
  let type, unit, startDate, endDate, value, sourceName;

  if (match) {
    [, type, unit, startDate, endDate, value] = match;
    // 提取 sourceName
    sourceName = (line.match(/sourceName="([^"]*)"/) || [])[1] || "";
  } else {
    // 试无 unit 的格式（睡眠）
    match = line.match(RECORD_NO_UNIT);
    if (!match) continue;
    [, type, startDate, endDate, value] = match;
    sourceName = (line.match(/sourceName="([^"]*)"/) || [])[1] || "";
  }

  const date = startDate.split(" ")[0];

  // 跳过 90 天前的旧数据
  if (date < cutoffDateStr) { skippedOld++; continue; }

  // ---- 体重 ----
  if (type === TYPES.BODY_MASS) {
    const v = parseFloat(value);
    if (!isNaN(v) && v > 0) {
      if (!weightData.has(date) || startDate > (weightData.get(date)?._ts || "")) {
        weightData.set(date, { value: v, source: sourceName || "Apple Health", _ts: startDate });
      }
    }
    count++;
  }

  // ---- 体脂率（XML 中是小数，需 ×100） ----
  else if (type === TYPES.BODY_FAT) {
    const v = parseFloat(value);
    if (!isNaN(v) && v > 0) {
      const pct = Math.round(v * 1000) / 10; // 0.225 → 22.5%
      if (!bodyFatData.has(date) || startDate > (bodyFatData.get(date)?._ts || "")) {
        bodyFatData.set(date, { value: pct, source: sourceName || "Apple Health", _ts: startDate });
      }
    }
    count++;
  }

  // ---- 活动能量 ----
  else if (type === TYPES.ACTIVE_ENERGY) {
    const v = parseFloat(value);
    if (!isNaN(v) && v > 0) {
      const existing = activeData.get(date);
      activeData.set(date, {
        value: (existing?.value || 0) + v,
        source: sourceName || "Apple Health",
      });
    }
    count++;
  }

  // ---- 睡眠（采集所有片段，后面聚合） ----
  else if (type === TYPES.SLEEP) {
    const start = new Date(startDate).getTime();
    const end   = new Date(endDate).getTime();
    const hours = (end - start) / 3600000;
    if (hours > 0 && hours < 24) {
      // 取入睡日期（中午12点前算前一天的睡眠）
      const h = new Date(startDate).getHours();
      const sleepDate = h < 12
        ? new Date(start - 12 * 3600000).toISOString().split("T")[0]
        : date;
      sleepRaw.push({
        date: sleepDate,
        hours,
        sourceName,
        stage: value,  // 含 AsleepCore/AsleepDeep/AsleepREM/Awake 等信息
      });
      count++;
    }
  }
}

// ============================================================
// 睡眠聚合：按日期 + 来源分组
// ============================================================
const sleepByNight = new Map(); // "2025-07-15|Apple Watch" → total hours

for (const s of sleepRaw) {
  const isAutoSleep = s.sourceName.toLowerCase().includes("autosleep");
  const isWatch = s.sourceName.toLowerCase().includes("watch") || s.sourceName.toLowerCase().includes("apple");

  // AutoSleep：整段时长直接采用
  // Apple Watch：各阶段累加（排除 Awake）
  const key = `${s.date}|${isAutoSleep ? "autosleep" : "watch"}`;

  if (isAutoSleep) {
    // AutoSleep 通常是一整段，取最大值
    const cur = sleepByNight.get(key);
    if (!cur || s.hours > cur) {
      sleepByNight.set(key, s.hours);
    }
  } else {
    // Apple Watch：如果是 Awake，跳过；否则累加
    if (s.stage && s.stage.toLowerCase().includes("awake")) continue;
    sleepByNight.set(key, (sleepByNight.get(key) || 0) + s.hours);
  }
}

// 每晚优先使用 Apple Watch 数据，没有则用 AutoSleep
const sleepByDate = new Map(); // date → hours
const nightKeys = [...sleepByNight.keys()];
// 先按日期分组
const nightGroups = {};
for (const key of nightKeys) {
  const [date, source] = key.split("|");
  if (!nightGroups[date]) nightGroups[date] = { watch: 0, autosleep: 0 };
  nightGroups[date][source] = sleepByNight.get(key);
}
for (const [date, vals] of Object.entries(nightGroups)) {
  // 优先 Watch，其次 AutoSleep
  const hours = vals.watch > 0 ? vals.watch : vals.autosleep;
  if (hours > 0) {
    const rounded = Math.round(hours * 10) / 10;
    sleepByDate.set(date, { value: rounded, source: vals.watch > 0 ? "Apple Watch" : "AutoSleep" });
  }
}

console.log(`✅ 解析完成：${count} 条记录（跳过 ${skippedOld} 条 90 天前的旧数据）`);
console.log(`   体重 ${weightData.size} 天 · 体脂率 ${bodyFatData.size} 天 · 睡眠 ${sleepByDate.size} 天 · 活动卡路里 ${activeData.size} 天`);

// ============================================================
// 写入 Excel
// ============================================================
console.log("\n📝 正在写入 Excel...");

const wb = XLSX.utils.book_new();
const now = new Date().toISOString();

// 体重
{
  const rows = [...weightData.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { value, source }]) => ({
      "日期": date, "体重(kg)": value, "数据来源": source, "备注": "", "同步时间": now,
    }));
  const ws = XLSX.utils.aoa_to_sheet([HEADERS["体重记录"], ...rows.map(r => HEADERS["体重记录"].map(h => r[h] ?? ""))]);
  XLSX.utils.book_append_sheet(wb, ws, "体重记录");
  console.log(`  体重记录: ${rows.length} 天`);
}

// 体脂率
{
  const rows = [...bodyFatData.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { value, source }]) => ({
      "日期": date, "体脂率(%)": value, "数据来源": source, "备注": "", "同步时间": now,
    }));
  const ws = XLSX.utils.aoa_to_sheet([HEADERS["体脂率记录"], ...rows.map(r => HEADERS["体脂率记录"].map(h => r[h] ?? ""))]);
  XLSX.utils.book_append_sheet(wb, ws, "体脂率记录");
  console.log(`  体脂率记录: ${rows.length} 天`);
}

// 睡眠
{
  const rows = [...sleepByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { value, source }]) => ({
      "日期": date, "睡眠时长(小时)": value, "卧床时长(小时)": 0, "数据来源": source, "备注": "", "同步时间": now,
    }));
  const ws = XLSX.utils.aoa_to_sheet([HEADERS["睡眠记录"], ...rows.map(r => HEADERS["睡眠记录"].map(h => r[h] ?? ""))]);
  XLSX.utils.book_append_sheet(wb, ws, "睡眠记录");
  console.log(`  睡眠记录: ${rows.length} 天`);
}

// 活动卡路里
{
  const rows = [...activeData.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { value, source }]) => ({
      "日期": date, "活动卡路里(kcal)": Math.round(value), "数据来源": source, "同步时间": now,
    }));
  const ws = XLSX.utils.aoa_to_sheet([HEADERS["活动卡路里"], ...rows.map(r => HEADERS["活动卡路里"].map(h => r[h] ?? ""))]);
  XLSX.utils.book_append_sheet(wb, ws, "活动卡路里");
  console.log(`  活动卡路里: ${rows.length} 天`);
}

// 空 Sheet 占位
["饮食记录", "饮食汇总", "力量训练", "有氧训练", "训练记录", "目标设定", "智能建议日志"].forEach(name => {
  try { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), name); } catch {}
});

const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
writeFileSync(OUTPUT_PATH, buf);
console.log(`\n🎉 完成！数据已写入 ${OUTPUT_PATH}`);
