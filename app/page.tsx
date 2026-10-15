import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 font-[vazir]">
      <h1 className="mb-6 text-3xl font-bold text-gray-800">به سئوتولز خوش آمدید</h1>
      <Link
        href="/site"
        className="rounded-lg bg-blue-600 px-6 py-3 text-white shadow-md transition hover:bg-blue-700"
      >
        ورود به داشبورد اصلی
      </Link>
    </div>
  );
}
