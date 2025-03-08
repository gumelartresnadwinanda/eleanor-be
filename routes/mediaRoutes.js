const express = require("express");
const db = require("../db/connection");
const checkToken = require("../middleware/authMiddleware");
const mediaFields = require("../constants/mediaFields");

const router = express.Router();

// GET route to fetch media with pagination, randomization, authentication check, and optional tag search
router.get("/", checkToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      is_random = false,
      tags,
      match_all_tags = false,
    } = req.query;
    const offset = (page - 1) * limit;

    // Build the query to fetch media
    let query = db("media");
    if (!req.isAuthenticated) {
      query = query.where("is_protected", false);
    }

    if (tags) {
      const tagsArray = tags.split(",");
      if (match_all_tags === "true") {
        query = query.where((builder) => {
          tagsArray.forEach((tag) => {
            builder.andWhere("tags", "like", `%${tag}%`);
          });
        });
      } else {
        query = query.where((builder) => {
          tagsArray.forEach((tag) => {
            builder.orWhere("tags", "like", `%${tag}%`);
          });
        });
      }
    }

    // Apply randomization or pagination
    const countQuery = query.clone();
    if (is_random === "true") {
      query = query.orderByRaw("RANDOM()");
    } else {
      query = query.offset(offset).limit(limit);
    }

    // Execute the query and send the response
    const medias = await query;
    const count = await countQuery.count().first();
    const next = page * limit < count.count ? page + 1 : null;
    const prev = page > 1 ? page - 1 : null;
    res.json({ data: medias, next, prev, count: count.count });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch media" });
  }
});

// POST route to insert batch media data
router.post("/batch", checkToken, async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const mediaData = req.body;

  if (!Array.isArray(mediaData)) {
    return res.status(400).json({ error: "Invalid data format" });
  }

  const failedInserts = [];

  try {
    await db.transaction(async (trx) => {
      for (const media of mediaData) {
        const mediaEntry = {
          title: media.title,
          file_path: media.file_path,
          file_type: media.file_type,
          duration: media.duration,
          tags: media.tags,
          thumbnail_path: media.thumbnail_path,
          created_at: media.created_at || new Date(),
          is_protected: media.is_protected || false,
        };

        try {
          await trx("media").insert(mediaEntry);
        } catch (error) {
          failedInserts.push({
            file_path: media.file_path,
            reason: error.message,
          });
          console.error(
            `Failed to insert media file: ${media.file_path}`,
            error
          );
        }
      }
    });

    res.status(201).json({
      message: "Batch media data inserted successfully",
      data: mediaData,
      failedInserts,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to insert batch media data" });
  }
});

// PUT route to update batch media data
router.put("/batch", checkToken, async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const mediaData = req.body;

  if (!Array.isArray(mediaData)) {
    return res.status(400).json({ error: "Invalid data format" });
  }

  const failedUpdates = [];

  try {
    await db.transaction(async (trx) => {
      for (const media of mediaData) {
        const mediaEntry = {};

        // Only update fields that are provided
        mediaFields.forEach((field) => {
          if (media[field] !== undefined) {
            mediaEntry[field] = media[field];
          }
        });

        try {
          await trx("media").where({ id: media.id }).update(mediaEntry);
        } catch (error) {
          failedUpdates.push({ id: media.id, reason: error.message });
          console.error(`Failed to update media ID: ${media.id}`, error);
        }
      }
    });

    res.status(200).json({
      message: "Batch media data updated successfully",
      data: mediaData,
      failedUpdates,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update batch media data" });
  }
});

// DELETE route to delete batch media data
router.delete("/batch", checkToken, async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const mediaData = req.body;

  if (!Array.isArray(mediaData)) {
    return res.status(400).json({ error: "Invalid data format" });
  }

  const failedDeletes = [];

  try {
    await db.transaction(async (trx) => {
      for (const media of mediaData) {
        try {
          await trx("media").where({ file_path: media.file_path }).del();
        } catch (error) {
          failedDeletes.push({
            file_path: media.file_path,
            reason: error.message,
          });
          console.error(
            `Failed to delete media file: ${media.file_path}`,
            error
          );
        }
      }
    });

    res.status(200).json({
      message: "Batch media data deleted successfully",
      data: mediaData,
      failedDeletes,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete batch media data" });
  }
});

// PUT route to update tags for a batch of media entries
router.put("/batch/tags", checkToken, async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { ids, tags } = req.body;

  if (!Array.isArray(ids) || typeof tags !== "string") {
    return res.status(400).json({ error: "Invalid data format" });
  }

  const failedUpdates = [];

  try {
    await db.transaction(async (trx) => {
      for (const id of ids) {
        try {
          const media = await trx("media").where({ id }).first();
          if (media) {
            const existingTags = media.tags ? media.tags.split(",") : [];
            const newTags = tags.split(",");
            const tagsToAdd = newTags.filter(
              (tag) => !existingTags.includes(tag)
            );

            if (tagsToAdd.length > 0) {
              const updatedTags = [...existingTags, ...tagsToAdd].join(",");
              await trx("media").where({ id }).update({ tags: updatedTags });
            }
          }
        } catch (error) {
          failedUpdates.push({ id, reason: error.message });
          console.error(`Failed to update tags for media ID: ${id}`, error);
        }
      }
    });

    res.status(200).json({
      message: "Batch tags updated successfully",
      data: ids,
      failedUpdates,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update batch tags" });
  }
});

// DELETE route to remove tags for a batch of media entries
router.delete("/batch/tags", checkToken, async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { ids, tags } = req.body;

  if (!Array.isArray(ids) || typeof tags !== "string") {
    return res.status(400).json({ error: "Invalid data format" });
  }

  const failedDeletes = [];

  try {
    await db.transaction(async (trx) => {
      for (const id of ids) {
        try {
          const media = await trx("media").where({ id }).first();
          if (media) {
            const existingTags = media.tags ? media.tags.split(",") : [];
            const tagsToRemove = tags.split(",");
            const updatedTags = existingTags
              .filter((tag) => !tagsToRemove.includes(tag))
              .join(",");

            await trx("media").where({ id }).update({ tags: updatedTags });
          }
        } catch (error) {
          failedDeletes.push({ id, reason: error.message });
          console.error(`Failed to remove tags for media ID: ${id}`, error);
        }
      }
    });

    res.status(200).json({
      message: "Batch tags removed successfully",
      data: ids,
      failedDeletes,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove batch tags" });
  }
});

// PUT route to update protection status for a batch of media entries
router.put("/batch/protected", checkToken, async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { ids, is_protected } = req.body;

  if (!Array.isArray(ids) || typeof is_protected !== "boolean") {
    return res.status(400).json({ error: "Invalid data format" });
  }

  const failedUpdates = [];

  try {
    await db.transaction(async (trx) => {
      for (const id of ids) {
        try {
          await trx("media").where({ id }).update({ is_protected });
        } catch (error) {
          failedUpdates.push({ id, reason: error.message });
          console.error(
            `Failed to update protection status for media ID: ${id}`,
            error
          );
        }
      }
    });

    res.status(200).json({
      message: "Batch protection status updated successfully",
      data: ids,
      failedUpdates,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update batch protection status" });
  }
});

module.exports = router;
