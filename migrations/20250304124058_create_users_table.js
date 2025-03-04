exports.up = function (knex) {
  return knex.schema.createTable("users", (table) => {
    table.increments("id").primary();
    table.string("username", 255).notNullable().unique();
    table.string("role", 50).notNullable();
    table.text("permissions");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("users");
};
