/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("album_media", (table) => {
    table.increments("id").primary();
    table.integer("album_id").unsigned().notNullable();
    table.integer("media_id").unsigned().notNullable();
    table
      .foreign("album_id")
      .references("id")
      .inTable("albums")
      .onDelete("CASCADE");
    table
      .foreign("media_id")
      .references("id")
      .inTable("media")
      .onDelete("CASCADE");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("album_media");
};
