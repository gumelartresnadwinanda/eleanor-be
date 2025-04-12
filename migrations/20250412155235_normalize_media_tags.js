exports.up = async function (knex) {
  const exists = await knex.schema.hasTable("media_tags");
  if (!exists) {
    await knex.schema.createTable("media_tags", (table) => {
      table.integer("media_id").notNullable();
      table.string("tag_name").notNullable();
      table.primary(["media_id", "tag_name"]);
      table
        .foreign("media_id")
        .references("id")
        .inTable("media")
        .onDelete("CASCADE");
      table
        .foreign("tag_name")
        .references("name")
        .inTable("tags")
        .onDelete("CASCADE");
    });
  }

  await knex.raw(`
    INSERT INTO media_tags (media_id, tag_name)
    SELECT
      m.id,
      trim(t) AS tag_name
    FROM media m,
    unnest(string_to_array(m.tags, ',')) AS t
    JOIN tags tg ON tg.name = trim(t)
    ON CONFLICT DO NOTHING
  `);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("media_tags");
};
