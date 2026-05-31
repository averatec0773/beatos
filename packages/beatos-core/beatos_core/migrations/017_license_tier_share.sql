-- v0.0.42: each license tier can carry a revenue-share percentage (网易云
-- 编曲分润比例 / "arrangement profit-share ratio"). NULL = unset; the platform
-- field is optional, so NULL means "don't fill it". Append-only per the
-- migrations rule (rule 1); existing rows default NULL.
ALTER TABLE license_tier ADD COLUMN share REAL;
