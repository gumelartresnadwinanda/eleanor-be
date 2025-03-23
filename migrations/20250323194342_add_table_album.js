/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("albums", (table) => {
    table.increments("id").primary();
    table.string("cover_url");
    table.string("fallback_cover_url"); // New field for fallback cover URL
    table.integer("parent").unsigned().nullable();
    table.text("tags");
    table.string("title").notNullable();
    table.boolean("is_protected").defaultTo(false);
    table.boolean("is_hidden").defaultTo(false);
    table.timestamp("deleted_at").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.string("owner").nullable();
    table.json("online_album_urls").nullable(); // New field for online album URLs
    table
      .foreign("parent")
      .references("id")
      .inTable("albums")
      .onDelete("SET NULL");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("albums");
};
