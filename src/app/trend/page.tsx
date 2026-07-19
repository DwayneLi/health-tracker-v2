"use client";

import { useEffect, useState } from "react";

interface TrendData {
  period: { start: string; end: string; days: number };
  goal: {
    targetWeight_kg: number;
    dailyCalorieTarget_kcal: number;
    weeklyWeightLossPct: number;
  } | null;
  weight: { data: { date: string; value: number }[]; stats: { change: number; changePct: number; avg: number; trend: string } | null };
  bodyFat: { data: { date: string; value: number }[]; stats: { change: number; trend: string } | null };
  sleep: { stats: { avg: number; min: number; max: number; daysBelow7h: number } | null };
  activeEnergy: { stats: { avg: number; min: number; max: number; total: number; cv: number } | null };
  diet: { stats: { avgDailyCalories: number; avgProtein: number; calorieGoalHitRate: number } | null };
  flags: { level: string; metric: string; message: string }[];
  sync_status: Record<string, { last_sync: string | null; status: string }>;
}

const PERIODS = [
  { label: "近 7 天", value: 7 },
  { label: "近 14 天", value: 14 },
  { label: "近 30 天", value: 30 },
];

const ANALYSIS_PROMPT = `你是一个健康数据分析师。以下是用户最近的健康追踪数据：

{粘贴 /api/trend 返回的完整 JSON}

请从以下维度进行分析：
1. **体重与热量**：体重变化与热量摄入的关系，减重速度是否健康（参考：安全减重 0.5-1%/周）
2. **体成分**：体重与体脂率变化是否同步（若体重下降但体脂率不变 → 可能流失肌肉）
3. **睡眠评估**：睡眠质量及对体重管理和活动消耗的影响
4. **活动消耗**：Apple Watch 活动卡路里趋势，结合训练数据交叉验证
5. **行动建议**：未来一周关于饮食、训练、睡眠的具体可执行建议
6. **异常警示**：需要警惕的指标异常

要求：
- 简体中文
- 不超过 300 字
- 建议要具体可执行（如「建议减少晚餐碳水约 30g」而非「少吃碳水」）
- 如有危险信号（如体重下降过快），请明确标注「⚠️ 需关注」`;

export default function TrendPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/trend?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError("加载失败，请确认服务已启动");
        setLoading(false);
      });
  }, [days]);

  const handleCopyData = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied("data");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = JSON.stringify(data, null, 2);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied("data");
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(ANALYSIS_PROMPT);
      setCopied("prompt");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = ANALYSIS_PROMPT;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied("prompt");
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const flagLevelConfig: Record<string, { bg: string; text: string; icon: string }> = {
    critical: { bg: "bg-red-50", text: "text-red-800", icon: "🔴" },
    warning: { bg: "bg-yellow-50", text: "text-yellow-800", icon: "🟡" },
    positive: { bg: "bg-green-50", text: "text-green-800", icon: "🟢" },
    info: { bg: "bg-blue-50", text: "text-blue-800", icon: "🔵" },
  };

  return (
    <div className="min-h-screen">
      {/* 导航 */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">📊 趋势分析</h1>
          <div className="flex gap-4 text-sm">
            <a href="/" className="text-gray-500 hover:text-blue-600">
              首页
            </a>
            <a href="/body" className="text-gray-500 hover:text-blue-600">
              体重
            </a>
            <a href="/diet" className="text-gray-500 hover:text-blue-600">
              饮食
            </a>
            <a href="/training" className="text-gray-500 hover:text-blue-600">
              训练
            </a>
            <a href="/activity" className="text-gray-500 hover:text-blue-600">
              活动
            </a>
            <a href="/trend" className="text-blue-600 font-medium">
              趋势
            </a>
            <a href="/settings" className="text-gray-500 hover:text-blue-600">
              设置
            </a>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* 周期选择器 */}
        <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
          <span className="text-sm text-gray-500">分析周期:</span>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                days === p.value
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-gray-400">加载分析数据...</div>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        ) : data ? (
          <>
            {/* 基础统计 */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="font-medium mb-4">📈 基础统计</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {data.weight.stats && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-400">体重变化</p>
                    <p
                      className={`text-lg font-bold ${
                        data.weight.stats.change < 0
                          ? "text-green-600"
                          : data.weight.stats.change > 0
                          ? "text-red-600"
                          : "text-gray-600"
                      }`}
                    >
                      {data.weight.stats.change > 0 ? "+" : ""}
                      {data.weight.stats.change.toFixed(1)} kg
                    </p>
                    <p className="text-xs text-gray-400">
                      ({data.weight.stats.changePct > 0 ? "+" : ""}
                      {data.weight.stats.changePct.toFixed(1)}%)
                    </p>
                  </div>
                )}
                {data.bodyFat.stats && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-400">体脂率变化</p>
                    <p
                      className={`text-lg font-bold ${
                        data.bodyFat.stats.change < 0
                          ? "text-green-600"
                          : data.bodyFat.stats.change > 0
                          ? "text-red-600"
                          : "text-gray-600"
                      }`}
                    >
                      {data.bodyFat.stats.change > 0 ? "+" : ""}
                      {data.bodyFat.stats.change.toFixed(1)}%
                    </p>
                  </div>
                )}
                {data.sleep.stats && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-400">睡眠均值</p>
                    <p className="text-lg font-bold">
                      {data.sleep.stats.avg.toFixed(1)}h
                    </p>
                    <p className="text-xs text-gray-400">
                      {data.sleep.stats.daysBelow7h > 0
                        ? `${data.sleep.stats.daysBelow7h} 天不足 7h`
                        : "全部达标"}
                    </p>
                  </div>
                )}
                {data.activeEnergy.stats && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-400">活动卡路里日均</p>
                    <p className="text-lg font-bold">
                      {Math.round(data.activeEnergy.stats.avg)} kcal
                    </p>
                    <p className="text-xs text-gray-400">
                      总计 {Math.round(data.activeEnergy.stats.total)} kcal
                    </p>
                  </div>
                )}
              </div>
              {data.diet.stats && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-400">热量达标率</p>
                  <p className="text-lg font-bold">
                    {Math.round(data.diet.stats.calorieGoalHitRate * 100)}%
                  </p>
                  <p className="text-xs text-gray-400">
                    日均摄入 {Math.round(data.diet.stats.avgDailyCalories)} kcal · 蛋白质{" "}
                    {Math.round(data.diet.stats.avgProtein)}g
                  </p>
                </div>
              )}
            </div>

            {/* 告警标签卡片 */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="font-medium mb-4">
                🚦 趋势洞察 ({data.flags.length})
              </h2>
              {data.flags.length > 0 ? (
                <div className="space-y-2">
                  {data.flags.map((f, i) => {
                    const config = flagLevelConfig[f.level] || flagLevelConfig.info;
                    return (
                      <div
                        key={i}
                        className={`p-3 rounded-lg text-sm ${config.bg} ${config.text}`}
                      >
                        <span className="mr-2">{config.icon}</span>
                        {f.message}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">暂无告警</p>
              )}
            </div>

            {/* 操作区 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 复制数据 */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="font-medium mb-3">📋 复制分析数据</h2>
                <p className="text-sm text-gray-500 mb-4">
                  将完整趋势 JSON 复制到剪贴板，可供外部大模型分析使用
                </p>
                <button
                  onClick={handleCopyData}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    copied === "data"
                      ? "bg-green-500 text-white"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  }`}
                >
                  {copied === "data" ? "✅ 已复制" : "📋 复制分析数据"}
                </button>
              </div>

              {/* 外部大模型分析 Prompt */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="font-medium mb-3">🤖 外部大模型分析 Prompt</h2>
                <p className="text-sm text-gray-500 mb-4">
                  复制以下 Prompt，粘贴到 Gemini/Claude 获得深度解读
                </p>
                <button
                  onClick={handleCopyPrompt}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    copied === "prompt"
                      ? "bg-green-500 text-white"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  }`}
                >
                  {copied === "prompt" ? "✅ 已复制" : "📋 复制 Prompt"}
                </button>
              </div>
            </div>

            {/* Prompt 预览 */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="font-medium mb-3">Prompt 模板预览</h2>
              <pre className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                {ANALYSIS_PROMPT}
              </pre>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
