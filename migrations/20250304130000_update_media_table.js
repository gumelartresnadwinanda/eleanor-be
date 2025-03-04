exports.up = function (knex) {
  return knex.schema.alterTable("media", (table) => {
    table.float("duration").alter(); // Change duration to float
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("media", (table) => {
    table.integer("duration").alter(); // Revert duration to integer
  });
};
