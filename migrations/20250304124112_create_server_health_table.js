exports.up = function (knex) {
  return knex.schema.createTable("server_health", (table) => {
    table.increments("id").primary();
    table.float("storage_usage").notNullable();
    table.integer("active_users").notNullable();
    table.timestamp("timestamp").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("server_health");
};
