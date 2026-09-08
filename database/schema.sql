CREATE TYPE livestock_species AS ENUM ('Pig', 'Chicken');
CREATE TYPE batch_status AS ENUM ('Active', 'Completed');
CREATE TYPE expense_category AS ENUM ('Feed', 'Medicine', 'Materials', 'Gas', 'Salary');

CREATE TABLE farm_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entra_object_id UUID UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_code TEXT UNIQUE NOT NULL,
    species livestock_species NOT NULL,
    purchase_date DATE NOT NULL,
    supplier_id UUID REFERENCES suppliers(id),
    starting_headcount INTEGER NOT NULL CHECK (starting_headcount > 0),
    target_weight_kg NUMERIC(8, 2) NOT NULL CHECK (target_weight_kg > 0),
    purchase_cost_php NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (purchase_cost_php >= 0),
    status batch_status NOT NULL DEFAULT 'Active',
    completed_at DATE,
    created_by UUID REFERENCES farm_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE weekly_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    week_ending DATE NOT NULL,
    average_weight_kg NUMERIC(8, 3) NOT NULL CHECK (average_weight_kg >= 0),
    feed_bags NUMERIC(8, 2) CHECK (feed_bags >= 0),
    bag_weight_kg NUMERIC(8, 2) NOT NULL DEFAULT 50 CHECK (bag_weight_kg > 0),
    note TEXT,
    recorded_by UUID REFERENCES farm_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (batch_id, week_ending)
);

CREATE TABLE mortality_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    loss_date DATE NOT NULL,
    heads_lost INTEGER NOT NULL CHECK (heads_lost > 0),
    note TEXT,
    recorded_by UUID REFERENCES farm_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE batch_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    note_date DATE NOT NULL,
    note_type TEXT NOT NULL,
    note TEXT NOT NULL,
    recorded_by UUID REFERENCES farm_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_date DATE NOT NULL,
    category expense_category NOT NULL,
    supplier_id UUID REFERENCES suppliers(id),
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    amount_php NUMERIC(12, 2) NOT NULL CHECK (amount_php >= 0),
    employee_name TEXT,
    bonus_amount_php NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (bonus_amount_php >= 0),
    recorded_by UUID REFERENCES farm_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feed_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    feed_name TEXT NOT NULL,
    species livestock_species NOT NULL,
    stage TEXT NOT NULL,
    bags_on_hand NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (bags_on_hand >= 0),
    reorder_level_bags NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (reorder_level_bags >= 0),
    bag_weight_kg NUMERIC(8, 2) NOT NULL DEFAULT 50 CHECK (bag_weight_kg > 0),
    unit_cost_php NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (unit_cost_php >= 0),
    supplier_id UUID REFERENCES suppliers(id),
    updated_by UUID REFERENCES farm_users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE batch_sale_estimates (
    batch_id UUID PRIMARY KEY REFERENCES batches(id) ON DELETE CASCADE,
    estimated_price_per_kg_php NUMERIC(10, 2) NOT NULL CHECK (estimated_price_per_kg_php >= 0),
    estimated_weight_per_head_kg NUMERIC(8, 2) NOT NULL CHECK (estimated_weight_per_head_kg >= 0),
    updated_by UUID REFERENCES farm_users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES batches(id),
    sale_date DATE NOT NULL,
    buyer_name TEXT NOT NULL,
    live_weight_kg NUMERIC(12, 2) NOT NULL CHECK (live_weight_kg > 0),
    price_per_kg_php NUMERIC(10, 2) NOT NULL CHECK (price_per_kg_php >= 0),
    amount_php NUMERIC(12, 2) NOT NULL CHECK (amount_php >= 0),
    payment_status TEXT NOT NULL DEFAULT 'Pending',
    recorded_by UUID REFERENCES farm_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX weekly_performance_batch_week_idx ON weekly_performance (batch_id, week_ending);
CREATE INDEX mortality_records_batch_date_idx ON mortality_records (batch_id, loss_date);
CREATE INDEX batch_notes_batch_date_idx ON batch_notes (batch_id, note_date);
CREATE INDEX expenses_batch_date_idx ON expenses (batch_id, expense_date);
CREATE INDEX feed_inventory_species_stage_idx ON feed_inventory (species, stage);
CREATE UNIQUE INDEX feed_inventory_batch_feed_name_idx ON feed_inventory (batch_id, feed_name);