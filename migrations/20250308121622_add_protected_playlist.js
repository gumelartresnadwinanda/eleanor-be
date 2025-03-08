/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.table("playlists", (table) => {
    table.boolean("is_protected").defaultTo(false); // Add is_protected field
    table.text("tags"); // Add tags field
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.table("playlists", (table) => {
    table.dropColumn("is_protected"); // Remove is_protected field
    table.dropColumn("tags"); // Remove tags field
  });
};
