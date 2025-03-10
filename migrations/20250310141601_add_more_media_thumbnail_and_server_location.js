/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.table("media", function (table) {
    table.string("thumbnail_lg");
    table.string("thumbnail_md");
    table.string("server_location").defaultTo("local");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.table("media", function (table) {
    table.dropColumn("thumbnail_lg");
    table.dropColumn("thumbnail_md");
    table.dropColumn("server_location");
  });
};
