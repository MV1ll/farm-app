CREATE TABLE capital_funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    received_date DATE NOT NULL,
    amount_php NUMERIC(12, 2) NOT NULL CHECK (amount_php > 0),
    description TEXT NOT NULL,
    recorded_by UUID REFERENCES farm_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX capital_funds_received_date_idx ON capital_funds (received_date);

INSERT INTO capital_funds (received_date, amount_php, description)
VALUES (CURRENT_DATE, 100000, 'Opening operational capital');