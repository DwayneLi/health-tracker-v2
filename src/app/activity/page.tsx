"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface SleepRecord {
  date: string;
  hours: number;
  bedHours: number;
  source: string;
  syncTime: string;
}

interface ActiveEnergyRecord {
  date: string;
  kcal: number;
  source: string;
  syncTime: string;
}

export default function ActivityPage() {
  const [sleeps, setSleeps] = useState<SleepRecord[]>([]);
  const [activeEnergies, setActiveEnergies] = useState<ActiveEnergyRecord[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/data?type=sleep&days=30").then((r) => r.json()),
      fetch("/api/data?type=active_energy&days=30").then((r) => r.json()),
    ])
      .then(([sd, ad]) => {
        setSleeps(sd.sleeps || []);
        setActiveEnergies(ad.activeEnergies || []);
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

  // 计算统计
  const recentSleeps = sleeps.slice(-7);
  const sleepAvg7 =
    recentSleeps.length > 0
      ? Math.round(
          (recentSleeps.reduce((s, r) => s + r.hours, 0) /
            recentSleeps.length) *
            10
        ) / 10
      : 0;
  const sleepAvg30 =
    sleeps.length > 0
      ? Math.round(
          (sleeps.reduce((s, r) => s + r.hours, 0) / sleeps.length) * 10
        ) / 10
      : 0;

  const recentEnergies = activeEnergies.slice(-7);
  const energyAvg7 =
    recentEnergies.length > 0
      ? Math.round(
          recentEnergies.reduce((s, r) => s + r.kcal, 0) /
            recentEnergies.length
        )
      : 0;
  const energyAvg30 =
    activeEnergies.length > 0
      ? Math.round(
          activeEnergies.reduce((s, r) => s + r.kcal, 0) /
            activeEnergies.length
        )
      : 0;

  const latestSleep = sleeps.length > 0 ? sleeps[sleeps.length - 1] : null;
  const latestEnergy =
    activeEnergies.length > 0
      ? activeEnergies[activeEnergies.length - 1]
      : null;

  const sleepChartData = sleeps.map((s) => ({
    date: s.date.slice(5),
    hours: s.hours,
  }));

  const energyChartData = activeEnergies.map((e) => ({
    date: e.date.slice(5),
    kcal: e.kcal,
  }));

  return (
    <div className="min-h-screen">
      {/* 导航 */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">😴 睡眠与活动</h1>
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
            <a href="/activity" className="text-blue-600 font-medium">
              活动
            </a>
            <a href="/trend" className="text-gray-500 hover:text-blue-600">
              趋势
            </a>
            <a href="/settings" className="text-gray-500 hover:text-blue-600">
              设置
            </a>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* 睡眠统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">最新睡眠</p>
            <p className="text-2xl font-bold">
              {latestSleep ? `${latestSleep.hours}h` : "--"}
            </p>
            {latestSleep && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  latestSleep.source === "Apple Health"
                    ? "bg-green-100 text-green-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {latestSleep.source || "手动录入"}
              </span>
            )}
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">7 天日均睡眠</p>
            <p className="text-2xl font-bold">
              {sleepAvg7 > 0 ? `${sleepAvg7}h` : "--"}
            </p>
            <p className="text-xs text-gray-400">
              {sleepAvg7 >= 7 ? "✅ 达标" : "⚠️ 不足"}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">30 天日均睡眠</p>
            <p className="text-2xl font-bold">
              {sleepAvg30 > 0 ? `${sleepAvg30}h` : "--"}
            </p>
          </div>
        </div>

        {/* 睡眠柱状图 */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-3">
            😴 近 30 天睡眠时长
            {latestSleep?.syncTime && (
              <span className="text-gray-400 ml-2 text-xs">
                同步:{" "}
                {new Date(latestSleep.syncTime).toLocaleString("zh-CN")}
              </span>
            )}
          </h2>
          {sleepChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sleepChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis
                  domain={[0, "auto"]}
                  label={{
                    value: "小时",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 12 },
                  }}
                />
                <Tooltip
                  formatter={(value) => [`${value}h`, "睡眠时长"]}
                />
                <Bar
                  dataKey="hours"
                  fill="#8b5cf6"
                  name="睡眠时长"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-10">
              暂无睡眠数据，配置 Apple Health 快捷指令自动同步
            </p>
          )}
          {sleepAvg7 > 0 && (
            <p className="text-xs text-gray-400 mt-2 text-center">
              7 天平均: {sleepAvg7}h · 参考线: 7h（CDC 建议）
            </p>
          )}
        </div>

        {/* 活动卡路里统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">最新活动卡路里</p>
            <p className="text-2xl font-bold">
              {latestEnergy ? `${latestEnergy.kcal} kcal` : "--"}
            </p>
            {latestEnergy && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  latestEnergy.source === "Apple Health"
                    ? "bg-green-100 text-green-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {latestEnergy.source || "Apple Health"}
              </span>
            )}
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">7 天日均活动</p>
            <p className="text-2xl font-bold">
              {energyAvg7 > 0 ? `${energyAvg7} kcal` : "--"}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">30 天日均活动</p>
            <p className="text-2xl font-bold">
              {energyAvg30 > 0 ? `${energyAvg30} kcal` : "--"}
            </p>
          </div>
        </div>

        {/* 活动卡路里柱状图 */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-3">
            🔥 近 30 天活动卡路里
            {latestEnergy?.syncTime && (
              <span className="text-gray-400 ml-2 text-xs">
                同步:{" "}
                {new Date(latestEnergy.syncTime).toLocaleString("zh-CN")}
              </span>
            )}
          </h2>
          {energyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={energyChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis
                  domain={[0, "auto"]}
                  label={{
                    value: "kcal",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 12 },
                  }}
                />
                <Tooltip
                  formatter={(value) => [`${value} kcal`, "活动卡路里"]}
                />
                <Bar
                  dataKey="kcal"
                  fill="#f97316"
                  name="活动卡路里"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-10">
              暂无活动卡路里数据，配置 Apple Health 快捷指令自动同步
            </p>
          )}
          {energyAvg7 > 0 && (
            <p className="text-xs text-gray-400 mt-2 text-center">
              7 天平均: {energyAvg7} kcal
            </p>
          )}
        </div>

        {/* 数据来源 */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-3">
            📋 数据来源
          </h2>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                Apple Health
              </span>
              <span>睡眠：Apple Watch 或 iPhone 健康 App</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                Apple Health
              </span>
              <span>活动卡路里：Apple Watch 活动能量</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
