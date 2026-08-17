"use client";

import { AreaChart, Area, ResponsiveContainer } from "recharts";

// ساخت داده‌های تستی (Mock) برای نمایش در نمودار
// اگر سایت رشد داشته باشد، نمودار صعودی و اگر افت داشته باشد، نزولی رسم می‌شود
const generateData = (trend: "up" | "down") => {
  return Array.from({ length: 20 }).map((_, i) => ({
    value: trend === "up" 
      ? Math.floor(Math.random() * 50) + (i * 5)  // روند صعودی
      : Math.floor(Math.random() * 50) + ((20 - i) * 5) // روند نزولی
  }));
};

export default function MiniChart({ trend }: { trend: "up" | "down" }) {
  const data = generateData(trend);
  const color = trend === "up" ? "#3b82f6" : "#6366f1"; // رنگ آبی برای هر دو، اما طیف متفاوت

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          {/* ساخت گرادیانت (سایه محو) زیر نمودار */}
          <linearGradient id={`color-${trend}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* رسم خط اصلی و سایه */}
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fillOpacity={1}
          fill={`url(#color-${trend})`}
          isAnimationActive={false} // انیمیشن را برای نمودارهای کوچک خاموش می‌کنیم تا سبک باشد
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}