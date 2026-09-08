ALTER TABLE capital_funds
    DROP CONSTRAINT capital_funds_amount_php_check,
    ADD CONSTRAINT capital_funds_amount_php_check
        CHECK (amount_php <> 0);