/**
 * 日期工具 — 统一使用中国标准时间（Asia/Shanghai）
 *
 * 避免服务器默认 UTC 导致上午的数据被记到前一天。
 */

/**
 * 获取今天在中国标准时间下的日期字符串 YYYY-MM-DD
 */
export function getTodayStr(): string {
  return formatDateBeijing(new Date());
}

/**
 * 将 Date 转换为中国标准时间下的日期字符串 YYYY-MM-DD
 */
export function formatDateBeijing(date: Date): string {
  return date
    .toLocaleDateString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\//g, "-");
}

/**
 * 获取中国标准时间下的当前日期时间字符串
 */
export function getNowStr(): string {
  return new Date().toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
