/**
 * 从 AI 回答文本中解析营养素数值
 *
 * 支持的常见格式：
 *   - 热量：约 414 kcal
 *   - 蛋白质：约 45.9 g
 *   - **热量**：约 **414 kcal**
 *   - 碳水化合物：约 36.9 g
 *   - 卡路里 414 卡
 *
 * 单位处理：
 *   - 热量支持 kcal / 千卡 / 卡路里 / 卡（1 卡 = 0.001 kcal）
 *   - 蛋白质/碳水/脂肪单位为 g
 */

export interface ParsedNutrition {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  desc?: string;
  missing: string[]; // 未解析到的字段
}

function matchNumber(text: string, regex: RegExp): number | undefined {
  const m = text.match(regex);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return isNaN(n) ? undefined : n;
}

/**
 * 提取文本中第一个看起来像食物描述的句子作为 desc
 */
function extractDesc(text: string): string | undefined {
  // 去掉 markdown 加粗符号
  const cleaned = text.replace(/\*\*/g, "").trim();
  // 找到第一个「我吃了XXX」模式
  const ate = cleaned.match(/我吃了([^，。,.\n]{2,40})/);
  if (ate) return ate[1].trim();
  // 取第一行作为描述
  const firstLine = cleaned.split("\n").map(s => s.trim()).find(Boolean);
  return firstLine ? firstLine.slice(0, 60) : undefined;
}

export function parseNutrition(text: string): ParsedNutrition {
  const result: ParsedNutrition = { missing: [] };

  // 热量：支持 kcal / 千卡 / 卡路里 / 卡（1 卡 = 0.001 kcal）
  const caloriesRaw =
    matchNumber(text, /热量[：:]?\s*[约为约]?\s*(\d+(?:\.\d+)?)\s*(?:kcal|千卡|大卡)/i) ??
    matchNumber(text, /卡路里[：:]?\s*[约为约]?\s*(\d+(?:\.\d+)?)\s*(?:kcal|千卡|大卡)/i) ??
    matchNumber(text, /热量[：:]?\s*[约为约]?\s*(\d+(?:\.\d+)?)\s*卡(?!\s*路里)/);
  if (caloriesRaw !== undefined) {
    // 检测单位是否为"卡"（小卡）而非"卡路里/kcal"
    const unitHint = text.match(/热量[：:]?\s*[约为约]?\s*\d+(?:\.\d+)?\s*([\u4e00-\u9fa5a-zA-Z]+)/);
    if (unitHint && /^(卡)(?!路里|路|卡)/.test(unitHint[1])) {
      // 1 大卡 = 1000 小卡
      result.calories = Math.round(caloriesRaw * 0.001 * 10) / 10;
    } else {
      result.calories = Math.round(caloriesRaw * 10) / 10;
    }
  } else {
    result.missing.push("热量");
  }

  // 蛋白质
  const proteinRaw =
    matchNumber(text, /蛋白质[：:]?\s*[约为约]?\s*(\d+(?:\.\d+)?)\s*g/i);
  if (proteinRaw !== undefined) {
    result.protein = Math.round(proteinRaw * 10) / 10;
  } else {
    result.missing.push("蛋白质");
  }

  // 碳水（支持"碳水化合物"和"碳水"）
  const carbsRaw =
    matchNumber(text, /碳水(?:化合物)?[：:]?\s*[约为约]?\s*(\d+(?:\.\d+)?)\s*g/i);
  if (carbsRaw !== undefined) {
    result.carbs = Math.round(carbsRaw * 10) / 10;
  } else {
    result.missing.push("碳水");
  }

  // 脂肪
  const fatRaw =
    matchNumber(text, /脂肪[：:]?\s*[约为约]?\s*(\d+(?:\.\d+)?)\s*g/i);
  if (fatRaw !== undefined) {
    result.fat = Math.round(fatRaw * 10) / 10;
  } else {
    result.missing.push("脂肪");
  }

  // 食物描述
  const desc = extractDesc(text);
  if (desc) result.desc = desc;

  return result;
}