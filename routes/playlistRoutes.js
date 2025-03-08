const express = require("express");
const db = require("../db/connection");
const checkToken = require("../middleware/authMiddleware");

const router = express.Router();

// GET route to fetch playlists with pagination, randomization, authentication check, and optional tag search
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

    // Build the query to fetch playlists
    let query = db("playlists");
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

    const countQuery = query.clone();
    // Apply randomization or pagination
    if (is_random === "true") {
      query = query.orderByRaw("RANDOM()");
    } else {
      query = query.offset(offset).limit(limit);
    }

    // Execute the query and send the response
    const playlists = await query;
    const count = await countQuery.count().first();
    const next = page * limit < count.count ? page + 1 : null;
    const prev = page > 1 ? page - 1 : null;
    res.json({ data: playlists, next, prev, count: count.count });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch playlists" });
  }
});

// POST route to create a new playlist
router.post("/", checkToken, async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { name, description, tags, is_protected = false } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Playlist name is required" });
  }

  try {
    const [newPlaylist] = await db("playlists").insert(
      {
        name,
        description,
        tags,
        is_protected,
        created_at: new Date(),
      },
      ["id", "name", "description", "tags", "is_protected", "created_at"]
    );

    res
      .status(201)
      .json({ message: "Playlist created successfully", data: newPlaylist });
  } catch (err) {
    res.status(500).json({ error: "Failed to create playlist" });
  }
});

// GET route to fetch media included in a playlist with pagination
router.get("/:playlistId/media", checkToken, async (req, res) => {
  const { playlistId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    // Fetch media associated with the playlist
    const mediaQuery = db("media")
      .join("playlist_media", "media.id", "playlist_media.media_id")
      .where("playlist_media.playlist_id", playlistId)
      .select("media.*")
      .offset(offset)
      .limit(limit);

    const media = await mediaQuery;
    const count = await db("playlist_media")
      .where("playlist_id", playlistId)
      .count()
      .first();

    const next = page * limit < count.count ? page + 1 : null;
    const prev = page > 1 ? page - 1 : null;

    res.json({ data: media, next, prev, count: count.count });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch media for the playlist" });
  }
});

// POST route to add media to a playlist
router.post("/:playlistId/media", checkToken, async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { playlistId } = req.params;
  const { mediaIds } = req.body;

  if (!Array.isArray(mediaIds)) {
    return res.status(400).json({ error: "Invalid data format" });
  }

  try {
    await db.transaction(async (trx) => {
      for (const mediaId of mediaIds) {
        try {
          await trx("playlist_media").insert({
            playlist_id: playlistId,
            media_id: mediaId,
          });
        } catch (error) {
          console.error(
            `Failed to add media ID: ${mediaId} to playlist ID: ${playlistId}`,
            error
          );
        }
      }
    });

    res.status(201).json({
      message: "Media added to playlist successfully",
      data: mediaIds,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to add media to playlist" });
  }
});

// DELETE route to remove media from a playlist
router.delete("/:playlistId/media", checkToken, async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { playlistId } = req.params;
  const { mediaIds } = req.body;

  if (!Array.isArray(mediaIds)) {
    return res.status(400).json({ error: "Invalid data format" });
  }

  try {
    await db.transaction(async (trx) => {
      for (const mediaId of mediaIds) {
        try {
          await trx("playlist_media")
            .where({
              playlist_id: playlistId,
              media_id: mediaId,
            })
            .del();
        } catch (error) {
          console.error(
            `Failed to remove media ID: ${mediaId} from playlist ID: ${playlistId}`,
            error
          );
        }
      }
    });

    res.status(200).json({
      message: "Media removed from playlist successfully",
      data: mediaIds,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove media from playlist" });
  }
});

// PUT route to update media in a playlist
router.put("/:playlistId/media", checkToken, async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { playlistId } = req.params;
  const { mediaActions } = req.body;

  if (!Array.isArray(mediaActions)) {
    return res.status(400).json({ error: "Invalid data format" });
  }

  const failedActions = [];

  try {
    await db.transaction(async (trx) => {
      for (const { id, action } of mediaActions) {
        if (!["in", "out"].includes(action)) {
          failedActions.push({ id, action, reason: "Invalid action format" });
          continue;
        }

        try {
          if (action === "in") {
            await trx("playlist_media").insert({
              playlist_id: playlistId,
              media_id: id,
            });
          } else if (action === "out") {
            await trx("playlist_media")
              .where({
                playlist_id: playlistId,
                media_id: id,
              })
              .del();
          }
        } catch (error) {
          failedActions.push({ id, action, reason: error.message });
          console.error(
            `Failed to ${action === "in" ? "add" : "remove"} media ID: ${id} ${
              action === "in" ? "to" : "from"
            } playlist ID: ${playlistId}`,
            error
          );
        }
      }
    });

    res.status(200).json({
      message: "Playlist updated successfully",
      data: mediaActions,
      failedActions,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update playlist" });
  }
});

module.exports = router;
