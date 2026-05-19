-- v0.0.24.1: drop description_draft. The two-field design (draft + live)
-- was redundant once 2PC made every AI write user-reviewed before commit.
ALTER TABLE track DROP COLUMN description_draft;
