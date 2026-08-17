import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 font-[vazir]">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">به سئوگتس خوش آمدید</h1>
      <Link href="/site" className="px-6 py-3 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition">
        ورود به داشبورد اصلی
      </Link>
    </div>
  );
}