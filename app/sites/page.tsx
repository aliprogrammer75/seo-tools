"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Site = {
  id: number; slug: string; name: string; base_url: string;
  gsc_property_url: string; status: "active" | "paused";
};
const initial = {
  slug: "", name: "", baseUrl: "", propertyUrl: "",
  siteBrandTerms: "", productBrandTerms: "", sitemaps: ""
};
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || "درخواست ناموفق بود.");
  }
  return data as T;
}
const parseLines = (value: string) => value.split(/[\n,،]+/).map(s => s.trim()).filter(Boolean);
export default function ManageSites() {
  const [sites, setSites] = useState<Site[]>([]);
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{success: true; sites: Site[]}>("/api/sites/manage");
      setSites(data.sites);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در دریافت سایت‌ها");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function addSite(event: React.FormEvent) {
    event.preventDefault();
    setWorking("create"); setError(""); setStatus("");
    try {
      const data = await api<{success: true; message: string}>("/api/sites/manage", {
        method: "POST", headers: {"content-type": "application/json"},
        body: JSON.stringify({
          slug: form.slug, name: form.name, baseUrl: form.baseUrl, propertyUrl: form.propertyUrl,
          siteBrandTerms: parseLines(form.siteBrandTerms),
          productBrandTerms: parseLines(form.productBrandTerms),
          sitemaps: parseLines(form.sitemaps),
          contentRules: [],
        }),
      });
      setStatus(data.message); setForm(initial);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "ثبت سایت ناموفق بود"); }
    finally { setWorking(""); }
  }
  async function verify(site: Site, activate: boolean) {
    setWorking(site.slug); setStatus(""); setError("");
    try {
      const data = await api<{success: true; message: string}>("/api/sites/verify", {
        method: "POST", headers: {"content-type": "application/json"},
        body: JSON.stringify({slug: site.slug, activate}),
      });
      setStatus(data.message + (activate ? " سایت فعال شد." : ""));
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "تأیید دسترسی ناموفق بود"); }
    finally { setWorking(""); }
  }
  async function pause(site: Site) {
    setWorking(site.slug); setError(""); setStatus("");
    try {
      await api("/api/sites/manage", {
        method: "PATCH", headers: {"content-type": "application/json"},
        body: JSON.stringify({slug: site.slug, status: "paused"}),
      });
      setStatus("همگام‌سازی این سایت متوقف شد."); await refresh();
    } catch(e) { setError(e instanceof Error ? e.message : "توقف سایت ناموفق بود"); }
    finally { setWorking(""); }
  }
  const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-blue-600";
  return <div dir="rtl" className="mx-auto max-w-5xl space-y-7 text-right">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-extrabold">مدیریت سایت‌ها</h1><p className="mt-2 text-sm text-slate-500">پراپرتی‌های سرچ کنسول و دسترسی‌ها</p></div>
      <Link className="rounded-lg border border-slate-300 px-3 py-2 text-sm" href="/site">داشبورد</Link>
    </header>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</p>}
    {status && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{status}</p>}
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-bold">سایت‌های ثبت‌شده</h2>
      {loading && <p>در حال دریافت فهرست…</p>}
      {!loading && sites.length === 0 && <p className="text-slate-500">هنوز سایتی ثبت نشده است.</p>}
      <div className="space-y-3">
        {sites.map(site => <div key={site.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-bold">{site.name} <span className="mr-2 text-xs font-normal text-slate-500">{site.status === "active" ? "فعال" : "متوقف"}</span></p>
            <p dir="ltr" className="mt-1 break-all text-left text-xs text-slate-500">{site.gsc_property_url}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!working} onClick={() => void verify(site, false)} className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-50">تست دسترسی GSC</button>
            {site.status === "paused" && <button type="button" disabled={!!working} onClick={() => void verify(site, true)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">تأیید و فعال‌سازی</button>}
            {site.status === "active" && <button type="button" disabled={!!working} onClick={() => void pause(site)} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold text-amber-700 disabled:opacity-50">توقف</button>}
          </div>
        </div>)}
      </div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-2 text-lg font-bold">افزودن سایت</h2>
      <p className="mb-5 text-sm leading-7 text-slate-500">سایت جدید ابتدا متوقف می‌ماند. باید ایمیل سرویس‌اکانت را به عنوان کاربر سرچ کنسول آن پراپرتی اضافه کرده باشید.</p>
      <form onSubmit={e => void addSite(e)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-bold">نام نمایشی
          <input required maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className={field} placeholder="مثلاً دیجی خواب"/>
        </label>
        <label className="space-y-2 text-sm font-bold">شناسه انگلیسی
          <input required pattern="[a-z][a-z0-9-]{2,47}" value={form.slug} dir="ltr" onChange={e=>setForm({...form,slug:e.target.value.toLowerCase()})} className={field} placeholder="digikhab"/>
        </label>
        <label className="space-y-2 text-sm font-bold">آدرس اصلی
          <input required type="url" dir="ltr" className={field} placeholder="https://example.com/" value={form.baseUrl} onChange={e=>setForm({...form,baseUrl:e.target.value})}/>
        </label>
        <label className="space-y-2 text-sm font-bold">پراپرتی GSC
          <input required dir="ltr" className={field} value={form.propertyUrl} onChange={e=>setForm({...form,propertyUrl:e.target.value})} placeholder="https://example.com/ یا sc-domain:example.com"/>
        </label>
        {(["siteBrandTerms","productBrandTerms","sitemaps"] as const).map((key) => <label key={key} className="space-y-2 text-sm font-bold">
          {key === "siteBrandTerms" ? "نام‌های برند سایت" : key === "productBrandTerms" ? "برندهای محصول" : "نشانی سایت‌مپ‌ها"}
          <textarea dir={key==="sitemaps"?"ltr":"rtl"} rows={3} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} className={field} placeholder="هر مورد در یک سطر"/>
        </label>)}
        <div className="flex items-end"><button type="submit" disabled={!!working} className="w-full rounded-xl bg-slate-900 px-4 py-3 font-bold text-white disabled:opacity-50">{working==="create"?"در حال ثبت…":"ثبت سایت متوقف"}</button></div>
      </form>
    </section>
  </div>;
}
