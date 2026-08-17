"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// متغیر showComparison اضافه شد
export default function MainChart({ data, showMetrics, showComparison = true }: { data: any[], showMetrics: any, showComparison?: boolean }) {
  if (!data || data.length === 0) {
    return <div className="flex h-full items-center justify-center text-gray-400 font-[vazir]">در حال پردازش نمودار...</div>;
  }

  const formatDateShort = (dateString: string) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDateFull = (dateString: string) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatValue = (val: any, isPos = false, isCtr = false) => {
    if (val === null || val === undefined) return '-';
    if (isCtr) return Number(val).toFixed(1) + '%';
    if (isPos) return Number(val).toFixed(1);
    if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
    return val.toString();
  };

  const calcTrend = (curr: any, prev: any, isPos = false) => {
    if (curr === null || prev === null || prev === 0) return null;
    if (isPos) {
      const diff = prev - curr; 
      return diff === 0 ? 0 : diff;
    }
    return ((curr - prev) / prev) * 100;
  };

  const TrendBadge = ({ trend, isPos = false }: { trend: number | null, isPos?: boolean }) => {
    if (trend === null) return null;
    if (trend === 0) return <span className="text-gray-400 text-[10px] ml-1">~ 0</span>;
    const isPositive = trend > 0;
    const color = isPositive ? 'text-green-500' : 'text-rose-500';
    const arrow = isPositive ? '↑' : '↓';
    return <span className={`${color} text-[10px] font-bold ml-1`}>{arrow}{Math.abs(trend).toFixed(0)}{isPos ? '' : '%'}</span>;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const row = payload[0].payload;
      return (
        <div className="bg-white p-3 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.1)] border border-gray-100 text-sm min-w-[220px]" dir="ltr">
          <div className="flex justify-between border-b border-gray-100 pb-2 mb-2 text-gray-500 text-[11px] font-medium">
            <span className="text-gray-800">{formatDateFull(row.date)}</span>
            {showComparison && <span>vs {formatDateFull(row.prevDate)}</span>}
          </div>
          
          <div className="space-y-2">
            {showMetrics.clicks && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div><span className="text-gray-600 text-xs">Clicks</span></div>
                <div className="flex items-center font-bold text-gray-800">
                  {formatValue(row.clicks)} 
                  {showComparison && <><TrendBadge trend={calcTrend(row.clicks, row.p_clicks)} /> <span className="text-gray-400 font-normal ml-2">{formatValue(row.p_clicks)}</span></>}
                </div>
              </div>
            )}
            {showMetrics.impressions && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-500"></div><span className="text-gray-600 text-xs">Impressions</span></div>
                <div className="flex items-center font-bold text-gray-800">
                  {formatValue(row.impressions)} 
                  {showComparison && <><TrendBadge trend={calcTrend(row.impressions, row.p_imp)} /> <span className="text-gray-400 font-normal ml-2">{formatValue(row.p_imp)}</span></>}
                </div>
              </div>
            )}
            {showMetrics.ctr && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-teal-500"></div><span className="text-gray-600 text-xs">CTR</span></div>
                <div className="flex items-center font-bold text-gray-800">
                  {formatValue(row.ctr, false, true)} 
                  {showComparison && <><TrendBadge trend={calcTrend(row.ctr, row.p_ctr)} /> <span className="text-gray-400 font-normal ml-2">{formatValue(row.p_ctr, false, true)}</span></>}
                </div>
              </div>
            )}
            {showMetrics.position && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500"></div><span className="text-gray-600 text-xs">Avg. Position</span></div>
                <div className="flex items-center font-bold text-gray-800">
                  {formatValue(row.position, true)} 
                  {showComparison && <><TrendBadge trend={calcTrend(row.position, row.p_pos, true)} isPos={true} /> <span className="text-gray-400 font-normal ml-2">{formatValue(row.p_pos, true)}</span></>}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
          <linearGradient id="colorImp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a855f7" stopOpacity={0.25}/><stop offset="95%" stopColor="#a855f7" stopOpacity={0}/></linearGradient>
          <linearGradient id="colorCtr" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25}/><stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/></linearGradient>
          <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.25}/><stop offset="95%" stopColor="#f97316" stopOpacity={0}/></linearGradient>
        </defs>
        
        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{fontSize: 11, fill: '#94a3b8'}} tickFormatter={formatDateShort} minTickGap={20} />

        <YAxis yAxisId="clicks" orientation="left" tick={{fontSize: 11, fill: '#94a3b8'}} axisLine={false} tickLine={false} hide={!showMetrics?.clicks} />
        <YAxis yAxisId="impressions" orientation="right" tick={{fontSize: 11, fill: '#94a3b8'}} axisLine={false} tickLine={false} hide={!showMetrics?.impressions} />
        <YAxis yAxisId="ctr" orientation="right" hide={true} domain={['dataMin', 'dataMax']} />
        <YAxis yAxisId="position" orientation="right" hide={true} reversed={true} domain={['dataMin', 'dataMax']} />
        
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }} />
        
        {/* 🪄 اعمال مخفی‌سازی خط‌چین‌های مقایسه با توجه به دکمه تنظیمات */}
        {showComparison && showMetrics?.clicks && <Area yAxisId="clicks" type="monotone" dataKey="p_clicks" stroke="#93c5fd" strokeWidth={1.5} strokeDasharray="4 4" fill="none" activeDot={false} />}
        {showComparison && showMetrics?.impressions && <Area yAxisId="impressions" type="monotone" dataKey="p_imp" stroke="#d8b4fe" strokeWidth={1.5} strokeDasharray="4 4" fill="none" activeDot={false} />}
        {showComparison && showMetrics?.ctr && <Area yAxisId="ctr" type="monotone" dataKey="p_ctr" stroke="#5eead4" strokeWidth={1.5} strokeDasharray="4 4" fill="none" activeDot={false} />}
        {showComparison && showMetrics?.position && <Area yAxisId="position" type="monotone" dataKey="p_pos" stroke="#fdba74" strokeWidth={1.5} strokeDasharray="4 4" fill="none" activeDot={false} />}

        <Area yAxisId="clicks" connectNulls type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorClicks)" hide={!showMetrics?.clicks} />
        <Area yAxisId="impressions" connectNulls type="monotone" dataKey="impressions" stroke="#a855f7" strokeWidth={2.5} fillOpacity={1} fill="url(#colorImp)" hide={!showMetrics?.impressions} />
        <Area yAxisId="ctr" connectNulls type="monotone" dataKey="ctr" stroke="#14b8a6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCtr)" hide={!showMetrics?.ctr} />
        <Area yAxisId="position" connectNulls type="monotone" dataKey="position" stroke="#f97316" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPos)" hide={!showMetrics?.position} />
      </AreaChart>
    </ResponsiveContainer>
  );
}