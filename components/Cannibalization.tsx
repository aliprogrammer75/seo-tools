"use client";

import { useState } from "react";
import { AlertTriangle, Trophy, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";

export default function Cannibalization({ data, baseUrl }: { data: any[], baseUrl: string }) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  
  const [sortKey, setSortKey] = useState("totalClicks");
  const [sortDir, setSortDir] = useState("desc");

  const toggleRow = (id: number) => {
    if (expandedRow === id) setExpandedRow(null);
    else setExpandedRow(id);
  };

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortedData = data ? [...data].sort((a, b) => {
    let aVal = sortKey === 'pagesCount' ? a.competingPages.length : a.totalClicks;
    let bVal = sortKey === 'pagesCount' ? b.competingPages.length : b.totalClicks;
    
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  }) : [];

  return (
    <div className="animate-fade-in font-[vazir]" dir="rtl">
      <div className="bg-gradient-to-l from-rose-50 to-white border border-rose-100 rounded-2xl p-6 mb-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-2 h-full bg-rose-400"></div>
        <div className="flex gap-4 items-start">
          <div className="bg-rose-100 p-3 rounded-full text-rose-600 shrink-0">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 mb-2">هم‌خواری کلمات کلیدی (Cannibalization)</h2>
            <p className="text-slate-600 text-sm leading-relaxed max-w-4xl">
              این گزارش فقط زمانی هشدار می‌دهد که حداقل دو صفحه سهم معناداری از ایمپرشن داشته باشند و برندهٔ روزانه بین آن‌ها جابه‌جا شود. برچسب <strong className="text-rose-600">بحرانی</strong> نشانهٔ رقابت محتمل است و پیش از ادغام یا ریدایرکت باید دستی بررسی شود.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-12 gap-4 p-4 bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500">
          <div className="col-span-6 md:col-span-8">کلمه کلیدی درگیر</div>
          <button onClick={() => handleSort('totalClicks')} className="col-span-3 md:col-span-2 text-center hover:text-gray-800 transition">
            مجموع کلیک {sortKey === 'totalClicks' && (sortDir === 'desc' ? '▼' : '▲')}
          </button>
          <button onClick={() => handleSort('pagesCount')} className="col-span-3 md:col-span-2 text-center hover:text-gray-800 transition">
            صفحات درگیر {sortKey === 'pagesCount' && (sortDir === 'desc' ? '▼' : '▲')}
          </button>
        </div>

        <div className="divide-y divide-gray-100">
          {(!sortedData || sortedData.length === 0) && (
            <div className="p-8 text-center text-gray-400 font-medium">
              در این بازه زمانی، هیچ صفحه درگیری یافت نشد. عالی است! 🎉
            </div>
          )}

          {sortedData.map((item) => (
            <div key={item.id} className="group">
              <div 
                onClick={() => toggleRow(item.id)}
                className={`grid grid-cols-12 gap-4 p-4 items-center cursor-pointer transition-colors ${expandedRow === item.id ? 'bg-rose-50/50' : 'hover:bg-gray-50'}`}
              >
                <div className="col-span-6 md:col-span-8 font-bold text-slate-800 flex items-center gap-2">
                  {expandedRow === item.id ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  {item.query}
                  {/* 🚨 لیبل هوشمند بحرانی */}
                  {item.isCritical && (
                    <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded-md text-[10px] font-black tracking-wider flex items-center gap-1 mr-2">
                      <AlertTriangle size={12}/> بحرانی
                    </span>
                  )}
                </div>
                <div className="col-span-3 md:col-span-2 text-center font-bold text-blue-600">{item.totalClicks}</div>
                <div className="col-span-3 md:col-span-2 text-center">
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-md text-xs font-bold">
                    {item.competingPages.length} صفحه
                  </span>
                </div>
              </div>

              {expandedRow === item.id && (
                <div className="bg-slate-50 border-t border-gray-100 p-6 shadow-inner animate-fade-in">
                  <h4 className="text-xs font-bold text-slate-500 mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                    صفحاتی که بر سر این کلمه رقابت می‌کنند:
                  </h4>
                  
                  <div className="space-y-3">
                    {item.competingPages.map((page: any, idx: number) => (
                      <div key={idx} className={`flex flex-col md:flex-row justify-between md:items-center p-4 rounded-xl border ${page.isWinner ? 'bg-green-50/50 border-green-200' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center gap-3 mb-3 md:mb-0 overflow-hidden">
                          {page.isWinner ? (
                            <div className="bg-green-100 text-green-600 p-2 rounded-lg" title="صفحه برنده (بیشترین کلیک)"><Trophy size={18} /></div>
                          ) : (
                            <div className="bg-gray-100 text-gray-400 p-2 rounded-lg"><ExternalLink size={18} /></div>
                          )}
                          <a href={new URL(page.url, baseUrl).toString()} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-700 hover:text-blue-600 truncate" dir="ltr">
                            {page.url}
                          </a>
                        </div>
                        
                        <div className="flex gap-6 text-sm" dir="ltr">
                          <div className="text-center">
                            <div className="text-xs text-slate-400 mb-1">Clicks</div>
                            <div className="font-bold text-slate-800">{page.clicks}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-slate-400 mb-1">Impr.</div>
                            <div className="font-bold text-slate-800">{page.impressions}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-slate-400 mb-1">Pos.</div>
                            <div className={`font-bold ${page.position < 10 ? 'text-green-600' : 'text-orange-500'}`}>{page.position}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
