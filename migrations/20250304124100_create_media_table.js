exports.up = function (knex) {
  return knex.schema.createTable("media", (table) => {
    table.increments("id").primary();
    table.string("title", 255).notNullable();
    table.text("file_path").notNullable();
    table.string("file_type", 50).notNullable();
    table.text("tags");
    table.integer("duration");
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("media");
};
