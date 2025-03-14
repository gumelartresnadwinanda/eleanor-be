require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");
const knex = require("knex");
const config = require("../knexfile");

const db = knex(config.development);

async function updateCreatedDate(folderPath, recursiveCheck) {
  let skippedFiles = [];
  let updatedFiles = [];
  let errorFiles = [];

  try {
    const files = await fs.readdir(folderPath, { withFileTypes: true });
    for (const file of files) {
      const filePath = path.join(folderPath, file.name);
      if (file.isDirectory()) {
        if (file.name === "thumbnails") {
          console.log(`Skipping directory: ${filePath}`);
          continue;
        }
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
            await db("media")
              .where("file_path", filePath)
              .update({ created_at: createdAt })
              .then(() => {
                console.log(
                  `Updated created_at for ${filePath} to ${createdAt}`
                );
                updatedFiles.push(filePath);
              })
              .catch(() => {
                console.error(`Error querying database for ${filePath}:`);
                console.log(`No database record for ${filePath}, skipping...`);
                skippedFiles.push(filePath);
                return null;
              });
          } catch (error) {
            if (error.code === "ENOENT") {
              console.log(
                `No corresponding .MOV file for ${filePath}, skipping...`
              );
              skippedFiles.push(filePath);
            } else {
              console.error(`Error reading ${movFilePath}:`, error);
              errorFiles.push({ file: filePath, error: error.message });
            }
          }
        } else {
          console.log(`Skipping non-MOV file: ${filePath}`);
          skippedFiles.push(filePath);
        }
      }
    }
  } catch (error) {
    console.error("Error updating created dates:", error);
  } finally {
    await db.destroy();
  }

  return {
    updatedFiles,
    skippedFiles,
    errorFiles,
  };
}

module.exports = { updateCreatedDate };
