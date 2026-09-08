ALTER TABLE feed_inventory
    DROP CONSTRAINT feed_inventory_feed_name_key,
    ADD COLUMN batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX feed_inventory_batch_feed_name_idx
    ON feed_inventory (batch_id, feed_name);