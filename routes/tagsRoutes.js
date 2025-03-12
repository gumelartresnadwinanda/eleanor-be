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
      await db("tags").insert({ name: tag });
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

// Endpoint to get tags with pagination
router.get("/", checkToken, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = db("tags").offset(offset).limit(limit);

    if (!req.isAuthenticated) {
      query = query.where("is_protected", false);
    }

    const tags = await query;
    const count = await query.count().first();
    const next = page * limit < count.count ? page + 1 : null;
    const prev = page > 1 ? page - 1 : null;

    res.json({ data: tags, next, prev, count: count.count });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

module.exports = router;
