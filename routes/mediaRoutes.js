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

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const deleteWithData = req.query.deleteWithData === "true";

  try {
    const media = await db("media").where({ id }).first();

    if (!media) {
      return res.status(404).json({ message: "Media not found" });
    }

    if (deleteWithData) {
      const filePaths = [
        media.file_path,
        media.thumbnail_path,
        media.thumbnail_md,
        media.thumbnail_lg,
      ].filter(Boolean);

      for (const file of filePaths) {
        try {
          await fs.unlink(file);
        } catch (err) {
          console.warn(`File not found or could not delete: ${file}`);
        }
      }

      await db.transaction(async (trx) => {
        await trx("media_tags").where({ media_id: id }).del();
        await trx("media").where({ id }).del();
      });

      return res.json({ message: "Media and files deleted successfully" });
    } else {
      await db.transaction(async (trx) => {
        await trx("media_tags").where({ media_id: id }).del();
        await trx("media").where({ id }).update({ deleted_at: new Date() });
      });
      return res.json({ message: "Media soft deleted" });
    }
  } catch (err) {
    console.error("Delete media error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/favorite/:id", checkToken, async (req, res) => {
  const { id } = req.params;
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
  }

  try {
    await db("favorites").insert({ user_id: req.user.id, media_id: id });
    return res.json({ message: "added to favorite" });
  } catch (err) {
    console.error("error add to favorite:", err);
    res.status(500).json({ message: err.detail || "Server error", error: err });
  }
});

router.delete("/favorite/:id", checkToken, async (req, res) => {
  const { id } = req.params;
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const deletedCount = await db("favorites")
      .where({ user_id: req.user.id, id: id })
      .del();

    if (deletedCount === 0) {
      return res.status(404).json({ message: "Favorite not found" });
    }

    return res.json({ message: "Favorite deleted" });
  } catch (e) {
    res.status(500).json({ message: e.detail || "Server Error", error: e });
  }
});

router.get("/favorites/", checkToken, async (req, res) => {
  const { is_protected } = req.query;
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
  }

  try {
    let query = db("favorites")
      .select(
        "favorites.id",
        "media.thumbnail_md",
        "media.thumbnail_path",
        "media.file_path",
        "media.tags",
        "media.is_protected"
      )
      .join("media", "media.id", "favorites.media_id")
      .where("favorites.user_id", req.user.id);

    if (is_protected !== undefined) {
      query = query.where("is_protected", is_protected);
    }
    const data = await query;
    return res.json({
      data,
      count: data.length ?? 0,
      message: "success fetch favorites",
    });
  } catch (e) {
    res
      .status(500)
      .json({ message: e.detail || "Failed to fetch favorites", error: e });
  }
});

module.exports = router;
