"use client";

import { useEffect, useState, useCallback } from "react";
import { getTodayStr } from "@/lib/date";

interface SleepRecord {
  date: string;
  hours: number;
  source: string;
  syncTime: string;
}

export default function SleepPage() {
  const today = getTodayStr();
  const [records, setRecords] = useState<SleepRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ date: today, hours: "7.5", note: "" });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const fetchRecords = useCallback(async () => {
    try {
      const r = await fetch("/api/data?type=sleep&days=30");
      const d = await r.json();
      setRecords(d.sleeps || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleSubmit = async (quickDate?: string, quickHours?: number) => {
    const dateVal = quickDate || form.date;
    const hoursVal = quickHours ?? parseFloat(form.hours);
    if (isNaN(hoursVal) || hoursVal <= 0 || hoursVal > 24) {
      setFeedback({ type: "error", msg: "请输入 0.1~24 之间的有效小时数" });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_sleep", date: dateVal, hours: hoursVal, note: quickDate ? "" : form.note }),
      });
      if (r.ok) {
        setFeedback({ type: "success", msg: `✅ 已记录 ${hoursVal}h！` });
        setForm((p) => ({ ...p, hours: "7.5", note: "" }));
        fetchRecords();
      } else {
        const e = await r.json();
        setFeedback({ type: "error", msg: `❌ ${e.error || "记录失败"}` });
      }
    } catch {
      setFeedback({ type: "error", msg: "❌ 网络错误" });
    } finally {
      setSubmitting(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // 统计
  const recent7 = records.slice(-7);
  const avg7 = recent7.length > 0
    ? Math.round(recent7.reduce((s, r) => s + r.hours, 0) / recent7.length * 10) / 10
    : 0;
  const avg30 = records.length > 0
    ? Math.round(records.reduce((s, r) => s + r.hours, 0) / records.length * 10) / 10
    : 0;

  const recent10 = records.slice(-10).reverse();

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><div className="animate-pulse text-gray-400">加载中...</div></div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold">😴 睡眠记录</h1>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">7 天平均</p>
          <p className="text-2xl font-bold">{avg7 > 0 ? `${avg7}h` : "--"}</p>
          <p className="text-xs text-gray-400">{avg7 >= 7 ? "✅ 达标" : avg7 > 0 ? "⚠️ 不足" : ""}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">30 天平均</p>
          <p className="text-2xl font-bold">{avg30 > 0 ? `${avg30}h` : "--"}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">总记录</p>
          <p className="text-2xl font-bold">{records.length} 天</p>
        </div>
      </div>

      {/* 录入表单 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="font-medium mb-4">✏️ 记录睡眠</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">日期</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">睡眠时长 (小时)</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="24"
              value={form.hours}
              onChange={(e) => setForm((p) => ({ ...p, hours: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="7.5"
            />
            <p className="text-xs text-gray-400 mt-1">默认 7.5 小时</p>
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">备注 (可选)</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="如「深睡较多」"
            />
          </div>
        </div>

        {feedback && (
          <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${feedback.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {feedback.msg}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={() => handleSubmit()} disabled={submitting}
            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
            {submitting ? "记录中..." : "💾 记录"}
          </button>
          <button onClick={() => handleSubmit(today, 7.5)}
            disabled={submitting}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-lg transition-colors">
            ⚡ 快速记录 7.5h
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-3">
          同日重复录入将覆盖之前的数据。也可定期用脚本解析 Apple Health export.xml 批量导入。
        </p>
      </div>

      {/* 最近 10 条记录 */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-medium text-gray-500 mb-3">📋 最近 10 条记录</h2>
        {recent10.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b">
                  <th className="pb-2 font-medium">日期</th>
                  <th className="pb-2 font-medium">时长</th>
                  <th className="pb-2 font-medium">来源</th>
                  <th className="pb-2 font-medium">备注</th>
                </tr>
              </thead>
              <tbody>
                {recent10.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2">{r.date}</td>
                    <td className="py-2 font-medium">{r.hours}h</td>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.source === "Apple Health" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                        {r.source || "手动录入"}
                      </span>
                    </td>
                    <td className="py-2 text-gray-400">{r.syncTime ? new Date(r.syncTime).toLocaleString("zh-CN") : ""}</td>
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
