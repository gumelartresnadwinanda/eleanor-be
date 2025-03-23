/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("favorite_albums", (table) => {
    table.increments("id").primary();
    table.string("user_identifier").notNullable(); // Identifier for the user (e.g., username or email)
    table.integer("album_id").unsigned().notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table
      .foreign("album_id")
      .references("id")
      .inTable("albums")
      .onDelete("CASCADE");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("favorite_albums");
};
