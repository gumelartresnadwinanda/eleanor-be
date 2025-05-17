/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable("tags", (table) => {
    table.integer("parent").unsigned().nullable();
    table.text("media_tags");
    table
      .foreign("parent")
      .references("id")
      .inTable("tags")
      .onDelete("SET NULL");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable("tags", (table) => {
    table.dropForeign("parent");
    table.dropColumn("parent");
    table.dropColumn("media_tags");
  });
};
