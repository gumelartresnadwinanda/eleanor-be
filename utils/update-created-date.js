require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");
const knex = require("knex");
const config = require("../knexfile");

const db = knex(config.development);
const MEDIA_FOLDER = process.env.MEDIA_OPTIMIZE_FOLDER;
const SKIPPED_FILES_LOG = path.join(__dirname, "../output/skipped_files.json");

async function updateCreatedDate(folderPath) {
  let skippedFiles = [];

  try {
    const files = await fs.readdir(folderPath, { withFileTypes: true });
    for (const file of files) {
      const filePath = path.join(folderPath, file.name);
      if (file.isDirectory()) {
        await updateCreatedDate(filePath); // Recursively process subdirectories
      } else {
        const ext = path.extname(file.name).toLowerCase();
        if (ext === ".mp4") {
          const movFilePath = path.join(
            folderPath,
            path.basename(file.name, ".mp4") + ".MOV"
          );
          try {
            const movStat = await fs.stat(movFilePath);
            const createdAt = movStat.birthtime;

            const updatedRows = await db("media")
              .where("file_path", filePath)
              .update({ created_at: createdAt });

            if (updatedRows === 0) {
              console.log(`No database record for ${file.name}, skipping...`);
              skippedFiles.push(file.name);
            } else {
              console.log(
                `Updated created_at for ${file.name} to ${createdAt}`
              );
            }
          } catch (error) {
            if (error.code === "ENOENT") {
              console.log(
                `No corresponding .MOV file for ${file.name}, skipping...`
              );
            } else {
              console.error(`Error reading ${movFilePath}:`, error);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error updating created dates:", error);
  } finally {
    if (skippedFiles.length > 0) {
      try {
        await fs.writeFile(
          SKIPPED_FILES_LOG,
          JSON.stringify(skippedFiles, null, 2)
        );
        console.log(`Skipped files saved to ${SKIPPED_FILES_LOG}`);
      } catch (error) {
        console.error("Error writing skipped files log:", error);
      }
    }
    await db.destroy();
  }
}

(async () => {
  await updateCreatedDate(MEDIA_FOLDER);
})();
