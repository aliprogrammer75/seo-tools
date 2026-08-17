"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import MainChart from "../../components/MainChart";
import Cannibalization from "../../components/Cannibalization";
import { 
  MousePointerClick, Eye, Percent, TrendingUp, Filter, Copy, 
  Search, HelpCircle, ShoppingCart, TextSelect, BookOpen, 
  Package, Network, ChevronDown, Check, Activity, Target, AlertCircle, ShieldAlert, Sparkles, Ghost
} from "lucide-react";

export default function SiteDashboard() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [activeOptTool, setActiveOptTool] = useState("Decay");
  const [period, setPeriod] = useState(14); 
  
  const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState(false);
  const [showComparison, setShowComparison] = useState(true);
  const [showChangePercent, setShowChangePercent] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  const [excludeBrand, setExcludeBrand] = useState(true);
  const [brandKeywords, setBrandKeywords] = useState("exir, اکسیر");
  
  const [querySearchInput, setQuerySearchInput] = useState("");
  const [debouncedQuerySearch, setDebouncedQuerySearch] = useState("");
  const [activeQueryPreset, setActiveQueryPreset] = useState("All");

  const [pageSearchInput, setPageSearchInput] = useState("");
  const [debouncedPageSearch, setDebouncedPageSearch] = useState("");
  const [activePagePreset, setActivePagePreset] = useState("All");

  const [queriesFilter, setQueriesFilter] = useState("All"); 
  const [pagesFilter, setPagesFilter] = useState("All"); 
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [activeCluster, setActiveCluster] = useState<string | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuerySearch(querySearchInput), 600);
    return () => clearTimeout(handler);
  }, [querySearchInput]);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedPageSearch(pageSearchInput), 600);
    return () => clearTimeout(handler);
  }, [pageSearchInput]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsPeriodMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const periodOptions = [
    { label: "7 days", value: 7 }, { label: "14 days", value: 14 }, { label: "28 days", value: 28 },
    { label: "3 months", value: 90 }, { label: "6 months", value: 180 }, { label: "12 months", value: 365 }, { label: "16 months", value: 480 }
  ];

  const [showMetrics, setShowMetrics] = useState({ clicks: true, impressions: false, ctr: false, position: false });
  const toggleMetric = (metric: keyof typeof showMetrics) => setShowMetrics(prev => ({ ...prev, [metric]: !prev[metric] }));
  
  const [realQueries, setRealQueries] = useState<any[]>([]);
  const [realPages, setRealPages] = useState<any[]>([]);
  const [realContentGroups, setRealContentGroups] = useState<any[]>([]);
  const [realTopicClusters, setRealTopicClusters] = useState<any[]>([]); 
  const [realNewRankings, setRealNewRankings] = useState<any[]>([]);
  const [realChartData, setRealChartData] = useState<any[]>([]);
  const [realCannibalization, setRealCannibalization] = useState<any[]>([]); 
  const [realStriking, setRealStriking] = useState<any[]>([]);
  const [realCtrBench, setRealCtrBench] = useState<any[]>([]);
  const [realDecay, setRealDecay] = useState<any[]>([]);
  const [realZombies, setRealZombies] = useState<any[]>([]);

  const [totals, setTotals] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [sorts, setSorts] = useState<Record<string, { key: string, direction: 'asc' | 'desc' }>>({
    TopicClusters: { key: 'clicks', direction: 'desc' }, 
    ContentGroups: { key: 'clicks', direction: 'desc' },
    Queries: { key: 'clicks', direction: 'desc' }, 
    Pages: { key: 'clicks', direction: 'desc' },
    NewRankings: { key: 'clicks', direction: 'desc' }
  });

  const formatNumber = (num: number) => num >= 1000 ? (num / 1000).toFixed(1) + 'k' : num.toString();

  useEffect(() => {
    async function fetchAllData() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          days: period.toString(),
          excludeBrand: excludeBrand.toString(),
          brands: brandKeywords,
          qPreset: activeQueryPreset !== 'All' ? activeQueryPreset : '',
          qSearch: debouncedQuerySearch,
          pPreset: activePagePreset !== 'All' ? activePagePreset : '',
          pSearch: debouncedPageSearch
        });

        const response = await fetch(`/api/search-console?${params.toString()}`);
        const result = await response.json();
        
        if (result.success && result.data) {
          const d = result.data;
          setTotals(d.totals || null);
          setRealChartData(d.chartData || []);
          setRealCannibalization(d.cannibalizationData || []); 
          setRealStriking(d.strikingDistance || []);
          setRealCtrBench(d.ctrBenchmark || []);
          setRealDecay(d.contentDecay || []);

          const maxC = d.queries?.[0]?.clicks || 1;
          const formatRow = (r: any, i: number, textRaw: string) => ({
            ...r, id: i, text: textRaw, 
            displayClicks: formatNumber(r.clicks || 0), 
            displayImpressions: formatNumber(r.impressions || 0),
            displayCtr: (r.ctr || 0).toFixed(1) + '%', 
            displayPosition: r.position ? Number(r.position).toFixed(1) : '-', 
            progress: Math.max(2, ((r.clicks || 0) / maxC) * 100)
          });

          if (d.queries) setRealQueries(d.queries.map((r: any, i: number) => formatRow(r, i, r.text)));
          if (d.pages) setRealPages(d.pages.map((r: any, i: number) => formatRow(r, i, decodeURI(r.text.replace('https://exir.vip', '') || '/'))));
          if (d.contentGroups) setRealContentGroups(d.contentGroups.map((r: any, i: number) => formatRow(r, i, r.text)));
          if (d.topicClusters) setRealTopicClusters(d.topicClusters.map((r: any, i: number) => formatRow(r, i, r.text)));
          if (d.newRankings) setRealNewRankings(d.newRankings.map((r: any, i: number) => formatRow(r, i, r.text)));
          if (d.zombies) setRealZombies(d.zombies.map((r: any, i: number) => formatRow(r, i, decodeURI(r.text.replace('https://exir.vip', '') || '/'))));
        }
      } catch (error) { 
        console.error("خطا:", error); 
      } finally { 
        setIsLoading(false); 
      }
    }
    fetchAllData();
  }, [period, excludeBrand, brandKeywords, activeQueryPreset, debouncedQuerySearch, activePagePreset, debouncedPageSearch]);

  const getSortedData = (data: any[], filterMode: string, sortConfig?: { key: string, direction: 'asc' | 'desc' }) => {
    if (!data) return [];
    let result = [...data];
    if (filterMode === "Growing") result = result.filter(item => (item.click_diff || 0) > 0);
    else if (filterMode === "Decaying") result = result.filter(item => (item.click_diff || 0) < 0);

    const safeSort = sortConfig || { key: 'clicks', direction: 'desc' };

    result.sort((a, b) => {
      let aVal = a[safeSort.key] ?? 0; 
      let bVal = b[safeSort.key] ?? 0;
      let modifier = safeSort.direction === 'asc' ? 1 : -1;
      if (safeSort.key === 'position') { 
        modifier = safeSort.direction === 'asc' ? -1 : 1; 
        if (aVal === 0 || aVal === '-') aVal = 999; 
        if (bVal === 0 || bVal === '-') bVal = 999; 
      }
      if (aVal < bVal) return -1 * modifier; 
      if (aVal > bVal) return 1 * modifier; 
      return 0;
    }); 
    return result;
  };

  const handleSort = (tableName: string, key: string) => {
    setSorts(prev => {
      const current = prev[tableName] || { key: 'clicks', direction: 'desc' };
      return { ...prev, [tableName]: { key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' } };
    });
  };

  const filteredQueries = getSortedData(realQueries, queriesFilter, sorts.Queries);
  const filteredPages = getSortedData(realPages, pagesFilter, sorts.Pages);
  const sortedContentGroups = getSortedData(realContentGroups, "All", sorts.ContentGroups);
  const sortedTopicClusters = getSortedData(realTopicClusters, "All", sorts.TopicClusters);
  const sortedNewRankings = getSortedData(realNewRankings, "All", sorts.NewRankings);

  const FilterButtons = ({ activeFilter, setFilter }: { activeFilter: string, setFilter: (val: string) => void }) => (
    <div className="flex bg-gray-100 rounded-lg p-1 text-xs font-medium shrink-0">
      {['All', 'Growing', 'Decaying'].map(f => (
        <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-md transition ${activeFilter === f ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>{f}</button>
      ))}
    </div>
  );

  const Trend = ({ val, isPercent = true }: { val: any, isPercent?: boolean }) => {
    if (!showChangePercent) return null; 
    if (val === 0 || val === '0') return <span className="text-gray-400 text-[10px] font-bold" dir="ltr">~ 0</span>;
    const isInf = val === '∞'; const isPositive = isInf || val > 0;
    const color = isPositive ? 'text-green-500' : 'text-rose-500'; const arrow = isPositive ? '↑' : '↓';
    return <span className={`text-[10px] font-bold ${color}`} dir="ltr">{arrow} {isInf ? '∞' : Math.abs(val).toFixed(1) + (isPercent ? '%' : '')}</span>;
  };

  const RankBadge = ({ rank }: { rank: number }) => {
    if (!rank) return null;
    return <div className="flex items-center justify-center w-5 h-5 ml-2 mr-2 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-sm" style={{ clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }}>{Math.round(rank)}</div>;
  };

  const TableMetrics = ({ item }: { item: any }) => (
    <div className="flex gap-4 items-center shrink-0" dir="ltr">
      {showMetrics.clicks && <div className="w-20 flex justify-between items-center text-slate-800"><span className="font-bold">{item.displayClicks}</span><Trend val={item.clicks_trend} /></div>}
      {showMetrics.impressions && <div className="w-24 flex justify-between items-center text-purple-700"><span className="font-bold">{item.displayImpressions}</span><Trend val={item.imp_trend} /></div>}
      {showMetrics.ctr && <div className="w-20 flex justify-between items-center text-teal-600"><span className="font-bold">{item.displayCtr}</span><Trend val={item.ctr_trend} /></div>}
      {showMetrics.position && <div className="w-16 flex justify-between items-center text-orange-600"><span className="font-bold">{item.displayPosition}</span><Trend val={item.pos_trend} isPercent={false} /></div>}
    </div>
  );

  const SortableHeader = ({ metric, label, tableName }: { metric: string, label: string, tableName: string }) => {
    const currentSort = sorts[tableName] || { key: 'clicks', direction: 'desc' }; const isActive = currentSort.key === metric;
    const colors: any = { clicks: 'text-blue-600', impressions: 'text-purple-600', ctr: 'text-teal-600', position: 'text-orange-600' };
    const widths: any = { clicks: 'w-20', impressions: 'w-24', ctr: 'w-20', position: 'w-16' };
    return (
      <button onClick={() => handleSort(tableName, metric)} className={`text-left flex items-center gap-1 transition-all ${widths[metric]} ${isActive ? `border-b-2 pb-[2px] font-black border-current ${colors[metric]}` : `pb-[4px] font-bold text-gray-400 hover:${colors[metric]}`}`}>
        {label} {isActive && <span className="text-[10px]">{currentSort.direction === 'desc' ? '▼' : '▲'}</span>}
      </button>
    );
  };

  const TableHeader = ({ title, filterProps, tableName, icon: Icon }: any) => (
    <div className="flex justify-between items-end mb-4 border-b border-gray-100 pb-2">
      <div className="flex items-center gap-3"><h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">{Icon && <Icon className="text-blue-500" size={18}/>}{title}</h3>{filterProps && <FilterButtons {...filterProps} />}</div>
      <div className="flex gap-4 text-xs shrink-0" dir="ltr">{showMetrics.clicks && <SortableHeader metric="clicks" label="Clicks" tableName={tableName} />}{showMetrics.impressions && <SortableHeader metric="impressions" label="Impressions" tableName={tableName} />}{showMetrics.ctr && <SortableHeader metric="ctr" label="CTR" tableName={tableName} />}{showMetrics.position && <SortableHeader metric="position" label="Position" tableName={tableName} />}</div>
    </div>
  );

  return (
    <div className="animate-fade-in pb-20 relative text-right font-[vazir]" dir="rtl">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Link href="/" className="hover:text-gray-800 transition font-medium">سئوگتس</Link><span>/</span>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-md border border-gray-200 shadow-sm text-gray-800 font-bold" dir="ltr">
            <span className="text-purple-500">🌐</span> https://exir.vip/
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
            <span className="text-xs font-bold text-gray-600">بدون کلمات برند</span>
            <div onClick={() => setExcludeBrand(!excludeBrand)} className={`w-8 h-4.5 rounded-full relative cursor-pointer transition-colors ${excludeBrand ? 'bg-indigo-500' : 'bg-gray-300'}`}>
              <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform ${excludeBrand ? 'translate-x-3.5' : 'translate-x-0'}`}></div>
            </div>
          </div>
          <div className="flex bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
            <button onClick={() => toggleMetric('clicks')} className={`p-1.5 rounded-md transition ${showMetrics.clicks ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}><MousePointerClick size={18} /></button>
            <button onClick={() => toggleMetric('impressions')} className={`p-1.5 rounded-md transition ${showMetrics.impressions ? 'bg-purple-50 text-purple-600' : 'text-gray-400 hover:text-gray-600'}`}><Eye size={18} /></button>
            <button onClick={() => toggleMetric('ctr')} className={`p-1.5 rounded-md transition ${showMetrics.ctr ? 'bg-teal-50 text-teal-600' : 'text-gray-400 hover:text-gray-600'}`}><Percent size={18} /></button>
            <button onClick={() => toggleMetric('position')} className={`p-1.5 rounded-md transition ${showMetrics.position ? 'bg-orange-50 text-orange-600' : 'text-gray-400 hover:text-gray-600'}`}><TrendingUp size={18} /></button>
          </div>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setIsPeriodMenuOpen(!isPeriodMenuOpen)} className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-4 py-2 bg-white text-sm shadow-sm font-medium hover:border-gray-300 transition text-gray-700 min-w-[120px]" dir="ltr">
              <span>{periodOptions.find(p => p.value === period)?.label}</span><ChevronDown size={14} className={`text-gray-400 transition-transform ${isPeriodMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {isPeriodMenuOpen && (
              <div className="absolute top-full mt-2 left-0 w-[340px] bg-white border border-gray-200 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] z-50 flex overflow-hidden text-sm origin-top-left" dir="ltr">
                 <div className="w-1/2 bg-slate-50 border-r border-gray-100 p-4 flex flex-col justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-wider">Comparison</div>
                      <label className="flex items-center justify-between mb-5 cursor-pointer group"><span className="text-slate-700 font-medium group-hover:text-blue-600 transition">Previous Trend</span><div className={`w-8 h-4.5 rounded-full relative transition-colors ${showComparison ? 'bg-blue-500' : 'bg-gray-300'}`}><input type="checkbox" className="sr-only" checked={showComparison} onChange={(e) => setShowComparison(e.target.checked)} /><div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform ${showComparison ? 'translate-x-3.5' : 'translate-x-0'}`}></div></div></label>
                      <label className="flex items-center justify-between cursor-pointer group"><span className="text-slate-700 font-medium group-hover:text-blue-600 transition">Show change %</span><div className={`w-8 h-4.5 rounded-full relative transition-colors ${showChangePercent ? 'bg-blue-500' : 'bg-gray-300'}`}><input type="checkbox" className="sr-only" checked={showChangePercent} onChange={(e) => setShowChangePercent(e.target.checked)} /><div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform ${showChangePercent ? 'translate-x-3.5' : 'translate-x-0'}`}></div></div></label>
                    </div>
                 </div>
                 <div className="w-1/2 p-2">
                    {periodOptions.map(option => (<button key={option.value} onClick={() => { setPeriod(option.value); setIsPeriodMenuOpen(false); }} className={`w-full text-left px-3 py-2.5 rounded-lg transition flex items-center justify-between ${period === option.value ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-600 hover:bg-gray-50 hover:text-slate-900'}`}>{option.label}{period === option.value && <Check size={14} className="text-blue-500" />}</button>))}
                 </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="flex gap-6 text-sm font-medium border-b border-gray-200 mb-8 pb-0 gap-4">
        <button onClick={() => setActiveTab("Dashboard")} className={`pb-3 px-1 transition ${activeTab === "Dashboard" ? "text-gray-900 border-b-2 border-gray-900" : "text-gray-500 hover:text-gray-800"}`}>Dashboard</button>
        <button onClick={() => setActiveTab("Optimize")} className={`pb-3 px-1 transition flex items-center gap-1 ${activeTab === "Optimize" ? "text-purple-600 border-b-2 border-purple-600" : "text-gray-500 hover:text-gray-800"}`}><Activity size={16} /> Optimize</button>
      </nav>

      {activeTab === "Dashboard" && (
        <div className={`transition-all duration-300 ${isLoading ? 'opacity-50 blur-[2px] pointer-events-none' : 'opacity-100 blur-0'}`}>
          <div className="mb-12">
            <div className="flex flex-wrap items-center gap-8 mb-6" dir="ltr">
              {showMetrics.clicks && totals && <div className="flex items-center gap-2"><MousePointerClick className="text-blue-500" size={24} /><span className="text-slate-800 font-black text-3xl">{totals.displayClicks}</span><Trend val={totals.clicks_trend} /></div>}
              {showMetrics.impressions && totals && <div className="flex items-center gap-2"><Eye className="text-purple-500" size={24} /><span className="text-slate-800 font-black text-3xl">{totals.displayImpressions}</span><Trend val={totals.imp_trend} /></div>}
              {showMetrics.ctr && totals && <div className="flex items-center gap-2"><Percent className="text-teal-500" size={24} /><span className="text-slate-800 font-black text-3xl">{totals.displayCtr}</span><Trend val={totals.ctr_trend} /></div>}
              {showMetrics.position && totals && <div className="flex items-center gap-2"><TrendingUp className="text-orange-500" size={24} /><span className="text-slate-800 font-black text-3xl">{totals.displayPosition}</span><Trend val={totals.pos_trend} isPercent={false} /></div>}
            </div>
            <div className="h-80 w-full mt-4"><MainChart data={realChartData} showMetrics={showMetrics} showComparison={showComparison} /></div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-12 gap-y-8 mb-12 h-[450px]">
            <div className="bg-white rounded-xl flex flex-col p-4 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] h-full overflow-hidden">
              <TableHeader title="Topic Clusters" tableName="TopicClusters" icon={Sparkles} />
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-1 text-sm min-w-[500px]">
                  {sortedTopicClusters.map(item => (
                    <div key={item.id} onClick={() => setActiveCluster(item.text)} className="flex justify-between items-center p-2 hover:bg-blue-50/80 rounded-lg transition cursor-pointer group">
                      <span className="font-bold text-slate-800 truncate max-w-[40%] capitalize group-hover:text-blue-700 transition">{item.text}</span>
                      <TableMetrics item={item} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl flex flex-col p-4 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] h-full overflow-hidden">
              <TableHeader title="Content Groups" tableName="ContentGroups" />
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-1 text-sm min-w-[500px]">
                  {sortedContentGroups.map(item => (
                    <div key={item.id} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-lg transition">
                      <span className="font-medium text-slate-700 truncate max-w-[40%]">{item.text}</span>
                      <TableMetrics item={item} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-12 gap-y-8 mb-12">
            <div className="bg-white rounded-xl overflow-hidden flex flex-col border border-gray-100 shadow-sm">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex justify-between items-end mb-4"><div className="flex items-center gap-3"><h3 className="font-bold text-lg text-gray-800">Queries</h3><FilterButtons activeFilter={queriesFilter} setFilter={setQueriesFilter} /></div><div className="flex gap-4 text-xs shrink-0" dir="ltr">{showMetrics.clicks && <SortableHeader metric="clicks" label="Clicks" tableName="Queries" />}{showMetrics.impressions && <SortableHeader metric="impressions" label="Impr." tableName="Queries" />}{showMetrics.ctr && <SortableHeader metric="ctr" label="CTR" tableName="Queries" />}{showMetrics.position && <SortableHeader metric="position" label="Pos." tableName="Queries" />}</div></div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex bg-white rounded-lg border border-gray-200 p-1 shadow-sm text-xs font-medium">
                    <button onClick={() => setActiveQueryPreset('All')} className={`px-3 py-1.5 rounded-md transition ${activeQueryPreset === 'All' ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>همه</button>
                    <button onClick={() => setActiveQueryPreset('Questions')} className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${activeQueryPreset === 'Questions' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-blue-600'}`}><HelpCircle size={14} /> سؤالی</button>
                    <button onClick={() => setActiveQueryPreset('Buy')} className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${activeQueryPreset === 'Buy' ? 'bg-green-50 text-green-700' : 'text-gray-500 hover:text-green-600'}`}><ShoppingCart size={14} /> خرید</button>
                    <button onClick={() => setActiveQueryPreset('LongTail')} className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${activeQueryPreset === 'LongTail' ? 'bg-purple-50 text-purple-700' : 'text-gray-500 hover:text-purple-600'}`}><TextSelect size={14} /> لانگ‌تیل</button>
                  </div>
                  <div className="flex-1 relative min-w-[150px]">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input type="text" placeholder="جستجوی متن..." value={querySearchInput} onChange={(e) => setQuerySearchInput(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg pl-3 pr-10 py-2 text-xs focus:outline-none focus:border-blue-400 transition" />
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto p-4 flex-1"><div className="space-y-1 text-sm min-w-[500px]">
                  {filteredQueries.slice(0, 5).map(item => (<div key={item.id} className="relative group overflow-hidden rounded-md cursor-pointer"><div className="absolute top-0 right-0 h-full bg-blue-50/80 -z-10 transition-all duration-1000" style={{ width: `${item.progress}%` }}></div><div className="flex justify-between items-center p-2 z-10"><span className="font-medium text-slate-800 flex items-center truncate ml-4">{item.text} <RankBadge rank={item.position} /></span><TableMetrics item={item} /></div></div>))}
              </div></div>
              <button onClick={() => setExpandedTable('Queries')} className="w-full pt-3 pb-4 border-t border-gray-100 text-center text-gray-400 hover:text-gray-800 text-xs font-bold transition bg-gray-50 mt-auto">⛶ EXPAND ALL 500 ROWS</button>
            </div>

            <div className="bg-white rounded-xl overflow-hidden flex flex-col border border-gray-100 shadow-sm">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex justify-between items-end mb-4"><div className="flex items-center gap-3"><h3 className="font-bold text-lg text-gray-800">Pages</h3><FilterButtons activeFilter={pagesFilter} setFilter={setPagesFilter} /></div><div className="flex gap-4 text-xs shrink-0" dir="ltr">{showMetrics.clicks && <SortableHeader metric="clicks" label="Clicks" tableName="Pages" />}{showMetrics.impressions && <SortableHeader metric="impressions" label="Impr." tableName="Pages" />}{showMetrics.ctr && <SortableHeader metric="ctr" label="CTR" tableName="Pages" />}{showMetrics.position && <SortableHeader metric="position" label="Pos." tableName="Pages" />}</div></div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex bg-white rounded-lg border border-gray-200 p-1 shadow-sm text-xs font-medium">
                    <button onClick={() => setActivePagePreset('All')} className={`px-3 py-1.5 rounded-md transition ${activePagePreset === 'All' ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>همه</button>
                    <button onClick={() => setActivePagePreset('Blog')} className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${activePagePreset === 'Blog' ? 'bg-orange-50 text-orange-700' : 'text-gray-500 hover:text-orange-600'}`}><BookOpen size={14} /> مقالات</button>
                    <button onClick={() => setActivePagePreset('Product')} className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${activePagePreset === 'Product' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-indigo-600'}`}><Package size={14} /> محصولات</button>
                    <button onClick={() => setActivePagePreset('Deep')} className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${activePagePreset === 'Deep' ? 'bg-rose-50 text-rose-700' : 'text-gray-500 hover:text-rose-600'}`}><Network size={14} /> عمیق</button>
                  </div>
                  <div className="flex-1 relative min-w-[150px]">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input type="text" placeholder="جستجوی آدرس..." value={pageSearchInput} dir="ltr" onChange={(e) => setPageSearchInput(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg pl-3 pr-10 py-2 text-xs focus:outline-none focus:border-blue-400 transition" />
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto p-4 flex-1"><div className="space-y-1 text-sm min-w-[500px]">
                  {filteredPages.slice(0, 5).map(item => (<div key={item.id} className="relative group overflow-hidden rounded-md cursor-pointer"><div className="absolute top-0 right-0 h-full bg-blue-50/80 -z-10 transition-all duration-1000" style={{ width: `${item.progress}%` }}></div><div className="flex justify-between items-center p-2 z-10"><span className="font-medium text-slate-700 truncate max-w-[40%]" dir="ltr">{item.text}</span><TableMetrics item={item} /></div></div>))}
              </div></div>
              <button onClick={() => setExpandedTable('Pages')} className="w-full pt-3 pb-4 border-t border-gray-100 text-center text-gray-400 hover:text-gray-800 text-xs font-bold transition bg-gray-50 mt-auto">⛶ EXPAND ALL 500 ROWS</button>
            </div>
          </div>
          
          <div className="bg-white rounded-xl overflow-x-auto p-4 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] mb-12">
            <TableHeader title="New Rankings" tableName="NewRankings" />
            <div className="space-y-1 text-sm min-w-[500px]">
              {sortedNewRankings.map((item: any) => (
                <div key={item.id} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-lg transition">
                  <span className="font-medium text-slate-800 flex items-center">{item.text} <RankBadge rank={item.position} /></span>
                  <TableMetrics item={item} />
                </div>
              ))}
              {sortedNewRankings.length === 0 && <div className="text-center text-xs text-gray-400 py-4">در این بازه کلمه جدیدی یافت نشد</div>}
            </div>
          </div>
        </div>
      )}

      {activeTab === "Optimize" && (
        <div className={`flex flex-col md:flex-row gap-8 transition-all duration-300 ${isLoading ? 'opacity-50 blur-[2px]' : 'opacity-100'}`}>
          <div className="w-full md:w-72 flex flex-col gap-3 shrink-0">
            <button onClick={() => setActiveOptTool('Decay')} className={`p-4 rounded-2xl border text-right transition-all group ${activeOptTool === 'Decay' ? 'bg-orange-50 border-orange-200 shadow-sm' : 'bg-white border-gray-200 hover:border-orange-300'}`}>
              <div className="flex items-center gap-2 mb-2"><TrendingUp size={20} className={activeOptTool === 'Decay' ? 'text-orange-500' : 'text-gray-400 group-hover:text-orange-500'} /><h3 className={`font-black ${activeOptTool === 'Decay' ? 'text-orange-900' : 'text-gray-700'}`}>نقشه زوال محتوا</h3></div>
            </button>
            <button onClick={() => setActiveOptTool('Striking')} className={`p-4 rounded-2xl border text-right transition-all group ${activeOptTool === 'Striking' ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-gray-200 hover:border-blue-300'}`}>
              <div className="flex items-center gap-2 mb-2"><Target size={20} className={activeOptTool === 'Striking' ? 'text-blue-500' : 'text-gray-400 group-hover:text-blue-500'} /><h3 className={`font-black ${activeOptTool === 'Striking' ? 'text-blue-900' : 'text-gray-700'}`}>کلمات در یک قدمی</h3></div>
            </button>
            <button onClick={() => setActiveOptTool('CTR')} className={`p-4 rounded-2xl border text-right transition-all group ${activeOptTool === 'CTR' ? 'bg-teal-50 border-teal-200 shadow-sm' : 'bg-white border-gray-200 hover:border-teal-300'}`}>
              <div className="flex items-center gap-2 mb-2"><MousePointerClick size={20} className={activeOptTool === 'CTR' ? 'text-teal-500' : 'text-gray-400 group-hover:text-teal-500'} /><h3 className={`font-black ${activeOptTool === 'CTR' ? 'text-teal-900' : 'text-gray-700'}`}>قاتل تایتل‌ها (CTR)</h3></div>
            </button>
            <button onClick={() => setActiveOptTool('Cannibalization')} className={`p-4 rounded-2xl border text-right transition-all group ${activeOptTool === 'Cannibalization' ? 'bg-rose-50 border-rose-200 shadow-sm' : 'bg-white border-gray-200 hover:border-rose-300'}`}>
              <div className="flex items-center gap-2 mb-2"><AlertCircle size={20} className={activeOptTool === 'Cannibalization' ? 'text-rose-500' : 'text-gray-400 group-hover:text-rose-500'} /><h3 className={`font-black ${activeOptTool === 'Cannibalization' ? 'text-rose-900' : 'text-gray-700'}`}>هم‌خواری کلمات</h3></div>
            </button>
            <button onClick={() => setActiveOptTool('Zombie')} className={`p-4 rounded-2xl border text-right transition-all group mt-3 ${activeOptTool === 'Zombie' ? 'bg-slate-800 border-slate-700 shadow-sm' : 'bg-white border-gray-200 hover:border-slate-400'}`}>
              <div className="flex items-center gap-2 mb-2"><Ghost size={20} className={activeOptTool === 'Zombie' ? 'text-slate-100' : 'text-gray-400 group-hover:text-slate-600'} /><h3 className={`font-black ${activeOptTool === 'Zombie' ? 'text-white' : 'text-gray-700'}`}>صفحات زامبی</h3></div>
            </button>
            <div className="mt-4 p-4 bg-slate-50 border border-gray-200 rounded-2xl">
              <label className="text-xs font-bold text-gray-700 block mb-2 flex items-center gap-1"><ShieldAlert size={14}/> کلمات برند سایت</label>
              <input type="text" value={brandKeywords} onChange={(e) => setBrandKeywords(e.target.value)} placeholder="مثال: exir, اکسیر" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-400" />
            </div>
          </div>

          <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm overflow-hidden">
            {activeOptTool === 'Decay' && (
              <div className="animate-fade-in">
                <div className="mb-6"><h2 className="text-xl font-black text-gray-800 mb-2">نقشه زوال محتوا</h2></div>
                <table className="w-full text-sm text-left"><thead className="text-xs text-gray-400 border-b border-gray-100"><tr><th className="py-3 font-bold text-right">آدرس</th><th>افت</th><th>قبل</th><th>فعلی</th></tr></thead><tbody className="divide-y divide-gray-50">
                  {realDecay.map((item, idx) => (<tr key={idx} className="hover:bg-orange-50/30 transition"><td className="py-4 font-medium text-slate-700 text-right truncate max-w-[200px]" dir="ltr">{item.text}</td><td className="text-rose-500 font-bold">{Math.abs(item.decayPercent).toFixed(0)}%↓</td><td>{item.p_clicks}</td><td className="font-bold">{item.clicks}</td></tr>))}
                </tbody></table>
              </div>
            )}
            {activeOptTool === 'Striking' && (
              <div className="animate-fade-in">
                <div className="mb-6"><h2 className="text-xl font-black text-gray-800 mb-2">کلمات در یک قدمی</h2><p className="text-sm text-gray-500">کلماتی با رتبه ۱۰ تا ۲۵. با کلیک روی آدرس، صفحه را اصلاح و لینک‌سازی کنید.</p></div>
                <table className="w-full text-sm text-left"><thead className="text-xs text-gray-400 border-b border-gray-100"><tr><th className="py-3 font-bold text-right">کلمه و آدرس صفحه</th><th>Pos</th><th>Imp</th><th>Clicks</th></tr></thead><tbody className="divide-y divide-gray-50">
                  {realStriking.map((item, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/30 transition">
                      <td className="py-4 font-bold text-right">
                        <div className="text-slate-800">{item.text}</div>
                        {item.url && <a href={`https://exir.vip${item.url}`} target="_blank" className="text-[10px] text-blue-500 hover:text-blue-700 font-medium truncate max-w-[250px] block mt-1" dir="ltr">{decodeURI(item.url)}</a>}
                      </td>
                      <td className="font-black text-orange-600">{item.position.toFixed(1)}</td>
                      <td>{formatNumber(item.impressions)}</td>
                      <td className="text-blue-600">{item.clicks}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            )}
            {activeOptTool === 'CTR' && (
              <div className="animate-fade-in">
                <div className="mb-6"><h2 className="text-xl font-black text-gray-800 mb-2">قاتل تایتل‌ها</h2><p className="text-sm text-gray-500">کلماتی که رتبه عالی دارند اما کلیک نمی‌خورند. با کلیک روی آدرس، تایتل صفحه را ویرایش کنید.</p></div>
                <table className="w-full text-sm text-left"><thead className="text-xs text-gray-400 border-b border-gray-100"><tr><th className="py-3 font-bold text-right">کلمه و آدرس صفحه</th><th>افت کلیک</th><th>CTR واقعی</th><th>انتظار</th></tr></thead><tbody className="divide-y divide-gray-50">
                  {realCtrBench.map((item, idx) => (
                    <tr key={idx} className="hover:bg-teal-50/30 transition">
                      <td className="py-4 font-bold text-right">
                        <div className="text-slate-800">{item.text}</div>
                        {item.url && <a href={`https://exir.vip${item.url}`} target="_blank" className="text-[10px] text-teal-600 hover:text-teal-800 font-medium truncate max-w-[250px] block mt-1" dir="ltr">{decodeURI(item.url)}</a>}
                      </td>
                      <td className="text-rose-600 font-bold">-{item.missedClicks}</td>
                      <td>{item.ctr.toFixed(1)}%</td>
                      <td className="text-green-600 font-bold">{item.expectedCtr}%</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            )}
            {activeOptTool === 'Cannibalization' && (<div className="-m-6"><Cannibalization data={realCannibalization} /></div>)}
            {activeOptTool === 'Zombie' && (
              <div className="animate-fade-in">
                <div className="mb-6"><h2 className="text-xl font-black text-gray-800 mb-2">شکارچی صفحات زامبی 🧟‍♂️</h2><p className="text-sm text-gray-500">حداقل ۱۰۰ ایمپرشن و صفر کلیک.</p></div>
                <table className="w-full text-sm text-left"><thead className="text-xs text-gray-400 border-b border-gray-100"><tr><th className="py-3 font-bold text-right">آدرس صفحه</th><th className="w-20 text-center">کلیک</th><th className="w-24 text-center">ایمپرشن</th></tr></thead><tbody className="divide-y divide-gray-50">
                  {realZombies.map((item, idx) => (<tr key={idx} className="hover:bg-slate-50/80 transition"><td className="py-4 font-medium text-slate-700 text-right truncate max-w-[200px]" dir="ltr">{item.text}</td><td className="text-rose-500 font-black text-center">0</td><td className="text-purple-600 font-bold text-center">{formatNumber(item.impressions)}</td></tr>))}
                </tbody></table>
              </div>
            )}
          </div>
        </div>
      )}

      {expandedTable && (
        <div className="fixed inset-0 z-50 flex justify-center items-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col relative overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-xl font-black text-gray-900">{expandedTable}</h2>
              <button onClick={() => setExpandedTable(null)} className="text-gray-400 hover:text-red-500 transition text-3xl leading-none">&times;</button>
            </div>
            <div className="p-6 overflow-y-auto overflow-x-auto custom-scrollbar" style={{ maxHeight: 'calc(85vh - 80px)' }}>
              <div className="space-y-1.5 text-sm min-w-[600px]">
                {(expandedTable === 'Queries' ? filteredQueries : filteredPages).map(item => (
                  <div key={item.id} className="relative group overflow-hidden rounded-md border border-gray-50 p-3 hover:border-gray-200 transition">
                    <div className="absolute top-0 right-0 h-full bg-blue-50/50 -z-10" style={{ width: `${item.progress}%` }}></div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-slate-800 truncate max-w-[40%] flex items-center" dir={expandedTable === 'Pages' ? "ltr" : "rtl"}>{item.text} {expandedTable === 'Queries' && <RankBadge rank={item.position} />}</span>
                      <TableMetrics item={item} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeCluster && (
        <div className="fixed inset-0 z-[60] flex justify-center items-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col relative overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center bg-blue-50/50">
              <div className="flex items-center gap-3"><Sparkles className="text-blue-500" size={24} /><h2 className="text-xl font-black text-gray-900">کلمات مرتبط با خوشه: <span className="text-blue-700 bg-white border border-blue-200 px-3 py-1 rounded-lg ml-2 shadow-sm capitalize">{activeCluster}</span></h2></div>
              <button onClick={() => setActiveCluster(null)} className="text-gray-400 hover:text-red-500 transition text-3xl leading-none">&times;</button>
            </div>
            <div className="p-6 overflow-y-auto overflow-x-auto custom-scrollbar" style={{ maxHeight: 'calc(85vh - 90px)' }}>
              <div className="space-y-1.5 text-sm min-w-[600px]">
                {realQueries.filter(q => q.text.toLowerCase().includes(activeCluster.toLowerCase())).map(item => (
                    <div key={item.id} className="relative group overflow-hidden rounded-md border border-gray-50 p-3 hover:border-blue-100 hover:bg-blue-50/30 transition">
                      <div className="absolute top-0 right-0 h-full bg-blue-50/50 -z-10" style={{ width: `${item.progress}%` }}></div>
                      <div className="flex justify-between items-center"><span className="font-bold text-slate-700 truncate max-w-[40%] flex items-center">{item.text} <RankBadge rank={item.position} /></span><TableMetrics item={item} /></div>
                    </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}