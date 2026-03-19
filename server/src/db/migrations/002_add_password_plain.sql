-- Add password_plain column so admins can view agent passwords
ALTER TABLE agents ADD COLUMN IF NOT EXISTS password_plain VARCHAR(255);
