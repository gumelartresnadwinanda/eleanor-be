require("dotenv").config();
const express = require("express");
const db = require("../db/connection");
const checkToken = require("../middleware/authMiddleware");
const mediaFields = require("../constants/mediaFields");
const cacheMiddleware = require("../middleware/cacheMiddleware");
const fs = require("fs").promises;

const router = express.Router();

const SERVER_PORT = process.env.SERVER_PORT || 5002;
const SERVER_URL = process.env.SERVER_URL || "http://localhost";

// GET route to fetch media with pagination, randomization, authentication check, and optional tag search
router.get("/", checkToken, cacheMiddleware, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      tags,
      match_all_tags = false,
      file_type,
      is_protected,
      sort_by = "created_at",
      sort_order = "desc",
    } = req.query;
    const offset = (page - 1) * limit;
    const isAdmin = req.user && req.user.role === "admin";
    // Build the query to fetch media
    let query = db("media").whereNull("deleted_at");
    if (!req.isAuthenticated || !isAdmin) {
      query = query.where("is_protected", false);
    } else {
      if (is_protected !== undefined) {
        query = query.where("is_protected", is_protected);
      }
    }

    if (tags) {
      const tagsArray = tags.split(",").map((tag) => tag.toLowerCase());
      if (match_all_tags === "true") {
        query = query.where((builder) => {
          tagsArray.forEach((tag) => {
            builder
              .andWhere(db.raw("LOWER(tags)"), "like", `%${tag},%`)
              .orWhere(db.raw("LOWER(tags)"), "like", `%,${tag},%`)
              .orWhere(db.raw("LOWER(tags)"), "like", `%,${tag}`)
              .orWhere(db.raw("LOWER(tags)"), "=", tag);
          });
        });
      } else {
        query = query.where((builder) => {
          tagsArray.forEach((tag) => {
            builder
              .orWhere(db.raw("LOWER(tags)"), "like", `%${tag},%`)
              .orWhere(db.raw("LOWER(tags)"), "like", `%,${tag},%`)
              .orWhere(db.raw("LOWER(tags)"), "like", `%,${tag}`)
              .orWhere(db.raw("LOWER(tags)"), "=", tag);
          });
        });
      }
    }

    // Add file_type filter
    if (file_type && file_type !== "all") {
      query = query.where("file_type", file_type);
    }

    // Apply sorting, randomization, or pagination
    const countQuery = query.clone();
    query = query.orderBy(sort_by, sort_order).offset(offset).limit(limit);

    // Execute the query and send the response
    const medias = await query;
    const count = await countQuery.count().first();
    const next = page * limit < count.count ? page + 1 : null;
    const prev = page > 1 ? page - 1 : null;

    // Update file_path and thumbnail_path
    medias.forEach((media) => {
      if (media.server_location === "local") {
        if (media.file_path) {
          media.file_path = `${SERVER_URL}:${SERVER_PORT}/file/${media.file_path}`;
        }
        if (media.thumbnail_path) {
          media.thumbnail_path = `${SERVER_URL}:${SERVER_PORT}/file/${media.thumbnail_path}`;
        }
        if (media.thumbnail_md) {
          media.thumbnail_md = `${SERVER_URL}:${SERVER_PORT}/file/${media.thumbnail_md}`;
        }
        if (media.thumbnail_lg) {
          media.thumbnail_lg = `${SERVER_URL}:${SERVER_PORT}/file/${media.thumbnail_lg}`;
        }
      }
    });

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
          await trx("media")
            .where({ file_path: media.file_path })
            .update({ deleted_at: new Date() });
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

// GET route to check all file paths and return missing files
router.get("/check-files", checkToken, async (req, res) => {
  const { deleteMissing = false } = req.query;

  try {
    const mediaFiles = await db("media")
      .select("file_path")
      .whereNull("deleted_at");
    const missingFiles = [];

    for (const media of mediaFiles) {
      try {
        await fs.access(media.file_path);
      } catch (error) {
        if (error.code === "ENOENT") {
          missingFiles.push(media.file_path);
          if (deleteMissing === "true") {
            await db("media")
              .where("file_path", media.file_path)
              .update({ deleted_at: new Date() });
            console.log(
              `Soft deleted database entry for missing file: ${media.file_path}`
            );
          }
        } else {
          console.error(`Error checking file: ${media.file_path}`, error);
        }
      }
    }

    res.status(200).json({
      message: "File check completed",
      missingFiles,
    });
  } catch (error) {
    console.error("Error checking files:", error);
    res.status(500).json({ error: "Failed to check files" });
  }
});

// GET route to fetch media included in an album
router.get("/albums/:albumId/media", checkToken, async (req, res) => {
  const { albumId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const album = await db("albums").where("id", albumId).first();
    if (!album) {
      return res.status(404).json({ error: "Album not found" });
    }

    const mediaQuery = db("media")
      .join("album_media", "media.id", "album_media.media_id")
      .where("album_media.album_id", albumId)
      .select("media.*")
      .offset(offset)
      .limit(limit);

    const media = await mediaQuery;
    const count = await db("album_media")
      .where("album_id", albumId)
      .count()
      .first();

    const next = page * limit < count.count ? page + 1 : null;
    const prev = page > 1 ? page - 1 : null;

    res.json({
      album: {
        id: album.id,
        title: album.title,
        cover_url: album.cover_url,
        fallback_cover_url: album.fallback_cover_url, // Include fallback cover URL
        online_album_urls: album.online_album_urls, // Include online album URLs
      },
      media,
      next,
      prev,
      count: count.count,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch media for the album" });
  }
});

// GET route to fetch favorite albums for a user
router.get("/favorites", checkToken, async (req, res) => {
  const { user_identifier } = req.query;

  if (!user_identifier) {
    return res.status(400).json({ error: "User identifier is required" });
  }

  try {
    const favorites = await db("favorite_albums")
      .join("albums", "favorite_albums.album_id", "albums.id")
      .where("favorite_albums.user_identifier", user_identifier)
      .select("albums.*");

    res.status(200).json({ data: favorites });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch favorite albums" });
  }
});

// POST route to add an album to a user's favorites
router.post("/favorites", checkToken, async (req, res) => {
  const { user_identifier, album_id } = req.body;

  if (!user_identifier || !album_id) {
    return res
      .status(400)
      .json({ error: "User identifier and album ID are required" });
  }

  try {
    await db("favorite_albums").insert({ user_identifier, album_id });
    res.status(201).json({ message: "Album added to favorites" });
  } catch (err) {
    res.status(500).json({ error: "Failed to add album to favorites" });
  }
});

// DELETE route to remove an album from a user's favorites
router.delete("/favorites", checkToken, async (req, res) => {
  const { user_identifier, album_id } = req.body;

  if (!user_identifier || !album_id) {
    return res
      .status(400)
      .json({ error: "User identifier and album ID are required" });
  }

  try {
    await db("favorite_albums").where({ user_identifier, album_id }).del();
    res.status(200).json({ message: "Album removed from favorites" });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove album from favorites" });
  }
});

module.exports = router;
