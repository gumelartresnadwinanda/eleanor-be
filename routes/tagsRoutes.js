require("dotenv").config();
const express = require("express");
const db = require("../db/connection");
const checkToken = require("../middleware/authMiddleware");

const router = express.Router();
const SERVER_PORT = process.env.SERVER_PORT || 5002;
const SERVER_URL = process.env.SERVER_URL || "http://localhost";
// Function to populate tags from media table
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

    for (const tag of newTags) {
      await db("tags").insert({ name: tag, is_protected: true });
      createdCount++;
    }

    for (const tag of tagsSet) {
      if (existingTagsMap.has(tag) && existingTagsMap.get(tag) !== null) {
        await db("tags").where("name", tag).update({ deleted_at: null });
        restoredCount++;
      }
    }

    console.log(
      `Tags populated successfully. Created: ${createdCount}, Restored: ${restoredCount}`
    );
    return { createdCount, restoredCount };
  } catch (error) {
    console.error("Error populating tags:", error);
    throw error;
  }
}

// Endpoint to trigger tag population
router.post("/populate", checkToken, async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(403).json({ error: "Unauthorized" });
  }

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

function buildTagsQuery(isAuthenticated, is_protected, is_hidden, type) {
  let query = db("tags");

  if (!isAuthenticated) {
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

router.get("/", checkToken, async (req, res) => {
  const {
    page = 1,
    limit = 20,
    is_protected,
    is_hidden = false,
    sort_by = "id",
    sort_order = "asc",
    check_media = false,
    type,
  } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = buildTagsQuery(
      req.isAuthenticated,
      is_protected,
      is_hidden,
      type
    )
      .whereNull("deleted_at")
      .offset(offset)
      .limit(limit)
      .orderBy(sort_by, sort_order);

    const tags = await query;

    if (check_media) {
      // Fetch the most recent media for all tags in a single query
      const tagNames = tags.map((tag) => tag.name.toLowerCase());
      const mediaRecords = await db("media")
        .select("tags", "thumbnail_md", "thumbnail_path", "file_path")
        .whereNull("deleted_at")
        .where((builder) => {
          tagNames.forEach((tagName) => {
            builder.orWhereRaw(
              "LOWER(tags) LIKE ? OR LOWER(tags) LIKE ? OR LOWER(tags) LIKE ?",
              [`%,${tagName},%`, `${tagName},%`, `%,${tagName}`]
            );
          });
        })
        .orderBy("id", "desc");

      // Map the most recent media to each tag
      const mediaMap = {};
      for (const media of mediaRecords) {
        const mediaTags = media.tags.toLowerCase().split(",");
        for (const tagName of tagNames) {
          if (mediaTags.includes(tagName)) {
            if (!mediaMap[tagName]) {
              mediaMap[tagName] = media;
            }
          }
        }
      }

      // Assign the most recent media to each tag
      for (const tag of tags) {
        const media = mediaMap[tag.name.toLowerCase()];
        if (media) {
          tag.last_media = `${SERVER_URL}:${SERVER_PORT}/file/${
            media.thumbnail_md ||
            media.thumbnail_path ||
            media.file_path ||
            null
          }`;
        } else {
          tag.last_media = null;
        }
      }
    }

    const countQuery = buildTagsQuery(
      req.isAuthenticated,
      is_protected,
      is_hidden
    );
    const count = await countQuery.count("* as count").first();

    const next = page * limit < count.count ? page + 1 : null;
    const prev = page > 1 ? page - 1 : null;

    res.json({ data: tags, next, prev, count: count.count });
  } catch (error) {
    console.error("Error fetching tags:", error);
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

router.get("/detail/:tag", checkToken, async (req, res) => {
  const { tag } = req.params;
  const { is_protected } = req.query;

  try {
    const tagDetails = await db("tags")
      .where("name", tag)
      .whereNull("deleted_at")
      .first();

    if (!tagDetails) {
      return res.status(404).json({ error: "Tag not found" });
    }

    const recommendations = await db("tags")
      .where("type", tagDetails.type)
      .where("name", "!=", tag)
      .where("is_protected", is_protected || false)
      .where("is_hidden", false)
      .whereNull("deleted_at")
      .limit(20);

    res.status(200).json({
      tag: tagDetails,
      recommendations,
    });
  } catch (error) {
    console.error("Error fetching tag details:", error);
    res.status(500).json({ error: "Failed to fetch tag details" });
  }
});

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
