/**
 * 趋势分析引擎 — 统计计算 + 告警阈值
 *
 * 不依赖外部 AI API，纯统计算法。告警结果可直接展示或转发外部大模型。
 */

import type { TrendData, TrendDataPoint, TrendStats } from "./excel";

// ============================================================
// 告警阈值配置（默认值，后续可开放用户自定义）
// ============================================================

export interface Thresholds {
  /** 安全减重上限 %/周（超过触发严重告警） */
  maxWeeklyWeightLossPct: number;
  /** 体重上升告警阈值 %/周 */
  maxWeeklyWeightGainPct: number;
  /** 睡眠不足阈值 (小时) */
  sleepInsufficientHours: number;
  /** 睡眠严重不足阈值 (小时) */
  sleepSevereHours: number;
  /** 热量超标阈值 (超过目标百分比) */
  calorieOverTargetPct: number;
  /** 热量连续超标天数触发告警 */
  calorieOverDays: number;
  /** 数据同步超时 (小时) */
  syncTimeoutHours: number;
  /** 蛋白质最低摄入 (g/kg 体重) */
  minProteinGPerKg: number;
  /** 平台期判定天数 */
  plateauDays: number;
  /** 平台期体重变化阈值 (kg) */
  plateauThresholdKg: number;
  /** 活动量下降连续天数 */
  activityDropDays: number;
  /** 活动量下降比例 (低于均值百分比) */
  activityDropPct: number;
  /** 热量达标率正面阈值 */
  calorieGoalHitRateGood: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  maxWeeklyWeightLossPct: 1.5,
  maxWeeklyWeightGainPct: 1.0,
  sleepInsufficientHours: 7,
  sleepSevereHours: 6,
  calorieOverTargetPct: 1.1,
  calorieOverDays: 3,
  syncTimeoutHours: 48,
  minProteinGPerKg: 1.2,
  plateauDays: 14,
  plateauThresholdKg: 0.3,
  activityDropDays: 3,
  activityDropPct: 0.7,
  calorieGoalHitRateGood: 0.8,
};

// ============================================================
// Flag 类型
// ============================================================

export type FlagLevel = "critical" | "warning" | "info" | "positive";

export interface Flag {
  level: FlagLevel;
  metric: string;
  message: string;
}

// ============================================================
// 告警引擎
// ============================================================

export function evaluateFlags(
  data: TrendData,
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): Flag[] {
  const flags: Flag[] = [];

  // --- 🔴 严重 ---

  // 体重下降过快 + 体脂未同步
  if (data.weight.stats && data.bodyFat.stats) {
    const wPct = Math.abs(data.weight.stats.changePct);
    const bfChange = data.bodyFat.stats.change;
    if (
      data.weight.stats.change < 0 &&
      wPct > thresholds.maxWeeklyWeightLossPct &&
      bfChange >= 0
    ) {
      flags.push({
        level: "critical",
        metric: "weight",
        message: `体重下降过快（${wPct.toFixed(1)}%/周），体脂率未同步变化 → 可能流失肌肉`,
      });
    }
  }

  // 体重上升 + 热量超标
  if (data.weight.stats && data.diet.stats) {
    const wPct = data.weight.stats.changePct;
    if (
      data.weight.stats.change > 0 &&
      wPct > thresholds.maxWeeklyWeightGainPct &&
      data.diet.stats.calorieGoalHitRate < 0.5
    ) {
      flags.push({
        level: "critical",
        metric: "weight",
        message: `体重上升 ${data.weight.stats.change.toFixed(1)}kg（${wPct.toFixed(1)}%），近 7 天热量达标率偏低`,
      });
    }
  }

  // 睡眠严重不足
  if (data.sleep.stats && data.sleep.stats.avg < thresholds.sleepSevereHours) {
    flags.push({
      level: "critical",
      metric: "sleep",
      message: `周均睡眠仅 ${data.sleep.stats.avg.toFixed(1)}h，严重不足 → 影响代谢和训练恢复`,
    });
  }

  // --- 🟡 警告 ---

  // 睡眠不足（≥3 天 < 7h）
  if (
    data.sleep.stats &&
    "daysBelow7h" in data.sleep.stats &&
    (data.sleep.stats as { daysBelow7h: number }).daysBelow7h >= 3
  ) {
    const days = (data.sleep.stats as { daysBelow7h: number }).daysBelow7h;
    flags.push({
      level: "warning",
      metric: "sleep",
      message: `近 7 天有 ${days} 天睡眠不足 ${thresholds.sleepInsufficientHours}h`,
    });
  }

  // 热量连续超标
  if (data.diet.stats && data.goal) {
    const calorieData = data.diet.summary
      .map((r) => parseFloat(String(r["总热量"])) || 0)
      .slice(-thresholds.calorieOverDays);
    const overCount = calorieData.filter(
      (c) => c > data.goal!.dailyCalories * thresholds.calorieOverTargetPct
    ).length;
    if (overCount >= thresholds.calorieOverDays) {
      flags.push({
        level: "warning",
        metric: "diet",
        message: `连续 ${overCount} 天热量超标（目标 ${data.goal.dailyCalories} kcal）`,
      });
    }
  }

  // 蛋白质摄入不足
  if (data.diet.stats && data.weight.stats) {
    const avgProtein = data.diet.stats.avgProtein;
    const currentWeight = data.weight.stats.end;
    if (
      currentWeight > 0 &&
      avgProtein < thresholds.minProteinGPerKg * currentWeight
    ) {
      flags.push({
        level: "warning",
        metric: "diet",
        message: `日均蛋白质 ${avgProtein.toFixed(0)}g，低于 ${thresholds.minProteinGPerKg}g/kg 建议（当前体重 ${currentWeight}kg）`,
      });
    }
  }

  // 数据同步异常（> 48h）
  for (const [key, status] of Object.entries(data.syncStatus)) {
    if (status.status === "error") {
      const label =
        { weight: "体重", body_fat: "体脂率", sleep: "睡眠", active_energy: "活动卡路里" }[
          key
        ] || key;
      flags.push({
        level: "warning",
        metric: key,
        message: `${label} 已超过 48h 未同步`,
      });
    }
  }

  // --- 🟢 正面 ---

  // 体重健康下降
  if (data.weight.stats && data.bodyFat.stats) {
    const wPct = Math.abs(data.weight.stats.changePct);
    if (
      data.weight.stats.change < 0 &&
      wPct <= thresholds.maxWeeklyWeightLossPct &&
      wPct >= 0.3 &&
      data.bodyFat.stats.change < 0
    ) {
      flags.push({
        level: "positive",
        metric: "weight",
        message: `体重下降 ${wPct.toFixed(1)}%，体脂率同步下降 → 趋势健康`,
      });
    }
  }

  // 热量控制良好
  if (data.diet.stats && data.diet.stats.calorieGoalHitRate >= thresholds.calorieGoalHitRateGood) {
    flags.push({
      level: "positive",
      metric: "diet",
      message: `近 7 天热量达标率 ${(data.diet.stats.calorieGoalHitRate * 100).toFixed(0)}%`,
    });
  }

  // 活动量稳定
  if (data.activeEnergy.stats) {
    const values = data.activeEnergy.data.map((d) => d.value);
    const avg = data.activeEnergy.stats.avg;
    if (avg > 0) {
      const variance =
        values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
      const cv = Math.sqrt(variance) / avg;
      if (cv < 0.2) {
        flags.push({
          level: "positive",
          metric: "active_energy",
          message: `活动消耗稳定，日均 ${avg.toFixed(0)} kcal`,
        });
      }
    }
  }

  // --- 🔵 提示 ---

  // 平台期检测
  if (
    data.weight.data.length >= thresholds.plateauDays &&
    data.weight.stats &&
    Math.abs(data.weight.stats.change) < thresholds.plateauThresholdKg
  ) {
    flags.push({
      level: "info",
      metric: "weight",
      message: `体重已连续 ${data.weight.data.length} 天无明显变化 → 可能进入平台期`,
    });
  }

  // 活动量下降
  if (data.activeEnergy.stats && data.activeEnergy.data.length >= thresholds.activityDropDays) {
    const recent = data.activeEnergy.data.slice(-thresholds.activityDropDays);
    const avg = data.activeEnergy.stats.avg;
    const allBelow = recent.every(
      (d) => d.value < avg * thresholds.activityDropPct
    );
    if (allBelow) {
      flags.push({
        level: "info",
        metric: "active_energy",
        message: `近 ${thresholds.activityDropDays} 天活动量偏低（低于均值 ${(thresholds.activityDropPct * 100).toFixed(0)}%）`,
      });
    }
  }

  // 体脂率无数据
  if (data.bodyFat.data.length === 0) {
    flags.push({
      level: "info",
      metric: "body_fat",
      message: "体脂率暂无数据，可能未配置智能体脂秤或未同步",
    });
  }

  return flags;
}
