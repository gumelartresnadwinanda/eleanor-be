require("dotenv").config();
const express = require("express");
const db = require("../db/connection");
const checkToken = require("../middleware/authMiddleware");
const cacheMiddleware = require("../middleware/cacheMiddleware");
const { DEFAULT_PORT, DEFAULT_SERVER } = require("../constants/default");

const router = express.Router();
const SERVER_PORT = process.env.SERVER_PORT || DEFAULT_PORT;
const SERVER_URL = process.env.SERVER_URL || DEFAULT_SERVER;
// Function to populate tags from media table
// TODO: handle adding media tags to the tags table so no need to look for media tags
async function populateTags(startId = 0) {
  try {
    const mediaRecords = await db("media")
      .where("id", ">=", startId)
      .whereNull("deleted_at")
      .select("tags");

    const tagsSet = new Set();

    mediaRecords.forEach((record) => {
      if (record.tags) {
        record.tags.split(",").forEach((tag) => tagsSet.add(tag.trim()));
      }
    });

    const existingTags = await db("tags").select("name", "deleted_at");
    const existingTagsMap = new Map(
      existingTags.map((tag) => [tag.name, tag.deleted_at])
    );

    const newTags = [...tagsSet].filter((tag) => !existingTagsMap.has(tag));
    let createdCount = 0;
    let restoredCount = 0;
    const createdTags = [];
    const restoredTags = [];

    for (const tag of newTags) {
      await db("tags").insert({ name: tag, is_protected: true });
      createdCount++;
      createdTags.push(tag);
    }

    for (const tag of tagsSet) {
      if (existingTagsMap.has(tag) && existingTagsMap.get(tag) !== null) {
        await db("tags").where("name", tag).update({ deleted_at: null });
        restoredCount++;
        restoredTags.push(tag);
      }
    }

    console.log(
      `Tags populated successfully. Created: ${createdCount}, Restored: ${restoredCount}`
    );
    return { createdCount, restoredCount, createdTags, restoredTags };
  } catch (error) {
    console.error("Error populating tags:", error);
    throw error;
  }
}

// Endpoint to trigger tag population
router.post("/populate", async (req, res) => {
  const { startId = 0 } = req.body;

  try {
    const { createdCount, restoredCount } = await populateTags(startId);
    res.status(200).json({
      message: "Tags populated successfully",
      createdCount,
      restoredCount,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to populate tags" });
  }
});

function buildTagsQuery(
  isAuthenticated,
  is_protected,
  is_hidden,
  type,
  isAdmin = false
) {
  let query = db("tags");

  if (!isAuthenticated || !isAdmin) {
    query = query.where("is_protected", false);
  } else {
    if (is_protected !== undefined) {
      query = query.where("is_protected", is_protected);
    }
  }

  if (type) {
    query = query.where((builder) => {
      builder.where("type", type).orWhere("type", null);
    });
  }

  query = query.where("is_hidden", is_hidden);
  return query;
}

// TODO: Update query to handle filtering by media count per tag
router.get("/", checkToken, cacheMiddleware, async (req, res) => {
  const {
    page = 1,
    limit = 20,
    is_protected,
    is_hidden = false,
    sort_by = "id",
    sort_order = "asc",
    check_media = false, // set to true to get the most recent media for each tag
    type,
    popularity = false, // show tags based on media count
    tag_exclude = "",
  } = req.query;
  const offset = (page - 1) * limit;
  const isAdmin = req.user && req.user.role === "admin";
  try {
    let query = buildTagsQuery(
      req.isAuthenticated,
      is_protected,
      is_hidden,
      type,
      isAdmin || false
    ).whereNull("deleted_at");
    let countQuery = buildTagsQuery(
      req.isAuthenticated,
      is_protected,
      is_hidden,
      type,
      isAdmin || false
    ).whereNull("deleted_at");

    if (tag_exclude) {
      const excludeTags = tag_exclude
        .split(",")
        .map((tag) => tag.trim().toLowerCase());
      query = query.whereNot((builder) => {
        excludeTags.forEach((tag) => {
          builder
            .orWhere(db.raw("LOWER(name)"), "like", `%${tag},%`)
            .orWhere(db.raw("LOWER(name)"), "like", `%,${tag},%`)
            .orWhere(db.raw("LOWER(name)"), "like", `%,${tag}`)
            .orWhere(db.raw("LOWER(name)"), "=", tag);
        });
      });
      countQuery = countQuery.whereNot((builder) => {
        excludeTags.forEach((tag) => {
          builder
            .orWhere(db.raw("LOWER(name)"), "like", `%${tag},%`)
            .orWhere(db.raw("LOWER(name)"), "like", `%,${tag},%`)
            .orWhere(db.raw("LOWER(name)"), "like", `%,${tag}`)
            .orWhere(db.raw("LOWER(name)"), "=", tag);
        });
      });
    }

    if (popularity === "true" || popularity === true) {
      query = query
        .select(
          "tags.*",
          db.raw(
            "(SELECT COUNT(*) FROM media_tags WHERE tag_name = tags.name) as media_count"
          )
        )
        .orderBy("media_count", sort_order === "asc" ? "asc" : "desc");
    } else {
      query = query.orderBy(sort_by, sort_order);
    }

    query = query.offset(offset).limit(limit);

    const tags = await query;
    const count = await countQuery.count("* as count").first();

    if (check_media) {
      // Fetch the most recent media for each tag
      const tagNames = tags.map((tag) => tag.name.toLowerCase());

      // Use DISTINCT ON to select only the most recent media per tag
      const mediaRecords = await db("media")
        .select(
          "media.id",
          "media.thumbnail_md",
          "media.thumbnail_path",
          "media.file_path",
          "media_tags.tag_name"
        )
        .leftJoin("media_tags", "media.id", "media_tags.media_id")
        .whereIn("media_tags.tag_name", tagNames)
        .whereNull("media.deleted_at") // Ensure media is not deleted
        .orderBy("media_tags.tag_name") // First order by tag_name to match DISTINCT ON
        .orderBy("media.id", "desc") // Then order by media id descending to get the most recent
        .distinctOn("media_tags.tag_name"); // Get the most recent media for each tag

      // Map the most recent media to each tag
      const mediaMap = {};
      for (const media of mediaRecords) {
        const mediaTags = media.tag_name.toLowerCase();

        // Only add media if it contains at least one of the required fields
        if (media.thumbnail_md || media.thumbnail_path || media.file_path) {
          if (tagNames.includes(mediaTags) && !mediaMap[mediaTags]) {
            mediaMap[mediaTags] = media; // Keep the most recent media per tag
          }
        }
      }

      // Assign the most recent media to each tag
      for (const tag of tags) {
        const media = mediaMap[tag.name.toLowerCase()];

        // If a matching media is found, assign the image URL
        if (media) {
          tag.last_media = `${SERVER_URL}:${SERVER_PORT}/file/${
            media.thumbnail_md ||
            media.thumbnail_path ||
            media.file_path ||
            null
          }`;
        } else {
          // If no media found, set last_media to null
          tag.last_media = null;
        }
      }
    }

    const next = page * limit < count.count ? page + 1 : null;
    const prev = page > 1 ? page - 1 : null;

    res.json({ data: tags, next, prev, count: count.count });
  } catch (error) {
    console.error("Error fetching tags:", error);
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

router.get("/detail/:tag", checkToken, cacheMiddleware, async (req, res) => {
  const { tag } = req.params;

  try {
    const tagDetails = await db("tags")
      .where("name", tag)
      .whereNull("deleted_at")
      .first();

    if (!tagDetails) {
      return res.status(404).json({ error: "Tag not found" });
    }

    res.status(200).json({
      tag: tagDetails,
    });
  } catch (error) {
    console.error("Error fetching tag details:", error);
    res.status(500).json({ error: "Failed to fetch tag details" });
  }
});

// TODO: Update Query for getting tag recommendation, update the table structure if needed
router.get(
  "/recommendations/:tagName",
  cacheMiddleware,
  checkToken,
  async (req, res) => {
    const { tagName } = req.params;
    const { is_protected } = req.query;
    const isAdmin = req.user && req.user.role === "admin";
    try {
      const tagInfo = await db("tags").where("name", tagName).first();
      let recommendations = [];
      const tagType = tagInfo?.type || null;

      // Build query function that adds conditions dynamically
      const buildQuery = (baseQuery, conditions) => {
        conditions.forEach((condition) => {
          baseQuery = baseQuery.where(
            condition.column,
            condition.operator,
            condition.value
          );
        });
        return baseQuery;
      };

      // If no tag info or tag type is null, return fallback recommendations
      const fallbackConditions = [
        { column: "tags.deleted_at", operator: "is", value: null },
        { column: "tags.is_hidden", operator: "=", value: false },
      ];
      if (req.isAuthenticated && isAdmin) {
        if (typeof is_protected !== "undefined")
          fallbackConditions.push({
            column: "tags.is_protected",
            operator: "=",
            value: is_protected,
          });
      } else {
        fallbackConditions.push({
          column: "tags.is_protected",
          operator: "=",
          value: false,
        });
      }
      const fallbackQuery = db("tags").select(
        "tags.name as tag",
        db.raw(
          "(SELECT COUNT(*) FROM media_tags WHERE tag_name = tags.name) as usage_count"
        ),
        "tags.type",
        db.raw(`
          (
            SELECT m.thumbnail_path
            FROM media m
            JOIN media_tags mt ON m.id = mt.media_id
            WHERE mt.tag_name = tags.name
              AND m.deleted_at IS NULL
            ORDER BY m.created_at DESC
            LIMIT 1
          ) as thumbnail_path
        `)
      );
      const query = buildQuery(fallbackQuery, fallbackConditions)
        .orderBy(db.raw("RANDOM()"))
        .limit(10);
      const fallback = await query;

      const baseConditions = [
        { column: "t.deleted_at", operator: "is", value: null },
        { column: "t.is_hidden", operator: "!=", value: true },
        { column: "t.name", operator: "!=", value: tagName },
      ];
      if (req.isAuthenticated && isAdmin) {
        if (typeof is_protected !== "undefined")
          baseConditions.push({
            column: "t.is_protected",
            operator: "=",
            value: is_protected,
          });
      } else {
        baseConditions.push({
          column: "t.is_protected",
          operator: "=",
          value: false,
        });
      }

      // Recommendations when the tag type is "album"
      if (tagType === "album") {
        const stageQuery = db("media_tags as mt")
          .join("tags as t", "mt.tag_name", "t.name")
          .join("media as m", "mt.media_id", "m.id")
          .distinctOn("t.name")
          .select(
            "t.name as tag",
            db.raw("'stage' as type"),
            "m.thumbnail_path",
            "m.file_path",
            "m.thumbnail_md"
          )
          .where("t.type", "stage")
          .whereIn("mt.media_id", function () {
            this.select("media_id")
              .from("media_tags")
              .where("tag_name", tagName);
          })
          .orderBy("t.name")
          .limit(5);

        const stageRecommendations = await buildQuery(
          stageQuery,
          baseConditions
        );

        const personQuery = db("media_tags as mt")
          .join("tags as t", "mt.tag_name", "t.name")
          .join("media as m", "mt.media_id", "m.id")
          .select(
            "t.name as tag",
            db.raw("'person' as type"),
            "m.thumbnail_path",
            "m.file_path",
            "m.thumbnail_md"
          )
          .where("t.type", "person")
          .whereIn("mt.media_id", function () {
            this.select("media_id")
              .from("media_tags")
              .where("tag_name", tagName);
          })
          .limit(1);

        const personRecommendations = await buildQuery(
          personQuery,
          baseConditions
        );

        const sharedAlbumQuery = db("tags as t")
          .join("media_tags as mt", "t.name", "mt.tag_name")
          .join("media as m", "mt.media_id", "m.id")
          .select(
            "t.name as tag",
            db.raw("'album' as type"),
            "m.thumbnail_path",
            "m.file_path",
            "m.thumbnail_md"
          )
          .where("t.type", "album")
          .whereIn("mt.media_id", function () {
            this.select("media_id")
              .from("media_tags")
              .whereIn("tag_name", function () {
                this.select("tag_name")
                  .from("media_tags as mt1")
                  .join("tags as t1", "mt1.tag_name", "t1.name")
                  .where(
                    "mt1.media_id",
                    "in",
                    db("media_tags")
                      .select("media_id")
                      .where("tag_name", tagName)
                  )
                  .andWhere("t1.type", "person");
              });
          })
          .andWhere(
            "m.id",
            "=",
            db("media as m2")
              .select("m2.id")
              .join("media_tags as mt2", "m2.id", "mt2.media_id")
              .whereRaw("mt2.tag_name = t.name")
              .orderBy("m2.id", "desc")
              .limit(1)
          )
          .groupBy(
            "t.name",
            "m.thumbnail_path",
            "m.thumbnail_md",
            "m.file_path"
          )
          .limit(10);

        const sharedAlbumRecommendations = await buildQuery(
          sharedAlbumQuery,
          baseConditions
        );

        recommendations = [
          ...stageRecommendations,
          ...personRecommendations,
          ...sharedAlbumRecommendations,
          ...fallback,
        ];
      } else if (tagType === "person") {
        const albumQuery = db("tags as t")
          .join("media_tags as mt", "t.name", "mt.tag_name")
          .join("media as m", "mt.media_id", "m.id")
          .select(
            "t.name as tag",
            db.raw("'album' as type"),
            "m.thumbnail_path",
            "m.file_path",
            "m.thumbnail_md"
          )
          .where("t.type", "album")
          .whereIn("mt.media_id", function () {
            this.select("media_id")
              .from("media_tags")
              .where("tag_name", tagName);
          })
          .andWhere(
            "m.id",
            "=",
            db("media as m2")
              .select("m2.id")
              .join("media_tags as mt2", "m2.id", "mt2.media_id")
              .whereRaw("mt2.tag_name = t.name")
              .orderBy("m2.id", "desc")
              .limit(1)
          )
          .limit(10);

        const albumRecommendations = await buildQuery(
          albumQuery,
          baseConditions
        );
        const stageQuery = db("media_tags as mt1")
          .join("tags as base_t", "mt1.tag_name", "base_t.name")
          .join("media_tags as mt2", "mt1.media_id", "mt2.media_id")
          .join("tags as t", "mt2.tag_name", "t.name")
          .select(
            "t.name as tag",
            db.raw("'stage' as type"),
            db.raw("COUNT(*) as cooccurrence_count"),
            db.raw(`
        (SELECT m.thumbnail_path FROM media m 
        JOIN media_tags mt ON m.id = mt.media_id
        WHERE mt.tag_name = t.name
        ORDER BY m.id DESC LIMIT 1) as thumbnail_path
      `)
          )
          .where("base_t.name", tagName)
          .where("base_t.type", "person")
          .where("t.type", "stage")
          .whereNot("t.name", tagName)
          .groupBy("t.name")
          .orderBy("cooccurrence_count", "desc")
          .limit(5);
        const stageRecommendations = await buildQuery(
          stageQuery,
          baseConditions
        );
        recommendations = [
          ...albumRecommendations,
          ...stageRecommendations,
          ...fallback,
        ];
      } else if (tagType === "stage") {
        const personQuery = db("media_tags as mt_stage") // Start with stage tag occurrences
          .join(
            "media_tags as mt_person",
            "mt_stage.media_id",
            "mt_person.media_id"
          )
          .join("tags as t", "mt_person.tag_name", "t.name")
          .join("media as m", "mt_person.media_id", "m.id")
          .select(
            "t.name as tag",
            db.raw("'person' as type"),
            db.raw("COUNT(*) as cooccurrence_count"),
            db.raw(`
      (SELECT m2.thumbnail_path FROM media m2
       JOIN media_tags mt ON m2.id = mt.media_id
       WHERE mt.tag_name = t.name
       ORDER BY m2.created_at DESC LIMIT 1) as thumbnail_path
    `),
            "t.is_protected",
            "t.deleted_at",
            "t.is_hidden"
          )
          .where("mt_stage.tag_name", tagName)
          .where("t.type", "person")
          .groupBy("t.name", "t.is_protected", "t.deleted_at", "t.is_hidden")
          .orderBy("cooccurrence_count", "desc")
          .limit(15);
        const personRecommendations = await buildQuery(
          personQuery,
          baseConditions
        );

        const albumQuery = db("tags as t")
          .join("media_tags as mt", "t.name", "mt.tag_name")
          .join("media as m", "mt.media_id", "m.id")
          .select(
            "t.name as tag",
            db.raw("'album' as type"),
            "m.thumbnail_path",
            "m.file_path",
            "m.thumbnail_md"
          )
          .where("t.type", "album")
          .whereIn("mt.media_id", function () {
            this.select("media_id")
              .from("media_tags")
              .where("tag_name", tagName);
          })
          .andWhere(
            "m.id",
            "=",
            db("media as m2")
              .select("m2.id")
              .join("media_tags as mt2", "m2.id", "mt2.media_id")
              .whereRaw("mt2.tag_name = t.name")
              .orderBy("m2.id", "desc")
              .limit(1)
          )
          .limit(8);

        const albumRecommendations = await buildQuery(
          albumQuery,
          baseConditions
        );

        recommendations = [
          ...personRecommendations,
          ...albumRecommendations,
          ...fallback,
        ];
      } else {
        recommendations = fallback;
      }
      const uniqueMap = new Map();

      recommendations.forEach((item) => {
        if (!uniqueMap.has(item.tag)) {
          uniqueMap.set(item.tag, {
            ...item,
            id: item.tag,
            name: item.tag,
            last_media: `${SERVER_URL}:${SERVER_PORT}/file/${
              item.thumbnail_path || item.thumbnail_md || item.file_path
            }`,
          });
        }
      });
      const uniqueRecommendations = Array.from(uniqueMap.values());

      res.status(200).json({
        data: uniqueRecommendations,
        count: uniqueRecommendations.length || 0,
        message: "Recommendation success",
      });
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      res.status(500).json({ error: "Failed to fetch recommendations" });
    }
  }
);

// GET route to check all tags and apply soft deletion if not used in media
router.get("/check-tags", checkToken, async (req, res) => {
  try {
    const tags = await db("tags").select("name").orderBy("name", "asc");
    const tagsToDelete = [];

    for (const tag of tags) {
      const mediaCount = await db("media")
        .whereRaw("LOWER(tags) LIKE ?", [`%${tag.name.toLowerCase()}%`])
        .whereNull("deleted_at")
        .count()
        .first();

      if (mediaCount.count === 0 || mediaCount.count === "0") {
        const tagRecord = await db("tags")
          .where("name", tag.name)
          .whereNull("deleted_at")
          .first();

        if (tagRecord) {
          tagsToDelete.push(tag.name);
          await db("tags")
            .where("id", tagRecord.id)
            .update({ deleted_at: new Date() });
          console.log(`Soft deleted tag: ${tag.name}`);
        }
      }
    }

    res.status(200).json({
      message: "Tag check completed",
      tagsToDelete,
    });
  } catch (error) {
    console.error("Error checking tags:", error);
    res.status(500).json({ error: "Failed to check tags" });
  }
});

module.exports = router;
