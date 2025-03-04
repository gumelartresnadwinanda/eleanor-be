exports.up = function (knex) {
  return knex.schema.alterTable("media", (table) => {
    table.unique("file_path");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("media", (table) => {
    table.dropUnique("file_path");
  });
};
