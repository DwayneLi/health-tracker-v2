"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { getTodayStr } from "@/lib/date";

interface WeightRecord { date: string; weight: number; source: string; syncTime: string; note: string; }
interface BodyFatRecord { date: string; bodyFat: number; source: string; syncTime: string; note: string; }
interface Goal { targetWeight: number; weeklyPct: number; currentWeekTarget: number; dailyCalorieTarget: number; }
interface DeficitPoint { date: string; plannedDeficit: number; actualDeficit: number; }

export default function BodyPage() {
  const [weights, setWeights] = useState<WeightRecord[]>([]);
  const [bodyFats, setBodyFats] = useState<BodyFatRecord[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [dietSummaries, setDietSummaries] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formWeight, setFormWeight] = useState("");
  const [formBodyFat, setFormBodyFat] = useState("");
  const [formDate, setFormDate] = useState(getTodayStr());
  const [formNote, setFormNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [weightRes, dietRes] = await Promise.all([
        fetch("/api/data?type=weight&days=30"),
        fetch("/api/data?type=diet&days=30"),
      ]);
      const d = await weightRes.json();
      const diet = await dietRes.json();
      setWeights(d.weights || []);
      setBodyFats(d.bodyFats || []);
      setGoal(d.goal);
      setDietSummaries(diet.summaries || []);
    } catch { setError("加载失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async () => {
    if (!formWeight && !formBodyFat) { setSubmitMsg("请至少填写体重或体脂率"); return; }
    setSubmitting(true); setSubmitMsg(null);
    const today = getTodayStr();
    const records = [];
    if (formWeight && !isNaN(Number(formWeight))) records.push({ type: "weight", value: Number(formWeight), unit: "kg", date: formDate, source: "手动录入" });
    if (formBodyFat && !isNaN(Number(formBodyFat))) records.push({ type: "body_fat", value: Number(formBodyFat), unit: "%", date: formDate, source: "手动录入" });
    try {
      const res = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records }) });
      const result = await res.json();
      if (result.status === "ok" || result.status === "partial") {
        setSubmitMsg("✅ 录入成功"); setFormWeight(""); setFormBodyFat(""); setFormNote("");
        fetchData();
      } else { setSubmitMsg("❌ 录入失败，请重试"); }
    } catch { setSubmitMsg("❌ 网络错误，请重试"); }
    finally { setSubmitting(false); setTimeout(() => setSubmitMsg(null), 3000); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><div className="animate-pulse text-gray-400">加载中...</div></div>;

  const latestWeight = weights.length > 0 ? weights[weights.length - 1] : null;
  const latestBodyFat = bodyFats.length > 0 ? bodyFats[bodyFats.length - 1] : null;
  const chartData = weights.map(w => {
    const fat = bodyFats.find(f => f.date === w.date);
    return { date: w.date.slice(5), weight: w.weight, bodyFat: fat && fat.bodyFat > 0 ? fat.bodyFat : (null as number | null) };
  });
  const hasData = weights.length > 0 || bodyFats.length > 0;
  const recentWeights = weights.slice(-10).reverse();
  const recentFats = bodyFats.slice(-10).reverse();

  // 热量缺口趋势（最近 10 天有饮食数据的天）
  const TDEE = 2200;
  const weeklyPct = goal?.weeklyPct || 0.75;
  const deficitData: DeficitPoint[] = dietSummaries
    .slice(-10)
    .map(ds => {
      const date = String(ds["日期"]);
      const calories = parseInt(String(ds["总热量"])) || 0;
      const w = weights.find(wr => wr.date === date);
      const plannedDeficit = w
        ? Math.round((w.weight * weeklyPct / 100) * 7700 / 7)
        : 0;
      const actualDeficit = calories > 0 ? TDEE - calories : 0;
      const surp = calories > 0 && actualDeficit < 0;
      return {
        date: date.slice(5),
        plannedDeficit: plannedDeficit > 0 ? plannedDeficit : 0,
        actualDeficit: surp ? actualDeficit : Math.max(actualDeficit, 0),
      };
    })
    .filter(d => d.plannedDeficit > 0 || d.actualDeficit !== 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold">⚖️ 体重与体脂</h1>

      {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {!hasData ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-3xl mb-4">📱</p>
          <p className="text-gray-600 font-medium mb-2">暂无数据</p>
          <p className="text-sm text-gray-400">配置 Apple Health 快捷指令自动同步，或使用下方表单手动录入</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm p-4">
              <p className="text-sm text-gray-500">最新体重</p>
              <p className="text-3xl font-bold">{latestWeight ? `${latestWeight.weight} kg` : "--"}</p>
              {latestWeight && (
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${latestWeight.source === "Apple Health" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                    {latestWeight.source || "手动录入"}
                  </span>
                  {goal && <span className="text-xs text-gray-400">目标 {goal.targetWeight}kg</span>}
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <p className="text-sm text-gray-500">最新体脂率</p>
              <p className="text-3xl font-bold">{latestBodyFat ? `${latestBodyFat.bodyFat}%` : "--"}</p>
              {latestBodyFat && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${latestBodyFat.source === "Apple Health" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                  {latestBodyFat.source || "手动录入"}
                </span>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-medium text-gray-500 mb-3">近 30 天趋势</h2>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" domain={["auto", "auto"]} label={{ value: "体重 (kg)", angle: -90, position: "insideLeft", style: { fontSize: 12 } }} />
                  <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]} label={{ value: "体脂率 (%)", angle: 90, position: "insideRight", style: { fontSize: 12 } }} />
                  <Tooltip /><Legend />
                  <Line yAxisId="left" type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="体重 (kg)" />
                  <Line yAxisId="right" type="monotone" dataKey="bodyFat" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="体脂率 (%)" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-gray-400 text-center py-10">暂无趋势数据</p>}
          </div>
        </>
      )}

      {/* 热量缺口趋势 */}
      {deficitData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-3">📊 热量缺口趋势（最近 10 天）</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs text-gray-500">
            <div className="bg-gray-50 rounded px-2 py-1">
              <span>TDEE</span>
              <span className="float-right font-medium text-gray-700">{TDEE} kcal</span>
            </div>
            <div className="bg-gray-50 rounded px-2 py-1">
              <span>目标热量</span>
              <span className="float-right font-medium text-gray-700">{goal?.dailyCalorieTarget || "--"} kcal</span>
            </div>
            <div className="bg-gray-50 rounded px-2 py-1">
              <span>计划缺口</span>
              <span className="float-right font-medium text-blue-600">
                -{deficitData.length > 0 ? deficitData[deficitData.length - 1].plannedDeficit : 0} kcal
              </span>
            </div>
            <div className="bg-gray-50 rounded px-2 py-1">
              <span>近 10 天实际缺口</span>
              <span className={`float-right font-medium ${(() => {
                const last10 = deficitData.slice(-7).filter(d => d.actualDeficit !== 0);
                const avg = last10.length > 0 ? Math.round(last10.reduce((s, d) => s + d.actualDeficit, 0) / last10.length) : null;
                return avg !== null && avg > 0 ? "text-green-600" : "text-orange-500";
              })()}`}>
                {(() => {
                  const last10 = deficitData.slice(-7).filter(d => d.actualDeficit !== 0);
                  const avg = last10.length > 0 ? Math.round(last10.reduce((s, d) => s + d.actualDeficit, 0) / last10.length) : null;
                  return avg !== null ? (avg > 0 ? `-${avg} kcal` : `+${Math.abs(avg)} kcal`) : "--";
                })()}
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={deficitData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                domain={(() => {
                  const vals = deficitData.flatMap(d => [d.plannedDeficit, d.actualDeficit]);
                  const min = Math.min(...vals, 0);
                  const max = Math.max(...vals, 100);
                  return [Math.min(min - 50, -50), Math.ceil((max + 100) / 100) * 100];
                })()}
              />
              <Tooltip formatter={(v) => [`${v} kcal`, ""]} />
              <Legend />
              <Line type="monotone" dataKey="plannedDeficit" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} name="计划缺口 (kcal)" />
              <Line type="monotone" dataKey="actualDeficit" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} name="实际缺口 (kcal)" />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-2 text-center">
            计划缺口 = 当前体重 × 每周减重% × 7700 ÷ 7 · 实际缺口 = TDEE({TDEE}) − 实际摄入
          </p>
        </div>
      )}

      {/* 手动录入表单 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="font-medium mb-4">✏️ 手动录入（兜底）</h2>
        <div className="mb-4">
          <label className="block text-sm text-gray-500 mb-1">日期</label>
          <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
            className="w-48 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">体重 (kg)</label>
            <input type="number" step="0.1" value={formWeight} onChange={e => setFormWeight(e.target.value)}
              placeholder="70.5" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">体脂率 (%)</label>
            <input type="number" step="0.1" value={formBodyFat} onChange={e => setFormBodyFat(e.target.value)}
              placeholder="21.8" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm text-gray-500 mb-1">备注</label>
          <input type="text" value={formNote} onChange={e => setFormNote(e.target.value)}
            placeholder="可选，如「早上空腹测量」" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={handleSubmit} disabled={submitting}
            className={`px-6 py-2 rounded-lg text-white font-medium transition-colors ${submitting ? "bg-gray-400 cursor-not-allowed" : "bg-blue-500 hover:bg-blue-600"}`}>
            {submitting ? "提交中..." : "提交录入"}
          </button>
          {submitMsg && <span className={`text-sm ${submitMsg.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>{submitMsg}</span>}
        </div>
        <p className="text-xs text-gray-400 mt-3">同日重复录入将覆盖之前的数据。</p>
      </div>

      {/* 最近 10 条体重 + 体脂率 */}
      {recentWeights.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-3">📋 最近体重 & 体脂记录</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b">
                <th className="pb-2 font-medium">日期</th><th className="pb-2 font-medium">体重</th><th className="pb-2 font-medium">体脂率</th><th className="pb-2 font-medium">来源</th><th className="pb-2 font-medium">备注</th>
              </tr></thead>
              <tbody>
                {recentWeights.map((r, i) => {
                  const fat = bodyFats.find(f => f.date === r.date);
                  return (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2">{r.date}</td>
                    <td className="py-2 font-medium">{r.weight} kg</td>
                    <td className="py-2">{fat ? `${fat.bodyFat}%` : <span className="text-gray-300">—</span>}</td>
                    <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${r.source === "Apple Health" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{r.source || "手动"}</span></td>
                    <td className="py-2 text-gray-400">{r.note}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
