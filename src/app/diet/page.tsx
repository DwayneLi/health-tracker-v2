"use client";

import { useEffect, useState, useCallback } from "react";

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
  const today = new Date().toISOString().split("T")[0];
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
  const [records, setRecords] = useState<DietRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    try {
      const r = await fetch("/api/data?type=diet&days=30");
      const d = await r.json();
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
      setRecords(mapped.slice(-10).reverse());
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

  const recent10 = records;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold">🍽️ 饮食录入</h1>

      <div className="bg-white rounded-xl shadow-sm p-6">
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

      {/* 最近 10 条记录 */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-medium text-gray-500 mb-3">📋 最近 10 条记录</h2>
        {loading ? (
          <p className="text-gray-400 text-center py-4">加载中...</p>
        ) : recent10.length > 0 ? (
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
                </tr>
              </thead>
              <tbody>
                {recent10.map((r, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 whitespace-nowrap">{r.日期}</td>
                    <td className="py-2">{r.餐次}</td>
                    <td className="py-2 max-w-[200px] truncate">{r.食物描述}</td>
                    <td className="py-2 font-medium">{r.热量} kcal</td>
                    <td className="py-2">{r.蛋白质}g</td>
                    <td className="py-2">{r.碳水}g</td>
                    <td className="py-2">{r.脂肪}g</td>
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
