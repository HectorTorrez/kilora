-- +goose Up
CREATE TABLE whatsapp_notification (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workshop_id uuid NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
 branch_id uuid REFERENCES branch(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('quote', 'tracking', 'invitation')),
 token_hash text NOT NULL,
 recipient text NOT NULL,
 parameters jsonb NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','accepted','failed','unknown','cancelled')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 provider_message_id text,
 error_code text,
 UNIQUE (workshop_id, kind, token_hash)
);
CREATE INDEX whatsapp_notification_pending ON whatsapp_notification(available_at) WHERE status = 'queued';

-- +goose Down
DROP TABLE whatsapp_notification;
