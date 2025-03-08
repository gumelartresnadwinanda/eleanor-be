exports.up = function (knex) {
  return knex.schema.table("media", (table) => {
    table.boolean("is_protected").defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.table("media", (table) => {
    table.dropColumn("is_protected");
  });
};
