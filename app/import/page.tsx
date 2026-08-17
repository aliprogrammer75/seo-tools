"use client";

import { useState, useEffect } from "react";

export default function ImportHistory() {
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [missingDates, setMissingDates] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState(true);

  // به محض باز شدن صفحه، دیتابیس را اسکن می‌کند
  useEffect(() => {
    checkDatabase();
  }, []);

  const checkDatabase = async () => {
    setIsChecking(true);
    setLogs(["🔍 در حال اسکن دیتابیس کلادفلر..."]);
    try {
      const res = await fetch('/api/check-dates');
      const data = await res.json();
      
      if (data.success) {
        setMissingDates(data.missingDates);
        setLogs([
          `📊 وضعیت دیتابیس: ${data.existingCount} روز با موفقیت ذخیره شده است.`,
          `⚠️ تعداد روزهای جاافتاده: ${data.missingDates.length} روز`
        ]);
      } else {
        setLogs(["❌ خطا در اسکن دیتابیس"]);
      }
    } catch (error) {
      setLogs(["❌ خطای ارتباط با سرور"]);
    }
    setIsChecking(false);
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const startImport = async () => {
    if (missingDates.length === 0) {
       setLogs(prev => ["🎉 دیتابیس شما کاملاً آپدیت است و هیچ روز جاافتاده‌ای وجود ندارد!", ...prev]);
       return;
    }

    setIsImporting(true);
    setLogs(prev => ["🚀 شروع عملیات ترمیم (فقط برای روزهای جاافتاده)...", ...prev]);

    // حلقه فقط روی همان ۴ روز جاافتاده می‌چرخد!
    for (let i = 0; i < missingDates.length; i++) {
      const date = missingDates[i];
      try {
        setLogs(prev => [`⏳ در حال دریافت تاریخ ${date} ...`, ...prev]);
        
        const res = await fetch(`/api/import-history?date=${date}`);
        const contentType = res.headers.get("content-type");
        
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await res.json();
          if (data.success) {
            setLogs(prev => [`✅ ${data.message}`, ...prev]);
          } else {
            setLogs(prev => [`❌ خطا در ${date}: ${data.error}`, ...prev]);
          }
        } else {
          setLogs(prev => [`🛑 مسدود شدن موقت (گوگل). لطفاً بعداً تلاش کنید.`, ...prev]);
          break; // توقف در صورت بلاک شدن
        }

      } catch (err) {
        setLogs(prev => [`❌ خطای شبکه در تاریخ ${date}`, ...prev]);
      }
      
      setProgress(Math.round(((i + 1) / missingDates.length) * 100));
      await delay(3000); 
    }

    setLogs(prev => ["🎉 عملیات ترمیم با موفقیت به پایان رسید!", ...prev]);
    setIsImporting(false);
    checkDatabase(); // اسکن مجدد برای اطمینان از کامل شدن
  };

  return (
    <div className="min-h-screen bg-gray-50 p-10 font-[vazir]" dir="rtl">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
        <h1 className="text-2xl font-black text-gray-800 mb-2">اسکنر و ماشین زمان سئوگتس ⏳</h1>
        <p className="text-gray-500 mb-8 text-sm leading-relaxed">
          این ابزار دیتابیس شما را بررسی کرده و فقط روزهایی که استخراج نشده‌اند را دانلود می‌کند.
        </p>

        {/* نمایش روزهای جاافتاده به کاربر */}
        {!isChecking && missingDates.length > 0 && (
          <div className="mb-6 bg-orange-50 border border-orange-200 text-orange-800 p-4 rounded-xl text-sm font-medium flex flex-col gap-2">
            <span>⚠️ این {missingDates.length} روز در دیتابیس شما وجود ندارند:</span>
            <div className="flex flex-wrap gap-2 mt-1" dir="ltr">
              {missingDates.map(d => (
                <span key={d} className="bg-white px-2 py-1 rounded border border-orange-200 shadow-sm">{d}</span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={startImport}
          disabled={isImporting || isChecking || missingDates.length === 0}
          className={`w-full py-4 rounded-xl font-bold text-lg text-white transition-all ${
            isImporting || isChecking ? 'bg-gray-400 cursor-wait' : 
            missingDates.length === 0 ? 'bg-green-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-blue-600/30'
          }`}
        >
          {isChecking ? 'در حال اسکن...' : 
           isImporting ? 'در حال ترمیم دیتابیس...' : 
           missingDates.length === 0 ? 'دیتابیس کامل است ✅' : `🚀 دانلود ${missingDates.length} روز جاافتاده`}
        </button>

        {progress > 0 && (
          <div className="mt-8">
            <div className="flex justify-between text-sm mb-3 font-bold text-gray-700">
              <span>پیشرفت ترمیم:</span>
              <span className="text-blue-600">{progress}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden shadow-inner">
              <div className="bg-blue-500 h-4 rounded-full transition-all duration-500 relative" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        )}

        <div className="mt-8 bg-slate-900 rounded-xl p-4 h-80 overflow-y-auto text-xs font-mono shadow-inner flex flex-col-reverse" dir="rtl">
          {logs.map((log, idx) => (
            <div key={idx} className={`mb-2 py-1 border-b border-slate-800/50 ${
              log.includes('✅') || log.includes('🎉') ? 'text-green-400' : 
              log.includes('❌') || log.includes('🛑') ? 'text-rose-400' : 
              log.includes('⚠️') ? 'text-orange-400' : 'text-blue-300'
            }`}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}