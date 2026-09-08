-- Migration: Moscow prices (labor + materials) for all 42 works
-- Prices in RUB, based on Moscow market data 2026 (комфорт-класс / средний сегмент)
-- Sources: banki.ru, realty.yandex.ru, shehtel.pro, kalkremont.ru, toolfox.ru

-- Deactivate any previous Moscow rows to avoid duplicates
UPDATE estimate_price_ranges
   SET is_active = false
 WHERE country = 'Russia' AND city = 'Moscow';

UPDATE estimate_material_price_ranges
   SET is_active = false
 WHERE country = 'Russia' AND city = 'Moscow';

-- ==================== LABOR (работы) ====================
INSERT INTO estimate_price_ranges
  (work_key, country, city, currency, labor_min, labor_recommended, labor_max, source, confidence, sources_count, is_active)
VALUES
-- Demolition
('demo_tile',        'Russia', 'Moscow', 'RUB', 250,   350,   500,   'Moscow market 2026', 'high',   5, true),
('demo_screed',      'Russia', 'Moscow', 'RUB', 300,   400,   600,   'Moscow market 2026', 'high',   4, true),
('demo_partition',   'Russia', 'Moscow', 'RUB', 400,   600,   900,   'Moscow market 2026', 'high',   3, true),
('demo_floor',       'Russia', 'Moscow', 'RUB', 200,   300,   450,   'Moscow market 2026', 'high',   4, true),
-- Walls
('wall_plaster',     'Russia', 'Moscow', 'RUB', 700,   900,   1300,  'Moscow market 2026', 'high',   6, true),
('wall_putty',       'Russia', 'Moscow', 'RUB', 350,   500,   750,   'Moscow market 2026', 'high',   5, true),
('wall_prime',       'Russia', 'Moscow', 'RUB', 80,    120,   180,   'Moscow market 2026', 'high',   4, true),
('wall_paint',       'Russia', 'Moscow', 'RUB', 300,   400,   600,   'Moscow market 2026', 'high',   6, true),
-- Ceiling
('ceiling_paint',    'Russia', 'Moscow', 'RUB', 350,   500,   750,   'Moscow market 2026', 'high',   5, true),
('ceiling_gypsum',   'Russia', 'Moscow', 'RUB', 900,   1400,  2000,  'Moscow market 2026', 'high',   4, true),
('ceiling_stretch',  'Russia', 'Moscow', 'RUB', 500,   700,   1000,  'Moscow market 2026', 'high',   5, true),
-- Tiling
('tile_floor',       'Russia', 'Moscow', 'RUB', 1400,  1800,  2500,  'Moscow market 2026', 'high',   6, true),
('tile_wall',        'Russia', 'Moscow', 'RUB', 1600,  2000,  2800,  'Moscow market 2026', 'high',   6, true),
('tile_grout',       'Russia', 'Moscow', 'RUB', 150,   200,   300,   'Moscow market 2026', 'high',   4, true),
-- Flooring
('floor_screed',     'Russia', 'Moscow', 'RUB', 700,   900,   1400,  'Moscow market 2026', 'high',   5, true),
('floor_laminate',   'Russia', 'Moscow', 'RUB', 500,   650,   900,   'Moscow market 2026', 'high',   6, true),
('floor_parquet',    'Russia', 'Moscow', 'RUB', 1200,  1600,  2500,  'Moscow market 2026', 'high',   4, true),
('floor_vinyl',      'Russia', 'Moscow', 'RUB', 550,   750,   1100,  'Moscow market 2026', 'high',   4, true),
('floor_skirting',   'Russia', 'Moscow', 'RUB', 200,   300,   450,   'Moscow market 2026', 'high',   4, true),
-- Drywall
('gypsum_partition', 'Russia', 'Moscow', 'RUB', 1400,  1800,  2500,  'Moscow market 2026', 'high',   5, true),
('gypsum_box',       'Russia', 'Moscow', 'RUB', 600,   900,   1400,  'Moscow market 2026', 'high',   3, true),
('gypsum_slope',     'Russia', 'Moscow', 'RUB', 500,   750,   1200,  'Moscow market 2026', 'high',   3, true),
-- Electrical
('elec_socket',      'Russia', 'Moscow', 'RUB', 1100,  1500,  2200,  'Moscow market 2026', 'high',   6, true),
('elec_light',       'Russia', 'Moscow', 'RUB', 1000,  1400,  2000,  'Moscow market 2026', 'high',   5, true),
('elec_panel',       'Russia', 'Moscow', 'RUB', 12000, 18000, 28000, 'Moscow market 2026', 'high',   4, true),
('elec_cable',       'Russia', 'Moscow', 'RUB', 90,    130,   200,   'Moscow market 2026', 'high',   5, true),
-- Plumbing
('plumb_bathtub',    'Russia', 'Moscow', 'RUB', 5000,  7500,  12000, 'Moscow market 2026', 'high',   4, true),
('plumb_toilet',     'Russia', 'Moscow', 'RUB', 3500,  5000,  8000,  'Moscow market 2026', 'high',   5, true),
('plumb_shower',     'Russia', 'Moscow', 'RUB', 6000,  9000,  15000, 'Moscow market 2026', 'high',   4, true),
('plumb_sink',       'Russia', 'Moscow', 'RUB', 2500,  3500,  5500,  'Moscow market 2026', 'high',   4, true),
('plumb_water',      'Russia', 'Moscow', 'RUB', 3500,  5000,  8000,  'Moscow market 2026', 'high',   6, true),
('plumb_sewer',      'Russia', 'Moscow', 'RUB', 3000,  4500,  7000,  'Moscow market 2026', 'high',   5, true),
-- Doors
('door_install',     'Russia', 'Moscow', 'RUB', 3000,  4000,  6000,  'Moscow market 2026', 'high',   6, true),
('door_remove',      'Russia', 'Moscow', 'RUB', 600,   900,   1400,  'Moscow market 2026', 'high',   3, true),
-- Windows
('window_install',   'Russia', 'Moscow', 'RUB', 4000,  6000,  9000,  'Moscow market 2026', 'high',   5, true),
('window_slope',     'Russia', 'Moscow', 'RUB', 700,   1000,  1500,  'Moscow market 2026', 'high',   3, true),
('window_sill',      'Russia', 'Moscow', 'RUB', 1500,  2200,  3200,  'Moscow market 2026', 'high',   3, true),
-- Ventilation
('vent_hood',        'Russia', 'Moscow', 'RUB', 2500,  3500,  5500,  'Moscow market 2026', 'high',   3, true),
('vent_duct',        'Russia', 'Moscow', 'RUB', 900,   1300,  2000,  'Moscow market 2026', 'high',   3, true),
-- Waste
('waste_removal',    'Russia', 'Moscow', 'RUB', 5000,  8000,  12000, 'Moscow market 2026', 'high',   4, true),
-- Special
('heat_floor_elec',  'Russia', 'Moscow', 'RUB', 900,   1300,  2000,  'Moscow market 2026', 'high',   4, true),
('heat_floor_water', 'Russia', 'Moscow', 'RUB', 1400,  2000,  3000,  'Moscow market 2026', 'high',   3, true);

-- ==================== MATERIALS (материалы) ====================
INSERT INTO estimate_material_price_ranges
  (work_key, country, city, currency, materials_min, materials_recommended, materials_max, source, is_active)
VALUES
-- Demolition — materials 0 (only waste bags/disposal)
('demo_tile',        'Russia', 'Moscow', 'RUB', 20,    50,    100,   'Moscow market 2026', true),
('demo_screed',      'Russia', 'Moscow', 'RUB', 20,    50,    100,   'Moscow market 2026', true),
('demo_partition',   'Russia', 'Moscow', 'RUB', 20,    50,    100,   'Moscow market 2026', true),
('demo_floor',       'Russia', 'Moscow', 'RUB', 20,    50,    100,   'Moscow market 2026', true),
-- Walls
('wall_plaster',     'Russia', 'Moscow', 'RUB', 250,   350,   500,   'Moscow market 2026', true),
('wall_putty',       'Russia', 'Moscow', 'RUB', 150,   220,   350,   'Moscow market 2026', true),
('wall_prime',       'Russia', 'Moscow', 'RUB', 40,    60,    100,   'Moscow market 2026', true),
('wall_paint',       'Russia', 'Moscow', 'RUB', 200,   300,   500,   'Moscow market 2026', true),
-- Ceiling
('ceiling_paint',    'Russia', 'Moscow', 'RUB', 250,   350,   550,   'Moscow market 2026', true),
('ceiling_gypsum',   'Russia', 'Moscow', 'RUB', 500,   750,   1200,  'Moscow market 2026', true),
('ceiling_stretch',  'Russia', 'Moscow', 'RUB', 350,   500,   800,   'Moscow market 2026', true),
-- Tiling — материалы (плитка + клей + затирка)
('tile_floor',       'Russia', 'Moscow', 'RUB', 1200,  1800,  3500,  'Moscow market 2026', true),
('tile_wall',        'Russia', 'Moscow', 'RUB', 1000,  1500,  3000,  'Moscow market 2026', true),
('tile_grout',       'Russia', 'Moscow', 'RUB', 40,    70,    120,   'Moscow market 2026', true),
-- Flooring
('floor_screed',     'Russia', 'Moscow', 'RUB', 350,   500,   800,   'Moscow market 2026', true),
('floor_laminate',   'Russia', 'Moscow', 'RUB', 700,   1200,  2500,  'Moscow market 2026', true),
('floor_parquet',    'Russia', 'Moscow', 'RUB', 2500,  4500,  10000, 'Moscow market 2026', true),
('floor_vinyl',      'Russia', 'Moscow', 'RUB', 900,   1500,  2800,  'Moscow market 2026', true),
('floor_skirting',   'Russia', 'Moscow', 'RUB', 150,   250,   450,   'Moscow market 2026', true),
-- Drywall
('gypsum_partition', 'Russia', 'Moscow', 'RUB', 700,   1000,  1500,  'Moscow market 2026', true),
('gypsum_box',       'Russia', 'Moscow', 'RUB', 300,   500,   800,   'Moscow market 2026', true),
('gypsum_slope',     'Russia', 'Moscow', 'RUB', 250,   400,   650,   'Moscow market 2026', true),
-- Electrical
('elec_socket',      'Russia', 'Moscow', 'RUB', 350,   550,   1000,  'Moscow market 2026', true),
('elec_light',       'Russia', 'Moscow', 'RUB', 400,   650,   1200,  'Moscow market 2026', true),
('elec_panel',       'Russia', 'Moscow', 'RUB', 8000,  15000, 30000, 'Moscow market 2026', true),
('elec_cable',       'Russia', 'Moscow', 'RUB', 60,    100,   180,   'Moscow market 2026', true),
-- Plumbing (материал = сама сантехника)
('plumb_bathtub',    'Russia', 'Moscow', 'RUB', 15000, 30000, 80000, 'Moscow market 2026', true),
('plumb_toilet',     'Russia', 'Moscow', 'RUB', 8000,  15000, 40000, 'Moscow market 2026', true),
('plumb_shower',     'Russia', 'Moscow', 'RUB', 20000, 40000, 100000,'Moscow market 2026', true),
('plumb_sink',       'Russia', 'Moscow', 'RUB', 5000,  10000, 25000, 'Moscow market 2026', true),
('plumb_water',      'Russia', 'Moscow', 'RUB', 800,   1200,  2000,  'Moscow market 2026', true),
('plumb_sewer',      'Russia', 'Moscow', 'RUB', 600,   1000,  1700,  'Moscow market 2026', true),
-- Doors
('door_install',     'Russia', 'Moscow', 'RUB', 6000,  12000, 30000, 'Moscow market 2026', true),
('door_remove',      'Russia', 'Moscow', 'RUB', 0,     0,     0,     'Moscow market 2026', true),
-- Windows
('window_install',   'Russia', 'Moscow', 'RUB', 12000, 20000, 50000, 'Moscow market 2026', true),
('window_slope',     'Russia', 'Moscow', 'RUB', 300,   500,   900,   'Moscow market 2026', true),
('window_sill',      'Russia', 'Moscow', 'RUB', 800,   1500,  3500,  'Moscow market 2026', true),
-- Ventilation
('vent_hood',        'Russia', 'Moscow', 'RUB', 5000,  12000, 30000, 'Moscow market 2026', true),
('vent_duct',        'Russia', 'Moscow', 'RUB', 400,   700,   1200,  'Moscow market 2026', true),
-- Waste
('waste_removal',    'Russia', 'Moscow', 'RUB', 0,     0,     0,     'Moscow market 2026', true),
-- Special
('heat_floor_elec',  'Russia', 'Moscow', 'RUB', 800,   1400,  2500,  'Moscow market 2026', true),
('heat_floor_water', 'Russia', 'Moscow', 'RUB', 1500,  2500,  4500,  'Moscow market 2026', true);
