/**
 * 从 AI 回答文本中解析营养素数值
 *
 * 支持的常见格式：
 *   - 热量：约 414 kcal
 *   - 蛋白质：约 45.9 g
 *   - **热量**：约 **414 kcal**
 *   - 碳水化合物：约 36.9 g
 *   - 卡路里 414 卡
 *   - 总热量：约 1500 kcal
 *   - 总摄入：800 kcal
 *
 * 单位处理：
 *   - 热量支持 kcal / 千卡 / 大卡 / 卡路里 / 卡（1 卡 = 0.001 kcal）
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

export interface MultiMealItem {
  desc: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

function matchNumber(text: string, regex: RegExp): number | undefined {
  const m = text.match(regex);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return isNaN(n) ? undefined : n;
}

// 营养素关键词（用于 extractDesc 中跳过营养素行）
const NUTRIENT_KEYWORDS = /^(热量|卡路里|蛋白质|碳水|脂肪|总热量|总摄入)/;
const NUTRIENT_SKIP_PREFIXES = /^(约|#{1,3}\s)/;

/**
 * 更智能的 extractDesc —— 提取食物描述
 *
 * 优先级：
 * 1. 「我吃了XXX」句式
 * 2. 「食物：XXX」或「描述：XXX」标注行
 * 3. 第一个不是营养素关键词的行
 * 4. 回退到第一行（去掉行首编号 - * • 数字. 、）
 */
function extractDesc(text: string): string | undefined {
  // 去掉 markdown 加粗符号
  const cleaned = text.replace(/\*\*/g, "").trim();
  if (!cleaned) return undefined;

  // 优先级 1：「我吃了XXX」
  const ate = cleaned.match(/我吃了([^，。,.\n]{2,60})/);
  if (ate) return ate[1].trim();

  // 优先级 2：「食物：XXX」或「描述：XXX」
  const labeled = cleaned.match(/(?:食物|描述)[：:]\s*(.+?)(?:\n|$)/);
  if (labeled) return labeled[1].trim().slice(0, 60);

  // 优先级 3：第一个不是营养素关键词的行
  const lines = cleaned.split("\n").map(s => s.trim()).filter(Boolean);
  for (const line of lines) {
    // 跳过以「约」或「###」等开头的行
    if (NUTRIENT_SKIP_PREFIXES.test(line)) continue;
    // 跳过营养素关键词开头的行
    if (NUTRIENT_KEYWORDS.test(line)) continue;
    return line.slice(0, 60);
  }

  // 优先级 4：回退到第一行，去掉行首编号
  const firstLine = lines[0];
  if (firstLine) {
    const stripped = firstLine.replace(/^[-*•\d]+[.、)\s]+/, "").trim();
    return stripped.slice(0, 60);
  }

  return undefined;
}

export function parseNutrition(text: string): ParsedNutrition {
  const result: ParsedNutrition = { missing: [] };

  // 热量：支持 kcal / 千卡 / 卡路里 / 卡（1 卡 = 0.001 kcal）
  // 新增「总热量」和「总摄入」模式（放在末尾，最低优先级）
  const caloriesRaw =
    matchNumber(text, /热量[：:]?\s*[约为约]?\s*(\d+(?:\.\d+)?)\s*(?:kcal|千卡|大卡)/i) ??
    matchNumber(text, /卡路里[：:]?\s*[约为约]?\s*(\d+(?:\.\d+)?)\s*(?:kcal|千卡|大卡)/i) ??
    matchNumber(text, /热量[：:]?\s*[约为约]?\s*(\d+(?:\.\d+)?)\s*卡(?!\s*路里)/) ??
    matchNumber(text, /总热量[：:]?\s*[约为约]?\s*(\d+(?:\.\d+)?)\s*kcal/i) ??
    matchNumber(text, /总摄入[：:]?\s*(\d+(?:\.\d+)?)\s*kcal/i);
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

// ── 批量多餐解析 ──

const NUTRIENT_LINE_RE = /^(热量|卡路里|蛋白质|碳水|脂肪|总[热量卡])/;

/**
 * 从一段多餐文本中提取食物描述（营养行之前的所有行，用顿号连接）
 */
function extractMultiDesc(text: string): string {
  const cleaned = text.replace(/\*\*/g, "").trim();
  const lines = cleaned.split("\n").map(s => s.trim()).filter(Boolean);
  const descLines: string[] = [];
  for (const line of lines) {
    if (NUTRIENT_LINE_RE.test(line)) break;
    descLines.push(line);
  }
  return descLines.join("、") || lines[0]?.slice(0, 60) || "";
}

/**
 * 按空行拆分为多餐，每餐独立 parseNutrition
 */
export function parseMultiMeal(text: string): MultiMealItem[] {
  if (!text.trim()) return [];
  const blocks = text.split(/\n\s*\n/).filter(b => b.trim());
  return blocks.map(block => {
    const parsed = parseNutrition(block);
    return {
      desc: extractMultiDesc(block),
      calories: parsed.calories !== undefined ? String(parsed.calories) : "",
      protein: parsed.protein !== undefined ? String(parsed.protein) : "",
      carbs: parsed.carbs !== undefined ? String(parsed.carbs) : "",
      fat: parsed.fat !== undefined ? String(parsed.fat) : "",
    };
  });
}
