"use client";

import { useState } from "react";

export default function TrainingPage() {
  const today = new Date().toISOString().split("T")[0];
  const [tab, setTab] = useState<"strength" | "cardio">("strength");
  const [form, setForm] = useState({
    date: today,
    calories: "",
    rpe: "",
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const setField = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.calories || isNaN(Number(form.calories))) {
      setFeedback({ type: "error", msg: "请输入有效的卡路里数值" });
      return;
    }
    const rpe = Number(form.rpe);
    if (!form.rpe || isNaN(rpe) || rpe < 1 || rpe > 10) {
      setFeedback({ type: "error", msg: "RPE 必须在 1-10 范围内" });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const action = tab === "strength" ? "add_strength" : "add_cardio";
      const resp = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          calories: Number(form.calories),
          rpe: Number(form.rpe),
          date: form.date,
          note: form.note,
        }),
      });
      if (resp.ok) {
        const label = tab === "strength" ? "💪 力量训练" : "🏃 有氧训练";
        setFeedback({ type: "success", msg: `✅ ${label}已记录！` });
        setForm((prev) => ({ ...prev, calories: "", rpe: "", note: "" }));
      } else {
        const err = await resp.json();
        setFeedback({ type: "error", msg: `❌ ${err.error || "记录失败"}` });
      }
    } catch {
      setFeedback({ type: "error", msg: "❌ 网络错误，请重试" });
    } finally {
      setSubmitting(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  return (
    <div className="min-h-screen">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <a href="/" className="text-gray-500 hover:text-blue-600">
            ← 返回
          </a>
          <h1 className="text-lg font-bold">🏋️ 训练记录</h1>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          {/* Tab 切换 */}
          <div className="flex border-b mb-6">
            <button
              onClick={() => setTab("strength")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "strength"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              💪 力量训练
            </button>
            <button
              onClick={() => setTab("cardio")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "cardio"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              🏃 有氧训练
            </button>
          </div>

          {/* 表单 */}
          <div className="mb-4">
            <label className="block text-sm text-gray-500 mb-1">日期</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setField("date", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">卡路里(kcal) *</label>
              <input
                type="number"
                value={form.calories}
                onChange={(e) => setField("calories", e.target.value)}
                placeholder="300"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">
                疲劳度(RPE) * <span className="text-gray-300">1-10</span>
              </label>
              <input
                type="number"
                min={1}
                max={10}
                step={1}
                value={form.rpe}
                onChange={(e) => setField("rpe", e.target.value)}
                placeholder="7"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* RPE 说明 */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 font-medium mb-1">RPE 参考</p>
            <div className="grid grid-cols-5 text-xs text-gray-400 gap-1">
              <span>1-2 很轻松</span>
              <span>3-4 轻松</span>
              <span>5-6 中等</span>
              <span>7-8 吃力</span>
              <span>9-10 力竭</span>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-500 mb-1">备注</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setField("note", e.target.value)}
              placeholder={tab === "strength" ? "如「推胸+深蹲+硬拉」" : "如「户外跑 5km」"}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {feedback && (
            <div
              className={`mb-4 px-3 py-2 rounded-lg text-sm ${
                feedback.type === "success"
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {feedback.msg}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? "记录中..." : "💾 记录训练"}
          </button>
        </div>
      </main>
    </div>
  );
}
