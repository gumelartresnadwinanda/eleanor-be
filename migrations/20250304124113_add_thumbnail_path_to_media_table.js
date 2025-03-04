exports.up = function (knex) {
  return knex.schema.table("media", (table) => {
    table.text("thumbnail_path");
  });
};

exports.down = function (knex) {
  return knex.schema.table("media", (table) => {
    table.dropColumn("thumbnail_path");
  });
};
