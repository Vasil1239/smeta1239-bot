-- =====================================================================
-- @smeta1239_bot — Полная схема БД (Supabase / PostgreSQL)
-- Автономный сметчик для ремонта. Мультиязычный. Мультивалютный.
-- =====================================================================

-- Расширения
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- ПОЛЬЗОВАТЕЛИ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_users (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    language_code TEXT DEFAULT 'en',            -- язык интерфейса (ISO 639-1)
    currency TEXT DEFAULT 'EUR',                -- предпочитаемая валюта
    country TEXT,                               -- последняя выбранная страна
    city TEXT,                                  -- последний выбранный город
    referred_by BIGINT REFERENCES estimate_users(telegram_id),
    referral_bonus_days INTEGER DEFAULT 0,
    phone_number TEXT,                          -- для anti-abuse
    is_blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_telegram ON estimate_users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON estimate_users(referred_by);

-- ---------------------------------------------------------------------
-- ЛОКАЦИИ (страны, регионы, города)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_locations (
    id BIGSERIAL PRIMARY KEY,
    country TEXT NOT NULL,                      -- напр. "Serbia"
    country_code TEXT,                          -- ISO 3166-1 alpha-2, напр. "RS"
    region TEXT,                                -- необязательно
    city TEXT,                                  -- напр. "Belgrade"
    default_currency TEXT DEFAULT 'EUR',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(country, region, city)
);
CREATE INDEX IF NOT EXISTS idx_loc_country_city ON estimate_locations(country, city);

-- ---------------------------------------------------------------------
-- КАТАЛОГ РАБОТ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_work_catalog (
    id BIGSERIAL PRIMARY KEY,
    category TEXT NOT NULL,                     -- напр. "Плитка"
    category_key TEXT NOT NULL,                 -- машинный ключ: "tile"
    work_name TEXT NOT NULL,                    -- напр. "Укладка плитки"
    work_key TEXT UNIQUE NOT NULL,              -- машинный ключ: "tile_laying"
    unit TEXT NOT NULL,                         -- "m2" | "linear_m" | "piece" | "point" | "m3" | "trip"
    aliases JSONB DEFAULT '[]'::jsonb,          -- синонимы на разных языках для ИИ-парсинга
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_key ON estimate_work_catalog(work_key);
CREATE INDEX IF NOT EXISTS idx_work_category ON estimate_work_catalog(category_key);

-- ---------------------------------------------------------------------
-- ДИАПАЗОНЫ ЦЕН НА РАБОТЫ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_price_ranges (
    id BIGSERIAL PRIMARY KEY,
    work_key TEXT NOT NULL REFERENCES estimate_work_catalog(work_key) ON DELETE CASCADE,
    country TEXT NOT NULL,
    city TEXT,                                  -- NULL = базовая для страны
    currency TEXT NOT NULL DEFAULT 'EUR',
    labor_min NUMERIC(12,2) NOT NULL,
    labor_recommended NUMERIC(12,2) NOT NULL,
    labor_max NUMERIC(12,2) NOT NULL,
    source TEXT,
    confidence TEXT DEFAULT 'medium',           -- low | medium | high
    sources_count INTEGER DEFAULT 1,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(work_key, country, city, currency)
);
CREATE INDEX IF NOT EXISTS idx_price_lookup ON estimate_price_ranges(work_key, country, city);

-- ---------------------------------------------------------------------
-- ДИАПАЗОНЫ ЦЕН НА МАТЕРИАЛЫ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_material_price_ranges (
    id BIGSERIAL PRIMARY KEY,
    work_key TEXT NOT NULL REFERENCES estimate_work_catalog(work_key) ON DELETE CASCADE,
    country TEXT NOT NULL,
    city TEXT,
    currency TEXT NOT NULL DEFAULT 'EUR',
    materials_min NUMERIC(12,2) NOT NULL,
    materials_recommended NUMERIC(12,2) NOT NULL,
    materials_max NUMERIC(12,2) NOT NULL,
    source TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(work_key, country, city, currency)
);
CREATE INDEX IF NOT EXISTS idx_mat_price_lookup ON estimate_material_price_ranges(work_key, country, city);

-- ---------------------------------------------------------------------
-- СМЕТЫ (шапка)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_calculations (
    id BIGSERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    telegram_id BIGINT NOT NULL REFERENCES estimate_users(telegram_id),
    title TEXT,
    object_type TEXT,                           -- квартира, дом, коммерция
    object_area NUMERIC(10,2),                  -- м²
    country TEXT,
    city TEXT,
    currency TEXT DEFAULT 'EUR',
    price_mode TEXT DEFAULT 'recommended',      -- min | recommended | max | custom
    reserve_percent NUMERIC(5,2) DEFAULT 10.00,
    total_labor NUMERIC(12,2) DEFAULT 0,
    total_materials NUMERIC(12,2) DEFAULT 0,
    total_reserve NUMERIC(12,2) DEFAULT 0,
    total_grand NUMERIC(12,2) DEFAULT 0,
    raw_user_text TEXT,                         -- исходное описание пользователя
    is_saved BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calc_user ON estimate_calculations(telegram_id);
CREATE INDEX IF NOT EXISTS idx_calc_uuid ON estimate_calculations(uuid);

-- ---------------------------------------------------------------------
-- СТРОКИ СМЕТЫ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_calculation_items (
    id BIGSERIAL PRIMARY KEY,
    calculation_id BIGINT NOT NULL REFERENCES estimate_calculations(id) ON DELETE CASCADE,
    position INTEGER DEFAULT 0,
    work_key TEXT,                              -- может быть NULL для custom работы
    work_name TEXT NOT NULL,                    -- название на языке пользователя
    unit TEXT NOT NULL,
    quantity NUMERIC(12,3) NOT NULL,
    labor_price NUMERIC(12,2),
    labor_total NUMERIC(12,2),
    materials_price NUMERIC(12,2),
    materials_total NUMERIC(12,2),
    price_level TEXT,                           -- min | recommended | max | custom
    price_needs_clarification BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_items_calc ON estimate_calculation_items(calculation_id);

-- ---------------------------------------------------------------------
-- ЗАПРОСЫ НА КАСТОМНЫЕ РАБОТЫ (для расширения каталога)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_custom_work_requests (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT REFERENCES estimate_users(telegram_id),
    work_name_raw TEXT NOT NULL,                -- как ввёл пользователь
    unit_guess TEXT,
    country TEXT,
    city TEXT,
    language_code TEXT,
    ai_suggested_key TEXT,                      -- что предложил ИИ
    status TEXT DEFAULT 'new',                  -- new | approved | rejected | merged
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_status ON estimate_custom_work_requests(status);

-- ---------------------------------------------------------------------
-- ПОДПИСКИ И TRIAL
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL REFERENCES estimate_users(telegram_id),
    plan TEXT DEFAULT 'trial',                  -- trial | basic | pro | lifetime
    status TEXT DEFAULT 'active',               -- active | expired | cancelled
    started_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    reminder_7d_sent BOOLEAN DEFAULT FALSE,
    reminder_2d_sent BOOLEAN DEFAULT FALSE,
    reminder_0d_sent BOOLEAN DEFAULT FALSE,
    total_extensions INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sub_expires ON estimate_subscriptions(expires_at, status);

-- ---------------------------------------------------------------------
-- ПЛАТЕЖИ (Telegram Stars)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_payments (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL REFERENCES estimate_users(telegram_id),
    telegram_payment_charge_id TEXT UNIQUE NOT NULL,   -- защита от дублей
    provider_payment_charge_id TEXT,
    currency TEXT NOT NULL DEFAULT 'XTR',
    total_amount INTEGER NOT NULL,              -- в Stars
    plan TEXT NOT NULL,                         -- basic | pro | lifetime
    days_granted INTEGER NOT NULL,
    payload TEXT,
    promo_code TEXT,
    referral_source BIGINT,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pay_user ON estimate_payments(telegram_id);
CREATE INDEX IF NOT EXISTS idx_pay_charge ON estimate_payments(telegram_payment_charge_id);

-- ---------------------------------------------------------------------
-- ТАРИФНЫЕ ПЛАНЫ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_plans (
    id BIGSERIAL PRIMARY KEY,
    plan_key TEXT UNIQUE NOT NULL,              -- basic | pro | lifetime
    name TEXT NOT NULL,
    price_stars INTEGER NOT NULL,
    days_granted INTEGER NOT NULL,              -- 999999 для lifetime
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0
);

-- ---------------------------------------------------------------------
-- ПРОМОКОДЫ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_promo_codes (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    bonus_days INTEGER DEFAULT 0,
    discount_percent INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT 0,                 -- 0 = безлимит
    used_count INTEGER DEFAULT 0,
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS estimate_promo_activations (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL REFERENCES estimate_users(telegram_id),
    promo_code TEXT NOT NULL,
    bonus_days INTEGER,
    activated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(telegram_id, promo_code)
);

-- ---------------------------------------------------------------------
-- ЗАЯВКИ НА ТОЧНУЮ СМЕТУ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_precise_requests (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL REFERENCES estimate_users(telegram_id),
    calculation_id BIGINT REFERENCES estimate_calculations(id),
    country TEXT,
    city TEXT,
    object_type TEXT,
    area NUMERIC(10,2),
    works_summary TEXT,
    photos_file_ids JSONB DEFAULT '[]'::jsonb,
    deadline TEXT,
    status TEXT DEFAULT 'new',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- АУДИТ ДЕЙСТВИЙ АДМИНА
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_admin_actions (
    id BIGSERIAL PRIMARY KEY,
    admin_telegram_id BIGINT NOT NULL,
    action TEXT NOT NULL,
    target_table TEXT,
    target_id TEXT,
    changes JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- ОБЩИЙ ЛОГ СОБЫТИЙ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_audit_log (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT,
    event_type TEXT NOT NULL,
    severity TEXT DEFAULT 'info',               -- info | warn | error
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_log_type ON estimate_audit_log(event_type, created_at DESC);

-- ---------------------------------------------------------------------
-- RATE LIMITING
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_rate_limits (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    action TEXT NOT NULL,                       -- create_estimate | ai_call | export
    window_start TIMESTAMPTZ DEFAULT NOW(),
    count INTEGER DEFAULT 1,
    UNIQUE(telegram_id, action, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rl_lookup ON estimate_rate_limits(telegram_id, action, window_start DESC);

-- ---------------------------------------------------------------------
-- WEBHOOK IDEMPOTENCY (защита от повторной обработки update)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_processed_updates (
    update_id BIGINT PRIMARY KEY,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proc_time ON estimate_processed_updates(processed_at);

-- ---------------------------------------------------------------------
-- ЧЕРНОВИКИ СМЕТ (шаги диалога с пользователем)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimate_drafts (
    telegram_id BIGINT PRIMARY KEY REFERENCES estimate_users(telegram_id),
    state TEXT,                                 -- awaiting_task | awaiting_location | editing | ...
    data JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- НАЧАЛЬНЫЕ ДАННЫЕ
-- =====================================================================

-- Тарифные планы
INSERT INTO estimate_plans (plan_key, name, price_stars, days_granted, description, sort_order) VALUES
    ('basic',    'Basic 30 days',   299,    30, 'Полный доступ на 30 дней', 1),
    ('pro',      'PRO 90 days',     799,    90, 'Скидка 11%: 90 дней всего за 799 Stars', 2),
    ('lifetime', 'LIFETIME',        4999, 36500, 'Пожизненный доступ, все обновления включены', 3)
ON CONFLICT (plan_key) DO NOTHING;

-- Стартовый каталог работ
INSERT INTO estimate_work_catalog (category, category_key, work_name, work_key, unit, aliases) VALUES
-- Демонтаж
('Demolition', 'demolition', 'Демонтаж плитки',       'demo_tile',        'm2',  '["tile removal","démolition carrelage","demontaza plocica"]'::jsonb),
('Demolition', 'demolition', 'Демонтаж стяжки',       'demo_screed',      'm2',  '["screed removal"]'::jsonb),
('Demolition', 'demolition', 'Демонтаж перегородок',  'demo_partition',   'm2',  '["partition removal"]'::jsonb),
('Demolition', 'demolition', 'Демонтаж пола',         'demo_floor',       'm2',  '["floor removal"]'::jsonb),
-- Стены
('Walls', 'walls', 'Штукатурка стен',        'wall_plaster',    'm2', '["plaster","malterisanje"]'::jsonb),
('Walls', 'walls', 'Шпаклёвка стен',         'wall_putty',      'm2', '["puttying","gletovanje"]'::jsonb),
('Walls', 'walls', 'Грунтовка стен',         'wall_prime',      'm2', '["priming"]'::jsonb),
('Walls', 'walls', 'Покраска стен',          'wall_paint',      'm2', '["painting","krecenje","farbanje"]'::jsonb),
-- Потолки
('Ceiling', 'ceiling', 'Покраска потолка',   'ceiling_paint',   'm2', '["ceiling paint"]'::jsonb),
('Ceiling', 'ceiling', 'Гипсокартон потолка','ceiling_gypsum',  'm2', '["drywall ceiling","gips"]'::jsonb),
('Ceiling', 'ceiling', 'Натяжной потолок',   'ceiling_stretch', 'm2', '["stretch ceiling"]'::jsonb),
-- Плитка
('Tiling', 'tile', 'Укладка плитки на пол',  'tile_floor',      'm2', '["floor tiling","postavljanje plocica"]'::jsonb),
('Tiling', 'tile', 'Укладка плитки на стены','tile_wall',       'm2', '["wall tiling"]'::jsonb),
('Tiling', 'tile', 'Затирка швов',           'tile_grout',      'm2', '["grouting"]'::jsonb),
-- Полы
('Flooring', 'floor', 'Стяжка пола',          'floor_screed',    'm2', '["screed","estrih"]'::jsonb),
('Flooring', 'floor', 'Укладка ламината',     'floor_laminate',  'm2', '["laminate flooring"]'::jsonb),
('Flooring', 'floor', 'Укладка паркета',      'floor_parquet',   'm2', '["parquet"]'::jsonb),
('Flooring', 'floor', 'Укладка винила',       'floor_vinyl',     'm2', '["vinyl flooring"]'::jsonb),
('Flooring', 'floor', 'Плинтус',              'floor_skirting',  'linear_m', '["skirting","baseboard"]'::jsonb),
-- Гипсокартон
('Drywall', 'drywall', 'Гипсокартон перегородка', 'gypsum_partition', 'm2', '["drywall partition"]'::jsonb),
('Drywall', 'drywall', 'Гипсокартон короб',    'gypsum_box',      'linear_m', '["drywall box"]'::jsonb),
('Drywall', 'drywall', 'Гипсокартон откосы',   'gypsum_slope',    'linear_m', '["drywall slope"]'::jsonb),
-- Электрика
('Electrical', 'electric', 'Розетка/выключатель', 'elec_socket',   'point', '["socket","switch","utikac"]'::jsonb),
('Electrical', 'electric', 'Точка освещения',      'elec_light',    'point', '["light point"]'::jsonb),
('Electrical', 'electric', 'Электрощиток',         'elec_panel',    'piece', '["electrical panel"]'::jsonb),
('Electrical', 'electric', 'Прокладка кабеля',     'elec_cable',    'linear_m', '["cable installation"]'::jsonb),
-- Сантехника
('Plumbing', 'plumbing', 'Установка ванны',       'plumb_bathtub', 'piece', '["bathtub install","kada"]'::jsonb),
('Plumbing', 'plumbing', 'Установка унитаза',     'plumb_toilet',  'piece', '["toilet install","WC"]'::jsonb),
('Plumbing', 'plumbing', 'Установка душевой',     'plumb_shower',  'piece', '["shower install","tus"]'::jsonb),
('Plumbing', 'plumbing', 'Установка раковины',    'plumb_sink',    'piece', '["sink install","lavabo"]'::jsonb),
('Plumbing', 'plumbing', 'Разводка воды',         'plumb_water',   'point', '["water piping"]'::jsonb),
('Plumbing', 'plumbing', 'Канализация',           'plumb_sewer',   'point', '["sewer"]'::jsonb),
-- Двери
('Doors', 'doors', 'Установка межкомнатной двери', 'door_install', 'piece', '["door install","vrata"]'::jsonb),
('Doors', 'doors', 'Демонтаж двери',               'door_remove',  'piece', '["door removal"]'::jsonb),
-- Окна
('Windows', 'windows', 'Установка окна',           'window_install', 'piece', '["window install","prozor"]'::jsonb),
('Windows', 'windows', 'Откосы окна',              'window_slope',   'linear_m', '["window slope"]'::jsonb),
('Windows', 'windows', 'Подоконник',               'window_sill',    'linear_m', '["window sill"]'::jsonb),
-- Вентиляция
('Ventilation', 'vent', 'Установка вытяжки',       'vent_hood',     'piece', '["extractor hood"]'::jsonb),
('Ventilation', 'vent', 'Вентиляционный канал',    'vent_duct',     'linear_m', '["vent duct"]'::jsonb),
-- Мусор
('Waste', 'waste', 'Вывоз мусора',                 'waste_removal', 'trip',  '["waste removal","djubre"]'::jsonb),
-- Специальные
('Special', 'special', 'Тёплый пол электрический', 'heat_floor_elec', 'm2', '["electric heated floor","podno grejanje"]'::jsonb),
('Special', 'special', 'Тёплый пол водяной',       'heat_floor_water','m2', '["water heated floor"]'::jsonb)
ON CONFLICT (work_key) DO NOTHING;

-- Стартовые цены для Белграда, Сербия (EUR)
INSERT INTO estimate_price_ranges (work_key, country, city, currency, labor_min, labor_recommended, labor_max, source, confidence) VALUES
    ('tile_floor',      'Serbia', 'Belgrade', 'EUR', 20, 30, 45,  'Actual contractor prices 2026', 'high'),
    ('tile_wall',       'Serbia', 'Belgrade', 'EUR', 22, 32, 48,  'Actual contractor prices 2026', 'high'),
    ('tile_grout',      'Serbia', 'Belgrade', 'EUR', 3,  5,  8,   'Actual contractor prices 2026', 'medium'),
    ('wall_paint',      'Serbia', 'Belgrade', 'EUR', 3,  5,  8,   'Actual contractor prices 2026', 'high'),
    ('wall_plaster',    'Serbia', 'Belgrade', 'EUR', 8,  12, 18,  'Actual contractor prices 2026', 'high'),
    ('wall_putty',      'Serbia', 'Belgrade', 'EUR', 4,  6,  10,  'Actual contractor prices 2026', 'medium'),
    ('wall_prime',      'Serbia', 'Belgrade', 'EUR', 1.5,2.5,4,   'Actual contractor prices 2026', 'medium'),
    ('ceiling_paint',   'Serbia', 'Belgrade', 'EUR', 4,  6,  10,  'Actual contractor prices 2026', 'high'),
    ('ceiling_gypsum',  'Serbia', 'Belgrade', 'EUR', 15, 22, 32,  'Actual contractor prices 2026', 'medium'),
    ('floor_screed',    'Serbia', 'Belgrade', 'EUR', 8,  12, 18,  'Actual contractor prices 2026', 'high'),
    ('floor_laminate',  'Serbia', 'Belgrade', 'EUR', 6,  9,  14,  'Actual contractor prices 2026', 'high'),
    ('floor_parquet',   'Serbia', 'Belgrade', 'EUR', 15, 25, 40,  'Actual contractor prices 2026', 'medium'),
    ('elec_socket',     'Serbia', 'Belgrade', 'EUR', 18, 25, 35,  'Actual contractor prices 2026', 'high'),
    ('elec_light',      'Serbia', 'Belgrade', 'EUR', 18, 25, 35,  'Actual contractor prices 2026', 'high'),
    ('plumb_water',     'Serbia', 'Belgrade', 'EUR', 55, 75, 100, 'Actual contractor prices 2026', 'high'),
    ('plumb_sewer',     'Serbia', 'Belgrade', 'EUR', 55, 75, 100, 'Actual contractor prices 2026', 'high'),
    ('plumb_bathtub',   'Serbia', 'Belgrade', 'EUR', 60, 90, 130, 'Actual contractor prices 2026', 'medium'),
    ('plumb_toilet',    'Serbia', 'Belgrade', 'EUR', 40, 60, 90,  'Actual contractor prices 2026', 'medium'),
    ('door_install',    'Serbia', 'Belgrade', 'EUR', 40, 60, 90,  'Actual contractor prices 2026', 'high'),
    ('window_install',  'Serbia', 'Belgrade', 'EUR', 40, 60, 90,  'Actual contractor prices 2026', 'medium'),
    ('waste_removal',   'Serbia', 'Belgrade', 'EUR', 80, 120,180, 'Actual contractor prices 2026', 'medium'),
    ('heat_floor_elec', 'Serbia', 'Belgrade', 'EUR', 15, 22, 32,  'Actual contractor prices 2026', 'medium')
ON CONFLICT (work_key, country, city, currency) DO NOTHING;

-- Стартовые цены для Москвы, Россия (RUB)
INSERT INTO estimate_price_ranges (work_key, country, city, currency, labor_min, labor_recommended, labor_max, source, confidence) VALUES
    ('tile_floor',      'Russia', 'Moscow', 'RUB', 1200, 1800, 2800, 'Contractor market rates 2026', 'high'),
    ('wall_paint',      'Russia', 'Moscow', 'RUB', 250,  400,  650,  'Contractor market rates 2026', 'high'),
    ('wall_plaster',    'Russia', 'Moscow', 'RUB', 600,  900,  1400, 'Contractor market rates 2026', 'high'),
    ('elec_socket',     'Russia', 'Moscow', 'RUB', 1000, 1500, 2200, 'Contractor market rates 2026', 'high'),
    ('plumb_water',     'Russia', 'Moscow', 'RUB', 3500, 5000, 7500, 'Contractor market rates 2026', 'high'),
    ('door_install',    'Russia', 'Moscow', 'RUB', 2500, 4000, 6500, 'Contractor market rates 2026', 'high'),
    ('floor_laminate',  'Russia', 'Moscow', 'RUB', 400,  650,  950,  'Contractor market rates 2026', 'high')
ON CONFLICT (work_key, country, city, currency) DO NOTHING;

-- Стартовые цены для материалов Белграда
INSERT INTO estimate_material_price_ranges (work_key, country, city, currency, materials_min, materials_recommended, materials_max, source) VALUES
    ('tile_floor',      'Serbia', 'Belgrade', 'EUR', 15, 22, 35, 'Building supplies market 2026'),
    ('tile_wall',       'Serbia', 'Belgrade', 'EUR', 18, 25, 40, 'Building supplies market 2026'),
    ('wall_paint',      'Serbia', 'Belgrade', 'EUR', 1.5,2.5,5,  'Building supplies market 2026'),
    ('floor_laminate',  'Serbia', 'Belgrade', 'EUR', 8,  15, 30, 'Building supplies market 2026'),
    ('floor_screed',    'Serbia', 'Belgrade', 'EUR', 4,  6,  9,  'Building supplies market 2026')
ON CONFLICT (work_key, country, city, currency) DO NOTHING;

-- Промокод-приветствие
INSERT INTO estimate_promo_codes (code, bonus_days, max_uses, description) VALUES
    ('WELCOME2026', 14, 1000, 'Приветственный промокод: +14 дней бесплатно')
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- ФУНКЦИИ И ТРИГГЕРЫ
-- =====================================================================

-- Автообновление updated_at
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_calc ON estimate_calculations;
CREATE TRIGGER trg_touch_calc BEFORE UPDATE ON estimate_calculations
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_sub ON estimate_subscriptions;
CREATE TRIGGER trg_touch_sub BEFORE UPDATE ON estimate_subscriptions
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_drafts ON estimate_drafts;
CREATE TRIGGER trg_touch_drafts BEFORE UPDATE ON estimate_drafts
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Очистка старых записей идемпотентности (> 24 часов)
CREATE OR REPLACE FUNCTION cleanup_old_updates() RETURNS void AS $$
BEGIN
    DELETE FROM estimate_processed_updates WHERE processed_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;
