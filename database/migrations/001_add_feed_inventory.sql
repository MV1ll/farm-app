CREATE TABLE feed_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_name TEXT UNIQUE NOT NULL,
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

CREATE INDEX feed_inventory_species_stage_idx ON feed_inventory (species, stage);