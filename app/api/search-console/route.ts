import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const daysParam = parseInt(searchParams.get('days') || '14', 10);
    
    const excludeBrand = searchParams.get('excludeBrand') === 'true';
    const brandsStr = searchParams.get('brands') || '';
    const qPreset = searchParams.get('qPreset') || 'All';
    const qSearch = searchParams.get('qSearch') || '';
    const pPreset = searchParams.get('pPreset') || 'All';
    const pSearch = searchParams.get('pSearch') || '';

    const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID, CLOUDFLARE_API_TOKEN } = process.env;
    const d1Url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${CLOUDFLARE_DATABASE_ID}/query`;
    
    const fetchFromD1 = async (sqlQuery: string) => {
      const response = await fetch(d1Url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlQuery })
      });
      if (!response.ok) throw new Error(`Cloudflare Error`);
      const result = await response.json();
      if (!result.success) throw new Error(result.errors[0]?.message);
      return result.result[0].results || [];
    };

    const maxDateRes = await fetchFromD1("SELECT MAX(date) as maxDate FROM search_queries");
    const maxDate = maxDateRes[0]?.maxDate;
    if (!maxDate) return NextResponse.json({ success: false, error: "دیتابیس خالی است." }, { status: 400 });
    
    const dMax = new Date(maxDate);
    const dCurrentStart = new Date(dMax); dCurrentStart.setDate(dCurrentStart.getDate() - (daysParam - 1));
    const dPrevStart = new Date(dCurrentStart); dPrevStart.setDate(dPrevStart.getDate() - daysParam);

    const cEnd = dMax.toISOString().split('T')[0];
    const cStart = dCurrentStart.toISOString().split('T')[0];
    const pStart = dPrevStart.toISOString().split('T')[0];

    const buildKwCond = (colName: string) => {
      let cond = "1=1";
      if (excludeBrand && brandsStr) {
        const brands = brandsStr.split(',').map(b => b.trim()).filter(Boolean);
        brands.forEach(b => { cond += ` AND ${colName} NOT LIKE '%${b}%'`; });
      }
      if (qPreset === 'Questions') {
        const qws = ['چگونه','چطور','چرا','چیست','آیا','کجا','کی','کدام','چه','فرق','تفاوت','آموزش','راهنما'];
        cond += ` AND (${qws.map(w => `${colName} LIKE '%${w}%'`).join(' OR ')})`;
      } else if (qPreset === 'Buy') {
        const bws = ['خرید','قیمت','هزینه','ارزان','تخفیف','فروشگاه','سفارش','فروش','لیست'];
        cond += ` AND (${bws.map(w => `${colName} LIKE '%${w}%'`).join(' OR ')})`;
      } else if (qPreset === 'LongTail') {
        cond += ` AND ${colName} LIKE '% % % %'`;
      }
      if (qSearch) cond += ` AND ${colName} LIKE '%${qSearch}%'`;
      return cond;
    };

    const kwCond = buildKwCond('keyword');

    let pgCondition = "1=1";
    if (pPreset === 'Blog') pgCondition += ` AND (url LIKE '%/blog/%' OR url LIKE '%/mag/%' OR url LIKE '%/article/%')`;
    else if (pPreset === 'Product') pgCondition += ` AND (url LIKE '%/product/%' OR url LIKE '%/shop/%' OR url LIKE '%/item/%')`;
    else if (pPreset === 'Deep') pgCondition += ` AND url LIKE '%/%/%/%/%'`;
    if (pSearch) pgCondition += ` AND url LIKE '%${pSearch}%'`;

    // =========================================================================
    // 🌟 استراتژی هوشمند برای تطابق ۱۰۰ درصدی آمار نمودار با سرچ کنسول 
    // =========================================================================
    const hasQueryFilter = (excludeBrand && brandsStr.trim() !== '') || qPreset !== 'All' || qSearch.trim() !== '';
    const hasPageFilter = pPreset !== 'All' || pSearch.trim() !== '';

    let chartQuery = "";
    let totalsQuery = "";

    if (hasQueryFilter) {
      // اگر فیلتر کلمات روشن است، آمار با حذف کوئری‌های ناشناس محاسبه می‌شود
      chartQuery = `SELECT date, SUM(clicks) as clicks, SUM(impressions) as impressions, SUM(position*impressions)/NULLIF(SUM(impressions),0) as position FROM search_queries WHERE date >= '${pStart}' AND date <= '${cEnd}' AND ${kwCond} GROUP BY date ORDER BY date ASC`;
      totalsQuery = `SELECT 'totals' as text, SUM(CASE WHEN date >= '${cStart}' THEN clicks ELSE 0 END) as c_clicks, SUM(CASE WHEN date < '${cStart}' THEN clicks ELSE 0 END) as p_clicks, SUM(CASE WHEN date >= '${cStart}' THEN impressions ELSE 0 END) as c_imp, SUM(CASE WHEN date < '${cStart}' THEN impressions ELSE 0 END) as p_imp, SUM(CASE WHEN date >= '${cStart}' THEN position * impressions ELSE 0 END) / NULLIF(SUM(CASE WHEN date >= '${cStart}' THEN impressions ELSE 0 END), 0) as c_pos, SUM(CASE WHEN date < '${cStart}' THEN position * impressions ELSE 0 END) / NULLIF(SUM(CASE WHEN date < '${cStart}' THEN impressions ELSE 0 END), 0) as p_pos FROM search_queries WHERE date >= '${pStart}' AND date <= '${cEnd}' AND ${kwCond}`;
    } else if (hasPageFilter) {
      // اگر فیلتر صفحات روشن است، از جدول صفحات می‌خوانیم (که دیتای کامل‌تری نسبت به کلمات دارد)
      chartQuery = `SELECT date, SUM(clicks) as clicks, SUM(impressions) as impressions, SUM(position*impressions)/NULLIF(SUM(impressions),0) as position FROM search_pages WHERE date >= '${pStart}' AND date <= '${cEnd}' AND ${pgCondition} GROUP BY date ORDER BY date ASC`;
      totalsQuery = `SELECT 'totals' as text, SUM(CASE WHEN date >= '${cStart}' THEN clicks ELSE 0 END) as c_clicks, SUM(CASE WHEN date < '${cStart}' THEN clicks ELSE 0 END) as p_clicks, SUM(CASE WHEN date >= '${cStart}' THEN impressions ELSE 0 END) as c_imp, SUM(CASE WHEN date < '${cStart}' THEN impressions ELSE 0 END) as p_imp, SUM(CASE WHEN date >= '${cStart}' THEN position * impressions ELSE 0 END) / NULLIF(SUM(CASE WHEN date >= '${cStart}' THEN impressions ELSE 0 END), 0) as c_pos, SUM(CASE WHEN date < '${cStart}' THEN position * impressions ELSE 0 END) / NULLIF(SUM(CASE WHEN date < '${cStart}' THEN impressions ELSE 0 END), 0) as p_pos FROM search_pages WHERE date >= '${pStart}' AND date <= '${cEnd}' AND ${pgCondition}`;
    } else {
      // ✨ اگر فیلتری نداریم، دیتای خام و ۱۰۰٪ دقیقِ گوگل را از جدول Totals می‌خوانیم
      chartQuery = `SELECT date, SUM(clicks) as clicks, SUM(impressions) as impressions, SUM(position*impressions)/NULLIF(SUM(impressions),0) as position FROM site_totals WHERE date >= '${pStart}' AND date <= '${cEnd}' GROUP BY date ORDER BY date ASC`;
      totalsQuery = `SELECT 'totals' as text, SUM(CASE WHEN date >= '${cStart}' THEN clicks ELSE 0 END) as c_clicks, SUM(CASE WHEN date < '${cStart}' THEN clicks ELSE 0 END) as p_clicks, SUM(CASE WHEN date >= '${cStart}' THEN impressions ELSE 0 END) as c_imp, SUM(CASE WHEN date < '${cStart}' THEN impressions ELSE 0 END) as p_imp, SUM(CASE WHEN date >= '${cStart}' THEN position * impressions ELSE 0 END) / NULLIF(SUM(CASE WHEN date >= '${cStart}' THEN impressions ELSE 0 END), 0) as c_pos, SUM(CASE WHEN date < '${cStart}' THEN position * impressions ELSE 0 END) / NULLIF(SUM(CASE WHEN date < '${cStart}' THEN impressions ELSE 0 END), 0) as p_pos FROM site_totals WHERE date >= '${pStart}' AND date <= '${cEnd}'`;
    }

    const queriesQuery = `SELECT keyword as text, SUM(CASE WHEN date >= '${cStart}' THEN clicks ELSE 0 END) as c_clicks, SUM(CASE WHEN date < '${cStart}' THEN clicks ELSE 0 END) as p_clicks, SUM(CASE WHEN date >= '${cStart}' THEN impressions ELSE 0 END) as c_imp, SUM(CASE WHEN date < '${cStart}' THEN impressions ELSE 0 END) as p_imp, SUM(CASE WHEN date >= '${cStart}' THEN position * impressions ELSE 0 END) / NULLIF(SUM(CASE WHEN date >= '${cStart}' THEN impressions ELSE 0 END), 0) as c_pos, SUM(CASE WHEN date < '${cStart}' THEN position * impressions ELSE 0 END) / NULLIF(SUM(CASE WHEN date < '${cStart}' THEN impressions ELSE 0 END), 0) as p_pos FROM search_queries WHERE date >= '${pStart}' AND date <= '${cEnd}' AND ${kwCond} GROUP BY keyword HAVING c_clicks > 0 OR p_clicks > 0 OR c_imp > 10 ORDER BY (c_clicks + p_clicks) DESC LIMIT 500`;
    const pagesQuery = `SELECT url as text, SUM(CASE WHEN date >= '${cStart}' THEN clicks ELSE 0 END) as c_clicks, SUM(CASE WHEN date < '${cStart}' THEN clicks ELSE 0 END) as p_clicks, SUM(CASE WHEN date >= '${cStart}' THEN impressions ELSE 0 END) as c_imp, SUM(CASE WHEN date < '${cStart}' THEN impressions ELSE 0 END) as p_imp, SUM(CASE WHEN date >= '${cStart}' THEN position * impressions ELSE 0 END) / NULLIF(SUM(CASE WHEN date >= '${cStart}' THEN impressions ELSE 0 END), 0) as c_pos, SUM(CASE WHEN date < '${cStart}' THEN position * impressions ELSE 0 END) / NULLIF(SUM(CASE WHEN date < '${cStart}' THEN impressions ELSE 0 END), 0) as p_pos FROM search_pages WHERE date >= '${pStart}' AND date <= '${cEnd}' AND ${pgCondition} GROUP BY url HAVING c_clicks > 0 OR p_clicks > 0 OR c_imp > 10 ORDER BY (c_clicks + p_clicks) DESC LIMIT 500`;
    const clusterQuery = `SELECT keyword as text, SUM(CASE WHEN date >= '${cStart}' THEN clicks ELSE 0 END) as c_clicks, SUM(CASE WHEN date < '${cStart}' THEN clicks ELSE 0 END) as p_clicks, SUM(CASE WHEN date >= '${cStart}' THEN impressions ELSE 0 END) as c_imp, SUM(CASE WHEN date < '${cStart}' THEN impressions ELSE 0 END) as p_imp FROM search_queries WHERE date >= '${pStart}' AND date <= '${cEnd}' AND ${kwCond} GROUP BY keyword HAVING c_clicks > 0 OR p_clicks > 0 ORDER BY c_clicks DESC LIMIT 3000`;

    // 🧠 کوئری‌های خام برای ابزارهای Optimize
    const optimizeQueriesSql = `SELECT keyword as text, SUM(clicks) as c_clicks, SUM(impressions) as c_imp, SUM(position*impressions)/NULLIF(SUM(impressions),0) as c_pos FROM search_queries WHERE date >= '${cStart}' AND date <= '${cEnd}' GROUP BY keyword HAVING SUM(impressions) > 10 LIMIT 5000`;
    const optimizePagesSql = `SELECT url as text, SUM(CASE WHEN date >= '${cStart}' THEN clicks ELSE 0 END) as c_clicks, SUM(CASE WHEN date < '${cStart}' THEN clicks ELSE 0 END) as p_clicks, SUM(CASE WHEN date >= '${cStart}' THEN impressions ELSE 0 END) as c_imp FROM search_pages WHERE date >= '${pStart}' AND date <= '${cEnd}' GROUP BY url HAVING SUM(CASE WHEN date >= '${cStart}' THEN impressions ELSE 0 END) > 10 OR SUM(CASE WHEN date < '${cStart}' THEN clicks ELSE 0 END) > 10 LIMIT 5000`;
    const canniQuery = `SELECT query, page, SUM(clicks) as c_clicks, SUM(impressions) as c_imp, SUM(position*impressions)/NULLIF(SUM(impressions),0) as c_pos FROM search_query_pages WHERE date >= '${cStart}' AND date <= '${cEnd}' GROUP BY query, page HAVING SUM(impressions) > 10 LIMIT 5000`;

    // اجرای همزمان 🚀
    const [rawChartData, totalsRes, queriesRes, pagesRes, clusterRaw, optimizeQueriesRaw, optimizePagesRaw, cannibalizationRaw] = await Promise.all([
      fetchFromD1(chartQuery), fetchFromD1(totalsQuery), fetchFromD1(queriesQuery), fetchFromD1(pagesQuery), fetchFromD1(clusterQuery),
      fetchFromD1(optimizeQueriesSql), fetchFromD1(optimizePagesSql), fetchFromD1(canniQuery)
    ]);

    const chartData = [];
    const chunkSize = daysParam > 90 ? 7 : 1;
    for (let i = 0; i < daysParam; i += chunkSize) {
      let c_clicks = 0, p_clicks = 0, c_imp = 0, p_imp = 0, c_pos_sum = 0, p_pos_sum = 0;
      let cDateStr = ''; let pDateStr = '';
      for (let j = 0; j < chunkSize && (i + j) < daysParam; j++) {
        const dCurr = new Date(dCurrentStart); dCurr.setDate(dCurr.getDate() + i + j);
        const cdStr = dCurr.toISOString().split('T')[0]; if (j === 0) cDateStr = cdStr;
        const dPrev = new Date(dPrevStart); dPrev.setDate(dPrev.getDate() + i + j);
        const pdStr = dPrev.toISOString().split('T')[0]; if (j === 0) pDateStr = pdStr;

        const cData = rawChartData.find((r:any) => r.date === cdStr); const pData = rawChartData.find((r:any) => r.date === pdStr);
        if (cData) { c_clicks += cData.clicks || 0; c_imp += cData.impressions || 0; c_pos_sum += (cData.position || 0) * (cData.impressions || 0); }
        if (pData) { p_clicks += pData.clicks || 0; p_imp += pData.impressions || 0; p_pos_sum += (pData.position || 0) * (pData.impressions || 0); }
      }
      chartData.push({
        date: cDateStr, prevDate: pDateStr, clicks: c_clicks || null, p_clicks: p_clicks || null, impressions: c_imp || null, p_imp: p_imp || null,
        ctr: c_imp > 0 ? (c_clicks / c_imp) * 100 : null, p_ctr: p_imp > 0 ? (p_clicks / p_imp) * 100 : null,
        position: c_imp > 0 ? (c_pos_sum / c_imp) : null, p_pos: p_imp > 0 ? (p_pos_sum / p_imp) : null
      });
    }

    const processRow = (r: any) => {
      const c_clicks = Number(r.c_clicks) || 0; const p_clicks = Number(r.p_clicks) || 0;
      const c_imp = Number(r.c_imp) || 0;       const p_imp = Number(r.p_imp) || 0;
      const c_pos = Number(r.c_pos) || 0;       const p_pos = Number(r.p_pos) || 0;
      const c_ctr = c_imp > 0 ? (c_clicks / c_imp) * 100 : 0; const p_ctr = p_imp > 0 ? (p_clicks / p_imp) * 100 : 0;
      return {
        text: r.text, p_clicks, clicks: c_clicks, clicks_trend: p_clicks === 0 ? (c_clicks > 0 ? '∞' : 0) : ((c_clicks - p_clicks) / p_clicks * 100),
        impressions: c_imp, imp_trend: p_imp === 0 ? (c_imp > 0 ? '∞' : 0) : ((c_imp - p_imp) / p_imp * 100),
        ctr: c_ctr, ctr_trend: p_ctr === 0 ? (c_ctr > 0 ? '∞' : 0) : ((c_ctr - p_ctr) / p_ctr * 100),
        position: c_pos, pos_trend: p_pos === 0 ? (c_pos > 0 ? '∞' : 0) : (p_pos - c_pos),
        trendUp: c_clicks > p_clicks, click_diff: c_clicks - p_clicks
      };
    };

    const allQueries = queriesRes.map(processRow);
    const allPages = pagesRes.map(processRow);
    const newRankings = allQueries.filter((q: any) => q.clicks_trend === '∞' && q.clicks > 0).sort((a: any, b: any) => b.clicks - a.clicks).slice(0, 5);

    const groups: any = { 'بلاگ': {cc:0, pc:0, ci:0, pi:0}, 'محصولات': {cc:0, pc:0, ci:0, pi:0}, 'سایر': {cc:0, pc:0, ci:0, pi:0} };
    pagesRes.forEach((p: any) => {
      let cat = 'سایر';
      if (p.text.includes('/blog') || p.text.includes('/mag') || p.text.includes('/article')) cat = 'بلاگ'; 
      else if (p.text.includes('/product') || p.text.includes('/shop') || p.text.includes('/item')) cat = 'محصولات';
      groups[cat].cc += Number(p.c_clicks) || 0; groups[cat].pc += Number(p.p_clicks) || 0; 
      groups[cat].ci += Number(p.c_imp) || 0;    groups[cat].pi += Number(p.p_imp) || 0;
    });
    const contentGroups = Object.keys(groups).map((name, i) => processRow({ text: name, c_clicks: groups[name].cc, p_clicks: groups[name].pc, c_imp: groups[name].ci, p_imp: groups[name].pi, c_pos: 0, p_pos: 0 }));

    const stopWords = ['خرید','قیمت','ارزان','بهترین','جدید','آموزش','نحوه','طرز','چگونه','چیست','آیا','کجا','کی','کدام','چه','فرق','تفاوت','راهنما','های','در','با','برای','از','به','است','این','که','آنلاین','فروشگاه','the','in','on','at','for','and','how','to','best','buy','cheap'];
    const wordMap: any = {};
    clusterRaw.forEach((row: any) => {
      if (!row.text) return;
      const words = row.text.split(/[\s\-_]+/);
      words.forEach((w: string) => {
        const cleanW = w.trim().toLowerCase();
        if (cleanW.length < 3 || stopWords.includes(cleanW) || !isNaN(Number(cleanW))) return;
        if (!wordMap[cleanW]) wordMap[cleanW] = { word: cleanW, c_clicks: 0, p_clicks: 0, c_imp: 0, p_imp: 0, qCount: 0 };
        wordMap[cleanW].c_clicks += Number(row.c_clicks) || 0; wordMap[cleanW].p_clicks += Number(row.p_clicks) || 0;
        wordMap[cleanW].c_imp += Number(row.c_imp) || 0; wordMap[cleanW].p_imp += Number(row.p_imp) || 0;
        wordMap[cleanW].qCount += 1;
      });
    });

    const topicClusters = Object.values(wordMap)
      .filter((c: any) => c.qCount > 1).sort((a: any, b: any) => b.c_clicks - a.c_clicks).slice(0, 15)
      .map((c: any) => processRow({ text: c.word, c_clicks: c.c_clicks, p_clicks: c.p_clicks, c_imp: c.c_imp, p_imp: c.p_imp, c_pos: 0, p_pos: 0 }));
        
    const bestPageForQuery: any = {};
    cannibalizationRaw.forEach((r: any) => {
      const imp = Number(r.c_imp) || 0;
      if (!bestPageForQuery[r.query] || imp > bestPageForQuery[r.query].imp) {
         bestPageForQuery[r.query] = { url: r.page, imp: imp };
      }
    });

    const strikingDistance = optimizeQueriesRaw
      .filter((q: any) => q.c_pos >= 10 && q.c_pos <= 25 && q.c_imp > 50)
      .sort((a: any, b: any) => b.c_imp - a.c_imp)
      .slice(0, 150)
      .map((q: any) => ({ text: q.text, url: bestPageForQuery[q.text]?.url || null, clicks: q.c_clicks, impressions: q.c_imp, position: q.c_pos, ctr: q.c_imp > 0 ? (q.c_clicks / q.c_imp) * 100 : 0 }));

    const getExpectedCtr = (pos: number) => { if (pos < 2) return 25; if (pos < 4) return 10; if (pos < 6) return 6; if (pos <= 10) return 3; return 1; };
    
    const ctrBenchmark = optimizeQueriesRaw
      .filter((q: any) => q.c_pos > 0 && q.c_pos <= 10 && q.c_imp > 100)
      .map((q: any) => {
         const expectedCtr = getExpectedCtr(q.c_pos); 
         const expectedClicks = Math.round((q.c_imp * expectedCtr) / 100);
         const ctr = q.c_imp > 0 ? (q.c_clicks/q.c_imp)*100 : 0;
         return { text: q.text, url: bestPageForQuery[q.text]?.url || null, clicks: q.c_clicks, impressions: q.c_imp, position: q.c_pos, ctr, expectedCtr, missedClicks: expectedClicks - q.c_clicks };
      })
      .filter((q: any) => q.missedClicks > 0 && q.ctr < (q.expectedCtr * 0.5))
      .sort((a: any, b: any) => b.missedClicks - a.missedClicks)
      .slice(0, 150);

    const contentDecay = optimizePagesRaw
      .filter((p: any) => p.p_clicks > 50 && (p.c_clicks - p.p_clicks) < 0)
      .map((p: any) => {
        const click_diff = p.c_clicks - p.p_clicks; 
        const decayPercent = (click_diff / p.p_clicks) * 100;
        return { text: p.text, clicks: p.c_clicks, p_clicks: p.p_clicks, click_diff, decayPercent, decayScore: Math.abs(click_diff) * Math.abs(decayPercent) };
      })
      .filter((p: any) => p.decayPercent <= -20)
      .sort((a: any, b: any) => b.decayScore - a.decayScore)
      .slice(0, 150);

    const zombies = optimizePagesRaw
      .filter((p: any) => p.c_clicks === 0 && p.c_imp >= 100)
      .sort((a: any, b: any) => b.c_imp - a.c_imp)
      .slice(0, 500)
      .map((p: any) => ({ text: p.text, clicks: p.c_clicks, impressions: p.c_imp }));

    const canniMap: any = {};
    cannibalizationRaw.forEach((r: any) => {
      if(!canniMap[r.query]) canniMap[r.query] = { totalImp: 0, pages: [] };
      canniMap[r.query].totalImp += Number(r.c_imp) || 0;
      canniMap[r.query].pages.push({ url: r.page, clicks: Number(r.c_clicks) || 0, impressions: Number(r.c_imp) || 0, position: Number(r.c_pos).toFixed(1) });
    });
    
    const cannibalizationData = []; let cId = 1;
    for (const q in canniMap) {
      const validPages = canniMap[q].pages.filter((p:any) => p.impressions >= 100 && p.impressions >= (canniMap[q].totalImp * 0.10));
      if (validPages.length > 1) {
        const pagesList = validPages.sort((a: any, b: any) => b.clicks - a.clicks);
        pagesList[0].isWinner = true; for(let i=1; i<pagesList.length; i++) pagesList[i].isWinner = false;
        const isCritical = Math.abs(Number(pagesList[0].position) - Number(pagesList[1].position)) < 5;
        const totalC = pagesList.reduce((sum: number, p: any) => sum + p.clicks, 0);
        cannibalizationData.push({ id: cId++, query: q, totalClicks: totalC, isCritical, competingPages: pagesList });
      }
    }
    cannibalizationData.sort((a,b) => b.totalClicks - a.totalClicks).slice(0, 100);

    return NextResponse.json({ 
      success: true, 
      data: { chartData, totals: processRow(totalsRes[0] || {}), queries: allQueries, pages: allPages, newRankings, contentGroups, topicClusters, cannibalizationData, strikingDistance, ctrBenchmark, contentDecay, zombies }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}