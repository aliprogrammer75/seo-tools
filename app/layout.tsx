import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ابزار سئو | مشابه SEOGets",
  description: "داشبورد هوشمند سئو و تحلیل سرچ کنسول",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl">
      <body className="font-[Vazirmatn,Tahoma,Arial,sans-serif] bg-[#f8fafc] text-slate-900 min-h-screen flex flex-col">
        
        {/* هدر بالای صفحه (Top Navigation) */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              
              {/* بخش راست: لوگو */}
              <div className="flex items-center">
                <Link href="/" className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center">
                    <span className="text-white font-bold text-lg">S</span>
                  </div>
                  <h2 className="text-xl font-black text-gray-800 tracking-tight">
                    سئوگتس<span className="text-blue-600 font-medium ml-1">فارسی</span>
                  </h2>
                </Link>
              </div>

              {/* بخش چپ: پروفایل کاربر */}
              <div className="flex items-center gap-4">
                {/* آیکون زنگوله فرضی */}
                <button className="text-gray-400 hover:text-gray-600 transition text-xl">
                  🔔
                </button>
                <div className="flex items-center gap-3 pl-2 border-r border-gray-100 pr-4">
                  <div className="text-sm text-left hidden sm:block">
                    <p className="font-bold text-gray-800">تیم مدیر محصول</p>
                    <p className="text-gray-500 text-xs text-right">طرح حرفه‌ای</p>
                  </div>
                  {/* آواتار کاربر شبیه به عکس */}
                  <div className="w-9 h-9 rounded-full bg-orange-600 flex items-center justify-center text-white font-bold text-sm">
                    A
                  </div>
                </div>
              </div>

            </div>
          </div>
        </header>

        {/* بخش محتوای اصلی (پویا) */}
        <main className="flex-1 max-w-[1400px] w-full mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>

      </body>
    </html>
  );
}
