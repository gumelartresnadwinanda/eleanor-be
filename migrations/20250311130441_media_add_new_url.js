/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.table("media", function (table) {
    table.string("optimized_path"); // changed from file to optimized_path
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.table("media", function (table) {
    table.dropColumn("optimized_path"); // changed from file to optimized_path
  });
};
