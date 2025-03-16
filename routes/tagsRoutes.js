require("dotenv").config();
const express = require("express");
const db = require("../db/connection");
const checkToken = require("../middleware/authMiddleware");

const router = express.Router();

// Function to populate tags from media table
async function populateTags(startId = 0) {
  try {
    const mediaRecords = await db("media")
      .where("id", ">=", startId)
      .select("tags");

    const tagsSet = new Set();

    mediaRecords.forEach((record) => {
      if (record.tags) {
        record.tags.split(",").forEach((tag) => tagsSet.add(tag.trim()));
      }
    });

    const existingTags = await db("tags").select("name");
    const existingTagsSet = new Set(existingTags.map((tag) => tag.name));

    const newTags = [...tagsSet].filter((tag) => !existingTagsSet.has(tag));

    for (const tag of newTags) {
      // Insert new tags with is_hidden flag set to true to prevent them from being displayed before review
      await db("tags").insert({ name: tag, is_hidden: true });
    }

    console.log("Tags populated successfully.");
  } catch (error) {
    console.error("Error populating tags:", error);
  }
}

// Endpoint to trigger tag population
router.post("/populate", checkToken, async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { startId = 0 } = req.body;

  try {
    await populateTags(startId);
    res.status(200).json({ message: "Tags populated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to populate tags" });
  }
});

function buildTagsQuery(isAuthenticated, is_protected, is_hidden) {
  let query = db("tags");

  if (!isAuthenticated) {
    query = query.where("is_protected", false);
  } else {
    if (is_protected !== undefined) {
      query = query.where("is_protected", is_protected);
    }
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
  } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = buildTagsQuery(req.isAuthenticated, is_protected, is_hidden)
      .offset(offset)
      .limit(limit)
      .orderBy(sort_by, sort_order);

    const tags = await query;

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

module.exports = router;
