exports.up = function (knex) {
  return knex.schema.createTable("playlists", (table) => {
    table.increments("id").primary();
    table.integer("user_id").unsigned().notNullable();
    table.string("name", 255).notNullable();
    table.text("media_ids");
    table.foreign("user_id").references("id").inTable("users");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("playlists");
};
