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

module.exports = router;
