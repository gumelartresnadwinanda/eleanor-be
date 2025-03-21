/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.table("media", function (table) {
    table.string("protected_by");
    table.integer("user_protecting").unsigned().nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.table("media", function (table) {
    table.dropColumn("user_protecting");
    table.dropColumn("protected_by");
  });
};
