"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getTodayStr } from "@/lib/date";
import { parseNutrition } from "@/lib/nutrition-parser";
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
  const [showParser, setShowParser] = useState(false);
  const [parserFeedback, setParserFeedback] = useState<string | null>(null);
  const [records, setRecords] = useState<DietRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const formCardRef = useRef<HTMLDivElement>(null);
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
      ...p,  // 保留当前表单的日期、餐次
      foodDesc: r.食物描述,
      calories: String(r.热量), protein: String(r.蛋白质),
      carbs: String(r.碳水), fat: String(r.脂肪), note: "",
    }));
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleParse = () => {
    if (!aiText.trim()) {
      setParserFeedback("请粘贴 AI 回答内容");
      return;
    }
    const parsed = parseNutrition(aiText);
    const updates: Record<string, string> = {};
    if (parsed.calories !== undefined) updates.calories = String(parsed.calories);
    if (parsed.protein !== undefined) updates.protein = String(parsed.protein);
    if (parsed.carbs !== undefined) updates.carbs = String(parsed.carbs);
    if (parsed.fat !== undefined) updates.fat = String(parsed.fat);
    if (parsed.desc && !form.foodDesc.trim()) updates.foodDesc = parsed.desc;
    setForm(p => ({ ...p, ...updates }));
    const found = Object.keys(updates).filter(k => k !== "foodDesc");
    if (parsed.missing.length === 0) {
      setParserFeedback(`✅ 已自动填入 ${found.length} 项营养素`);
    } else {
      setParserFeedback(`⚠️ 已填入 ${found.length} 项，缺少：${parsed.missing.join("、")}`);
    }
    setTimeout(() => setParserFeedback(null), 4000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold">🍽️ 饮食录入</h1>

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
          <button type="button" onClick={() => setShowParser(s => !s)}
            className="mt-2 text-xs px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors">
            {showParser ? "🔼 收起解析器" : "🔽 从 AI 回答自动解析营养素"}
          </button>
          {showParser && (
            <div className="mt-3 p-3 bg-purple-50 rounded-lg">
              <p className="text-xs text-purple-700 mb-2">
                把 Gemini / Claude 的回答粘贴到下面，点解析会自动填入上方营养素框：
              </p>
              <textarea rows={4} value={aiText} onChange={e => setAiText(e.target.value)}
                placeholder="例：&#10;* 热量：约 414 kcal&#10;* 蛋白质：约 45.9 g&#10;* 碳水化合物：约 36.9 g&#10;* 脂肪：约 9.8 g"
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono resize-none" />
              <div className="flex items-center gap-2 mt-2">
                <button type="button" onClick={handleParse}
                  className="px-4 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg transition-colors">
                  🔍 解析
                </button>
                <button type="button" onClick={() => setAiText("")}
                  className="px-3 py-1.5 text-gray-500 text-sm rounded-lg hover:bg-gray-100">
                  清空
                </button>
                {parserFeedback && (
                  <span className="text-xs text-purple-700">{parserFeedback}</span>
                )}
              </div>
            </div>
          )}
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
