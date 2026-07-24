-- Add missing columns to places table
ALTER TABLE places ADD COLUMN price_level TEXT;
ALTER TABLE places ADD COLUMN best_time TEXT;
ALTER TABLE places ADD COLUMN activities TEXT;
ALTER TABLE places ADD COLUMN cuisine TEXT;
ALTER TABLE places ADD COLUMN amenities TEXT;