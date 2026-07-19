"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface TrendFlag {
  level: string;
  metric: string;
  message: string;
}

interface SyncItem {
  last_sync: string | null;
  status: string;
  latest_value: number | null;
}

interface DashboardData {
  today: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    meals: number;
  };
  weights: { date: string; weight: number }[];
  bodyFats: { date: string; bodyFat: number }[];
  dietSummary: Record<string, unknown>[];
  sleeps: { date: string; hours: number }[];
  activeEnergies: { date: string; kcal: number }[];
  suggestions: Record<string, unknown>[];
  syncStatus: Record<string, SyncItem>;
  goal: {
    targetWeight: number;
    weeklyPct: number;
    currentWeekTarget: number;
    dailyCalorieTarget: number;
  } | null;
}

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b"];

const SYNC_LABELS: Record<string, string> = {
  weight: "体重",
  body_fat: "体脂率",
  sleep: "睡眠",
  active_energy: "活动卡路里",
};

const SYNC_UNITS: Record<string, string> = {
  weight: "kg",
  body_fat: "%",
  sleep: "h",
  active_energy: "kcal",
};

const FLAG_LEVEL_STYLES: Record<string, string> = {
  critical: "bg-red-50 text-red-800 border-red-200",
  warning: "bg-yellow-50 text-yellow-800 border-yellow-200",
  positive: "bg-green-50 text-green-800 border-green-200",
  info: "bg-blue-50 text-blue-800 border-blue-200",
};

const FLAG_LEVEL_ICONS: Record<string, string> = {
  critical: "🔴",
  warning: "🟡",
  positive: "🟢",
  info: "🔵",
};

function getStatusDot(status: string): string {
  switch (status) {
    case "ok":
      return "🟢";
    case "warning":
      return "🟡";
    case "error":
      return "🔴";
    default:
      return "⚪";
  }
}

function formatSyncTime(syncTime: string | null): string {
  if (!syncTime) return "从未同步";
  try {
    const date = new Date(syncTime);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffH < 1) return "刚刚";
    if (diffH < 24) return `${diffH} 小时前`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD} 天前`;
  } catch {
    return "未知";
  }
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [trendFlags, setTrendFlags] = useState<TrendFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weightDays, setWeightDays] = useState(7);
  const [bodyFatDays, setBodyFatDays] = useState(7);

  useEffect(() => {
    Promise.all([
      fetch("/api/data?type=dashboard").then((r) => r.json()),
      fetch("/api/trend?days=7").then((r) => r.json()),
    ])
      .then(([dd, td]) => {
        setData(dd);
        setTrendFlags(td.flags || []);
        setLoading(false);
      })
      .catch(() => {
        setError("加载失败，请确认服务已启动");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-gray-400">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg"
        >
          重试
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">暂无数据</div>
      </div>
    );
  }

  const calorieTarget = data.goal?.dailyCalorieTarget || 2000;

  // goal 永远有默认值（75kg / 0.75% / 1500kcal）
  const effectiveGoal = data.goal || {
    targetWeight: 75,
    weeklyPct: 0.75,
    currentWeekTarget: 0,
    dailyCalorieTarget: 1500,
  };
  const hasWeights = data.weights.length > 0;

  // Y轴：体重 ±2.5kg，取整到 5 的倍数
  function weightDomain(weights: { weight: number }[]): [number, number] {
    if (weights.length === 0) return [0, 100];
    const vals = weights.map(w => w.weight);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = 2.5;
    const lower = Math.floor((min - pad) / 5) * 5;
    const upper = Math.ceil((max + pad) / 5) * 5;
    return [lower, upper];
  }

  // Y轴：体脂率 ±2%，取整到 1%
  function bodyFatDomain(fats: { bodyFat: number }[]): [number, number] {
    if (fats.length === 0) return [0, 50];
    const vals = fats.map(f => f.bodyFat);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = 2;
    const lower = Math.floor(min - pad);
    const upper = Math.ceil(max + pad);
    return [Math.max(0, lower), upper];
  }

  // 平均值
  function avg(values: number[]): number {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }
  const caloriePercent = Math.min(
    Math.round((data.today.calories / calorieTarget) * 100),
    100
  );

  const pieData = [
    { name: "已摄入", value: data.today.calories },
    {
      name: "剩余",
      value: Math.max(calorieTarget - data.today.calories, 0),
    },
  ];

  const macroData = [
    { name: "蛋白质", value: data.today.protein, fill: "#3b82f6" },
    { name: "碳水", value: data.today.carbs, fill: "#22c55e" },
    { name: "脂肪", value: data.today.fat, fill: "#f59e0b" },
  ];

  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* 🔄 同步状态面板 */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-500">
              🔄 同步状态
            </h2>
            <button
              onClick={() => window.location.reload()}
              className="text-xs px-3 py-1 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition-colors"
            >
              🔄 刷新状态
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(data.syncStatus || {}).map(([key, item]) => (
              <div key={key} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span>{getStatusDot(item.status)}</span>
                  <span className="text-sm font-medium text-gray-700">
                    {SYNC_LABELS[key] || key}
                  </span>
                </div>
                <p className="text-lg font-bold mt-1">
                  {item.latest_value !== null
                    ? `${item.latest_value} ${SYNC_UNITS[key] || ""}`
                    : "--"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatSyncTime(item.last_sync)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 今日概览卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">今日摄入</p>
            <p className="text-2xl font-bold">
              {data.today.calories}
              <span className="text-sm text-gray-400 font-normal">
                {" "}/ {calorieTarget} kcal
              </span>
            </p>
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${caloriePercent}%` }}
              />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">蛋白质</p>
            <p className="text-2xl font-bold">{data.today.protein}g</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">碳水</p>
            <p className="text-2xl font-bold">{data.today.carbs}g</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">脂肪</p>
            <p className="text-2xl font-bold">{data.today.fat}g</p>
          </div>
        </div>

        {/* 图表区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 热量环形图 */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-medium text-gray-500 mb-3">
              今日热量
            </h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                >
                  <Cell fill="#3b82f6" />
                  <Cell fill="#e5e7eb" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-center text-sm text-gray-400">
              {caloriePercent}% · 剩余 {calorieTarget - data.today.calories}{" "}
              kcal
            </p>
          </div>

          {/* 宏量营养素 */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-medium text-gray-500 mb-3">
              今日宏量营养素
            </h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={macroData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 减重进度 */}
          {hasWeights && (
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h2 className="text-sm font-medium text-gray-500 mb-3">🎯 减重进度</h2>
              {(() => {
                const current = data.weights[data.weights.length - 1].weight;
                const target = effectiveGoal.targetWeight;
                const remaining = current - target;
                const expectedWeekly = (current * effectiveGoal.weeklyPct) / 100;
                const weekAgo = data.weights.filter(w => {
                  const d = new Date(w.date);
                  const now = new Date();
                  return (now.getTime() - d.getTime()) / 86400000 <= 7;
                });
                const actualWeekly = weekAgo.length >= 2
                  ? weekAgo[0].weight - weekAgo[weekAgo.length - 1].weight
                  : 0;
                const onTrack = actualWeekly >= expectedWeekly * 0.7;
                const totalLost = data.weights[0].weight - current;
                const pctDone = data.weights[0].weight > target
                  ? Math.min(100, Math.round((totalLost / (data.weights[0].weight - target)) * 100))
                  : 0;

                return (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span>当前 <b className="text-blue-600">{current}kg</b></span>
                      <span className="text-gray-400">→</span>
                      <span>目标 <b className="text-gray-600">{target}kg</b></span>
                      <span className="text-gray-400">|</span>
                      <span>还需减 <b className={remaining > 0 ? "text-orange-500" : "text-green-500"}>
                        {remaining > 0 ? `${remaining.toFixed(1)}kg` : "已达成！"}
                      </b></span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-blue-500 h-3 rounded-full transition-all"
                        style={{ width: `${Math.min(pctDone, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>总进度 {pctDone}%（已减 {totalLost.toFixed(1)}kg）</span>
                      <span>
                        周目标 ↓{expectedWeekly.toFixed(1)}kg · 实际 
                        <span className={onTrack ? "text-green-500" : "text-red-500"}>
                          {actualWeekly > 0 ? "↑" : "↓"}{Math.abs(actualWeekly).toFixed(1)}kg
                          {onTrack ? " ✅" : " ⚠️"}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TDEE 与热量缺口 */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-medium text-gray-500 mb-3">🔥 热量分析</h2>
            {(() => {
              const TDEE = 2200;
              const targetIntake = effectiveGoal.dailyCalorieTarget;
              const current = data.weights.length > 0 ? data.weights[data.weights.length - 1].weight : 0;
              const weeklyPct = effectiveGoal.weeklyPct;
                // 计划缺口：体重 × 周% / 100 × 7700 / 7
                const plannedDeficit = current > 0 ? Math.round((current * weeklyPct / 100) * 7700 / 7) : 0;
                // 实际缺口：有饮食记录的7天平均
                const today = new Date().toISOString().split("T")[0];
                const recentDays: string[] = [];
                for (let i = 0; i < 7; i++) {
                  const d = new Date();
                  d.setDate(d.getDate() - i);
                  recentDays.push(d.toISOString().split("T")[0]);
                }
                const recentDiet = data.dietSummary.filter((ds: any) =>
                  recentDays.includes(String(ds["日期"]))
                );
                const daysWithDiet = recentDiet.filter((ds: any) => parseFloat(String(ds["总热量"])) > 0);
                const avgIntake = daysWithDiet.length > 0
                  ? Math.round(daysWithDiet.reduce((s: number, ds: any) => s + parseFloat(String(ds["总热量"])), 0) / daysWithDiet.length)
                  : null;
                const actualDeficit = avgIntake ? TDEE - avgIntake : null;
                const expectedLoss = actualDeficit ? ((actualDeficit * 7) / 7700).toFixed(1) : null;

                return (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center text-sm">
                    <div className="p-2 bg-gray-50 rounded">
                      <p className="text-gray-400 text-xs">TDEE</p>
                      <p className="font-bold">{TDEE} kcal</p>
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <p className="text-gray-400 text-xs">目标摄入</p>
                      <p className="font-bold">{targetIntake} kcal</p>
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <p className="text-gray-400 text-xs">计划缺口</p>
                      <p className="font-bold text-blue-600">-{plannedDeficit} kcal/天</p>
                      <p className="text-xs text-gray-400">对应 ↓{(plannedDeficit * 7 / 7700).toFixed(2)}kg/周</p>
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <p className="text-gray-400 text-xs">7天实际缺口</p>
                      {actualDeficit ? (
                        <>
                          <p className={`font-bold ${actualDeficit > 0 ? "text-green-600" : "text-red-600"}`}>
                            {actualDeficit > 0 ? "-" : "+"}{Math.abs(actualDeficit)} kcal/天
                          </p>
                          <p className="text-xs text-gray-400">预期 {actualDeficit > 0 ? "↓" : "↑"}{expectedLoss}kg/周</p>
                        </>
                      ) : (
                        <p className="text-gray-400">暂无饮食数据</p>
                      )}
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <p className="text-gray-400 text-xs">计划vs实际</p>
                      {actualDeficit ? (
                        <p className={`font-bold ${Math.abs(actualDeficit - plannedDeficit) < 100 ? "text-green-600" : "text-orange-500"}`}>
                          {actualDeficit >= plannedDeficit ? "✅ 达标" : `差${Math.round(plannedDeficit - actualDeficit)}kcal`}
                        </p>
                      ) : (
                        <p className="text-gray-400">—</p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

          {/* 体重趋势 */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-500">
                📉 体重趋势
                  <span className="text-gray-400 ml-2">目标 {effectiveGoal.targetWeight}kg</span>
              </h2>
              <div className="flex gap-1 text-xs">
                {[7, 30].map(d => (
                  <button
                    key={d}
                    onClick={() => setWeightDays(d)}
                    className={`px-2 py-1 rounded ${weightDays === d ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                  >
                    {d}天
                  </button>
                ))}
              </div>
            </div>
            {data.weights.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.weights.slice(-weightDays)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={weightDomain(data.weights.slice(-weightDays))} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="体重(kg)" />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-gray-400 text-center mt-1">
                  近 {weightDays} 天平均：{avg(data.weights.slice(-weightDays).map(w => w.weight)).toFixed(1)} kg
                </p>
              </>
            ) : (
              <p className="text-gray-400 text-center py-10">
                暂无体重数据，配置 Apple Health 快捷指令自动同步
              </p>
            )}
          </div>

          {/* 体脂率趋势 */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-500">
                📉 体脂率趋势
              </h2>
              <div className="flex gap-1 text-xs">
                {[7, 30].map(d => (
                  <button
                    key={d}
                    onClick={() => setBodyFatDays(d)}
                    className={`px-2 py-1 rounded ${bodyFatDays === d ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                  >
                    {d}天
                  </button>
                ))}
              </div>
            </div>
            {data.bodyFats.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.bodyFats.slice(-bodyFatDays)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={bodyFatDomain(data.bodyFats.slice(-bodyFatDays))} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="bodyFat" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="体脂率(%)" />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-gray-400 text-center mt-1">
                  近 {bodyFatDays} 天平均：{avg(data.bodyFats.slice(-bodyFatDays).map(f => f.bodyFat)).toFixed(1)}%
                </p>
              </>
            ) : (
              <p className="text-gray-400 text-center py-10">
                暂无体脂率数据，需智能体脂秤支持 Apple Health
              </p>
            )}
          </div>

          {/* 睡眠趋势 */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-medium text-gray-500 mb-3">
              😴 近 7 天睡眠
            </h2>
            {data.sleeps.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.sleeps.slice(-7)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar
                    dataKey="hours"
                    fill="#8b5cf6"
                    name="睡眠(小时)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 text-center py-10">
                暂无睡眠数据，通过快捷指令同步
              </p>
            )}
          </div>

          {/* 活动卡路里 🆕 */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-medium text-gray-500 mb-3">
              🔥 近 7 天活动卡路里
            </h2>
            {data.activeEnergies && data.activeEnergies.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.activeEnergies.slice(-7)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar
                    dataKey="kcal"
                    fill="#f97316"
                    name="活动卡路里(kcal)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 text-center py-10">
                暂无活动卡路里数据，Apple Watch 同步后自动展示
              </p>
            )}
          </div>
        </div>

        {/* 趋势洞察卡片 🆕 */}
        {trendFlags.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-medium text-gray-500 mb-3">
              💡 趋势洞察
            </h2>
            <div className="space-y-2">
              {trendFlags.map((f, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg text-sm border ${
                    FLAG_LEVEL_STYLES[f.level] || FLAG_LEVEL_STYLES.info
                  }`}
                >
                  <span className="mr-2">
                    {FLAG_LEVEL_ICONS[f.level] || "🔵"}
                  </span>
                  {f.message}
                </div>
              ))}
            </div>
            <div className="mt-3 text-right">
              <a
                href="/trend"
                className="text-xs text-blue-500 hover:text-blue-600"
              >
                查看完整趋势分析 →
              </a>
            </div>
          </div>
        )}

        {/* 智能建议（保留原有功能） */}
        {data.suggestions && data.suggestions.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-medium text-gray-500 mb-3">
              💡 智能建议
            </h2>
            <div className="space-y-2">
              {data.suggestions.slice(0, 3).map((s, i) => (
                <div
                  key={i}
                  className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800"
                >
                  <span className="font-medium">
                    [{String(s["建议类型"])}]
                  </span>{" "}
                  {String(s["建议内容"])}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 底部快捷入口 */}
        <div className="flex flex-wrap gap-3 justify-center">
          <a
            href="/diet"
            className="px-6 py-3 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow text-sm font-medium text-gray-700 hover:text-blue-600"
          >
            🍽️ 记录饮食
          </a>
          <a
            href="/training"
            className="px-6 py-3 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow text-sm font-medium text-gray-700 hover:text-blue-600"
          >
            🏋️ 记录训练
          </a>
          <a
            href="/trend"
            className="px-6 py-3 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow text-sm font-medium text-gray-700 hover:text-blue-600"
          >
            📊 趋势分析
          </a>
        </div>
      </main>
    </div>
  );
}
