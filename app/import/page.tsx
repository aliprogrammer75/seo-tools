"use client";

import { useCallback, useEffect, useState } from "react";

interface SiteOption {
  slug: string;
  name: string;
  propertyUrl: string;
}

interface ApiErrorBody {
  success?: boolean;
  error?: string;
  message?: string;
}

async function readJson(response: Response): Promise<ApiErrorBody & Record<string, unknown>> {
  const body = (await response.json().catch(() => ({}))) as ApiErrorBody &
    Record<string, unknown>;
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

export default function ImportHistory() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [siteSlug, setSiteSlug] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [missingDates, setMissingDates] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState(true);

  const checkDatabase = useCallback(async (selectedSite: string) => {
    if (!selectedSite) return;
    setIsChecking(true);
    setProgress(0);
    setLogs(["در حال بررسی روزهای کامل‌شده در D1..."]);

    try {
      const response = await fetch(
        `/api/check-dates?site=${encodeURIComponent(selectedSite)}&days=120`,
        { cache: "no-store" },
      );
      const data = await readJson(response);
      const dates = Array.isArray(data.missingDates)
        ? data.missingDates.filter((value): value is string => typeof value === "string")
        : [];
      const existingCount = typeof data.existingCount === "number" ? data.existingCount : 0;
      setMissingDates(dates);
      setLogs([
        `${existingCount.toLocaleString("fa-IR")} روز کامل در بازه موجود است.`,
        dates.length === 0
          ? "داده‌های نهایی این بازه کامل است."
          : `${dates.length.toLocaleString("fa-IR")} روز نیاز به دریافت یا تکمیل دارد.`,
      ]);
    } catch (error) {
      setMissingDates([]);
      setLogs([`خطا در بررسی دیتابیس: ${error instanceof Error ? error.message : "نامشخص"}`]);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/sites", { cache: "no-store" });
        const data = await readJson(response);
        const options = Array.isArray(data.sites) ? (data.sites as SiteOption[]) : [];
        if (!active) return;
        setSites(options);
        setSiteSlug(options[0]?.slug ?? "");
      } catch (error) {
        if (!active) return;
        setIsChecking(false);
        setLogs([`خطا در دریافت سایت‌ها: ${error instanceof Error ? error.message : "نامشخص"}`]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (siteSlug) void checkDatabase(siteSlug);
  }, [checkDatabase, siteSlug]);

  async function startImport() {
    if (!siteSlug || missingDates.length === 0) return;
    const queue = [...missingDates];
    setIsImporting(true);
    setProgress(0);
    setLogs((current) => ["ترمیم ترتیبی روزهای ناقص شروع شد.", ...current]);

    let completed = 0;
    for (const date of queue) {
      try {
        setLogs((current) => [`در حال دریافت ${date}...`, ...current]);
        const response = await fetch("/api/import-history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteSlug, date }),
        });
        const data = await readJson(response);
        setLogs((current) => [data.message ?? `${date} تکمیل شد.`, ...current]);
      } catch (error) {
        setLogs((current) => [
          `توقف در ${date}: ${error instanceof Error ? error.message : "خطای نامشخص"}`,
          "با اجرای دوباره، مرحله‌های کامل‌شده تکرار نمی‌شوند.",
          ...current,
        ]);
        break;
      }

      completed += 1;
      setProgress(Math.round((completed / queue.length) * 100));
    }

    setIsImporting(false);
    await checkDatabase(siteSlug);
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900 sm:p-10" dir="rtl">
      <section className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-black">ورود تاریخچه سرچ کنسول</h1>
        <p className="mt-2 text-sm leading-7 text-slate-500">
          فقط روزهای نهایی گوگل بررسی می‌شوند. هر روز پس از تکمیل هر پنج بُعد به داشبورد راه پیدا می‌کند.
        </p>

        <label className="mt-6 block text-sm font-bold" htmlFor="site">
          سایت
        </label>
        <select
          id="site"
          value={siteSlug}
          onChange={(event) => setSiteSlug(event.target.value)}
          disabled={isImporting || sites.length === 0}
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 disabled:opacity-60"
        >
          {sites.map((site) => (
            <option key={site.slug} value={site.slug}>
              {site.name} — {site.propertyUrl}
            </option>
          ))}
        </select>

        {!isChecking && missingDates.length > 0 && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-bold">
              {missingDates.length.toLocaleString("fa-IR")} روز ناقص یا دریافت‌نشده
            </p>
            <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto" dir="ltr">
              {missingDates.map((date) => (
                <span key={date} className="rounded-md border border-amber-200 bg-white px-2 py-1">
                  {date}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => void startImport()}
          disabled={isChecking || isImporting || missingDates.length === 0 || !siteSlug}
          className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-4 text-base font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isChecking
            ? "در حال بررسی..."
            : isImporting
              ? "در حال دریافت و ذخیره امن..."
              : missingDates.length === 0
                ? "بازه انتخابی کامل است"
                : `دریافت ${missingDates.length.toLocaleString("fa-IR")} روز`}
        </button>

        {progress > 0 && (
          <div className="mt-6">
            <div className="mb-2 flex justify-between text-sm font-bold">
              <span>پیشرفت</span>
              <span>{progress.toLocaleString("fa-IR")}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <div className="mt-6 h-72 overflow-y-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-200">
          {logs.map((log, index) => (
            <p key={`${index}-${log}`} className="border-b border-slate-800 py-1 last:border-0">
              {log}
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}
