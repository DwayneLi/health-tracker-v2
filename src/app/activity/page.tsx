"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getTodayStr } from "@/lib/date";

interface ActiveEnergyRecord { date: string; kcal: number; source: string; syncTime: string; }

export default function ActivityPage() {
  const today = getTodayStr();
  const [records, setRecords] = useState<ActiveEnergyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 手动录入表单
  const [form, setForm] = useState({ date: today, calories: "" });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const fetchRecords = useCallback(async () => {
    try {
      const r = await fetch("/api/data?type=active_energy&days=30");
      const d = await r.json();
      setRecords((d.records || []).map((r: any) => ({
        date: String(r.date || r["日期"] || ""),
        kcal: Math.round(parseFloat(String(r.calories || r["活动卡路里(kcal)"] || 0))),
        source: String(r.source || r["数据来源"] || "Apple Health"),
        syncTime: String(r.syncTime || r["同步时间"] || ""),
      })));
    } catch { setError("加载失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleSubmit = async () => {
    const kcal = parseInt(form.calories);
    if (isNaN(kcal) || kcal < 0) { setFeedback({ type: "error", msg: "请输入有效的卡路里数值" }); return; }
    setSubmitting(true); setFeedback(null);
    try {
      const r = await fetch("/api/data", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_active_energy", date: form.date, calories: kcal }),
      });
      if (r.ok) {
        setFeedback({ type: "success", msg: `✅ 已记录 ${kcal} kcal（来源：手动维护）` });
        setForm(p => ({ ...p, calories: "" }));
        fetchRecords();
      } else {
        const e = await r.json();
        setFeedback({ type: "error", msg: `❌ ${e.error || "记录失败"}` });
      }
    } catch { setFeedback({ type: "error", msg: "❌ 网络错误" }); }
    finally { setSubmitting(false); setTimeout(() => setFeedback(null), 3000); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><div className="animate-pulse text-gray-400">加载中...</div></div>;

  const recent7 = records.slice(-7);
  const avg7 = recent7.length > 0 ? Math.round(recent7.reduce((s, r) => s + r.kcal, 0) / recent7.length) : 0;
  const avg30 = records.length > 0 ? Math.round(records.reduce((s, r) => s + r.kcal, 0) / records.length) : 0;
  const latest = records.length > 0 ? records[records.length - 1] : null;
  const chartData = records.map(r => ({ date: r.date.slice(5), kcal: r.kcal }));
  const recent10 = records.slice(-10).reverse();

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold">🔥 活动卡路里</h1>

      {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">今日活动</p>
          <p className="text-2xl font-bold">{latest ? `${latest.kcal} kcal` : "--"}</p>
          {latest && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{latest.source}</span>}
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">7 天平均</p>
          <p className="text-2xl font-bold">{avg7 > 0 ? `${avg7} kcal` : "--"}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">30 天平均</p>
          <p className="text-2xl font-bold">{avg30 > 0 ? `${avg30} kcal` : "--"}</p>
        </div>
      </div>

      {/* 手动录入表单 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="font-medium mb-4">✏️ 手动维护</h2>
        <p className="text-xs text-gray-400 mb-4">手动设置后将覆盖当天 Apple Health 同步值，来源标记为「手动维护」</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">日期</label>
            <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">活动卡路里 (kcal)</label>
            <input type="number" min="0" value={form.calories} onChange={e => setForm(p => ({ ...p, calories: e.target.value }))}
              placeholder="500" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-end">
            <button onClick={handleSubmit} disabled={submitting}
              className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
              {submitting ? "记录中..." : "💾 手动维护"}
            </button>
          </div>
        </div>
        {feedback && (
          <div className={`px-3 py-2 rounded-lg text-sm ${feedback.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {feedback.msg}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">同日重复维护将覆盖之前的数据。如果在 Apple Health 同步之前设置，后续同步会覆盖此值。</p>
      </div>

      {/* 柱状图 */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-medium text-gray-500 mb-3">近 30 天活动卡路里</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, "auto"]} label={{ value: "kcal", angle: -90, position: "insideLeft", style: { fontSize: 12 } }} />
              <Tooltip formatter={(v) => [`${v} kcal`, "活动卡路里"]} />
              <Bar dataKey="kcal" fill="#f97316" name="活动卡路里" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-center py-10">暂无活动卡路里数据</p>
        )}
        {avg7 > 0 && <p className="text-xs text-gray-400 mt-2 text-center">7 天平均: {avg7} kcal</p>}
      </div>

      {/* 最近记录 */}
      {recent10.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-3">📋 最近记录</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b">
                <th className="pb-2 font-medium">日期</th><th className="pb-2 font-medium">卡路里</th><th className="pb-2 font-medium">来源</th>
              </tr></thead>
              <tbody>
                {recent10.map((r, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2">{r.date}</td>
                    <td className="py-2 font-medium">{r.kcal} kcal</td>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.source === "手动维护" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                        {r.source}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-medium text-gray-500 mb-3">📋 数据来源</h2>
        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
          <span className="text-xs px-3 py-1.5 rounded-full bg-green-100 text-green-700">🍏 Apple Health 自动同步</span>
          <span className="text-xs px-3 py-1.5 rounded-full bg-orange-100 text-orange-700">✏️ 手动维护</span>
        </div>
        <p className="text-xs text-gray-400 mt-2">活动卡路里默认通过 Apple Watch 快捷指令同步。手动维护的值会直接覆盖同日期数据。</p>
      </div>
    </div>
  );
}
