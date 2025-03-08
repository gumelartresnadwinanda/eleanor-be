/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("playlist_media", (table) => {
    table.increments("id").primary();
    table.integer("playlist_id").unsigned().notNullable();
    table.integer("media_id").unsigned().notNullable();
    table.foreign("playlist_id").references("id").inTable("playlists");
    table.foreign("media_id").references("id").inTable("media");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("playlist_media");
};
