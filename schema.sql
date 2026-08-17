-- جدول ۱: ذخیره آمار کلی سایت به تفکیک هر روز
CREATE TABLE IF NOT EXISTS site_totals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    clicks INTEGER,
    impressions INTEGER,
    ctr REAL,
    position REAL,
    UNIQUE(date)
);

-- جدول ۲: ذخیره کلمات کلیدی به تفکیک هر روز
CREATE TABLE IF NOT EXISTS search_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    keyword TEXT NOT NULL,
    clicks INTEGER,
    impressions INTEGER,
    ctr REAL,
    position REAL,
    UNIQUE(date, keyword)
);

-- جدول ۳: ذخیره صفحات به تفکیک هر روز
CREATE TABLE IF NOT EXISTS search_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    url TEXT NOT NULL,
    clicks INTEGER,
    impressions INTEGER,
    ctr REAL,
    position REAL,
    UNIQUE(date, url)
);

-- جدول ۴: ذخیره دستگاه‌ها به تفکیک هر روز
CREATE TABLE IF NOT EXISTS search_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    device TEXT NOT NULL,
    clicks INTEGER,
    impressions INTEGER,
    ctr REAL,
    position REAL,
    UNIQUE(date, device)
);