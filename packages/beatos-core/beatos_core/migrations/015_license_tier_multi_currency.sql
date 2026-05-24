-- v0.0.27: each license tier can carry prices in multiple currencies at once.
--
-- Old (0.0.26.x): license_tier.price + license_tier.currency — at most one
-- price per tier. Producers wanting to list ¥300 + $50 on the same beat had
-- to either duplicate the tier or maintain mental cross-conversions.
--
-- New: license_tier.prices_json — a JSON object {"CNY": 300, "USD": 50}.
-- Keys are currency codes (UI exposes CNY/USD/EUR/JPY/GBP; storage accepts
-- any string for adapter flexibility). Empty `{}` = tier exists but is not
-- priced.
--
-- Migration steps:
--   1. Add prices_json column with empty-object default
--   2. Backfill: where the old (price, currency) was set, encode it as a
--      single-key dict via json_object()
--   3. Drop the now-redundant price + currency columns
--   4. Clear in-flight set_license_tiers tokens — their payload shape used
--      the old (price + currency) keys and the approve handler can't
--      reinterpret them safely

ALTER TABLE license_tier ADD COLUMN prices_json TEXT NOT NULL DEFAULT '{}';

UPDATE license_tier
SET prices_json = json_object(currency, price)
WHERE price IS NOT NULL;

ALTER TABLE license_tier DROP COLUMN price;
ALTER TABLE license_tier DROP COLUMN currency;

DELETE FROM tokens WHERE tool_name = 'set_license_tiers';
