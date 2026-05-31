-- v0.0.44: per-track "free" flag. A free beat offers a free non-commercial
-- lease (gets the [FREE] name prefix + NetEase 免费授权) WHILE its paid license
-- tiers still apply. Append-only per the migrations rule (rule 1). 0 = not free.
ALTER TABLE track ADD COLUMN is_free INTEGER NOT NULL DEFAULT 0;
