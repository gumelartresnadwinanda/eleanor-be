/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("favorites", (table) => {
    table.increments("id").primary();
    table.string("user_id");
    table.integer("media_id").notNullable();
    table
      .foreign("media_id")
      .references("id")
      .inTable("media")
      .onDelete("CASCADE");
    table.dateTime("created_at").defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  knex.schema.dropTableIfExists("favorites");
};
