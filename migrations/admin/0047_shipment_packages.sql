-- ADMIN_DB only. Packages (cartons) inside one shipment, as a JSON list of
-- {length, width, height, cbm, weight} (cm, CBM, kg). Only shipments with two
-- or more packages have a row; their Declared CBM / weight are the totals.
CREATE TABLE shipment_packages (
 shipment_id TEXT PRIMARY KEY NOT NULL,
 packages TEXT NOT NULL CHECK(json_valid(packages) AND json_type(packages) = 'array'),
 updated_at TEXT NOT NULL
);
