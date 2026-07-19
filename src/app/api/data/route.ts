/**
 * 数据 API — 供 Web 仪表盘调用（v2 更新）
 *
 * GET /api/data?type=dashboard     — 仪表盘全量数据
 * GET /api/data?type=weight&days=30
 * GET /api/data?type=body_fat&days=30
 * GET /api/data?type=diet&days=7
 * GET /api/data?type=sleep&days=30
 * GET /api/data?type=active_energy&days=30
 * GET /api/data?type=strength_training&days=30
 * GET /api/data?type=cardio_training&days=30
 * GET /api/data?type=goal
 * GET /api/data?type=sync_status
 */

import { NextRequest, NextResponse } from "next/server";
import * as excel from "@/lib/excel";

// ============================================================
// POST: 写入操作（饮食 / 训练）
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "add_diet": {
        const { calories, protein, carbs, fat, foodDesc, mealType, date, note } = body;
        if (!calories || !mealType || !foodDesc) {
          return NextResponse.json(
            { error: "缺少必填字段：calories, mealType, foodDesc" },
            { status: 400 }
          );
        }
        const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        const entryDate = date || new Date().toISOString().split("T")[0];
        excel.addDietRecord({
          日期: entryDate,
          记录时间: now,
          餐次: mealType,
          食物描述: foodDesc,
          "热量(kcal)": Number(calories),
          "蛋白质(g)": Number(protein) || 0,
          "碳水(g)": Number(carbs) || 0,
          "脂肪(g)": Number(fat) || 0,
          备注: note || "",
        });
        return NextResponse.json({ success: true, date: entryDate, mealType });
      }

      case "add_strength": {
        const { calories, rpe, date, note } = body;
        if (!calories || !rpe) {
          return NextResponse.json(
            { error: "缺少必填字段：calories, rpe" },
            { status: 400 }
          );
        }
        if (Number(rpe) < 1 || Number(rpe) > 10) {
          return NextResponse.json(
            { error: "RPE 必须在 1-10 范围内" },
            { status: 400 }
          );
        }
        excel.addStrengthTraining({
          日期: date || new Date().toISOString().split("T")[0],
          训练类型: "力量训练",
          "卡路里(kcal)": Number(calories),
          "疲劳度(RPE)": Number(rpe),
          备注: note || "",
        });
        return NextResponse.json({ success: true });
      }

      case "add_cardio": {
        const { calories, rpe, date, note } = body;
        if (!calories || !rpe) {
          return NextResponse.json(
            { error: "缺少必填字段：calories, rpe" },
            { status: 400 }
          );
        }
        if (Number(rpe) < 1 || Number(rpe) > 10) {
          return NextResponse.json(
            { error: "RPE 必须在 1-10 范围内" },
            { status: 400 }
          );
        }
        excel.addCardioTraining({
          日期: date || new Date().toISOString().split("T")[0],
          训练类型: "有氧训练",
          "卡路里(kcal)": Number(calories),
          "疲劳度(RPE)": Number(rpe),
          备注: note || "",
        });
        return NextResponse.json({ success: true });
      }

      case "save_goal": {
        const { targetWeight, weeklyPct, dailyCalories } = body;
        const today = new Date().toISOString().split("T")[0];

        const weights = excel.readSheet(excel.SHEETS.WEIGHT);
        const latestWeight =
          weights.length > 0
            ? parseFloat(String(weights[weights.length - 1]["体重(kg)"])) || 0
            : 0;

        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 12 * 7);
        const targetDateStr = targetDate.toISOString().split("T")[0];

        const currentWeekTarget = latestWeight * Number(weeklyPct) / 100;

        excel.saveGoal({
          设定日期: today,
          "目标体重(kg)": Number(targetWeight),
          目标日期: targetDateStr,
          "起始体重(kg)": latestWeight,
          "每周减重百分比(%)": Number(weeklyPct),
          "当前周应减(kg)": Math.round(currentWeekTarget * 100) / 100,
          "每日热量目标(kcal)": Number(dailyCalories),
        });

        excel.recalculateWeeklyTarget();

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          { error: "未知 action，支持：add_diet, add_strength, add_cardio, save_goal" },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("Data API POST error:", err);
    return NextResponse.json(
      { error: "写入失败" },
      { status: 500 }
    );
  }
}

// ============================================================
// GET: 查询操作
// ============================================================

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "dashboard";
  const days = parseInt(searchParams.get("days") || "30");

  try {
    switch (type) {
      // --- 体重 + 体脂率 ---
      case "weight": {
        const weights = excel.readSheet(excel.SHEETS.WEIGHT);
        const fats = excel.readSheet(excel.SHEETS.BODY_FAT);
        const goal = excel.getGoal();

        return NextResponse.json({
          weights: weights.slice(-days).map((r) => ({
            date: String(r["日期"]),
            weight: parseFloat(String(r["体重(kg)"])) || 0,
            source: String(r["数据来源"] || ""),
            note: String(r["备注"] || ""),
            syncTime: String(r["同步时间"] || ""),
          })),
          bodyFats: fats.slice(-days).map((r) => ({
            date: String(r["日期"]),
            bodyFat: parseFloat(String(r["体脂率(%)"])) || 0,
            source: String(r["数据来源"] || ""),
            note: String(r["备注"] || ""),
            syncTime: String(r["同步时间"] || ""),
          })),
          goal: goal
            ? {
                targetWeight: parseFloat(String(goal["目标体重(kg)"])) || 0,
                targetDate: String(goal["目标日期"] || ""),
                startWeight: parseFloat(String(goal["起始体重(kg)"])) || 0,
                weeklyPct: parseFloat(String(goal["每周减重百分比(%)"])) || 0,
                currentWeekTarget:
                  parseFloat(String(goal["当前周应减(kg)"])) || 0,
                dailyCalorieTarget:
                  parseFloat(String(goal["每日热量目标(kcal)"])) || 2000,
              }
            : null,
        });
      }

      // --- 饮食 ---
      case "diet": {
        const dietRecords = excel.readSheet(excel.SHEETS.DIET);
        const summaries = excel.readSheet(excel.SHEETS.DIET_SUMMARY);
        return NextResponse.json({
          records: dietRecords.slice(-days * 5),
          summaries: summaries.slice(-days),
        });
      }

      // --- 睡眠 ---
      case "sleep": {
        const sleeps = excel.readSheet(excel.SHEETS.SLEEP);
        return NextResponse.json({
          sleeps: sleeps.slice(-days).map((r) => ({
            date: String(r["日期"]),
            hours: parseFloat(String(r["睡眠时长(小时)"])) || 0,
            bedHours: parseFloat(String(r["卧床时长(小时)"])) || 0,
            source: String(r["数据来源"] || ""),
            note: String(r["备注"] || ""),
            syncTime: String(r["同步时间"] || ""),
          })),
        });
      }

      // --- 活动卡路里 ---
      case "active_energy": {
        const data = excel.readSheet(excel.SHEETS.ACTIVE_ENERGY);
        return NextResponse.json({
          records: data.slice(-days).map((r) => ({
            date: String(r["日期"]),
            calories: parseFloat(String(r["活动卡路里(kcal)"])) || 0,
            source: String(r["数据来源"] || ""),
            syncTime: String(r["同步时间"] || ""),
          })),
        });
      }

      // --- 力量训练 ---
      case "strength_training": {
        const data = excel.readSheet(excel.SHEETS.STRENGTH_TRAINING);
        return NextResponse.json({
          records: data.slice(-days),
        });
      }

      // --- 有氧训练 ---
      case "cardio_training": {
        const data = excel.readSheet(excel.SHEETS.CARDIO_TRAINING);
        return NextResponse.json({
          records: data.slice(-days),
        });
      }

      // --- 目标 ---
      case "goal": {
        const goal = excel.getGoal();
        return NextResponse.json({ goal });
      }

      // --- 同步状态 ---
      case "sync_status": {
        return NextResponse.json(excel.getSyncStatus());
      }

      // --- 仪表盘全量数据 ---
      case "dashboard": {
        const weights = excel.readSheet(excel.SHEETS.WEIGHT);
        const fats = excel.readSheet(excel.SHEETS.BODY_FAT);
        const dietSummary = excel.readSheet(excel.SHEETS.DIET_SUMMARY);
        const sleeps = excel.readSheet(excel.SHEETS.SLEEP);
        const activeEnergy = excel.readSheet(excel.SHEETS.ACTIVE_ENERGY);
        const goal = excel.getGoal();
        const today = new Date().toISOString().split("T")[0];
        const syncStatus = excel.getSyncStatus();

        const todaySummary = dietSummary.find(
          (r) => String(r["日期"]) === today
        );

        return NextResponse.json({
          today: {
            calories: todaySummary
              ? parseInt(String(todaySummary["总热量"]))
              : 0,
            protein: todaySummary
              ? parseInt(String(todaySummary["总蛋白质"]))
              : 0,
            carbs: todaySummary
              ? parseInt(String(todaySummary["总碳水"]))
              : 0,
            fat: todaySummary
              ? parseInt(String(todaySummary["总脂肪"]))
              : 0,
            meals: todaySummary
              ? parseInt(String(todaySummary["餐次数"]))
              : 0,
          },
          weights: weights.slice(-30).map((r) => ({
            date: String(r["日期"]),
            weight: parseFloat(String(r["体重(kg)"])) || 0,
            source: String(r["数据来源"] || ""),
          })),
          bodyFats: fats.slice(-30).map((r) => ({
            date: String(r["日期"]),
            bodyFat: parseFloat(String(r["体脂率(%)"])) || 0,
            source: String(r["数据来源"] || ""),
          })),
          dietSummary: dietSummary.slice(-30),
          sleeps: sleeps.slice(-30).map((r) => ({
            date: String(r["日期"]),
            hours: parseFloat(String(r["睡眠时长(小时)"])) || 0,
          })),
          activeEnergies: activeEnergy.slice(-30).map((r) => ({
            date: String(r["日期"]),
            kcal: parseFloat(String(r["活动卡路里(kcal)"])) || 0,
          })),
          goal: goal
            ? {
                targetWeight: parseFloat(String(goal["目标体重(kg)"])) || 0,
                weeklyPct: parseFloat(String(goal["每周减重百分比(%)"])) || 0,
                currentWeekTarget:
                  parseFloat(String(goal["当前周应减(kg)"])) || 0,
                dailyCalorieTarget:
                  parseFloat(String(goal["每日热量目标(kcal)"])) || 2000,
              }
            : null,
          syncStatus,
        });
      }

      default:
        return NextResponse.json(
          { error: "Unknown data type" },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("Data API error:", err); console.error("Stack:", err instanceof Error ? err.stack : String(err));
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
