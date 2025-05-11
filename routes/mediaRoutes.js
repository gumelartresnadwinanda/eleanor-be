require("dotenv").config();
const express = require("express");
const db = require("../db/connection");
const checkToken = require("../middleware/authMiddleware");
const cacheMiddleware = require("../middleware/cacheMiddleware");
const { DEFAULT_PORT, DEFAULT_SERVER } = require("../constants/default");
const fs = require("fs").promises;

const router = express.Router();

const SERVER_PORT = process.env.SERVER_PORT || DEFAULT_PORT;
const SERVER_URL = process.env.SERVER_URL || DEFAULT_SERVER;

function processTags(tagsStr, excludeTagsStr) {
  const tags = tagsStr
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  const excludeTags = excludeTagsStr
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  const filteredTags = tags.filter((tag) => !excludeTags.includes(tag));

  return {
    filteredTags: filteredTags,
    excludeTags: excludeTags,
  };
}

// TODO: simplify process
router.get("/", checkToken, cacheMiddleware, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      tags,
      file_type,
      is_protected,
      sort_by = "created_at",
      sort_order = "desc",
      tag_exclude,
    } = req.query;
    const offset = (page - 1) * limit;
    const isAdmin = req.user && req.user.role === "admin";

    const { filteredTags, excludeTags } = await processTags(
      tags || "",
      tag_exclude || ""
    );

    let query = db("media").whereNull("deleted_at");
    if (!req.isAuthenticated || !isAdmin) {
      query = query.where("is_protected", false);
    } else {
      if (is_protected !== undefined) {
        query = query.where("is_protected", is_protected);
      }
    }

    if (filteredTags?.length > 0) {
      query = query.where((builder) => {
        filteredTags.forEach((tag) => {
          builder
            .orWhere(db.raw("LOWER(tags)"), "like", `%${tag},%`)
            .orWhere(db.raw("LOWER(tags)"), "like", `%,${tag},%`)
            .orWhere(db.raw("LOWER(tags)"), "like", `%,${tag}`)
            .orWhere(db.raw("LOWER(tags)"), "=", tag);
        });
      });
    }

    if (excludeTags?.length > 0) {
      query = query.whereNot((builder) => {
        excludeTags.forEach((tag) => {
          builder
            .orWhere(db.raw("LOWER(tags)"), "like", `%${tag},%`)
            .orWhere(db.raw("LOWER(tags)"), "like", `%,${tag},%`)
            .orWhere(db.raw("LOWER(tags)"), "like", `%,${tag}`)
            .orWhere(db.raw("LOWER(tags)"), "=", tag);
        });
      });
    }

    if (file_type && file_type !== "all") {
      query = query.where("file_type", file_type);
    }

    const countQuery = query.clone();
    query = query.orderBy(sort_by, sort_order).offset(offset).limit(limit);

    const medias = await query;
    const count = await countQuery.count().first();
    const next = page * limit < count.count ? page + 1 : null;
    const prev = page > 1 ? page - 1 : null;

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
    console.error("Error fetching media:", err);
    res.status(500).json({ error: "Failed to fetch media" });
  }
});

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

router.put("/tags/:id", checkToken, async (req, res) => {
  const { id } = req.params;
  const { tags } = req.body;

  if (!req.user || !req.user.isAdmin) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const media = await db("media").where({ id }).first();

    if (!media) {
      return res.status(404).json({ message: "Media not found" });
    }

    await db("media").where({ id }).update({ tags });

    return res.json({ message: "Tags updated successfully" });
  } catch (err) {
    console.error("Error updating tags:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// TODO: add route to handle changing tag of a media, reminder: also handle the normalization table
// TODO: add rotue to handle protective field

module.exports = router;
