-- Per-entry servings (D24). NULL = the recipe's own servings; only recipe
-- entries carry a value (enforced in PlanService). 1–12 like the servings dial.
ALTER TABLE meal_plan_entries
  ADD COLUMN servings TINYINT UNSIGNED NULL AFTER note,
  ADD CONSTRAINT entries_servings CHECK (servings IS NULL OR servings BETWEEN 1 AND 12);
