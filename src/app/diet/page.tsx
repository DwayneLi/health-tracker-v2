"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getTodayStr } from "@/lib/date";
import { parseNutrition, parseMultiMeal } from "@/lib/nutrition-parser";
import type { MultiMealItem } from "@/lib/nutrition-parser";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

interface DietRecord {
  日期: string;
  记录时间: string;
  餐次: string;
  食物描述: string;
  热量: number;
  蛋白质: number;
  碳水: number;
  脂肪: number;
}

// ── 蛋白粉预设 ──
const PROTEIN_PRESETS = [
  { name: "酵母蛋白粉", scoopG: 37, s1: { cal: 153, p: 32, c: 0, f: 2 }, s2: { cal: 306, p: 64, c: 1, f: 5 } },
  { name: "酪蛋白粉",   scoopG: 33, s1: { cal: 123, p: 28, c: 1, f: 0 }, s2: { cal: 246, p: 57, c: 2, f: 1 } },
  { name: "乳清蛋白粉", scoopG: 30, s1: { cal: 120, p: 23, c: 3, f: 2 }, s2: { cal: 241, p: 46, c: 6, f: 4 } },
];

export default function DietPage() {
  const today = getTodayStr();
  const hour = new Date().getHours();
  const defaultMeal =
    hour >= 5 && hour < 10 ? "早餐"
    : hour >= 10 && hour < 14 ? "午餐"
    : hour >= 14 && hour < 21 ? "晚餐"
    : "加餐";

  const [form, setForm] = useState({
    date: today, mealType: defaultMeal, foodDesc: "",
    calories: "", protein: "", carbs: "", fat: "", note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [aiText, setAiText] = useState("");
  const [parserFeedback, setParserFeedback] = useState<string | null>(null);
  const [records, setRecords] = useState<DietRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const formCardRef = useRef<HTMLDivElement>(null);

  // 批量多餐状态
  const [multiMeals, setMultiMeals] = useState<MultiMealItem[]>([]);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchFeedback, setBatchFeedback] = useState<string | null>(null);
  // 单餐解析结果（右列显示）
  const [parsedResult, setParsedResult] = useState<{
    desc: string; calories: string; protein: string; carbs: string; fat: string;
  } | null>(null);

  // 趋势图数据
  const [dietSummaries, setDietSummaries] = useState<Record<string, unknown>[]>([]);
  const [calorieTarget, setCalorieTarget] = useState<number>(1500);
  const [latestWeight, setLatestWeight] = useState<number>(0);
  const [exercisedToday, setExercisedToday] = useState(false);
  const [trendDays, setTrendDays] = useState(7);
  const [showCalTarget, setShowCalTarget] = useState(false);
  const [showProteinTarget, setShowProteinTarget] = useState(false);
  const [nutrientFilter, setNutrientFilter] = useState({ calories: true, protein: true, carbs: true, fat: true });

  const fetchRecords = useCallback(async () => {
    try {
      const [dietR, goalR, weightR] = await Promise.all([
        fetch("/api/data?type=diet&days=30"),
        fetch("/api/data?type=goal"),
        fetch("/api/data?type=weight&days=30"),
      ]);
      const d = await dietR.json();
      const mapped: DietRecord[] = (d.records || []).map((r: any) => ({
        日期: String(r["日期"]),
        记录时间: String(r["记录时间"] || ""),
        餐次: String(r["餐次"] || ""),
        食物描述: String(r["食物描述"] || ""),
        热量: parseInt(String(r["热量(kcal)"])) || 0,
        蛋白质: parseInt(String(r["蛋白质(g)"])) || 0,
        碳水: parseInt(String(r["碳水(g)"])) || 0,
        脂肪: parseInt(String(r["脂肪(g)"])) || 0,
      }));
      setRecords(mapped.slice(-20).reverse());
      const summaries = (d.summaries || [])
        .sort((a: any, b: any) => String(a["日期"]).localeCompare(String(b["日期"])))
        .slice(-30);
      setDietSummaries(summaries);
      const goalData = await goalR.json();
      if (goalData.goal) {
        setCalorieTarget(parseFloat(String(goalData.goal["每日热量目标(kcal)"])) || 1500);
      }
      const weightData = await weightR.json();
      const ws = weightData.weights || [];
      setLatestWeight(ws.length > 0 ? ws[ws.length - 1].weight : 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const setField = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async () => {
    if (!form.foodDesc.trim()) { setFeedback({ type: "error", msg: "请输入食物描述" }); return; }
    if (!form.calories || isNaN(Number(form.calories))) { setFeedback({ type: "error", msg: "请输入有效的热量值" }); return; }
    setSubmitting(true); setFeedback(null);
    try {
      const resp = await fetch("/api/data", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_diet", foodDesc: form.foodDesc.trim(), mealType: form.mealType,
          calories: Number(form.calories), protein: Number(form.protein) || 0,
          carbs: Number(form.carbs) || 0, fat: Number(form.fat) || 0,
          date: form.date, note: form.note,
        }),
      });
      if (resp.ok) {
        setFeedback({ type: "success", msg: "✅ 已记录！" });
        setForm(p => ({ ...p, foodDesc: "", calories: "", protein: "", carbs: "", fat: "", note: "" }));
        fetchRecords();
      } else {
        const err = await resp.json();
        setFeedback({ type: "error", msg: `❌ ${err.error || "记录失败"}` });
      }
    } catch { setFeedback({ type: "error", msg: "❌ 网络错误，请重试" }); }
    finally { setSubmitting(false); setTimeout(() => setFeedback(null), 3000); }
  };

  const recent20 = records;

  // 趋势图数据
  const chartData = dietSummaries
    .slice(-trendDays)
    .map(r => ({
      date: String(r["日期"]).slice(5),
      calories: parseInt(String(r["总热量"])) || 0,
      protein: Math.round(parseFloat(String(r["总蛋白质"])) || 0),
      carbs: Math.round(parseFloat(String(r["总碳水"])) || 0),
      fat: Math.round(parseFloat(String(r["总脂肪"])) || 0),
    }));
  const proteinTarget = latestWeight * (exercisedToday ? 1.6 : 1.2);

  const toggleNutrient = (k: string) =>
    setNutrientFilter(p => ({ ...p, [k]: !(p as any)[k] }));

  const handleCopy = (r: DietRecord) => {
    setForm(p => ({
      ...p,
      foodDesc: r.食物描述,
      calories: String(r.热量), protein: String(r.蛋白质),
      carbs: String(r.碳水), fat: String(r.脂肪), note: "",
    }));
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── AI 解析 ──
  const handleParse = () => {
    if (!aiText.trim()) {
      setParserFeedback("请粘贴 AI 回答内容");
      return;
    }
    setMultiMeals([]);
    setParsedResult(null);
    setParserFeedback(null);

    // 判断是否为多餐：营养素关键词出现 ≥5 次，或有空行分隔
    const nutrientCount = (aiText.match(/(热量|卡路里|蛋白质|碳水|脂肪|总[热量卡])/g) || []).length;
    const hasBlankLine = /\n\s*\n/.test(aiText);

    if (nutrientCount >= 5 || hasBlankLine) {
      // 多餐模式
      const meals = parseMultiMeal(aiText);
      if (meals.length === 0) {
        setParserFeedback("⚠️ 未能解析到餐次，请检查格式");
        return;
      }
      setMultiMeals(meals);
      setParserFeedback(`✅ 解析到 ${meals.length} 餐，可在下方修改后一键录入`);
    } else {
      // 单餐模式
      const parsed = parseNutrition(aiText);
      const result = {
        desc: parsed.desc || "",
        calories: parsed.calories !== undefined ? String(parsed.calories) : "",
        protein: parsed.protein !== undefined ? String(parsed.protein) : "",
        carbs: parsed.carbs !== undefined ? String(parsed.carbs) : "",
        fat: parsed.fat !== undefined ? String(parsed.fat) : "",
      };
      setParsedResult(result);
      const found = [result.calories && "热量", result.protein && "蛋白质", result.carbs && "碳水", result.fat && "脂肪"].filter(Boolean);
      if (parsed.missing.length === 0) {
        setParserFeedback(`✅ 已解析 ${found.length} 项营养素`);
      } else {
        setParserFeedback(`⚠️ 已解析 ${found.length} 项，缺少：${parsed.missing.join("、")}`);
      }
    }
    setTimeout(() => setParserFeedback(null), 4000);
  };

  // ── 单餐解析结果填入表单 ──
  const applyParsed = () => {
    if (!parsedResult) return;
    setForm(p => ({
      ...p,
      foodDesc: parsedResult.desc || p.foodDesc,
      calories: parsedResult.calories || p.calories,
      protein: parsedResult.protein || p.protein,
      carbs: parsedResult.carbs || p.carbs,
      fat: parsedResult.fat || p.fat,
    }));
    setParsedResult(null);
    setParserFeedback(null);
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── 蛋白粉快速填充 ──
  const fillProtein = (preset: typeof PROTEIN_PRESETS[0], scoops: 1 | 2) => {
    const s = scoops === 1 ? preset.s1 : preset.s2;
    setForm(p => ({
      ...p,
      foodDesc: preset.name,
      calories: String(s.cal),
      protein: String(s.p),
      carbs: String(s.c),
      fat: String(s.f),
    }));
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── 批量多餐录入 ──
  const handleBatchSave = async () => {
    setBatchSaving(true);
    setBatchFeedback(null);
    const mealOrder = ["早餐", "午餐", "晚餐"];
    let success = 0;
    let fail = 0;

    try {
      await Promise.all(multiMeals.map(async (meal, i) => {
        const mealType = i < 3 ? mealOrder[i] : "加餐";
        const resp = await fetch("/api/data", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add_diet",
            foodDesc: meal.desc || `第${i + 1}餐`,
            mealType,
            calories: Number(meal.calories) || 0,
            protein: Number(meal.protein) || 0,
            carbs: Number(meal.carbs) || 0,
            fat: Number(meal.fat) || 0,
            date: form.date,
            note: "",
          }),
        });
        if (resp.ok) success++; else fail++;
      }));

      if (fail === 0) {
        setBatchFeedback(`✅ 全部 ${success} 餐已录入！`);
        setMultiMeals([]);
        setAiText("");
        fetchRecords();
      } else {
        setBatchFeedback(`⚠️ ${success} 成功，${fail} 失败`);
      }
    } catch {
      setBatchFeedback("❌ 网络错误，请重试");
    } finally {
      setBatchSaving(false);
      setTimeout(() => setBatchFeedback(null), 4000);
    }
  };

  // ── 多餐列表编辑 ──
  const updateMultiMeal = (i: number, field: string, value: string) => {
    setMultiMeals(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  };
  const removeMultiMeal = (i: number) => {
    setMultiMeals(prev => prev.filter((_, idx) => idx !== i));
  };
  const addMultiMeal = () => {
    setMultiMeals(prev => [...prev, { desc: "", calories: "", protein: "", carbs: "", fat: "" }]);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold">🍽️ 饮食录入</h1>

      {/* ── AI 解析区：双列布局，始终可见 ── */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-sm font-medium text-gray-500 mb-4">🤖 AI 辅助解析</h2>
        <div className="flex flex-col md:flex-row gap-4">
          {/* 左列：粘贴区 */}
          <div className="flex-1">
            <textarea
              rows={10}
              value={aiText}
              onChange={e => { setAiText(e.target.value); setMultiMeals([]); setParsedResult(null); setParserFeedback(null); }}
              placeholder={`请按以下格式回复（第一行=食物名，接下来放营养素，支持一次粘贴多餐，用空行分隔）：

150 克米饭、75 克番茄炒蛋...
热量：约 XXX kcal
蛋白质：约 XXX g
碳水化合物：约 XXX g
脂肪：约 XXX g

1/3 个山姆牛肉卷...
热量：约 XXX kcal
...`}
              className="w-full px-3 py-2 border rounded-lg text-sm font-mono resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
            <div className="flex items-center gap-2 mt-2">
              <button type="button" onClick={handleParse}
                className="px-4 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg transition-colors">
                🔍 解析并填入
              </button>
              <button type="button" onClick={() => { setAiText(""); setMultiMeals([]); setParsedResult(null); setParserFeedback(null); }}
                className="px-3 py-1.5 text-gray-500 text-sm rounded-lg hover:bg-gray-100">
                清空
              </button>
              {parserFeedback && (
                <span className={`text-xs ${parserFeedback.startsWith("✅") ? "text-green-600" : parserFeedback.startsWith("⚠️") ? "text-amber-600" : "text-red-600"}`}>
                  {parserFeedback}
                </span>
              )}
            </div>
          </div>

          {/* 右列：单餐解析结果（仅在单餐模式下显示） */}
          {parsedResult && !multiMeals.length && (
            <div className="flex-1 p-4 bg-purple-50 rounded-lg">
              <p className="text-xs text-purple-700 font-medium mb-3">解析结果（可修改后录入）</p>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">食物描述</label>
                  <input type="text" value={parsedResult.desc}
                    onChange={e => setParsedResult(p => p ? { ...p, desc: e.target.value } : null)}
                    className="w-full px-2 py-1.5 border rounded text-sm focus:ring-2 focus:ring-purple-500" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { k: "calories", l: "热量(kcal)" },
                    { k: "protein", l: "蛋白质(g)" },
                    { k: "carbs", l: "碳水(g)" },
                    { k: "fat", l: "脂肪(g)" },
                  ].map(f => (
                    <div key={f.k}>
                      <label className="block text-xs text-gray-500 mb-0.5">{f.l}</label>
                      <input type="number" value={(parsedResult as any)[f.k]}
                        onChange={e => setParsedResult(p => p ? { ...p, [f.k]: e.target.value } : null)}
                        className="w-full px-2 py-1.5 border rounded text-sm focus:ring-2 focus:ring-purple-500" />
                    </div>
                  ))}
                </div>
                <button onClick={applyParsed}
                  className="w-full mt-2 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg transition-colors">
                  📝 录入此餐
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 蛋白粉预设 ── */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-medium text-gray-500 mb-3">🥛 蛋白粉快速选择</h2>
        <div className="grid grid-cols-3 gap-3">
          {PROTEIN_PRESETS.map(p => (
            <div key={p.name} className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-900 mb-1">{p.name}</p>
              <p className="text-xs text-amber-600 mb-2">{p.scoopG}g/勺</p>
              <div className="flex gap-2">
                <button onClick={() => fillProtein(p, 1)}
                  className="flex-1 py-1 px-2 text-xs bg-amber-200 hover:bg-amber-300 text-amber-800 rounded transition-colors">
                  1勺
                </button>
                <button onClick={() => fillProtein(p, 2)}
                  className="flex-1 py-1 px-2 text-xs bg-amber-200 hover:bg-amber-300 text-amber-800 rounded transition-colors">
                  2勺
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 批量多餐卡片（多餐模式下显示） ── */}
      {multiMeals.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4 border-2 border-purple-200">
          <h2 className="text-sm font-medium text-purple-700 mb-3">
            📋 解析到 {multiMeals.length} 餐，可修改后一键录入
          </h2>
          <div className="space-y-3 mb-4">
            {multiMeals.map((meal, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg relative">
                <button onClick={() => removeMultiMeal(i)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-sm transition-colors"
                  title="删除此餐">
                  ❌
                </button>
                <div className="mb-2 pr-8">
                  <label className="block text-xs text-gray-500 mb-0.5">食物</label>
                  <input type="text" value={meal.desc}
                    onChange={e => updateMultiMeal(i, "desc", e.target.value)}
                    className="w-full px-2 py-1 border rounded text-sm" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { k: "calories", l: "热量(kcal)" },
                    { k: "protein", l: "蛋白质(g)" },
                    { k: "carbs", l: "碳水(g)" },
                    { k: "fat", l: "脂肪(g)" },
                  ].map(f => (
                    <div key={f.k}>
                      <label className="block text-xs text-gray-500 mb-0.5">{f.l}</label>
                      <input type="number" value={(meal as any)[f.k]}
                        onChange={e => updateMultiMeal(i, f.k, e.target.value)}
                        className="w-full px-1.5 py-1 border rounded text-sm" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={addMultiMeal}
              className="px-3 py-1.5 text-sm border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-purple-300 hover:text-purple-600 transition-colors">
              ➕ 新增一餐
            </button>
            <button onClick={handleBatchSave} disabled={batchSaving}
              className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
              {batchSaving ? "录入中..." : "🚀 一键全部录入"}
            </button>
            {batchFeedback && (
              <span className={`text-sm ${batchFeedback.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>
                {batchFeedback}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            餐次分配：第1餐→早餐 · 第2餐→午餐 · 第3餐→晚餐 · 第4+餐→加餐
          </p>
        </div>
      )}

      {/* ── 手动录入表单 ── */}
      <div className="bg-white rounded-xl shadow-sm p-6" ref={formCardRef}>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">日期</label>
            <input type="date" value={form.date} onChange={e => setField("date", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">餐次</label>
            <select value={form.mealType} onChange={e => setField("mealType", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option>早餐</option><option>午餐</option><option>晚餐</option><option>加餐</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-gray-500 mb-1">食物描述</label>
          <textarea rows={3} value={form.foodDesc} onChange={e => setField("foodDesc", e.target.value)}
            placeholder="如「宫保鸡丁饭 + 炒青菜」"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" />
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-500 mb-2">── 营养素（从 Gemini / Claude 获取后填入）──</p>
          <div className="grid grid-cols-4 gap-3">
            {[{ k: "calories", l: "热量(kcal) *", p: "650" },
              { k: "protein", l: "蛋白质(g)", p: "35" },
              { k: "carbs", l: "碳水(g)", p: "55" },
              { k: "fat", l: "脂肪(g)", p: "30" }].map(f => (
              <div key={f.k}>
                <label className="block text-xs text-gray-400 mb-1">{f.l}</label>
                <input type="number" value={(form as any)[f.k]} onChange={e => setField(f.k, e.target.value)}
                  placeholder={f.p} className="w-full px-2 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-gray-500 mb-1">备注</label>
          <input type="text" value={form.note} onChange={e => setField("note", e.target.value)}
            placeholder="可选" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
        </div>

        {feedback && (
          <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${feedback.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {feedback.msg}
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting}
          className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
          {submitting ? "记录中..." : "💾 记录此餐"}
        </button>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
          <p className="font-medium mb-1">💡 如何获取营养素数据？</p>
          <p>将食物描述发给 Gemini 或 Claude：</p>
          <p className="mt-1 italic">「我吃了{form.foodDesc || "XXX"}，请帮我计算总热量、蛋白质、碳水、脂肪」</p>
          <p className="mt-1 text-blue-500">提示：描述时尽量带上份量估计（克数），结果更准确。</p>
        </div>
      </div>

      {/* 营养素趋势图 */}
      {chartData.length >= 2 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-500">📈 摄入趋势</h2>
            <div className="flex gap-1 text-xs">
              {[7, 14, 30].map(d => (
                <button key={d} onClick={() => setTrendDays(d)}
                  className={`px-2 py-1 rounded ${trendDays === d ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                  {d}天
                </button>
              ))}
            </div>
          </div>

          {/* 营养素开关 */}
          <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
            {[
              { k: "calories", l: "热量", c: "bg-blue-100 text-blue-700" },
              { k: "protein", l: "蛋白质", c: "bg-green-100 text-green-700" },
              { k: "carbs", l: "碳水", c: "bg-yellow-100 text-yellow-700" },
              { k: "fat", l: "脂肪", c: "bg-red-100 text-red-700" },
            ].map(n => (
              <button key={n.k} onClick={() => toggleNutrient(n.k)}
                className={`px-2 py-1 rounded-full transition-colors ${(nutrientFilter as any)[n.k] ? n.c : "bg-gray-100 text-gray-400"}`}>
                {n.l}
              </button>
            ))}
            <span className="text-gray-300 mx-1">|</span>
            <button onClick={() => setShowCalTarget(s => !s)}
              className={`px-2 py-1 rounded-full transition-colors ${showCalTarget ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-400"}`}>
              热量目标 ({calorieTarget})
            </button>
            <button onClick={() => setShowProteinTarget(s => !s)}
              className={`px-2 py-1 rounded-full transition-colors ${showProteinTarget ? "bg-green-500 text-white" : "bg-gray-100 text-gray-400"}`}>
              蛋白质目标 ({proteinTarget.toFixed(0)}g)
            </button>
            <select value={exercisedToday ? "1.6" : "1.2"}
              onChange={e => setExercisedToday(e.target.value === "1.6")}
              className={`ml-1 px-1.5 py-1 rounded text-xs border ${exercisedToday ? "border-green-300 bg-green-50 text-green-700" : "border-gray-200 text-gray-400"}`}>
              <option value="1.2">1.2 g/kg</option>
              <option value="1.6">1.6 g/kg</option>
            </select>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: "kcal", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} label={{ value: "g", angle: 90, position: "insideRight", style: { fontSize: 11 } }} />
              <Tooltip />
              <Legend />
              {nutrientFilter.calories && <Bar yAxisId="left" dataKey="calories" fill="#3b82f6" name="热量 (kcal)" radius={[3, 3, 0, 0]} />}
              {nutrientFilter.protein && <Line yAxisId="right" type="monotone" dataKey="protein" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="蛋白质 (g)" />}
              {nutrientFilter.carbs && <Line yAxisId="right" type="monotone" dataKey="carbs" stroke="#eab308" strokeWidth={2} dot={{ r: 3 }} name="碳水 (g)" />}
              {nutrientFilter.fat && <Line yAxisId="right" type="monotone" dataKey="fat" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="脂肪 (g)" />}
              {showCalTarget && <ReferenceLine yAxisId="left" y={calorieTarget} stroke="#3b82f6" strokeDasharray="6 4" label={{ value: `${calorieTarget} kcal`, position: "insideTopRight", fontSize: 10 }} />}
              {showProteinTarget && <ReferenceLine yAxisId="right" y={proteinTarget} stroke="#22c55e" strokeDasharray="6 4" label={{ value: `${proteinTarget.toFixed(0)}g`, position: "insideTopRight", fontSize: 10 }} />}
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-2 text-center">
            柱状 = 热量 (左轴 kcal) · 折线 = 营养素 (右轴 g) · 蛋白质目标 = 体重 × {exercisedToday ? "1.6（运动日）" : "1.2（休息日）"} g/kg
          </p>
        </div>
      )}

      {/* 最近 20 条记录 */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-medium text-gray-500 mb-3">📋 最近 20 条记录</h2>
        {loading ? (
          <p className="text-gray-400 text-center py-4">加载中...</p>
        ) : recent20.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b">
                  <th className="pb-2 font-medium">日期</th>
                  <th className="pb-2 font-medium">餐次</th>
                  <th className="pb-2 font-medium">食物</th>
                  <th className="pb-2 font-medium">热量</th>
                  <th className="pb-2 font-medium">蛋白质</th>
                  <th className="pb-2 font-medium">碳水</th>
                  <th className="pb-2 font-medium">脂肪</th>
                  <th className="pb-2 font-medium w-16">操作</th>
                </tr>
              </thead>
              <tbody>
                {recent20.map((r, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 whitespace-nowrap">{r.日期}</td>
                    <td className="py-2">{r.餐次}</td>
                    <td className="py-2 max-w-[200px] truncate">{r.食物描述}</td>
                    <td className="py-2 font-medium">{r.热量} kcal</td>
                    <td className="py-2">{r.蛋白质}g</td>
                    <td className="py-2">{r.碳水}g</td>
                    <td className="py-2">{r.脂肪}g</td>
                    <td className="py-2">
                      <button onClick={() => handleCopy(r)}
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-blue-100 hover:text-blue-600 text-gray-500 transition-colors"
                        title="复制到表单">
                        📋 复制
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-6">暂无记录，开始录入吧</p>
        )}
      </div>
    </div>
  );
}
