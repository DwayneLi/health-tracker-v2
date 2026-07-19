"use client";

import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "首页", icon: "📊" },
  { href: "/body", label: "体重", icon: "⚖️" },
  { href: "/diet", label: "饮食", icon: "🍽️" },
  { href: "/training", label: "训练", icon: "🏋️" },
  { href: "/sleep", label: "睡眠", icon: "😴" },
  { href: "/activity", label: "活动", icon: "🔥" },
  { href: "/trend", label: "趋势", icon: "📈" },
  { href: "/settings", label: "设置", icon: "⚙️" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="bg-white shadow-sm border-b sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-2 sm:px-4">
        <div className="flex items-center justify-between overflow-x-auto">
          <h1 className="text-base font-bold whitespace-nowrap mr-4 hidden sm:block">
            📊 健康追踪
          </h1>
          <div className="flex gap-0 sm:gap-1 min-w-0">
            {TABS.map((tab) => {
              const isActive =
                tab.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(tab.href);
              return (
                <a
                  key={tab.href}
                  href={tab.href}
                  className={`px-2 sm:px-3 py-3 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <span className="sm:hidden">{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.icon} {tab.label}</span>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
