"use client";

import { useState } from "react";

export default function DietPage() {
  const today = new Date().toISOString().split("T")[0];
  const hour = new Date().getHours();
  const defaultMeal =
    hour >= 5 && hour < 10
      ? "早餐"
      : hour >= 10 && hour < 14
        ? "午餐"
        : hour >= 14 && hour < 21
          ? "晚餐"
          : "加餐";

  const [form, setForm] = useState({
    date: today,
    mealType: defaultMeal,
    foodDesc: "",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const setField = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.foodDesc.trim()) {
      setFeedback({ type: "error", msg: "请输入食物描述" });
      return;
    }
    if (!form.calories || isNaN(Number(form.calories))) {
      setFeedback({ type: "error", msg: "请输入有效的热量值" });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const resp = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_diet",
          foodDesc: form.foodDesc.trim(),
          mealType: form.mealType,
          calories: Number(form.calories),
          protein: Number(form.protein) || 0,
          carbs: Number(form.carbs) || 0,
          fat: Number(form.fat) || 0,
          date: form.date,
          note: form.note,
        }),
      });
      if (resp.ok) {
        setFeedback({ type: "success", msg: "✅ 已记录！" });
        setForm((prev) => ({
          ...prev,
          foodDesc: "",
          calories: "",
          protein: "",
          carbs: "",
          fat: "",
          note: "",
        }));
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
          <h1 className="text-lg font-bold">🍽️ 饮食录入</h1>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">日期</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setField("date", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">餐次</label>
              <select
                value={form.mealType}
                onChange={(e) => setField("mealType", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option>早餐</option>
                <option>午餐</option>
                <option>晚餐</option>
                <option>加餐</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-500 mb-1">食物描述</label>
            <textarea
              rows={3}
              value={form.foodDesc}
              onChange={(e) => setField("foodDesc", e.target.value)}
              placeholder="如「宫保鸡丁饭 + 炒青菜」"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>

          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-2">
              ── 营养素（从 Gemini / Claude 获取后填入）──
            </p>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">热量(kcal) *</label>
                <input
                  type="number"
                  value={form.calories}
                  onChange={(e) => setField("calories", e.target.value)}
                  placeholder="650"
                  className="w-full px-2 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">蛋白质(g)</label>
                <input
                  type="number"
                  value={form.protein}
                  onChange={(e) => setField("protein", e.target.value)}
                  placeholder="35"
                  className="w-full px-2 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">碳水(g)</label>
                <input
                  type="number"
                  value={form.carbs}
                  onChange={(e) => setField("carbs", e.target.value)}
                  placeholder="55"
                  className="w-full px-2 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">脂肪(g)</label>
                <input
                  type="number"
                  value={form.fat}
                  onChange={(e) => setField("fat", e.target.value)}
                  placeholder="30"
                  className="w-full px-2 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-500 mb-1">备注</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setField("note", e.target.value)}
              placeholder="可选"
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
            {submitting ? "记录中..." : "💾 记录此餐"}
          </button>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
            <p className="font-medium mb-1">💡 如何获取营养素数据？</p>
            <p>将食物描述发给 Gemini 或 Claude：</p>
            <p className="mt-1 italic">
              「我吃了{form.foodDesc || "XXX"}，请帮我计算总热量、蛋白质、碳水、脂肪」
            </p>
            <p className="mt-1 text-blue-500">提示：描述时尽量带上份量估计（克数），结果更准确。</p>
          </div>
        </div>
      </main>
    </div>
  );
}
