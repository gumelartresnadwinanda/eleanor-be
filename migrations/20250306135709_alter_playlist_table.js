exports.up = function (knex) {
  return knex.schema.alterTable("playlists", (table) => {
    table.dropColumn("user_id"); // Remove user_id column
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("playlists", (table) => {
    table.integer("user_id").unsigned().notNullable(); // Re-add user_id column
    table.foreign("user_id").references("id").inTable("users");
  });
};
