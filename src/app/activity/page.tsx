"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ActiveEnergyRecord { date: string; kcal: number; source: string; syncTime: string; }

export default function ActivityPage() {
  const [records, setRecords] = useState<ActiveEnergyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/data?type=active_energy&days=30")
      .then(r => r.json())
      .then(d => {
        setRecords((d.records || []).map((r: any) => ({
          date: String(r.date || r["日期"] || ""),
          kcal: parseInt(String(r.calories || r["活动卡路里(kcal)"] || 0)),
          source: String(r.source || r["数据来源"] || "Apple Health"),
          syncTime: String(r.syncTime || r["同步时间"] || ""),
        })));
        setLoading(false);
      })
      .catch(() => { setError("加载失败"); setLoading(false); });
  }, []);

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
          <p className="text-gray-400 text-center py-10">暂无活动卡路里数据，Apple Watch 同步后自动展示</p>
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
                    <td className="py-2"><span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{r.source}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-medium text-gray-500 mb-3">📋 数据来源</h2>
        <p className="text-sm text-gray-600">活动卡路里数据来自 Apple Watch 的「活动能量」指标，通过快捷指令每日自动同步。</p>
      </div>
    </div>
  );
}
