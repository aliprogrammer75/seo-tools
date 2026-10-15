import Link from "next/link";
export default function Home(){return <main dir="rtl" className="mx-auto flex min-h-[75vh] max-w-xl flex-col items-center justify-center gap-6 text-center">
<h1 className="text-3xl font-extrabold text-slate-900">SEO Tools</h1>
<p className="text-slate-600">ورود امن با گوگل، مدیریت پراپرتی‌های سرچ کنسول و تحلیل داده‌های سایت‌های مجاز شما.</p>
<a href="/api/auth/google/start" className="rounded-xl bg-blue-600 px-7 py-3 font-bold text-white hover:bg-blue-700">ورود با حساب گوگل</a>
<Link href="/site" className="text-sm text-blue-700 underline">مشاهده داشبورد پس از ورود</Link>
</main>}