/**
 * Apple Health 数据导入脚本
 *
 * 用法：
 *   1. iPhone → 健康 App → 右上角头像 → 底部「导出所有健康数据」
 *   2. 把 export.zip 解压，得到 apple_health_export/export.xml
 *   3. 把 export.xml 放到项目的 data/ 目录下
 *   4. 运行：node scripts/import-health.mjs
 *
 * 支持的数据类型：
 *   - 体重 (BodyMass)
 *   - 体脂率 (BodyFatPercentage)
 *   - 睡眠时长 (SleepAnalysis)
 *   - 活动能量 (ActiveEnergyBurned)
 */

import { createReadStream, readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import * as path from "path";
import * as XLSX from "xlsx";

const DATA_DIR = path.join(process.cwd(), "data");
const XML_PATH = path.join(DATA_DIR, "export.xml");
const OUTPUT_PATH = path.join(DATA_DIR, "health_data.xlsx");

// ============================================================
// 正则：匹配 Apple Health export.xml 中的 Record 行
// ============================================================
const RECORD_RE = /<Record\s+type="([^"]+)"[^>]*\s+unit="([^"]*)"[^>]*\s+startDate="([^"]+)"\s+endDate="([^"]+)"[^>]*\s+value="([^"]*)"/;

// ============================================================
// 数据类型映射
// ============================================================
const TYPE_MAP = {
  "HKQuantityTypeIdentifierBodyMass":          { sheet: "体重记录",     field: "体重(kg)",      unit: "kg"    },
  "HKQuantityTypeIdentifierBodyFatPercentage": { sheet: "体脂率记录",   field: "体脂率(%)",    unit: "%"     },
  "HKCategoryTypeIdentifierSleepAnalysis":     { sheet: "睡眠记录",     field: "睡眠时长(小时)", unit: "hours" },
  "HKQuantityTypeIdentifierActiveEnergyBurned":{ sheet: "活动卡路里",   field: "活动卡路里(kcal)", unit: "kcal"  },
};

// ============================================================
// Sheet 表头
// ============================================================
const HEADERS = {
  "体重记录":   ["日期", "体重(kg)", "数据来源", "备注", "同步时间"],
  "体脂率记录": ["日期", "体脂率(%)", "数据来源", "备注", "同步时间"],
  "睡眠记录":   ["日期", "睡眠时长(小时)", "卧床时长(小时)", "数据来源", "备注", "同步时间"],
  "活动卡路里": ["日期", "活动卡路里(kcal)", "数据来源", "同步时间"],
};

// ============================================================
// 按日期分组存储
// ============================================================
const dataStore = {
  "体重记录":   new Map(),  // date → { value, source }
  "体脂率记录": new Map(),
  "睡眠记录":   new Map(),
  "活动卡路里": new Map(),
};

let count = 0;
let skipped = 0;

console.log("📖 正在解析 export.xml（可能很大，请耐心等待）...");

const stream = createReadStream(XML_PATH, { encoding: "utf-8" });
const rl = createInterface({ input: stream });

for await (const line of rl) {
  if (!line.includes("<Record ")) continue;

  const match = line.match(RECORD_RE);
  if (!match) continue;

  const [, type, unit, startDate, endDate, value] = match;
  const mapping = TYPE_MAP[type];
  if (!mapping) continue;

  const date = startDate.split(" ")[0]; // "2025-07-15 08:00:00 +0800" → "2025-07-15"

  let numValue;
  if (type === "HKCategoryTypeIdentifierSleepAnalysis") {
    // 睡眠：计算时长（秒→小时）
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    numValue = Math.round(((end - start) / 3600000) * 10) / 10; // 保留1位小数
  } else {
    numValue = parseFloat(value);
  }

  if (isNaN(numValue) || numValue <= 0) {
    skipped++;
    continue;
  }

  const store = dataStore[mapping.sheet];
  // 同一天多条记录 → 求和（活动卡路里）或取最新（体重/体脂/睡眠）
  if (type === "HKQuantityTypeIdentifierActiveEnergyBurned") {
    const existing = store.get(date);
    store.set(date, { value: (existing?.value || 0) + numValue, source: "Apple Health" });
  } else {
    // 权重/体脂/睡眠：只保留当天最后一条（或最大值）
    if (!store.has(date) || numValue > (store.get(date)?.value || 0)) {
      store.set(date, { value: numValue, source: "Apple Health" });
    }
  }
  count++;
}

console.log(`✅ 解析完成：${count} 条记录，跳过 ${skipped} 条无效数据`);

// ============================================================
// 写入 Excel
// ============================================================
console.log("📝 正在写入 Excel...");

const wb = XLSX.utils.book_new();
const now = new Date().toISOString();

for (const [sheetName, data] of Object.entries(dataStore)) {
  const rows = [];
  const sorted = [...data.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [date, { value, source }] of sorted) {
    if (sheetName === "睡眠记录") {
      rows.push({
        "日期": date,
        "睡眠时长(小时)": value,
        "卧床时长(小时)": 0,
        "数据来源": source,
        "备注": "",
        "同步时间": now,
      });
    } else if (sheetName === "活动卡路里") {
      rows.push({
        "日期": date,
        "活动卡路里(kcal)": Math.round(value),
        "数据来源": source,
        "同步时间": now,
      });
    } else {
      rows.push({
        "日期": date,
        [HEADERS[sheetName][1]]: value,
        "数据来源": source,
        "备注": "",
        "同步时间": now,
      });
    }
  }

  const headers = HEADERS[sheetName];
  const wsData = [headers, ...rows.map(r => headers.map(h => r[h] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  console.log(`  ${sheetName}: ${rows.length} 条记录`);
}

// 追加已有的其他 Sheet（饮食/训练/目标等）
const EXISTING_SHEETS = ["饮食记录", "饮食汇总", "力量训练", "有氧训练", "训练记录", "目标设定", "智能建议日志"];
for (const name of EXISTING_SHEETS) {
  try {
    const ws = XLSX.utils.aoa_to_sheet([[]]); // 空 sheet 占位
    XLSX.utils.book_append_sheet(wb, ws, name);
  } catch {}
}

const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
writeFileSync(OUTPUT_PATH, buf);
console.log(`\n🎉 完成！数据已写入 ${OUTPUT_PATH}`);
console.log(`   共导入 ${Object.values(dataStore).reduce((s, m) => s + m.size, 0)} 天的数据`);
