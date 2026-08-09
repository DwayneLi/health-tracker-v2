"use client";

import { useEffect, useState, useMemo } from "react";

export default function SettingsPage() {
  const [goal, setGoal] = useState({
    targetWeight: "",
    weeklyPct: "0.5",
    dailyCalories: "1500",
    tdee: "2200",
    autoCalc: true,
    proteinPerKg: "1.2",
  });
  const [currentWeight, setCurrentWeight] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/data?type=goal").then((r) => r.json()),
      fetch("/api/data?type=weight&days=1").then((r) => r.json()),
    ])
      .then(([d, w]) => {
        if (d.goal) {
          setGoal({
            targetWeight: String(d.goal["目标体重(kg)"] || ""),
            weeklyPct: String(d.goal["每周减重百分比(%)"] || "0.5"),
            dailyCalories: String(d.goal["每日热量目标(kcal)"] || "2000"),
            tdee: String(d.goal["TDEE(kcal)"] || "2200"),
            autoCalc: String(d.goal["自动计算热量"] || "true") === "true",
            proteinPerKg: String(d.goal["蛋白质基准(g/kg)"] || "1.2"),
          });
        } else {
          setGoal({
            targetWeight: "75", weeklyPct: "0.75", dailyCalories: "1500",
            tdee: "2200", autoCalc: true, proteinPerKg: "1.2",
          });
        }
        const ws = w.weights || [];
        setCurrentWeight(ws.length > 0 ? ws[ws.length - 1].weight : 0);
      })
      .catch(console.error);
  }, []);

  // 自动计算的每日热量（仅在 autoCalc 开启时使用）
  const derivedCalories = useMemo(() => {
    const w = currentWeight || parseFloat(goal.targetWeight) || 75;
    const pct = parseFloat(goal.weeklyPct) || 0;
    const t = parseFloat(goal.tdee) || 2200;
    const deficit = Math.round(w * pct / 100 * 7700 / 7);
    return Math.max(800, t - deficit);
  }, [currentWeight, goal.targetWeight, goal.weeklyPct, goal.tdee]);

  // 当前实际使用的每日热量值
  const effectiveCalories = goal.autoCalc ? String(derivedCalories) : goal.dailyCalories;

  const updateGoal = (field: string, value: string | boolean) => {
    setGoal((prev) => {
      const next = { ...prev, [field]: value };
      // 切换自动计算开启时，同步计算值
      if (field === "autoCalc" && value === true) {
        const w = currentWeight || parseFloat(next.targetWeight) || 75;
        const pct = parseFloat(next.weeklyPct) || 0;
        const t = parseFloat(next.tdee) || 2200;
        const deficit = Math.round(w * pct / 100 * 7700 / 7);
        next.dailyCalories = String(Math.max(800, t - deficit));
      }
      return next;
    });
  };

  const handleSave = async () => {
    try {
      const resp = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_goal",
          targetWeight: parseFloat(goal.targetWeight) || 75,
          weeklyPct: parseFloat(goal.weeklyPct) || 0.75,
          dailyCalories: parseInt(effectiveCalories) || 1500,
          tdee: parseInt(goal.tdee) || 2200,
          proteinPerKg: parseFloat(goal.proteinPerKg) || 1.2,
          autoCalc: String(goal.autoCalc),
        }),
      });
      if (resp.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error("Save goal failed", e);
    }
  };

  const deficit = useMemo(() => {
    const t = parseFloat(goal.tdee) || 2200;
    const c = parseInt(effectiveCalories) || 1500;
    return t - c;
  }, [goal.tdee, effectiveCalories]);

  return (
    <div className="min-h-screen">
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-lg font-bold">⚙️ 设置</h1>

        {/* Apple Health 同步指南 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-medium mb-4">📲 Apple Health 同步指南</h2>

          {/* 快捷指令链接占位 */}
          <div className="bg-blue-50 rounded-lg p-4 mb-4 text-center">
            <p className="text-blue-700 font-medium mb-1">
              🔗 Health Tracker 快捷指令
            </p>
            <p className="text-blue-600 text-sm">
              即将提供 iCloud 链接
            </p>
            <p className="text-xs text-blue-400 mt-1">
              届时点击链接即可在 iPhone 上一键导入快捷指令
            </p>
          </div>

          {/* 配置步骤 */}
          <div className="space-y-3 mb-6">
            <h3 className="text-sm font-medium text-gray-700">
              📋 配置步骤（约 2 分钟）
            </h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex gap-3">
                <span className="text-blue-500 font-bold shrink-0">1.</span>
                <span>
                  点击上方按钮获取 iCloud 快捷指令链接
                </span>
              </div>
              <div className="flex gap-3">
                <span className="text-blue-500 font-bold shrink-0">2.</span>
                <span>
                  在 iPhone 上打开链接 → 点击「添加快捷指令」
                </span>
              </div>
              <div className="flex gap-3">
                <span className="text-blue-500 font-bold shrink-0">3.</span>
                <span>
                  首次运行时会弹出<b>三项</b>健康数据授权（体重/体脂率/活动能量），全部点击「允许」<br />
                  <span className="text-blue-500">注：<b>睡眠</b>不在快捷指令同步范围内，请前往"😴 睡眠"标签页手动录入。</span>
                </span>
              </div>
              <div className="flex gap-3">
                <span className="text-blue-500 font-bold shrink-0">4.</span>
                <span>手动运行一次确认数据能正常推送</span>
              </div>
              <div className="flex gap-3">
                <span className="text-blue-500 font-bold shrink-0">5.</span>
                <span>
                  打开「自动化」标签 → 新建「特定时间」自动化 → 每日 08:00 →
                  添加操作「运行快捷指令」→ 选择「Health Tracker 同步」→{" "}
                  <strong>关闭「运行前询问」</strong>
                </span>
              </div>
            </div>
          </div>

          {/* 注意事项 */}
          <div className="bg-yellow-50 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-yellow-800 mb-2">
              ⚠️ 注意事项
            </h3>
            <ul className="text-xs text-yellow-700 space-y-1 list-disc list-inside">
              <li>
                体脂率需要智能体脂秤（如 Withings、小米体脂秤）支持 Apple
                Health 写入
              </li>
              <li>活动卡路里需要 Apple Watch 佩戴记录</li>
              <li>
                自动化在设备解锁时执行，如果 08:00 设备锁屏，将在解锁后补偿执行
              </li>
              <li>同步不消耗蜂窝数据时可使用 Wi-Fi</li>
            </ul>
          </div>

          {/* 同步数据说明表格 */}
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            📊 三项同步数据说明
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4 font-medium">数据项</th>
                  <th className="py-2 pr-4 font-medium">Apple Health 类型</th>
                  <th className="py-2 pr-4 font-medium">所需设备</th>
                  <th className="py-2 font-medium">单位</th>
                </tr>
              </thead>
              <tbody className="text-gray-600">
                <tr className="border-b">
                  <td className="py-2 pr-4">体重</td>
                  <td className="py-2 pr-4 text-xs">HKQuantityTypeIdentifierBodyMass</td>
                  <td className="py-2 pr-4">iPhone 或智能体脂秤</td>
                  <td className="py-2">kg</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">体脂率</td>
                  <td className="py-2 pr-4 text-xs">HKQuantityTypeIdentifierBodyFatPercentage</td>
                  <td className="py-2 pr-4">智能体脂秤</td>
                  <td className="py-2">%</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">活动卡路里</td>
                  <td className="py-2 pr-4 text-xs">HKQuantityTypeIdentifierActiveEnergyBurned</td>
                  <td className="py-2 pr-4">Apple Watch</td>
                  <td className="py-2">kcal</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 睡眠说明（手动录入） */}
          <div className="bg-blue-50 rounded-lg p-5 border border-blue-100">
            <h4 className="text-sm font-medium text-blue-800 mb-2">😴 睡眠数据 · 手动录入</h4>
            <p className="text-sm text-blue-700 mb-3">
              睡眠不通过快捷指令自动同步。请在「睡眠」标签页手动录入，默认 7.5 小时。
              也可定期用 <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">scripts/import-health.mjs</code> 脚本
              解析 Apple Health export.xml 批量导入历史数据。
            </p>
          </div>
        </div>

        {/* 目标设定 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-medium mb-4">🎯 减重目标</h2>

          <div className="space-y-4">
            {/* 目标体重 */}
            <div>
              <label className="block text-sm text-gray-500 mb-1">
                目标体重 (kg)
              </label>
              <input
                type="number"
                value={goal.targetWeight}
                onChange={(e) => updateGoal("targetWeight", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="75"
              />
              <p className="text-xs text-gray-400 mt-1">当前体重参考：{currentWeight ? `${currentWeight} kg` : "暂无数据"}</p>
            </div>

            {/* 每周减重百分比 */}
            <div>
              <label className="block text-sm text-gray-500 mb-1">
                每周减重百分比 (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={goal.weeklyPct}
                onChange={(e) => updateGoal("weeklyPct", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0.75"
              />
              <p className="text-xs text-gray-400 mt-1">
                建议 0.5-1.0%。体重 75kg 时 0.75% = 每周减 0.56kg
              </p>
            </div>

            {/* TDEE */}
            <div>
              <label className="block text-sm text-gray-500 mb-1">
                TDEE — 每日总消耗 (kcal)
              </label>
              <input
                type="number"
                value={goal.tdee}
                onChange={(e) => updateGoal("tdee", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="2200"
              />
              <p className="text-xs text-gray-400 mt-1">
                基础代谢 + 日常活动 + 运动的每日总消耗。久坐约 2000 · 轻度活动约 2200 · 活跃约 2500+
              </p>
            </div>

            {/* 自动计算开关 */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <button
                onClick={() => updateGoal("autoCalc", !goal.autoCalc)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  goal.autoCalc ? "bg-blue-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    goal.autoCalc ? "translate-x-5.5" : "translate-x-0.5"
                  }`}
                />
              </button>
              <div>
                <span className="text-sm font-medium">自动计算每日热量</span>
                <p className="text-xs text-gray-400">
                  开启后每日目标 = TDEE − 减重缺口，自动联动
                </p>
              </div>
            </div>

            {/* 每日热量目标 */}
            <div>
              <label className="block text-sm text-gray-500 mb-1">
                每日热量目标 (kcal)
              </label>
              {goal.autoCalc ? (
                <div>
                  <input
                    type="number"
                    value={derivedCalories}
                    disabled
                    className="w-full px-3 py-2 border rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                  />
                  <p className="text-xs text-blue-500 mt-1">
                    🔒 自动计算：{goal.tdee || "2200"} (TDEE) − {deficit} (缺口) = {derivedCalories} kcal
                    （每 kg 脂肪 ≈ 7700 kcal）
                  </p>
                </div>
              ) : (
                <div>
                  <input
                    type="number"
                    value={goal.dailyCalories}
                    onChange={(e) => updateGoal("dailyCalories", e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="1500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    手动设置。参考缺口：TDEE {goal.tdee || "2200"} − 目标 = 建议约 {derivedCalories} kcal
                  </p>
                </div>
              )}
            </div>

            {/* 蛋白质基准 */}
            <div>
              <label className="block text-sm text-gray-500 mb-1">
                蛋白质基准 (g/kg)
              </label>
              <input
                type="number"
                step="0.1"
                value={goal.proteinPerKg}
                onChange={(e) => updateGoal("proteinPerKg", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="1.2"
              />
              <p className="text-xs text-gray-400 mt-1">
                久坐 1.2 · 运动日 1.6 · 增肌 1.8-2.0。当前体重 {currentWeight || "--"} kg 时蛋白质目标 ≈{" "}
                {currentWeight > 0
                  ? `${Math.round(currentWeight * (parseFloat(goal.proteinPerKg) || 1.2))} g/天`
                  : "--"}
              </p>
            </div>

            <button
              onClick={handleSave}
              className={`px-6 py-2 rounded-lg text-white font-medium transition-colors ${
                saved
                  ? "bg-green-500"
                  : "bg-blue-500 hover:bg-blue-600"
              }`}
            >
              {saved ? "✅ 已保存" : "保存设置"}
            </button>
          </div>
        </div>

        {/* 数据导出 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-medium mb-4">💾 数据导出</h2>
          <a
            href="/api/export"
            className="inline-block px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
          >
            导出 Excel
          </a>
          <p className="text-xs text-gray-400 mt-2">
            导出包含所有健康数据的 Excel 文件，含体重、体脂、饮食、睡眠、活动卡路里、训练等全部 Sheet
          </p>
        </div>
      </main>
    </div>
  );
}
