const youtubedl = require("youtube-dl-exec");

async function downloadMp3(url, outputPath) {
  try {
    await youtubedl(url, {
      extractAudio: true,
      audioFormat: "mp3",
      output: outputPath,
    });
  } catch (error) {
    console.error("Error downloading MP3:", error);
    throw error;
  }
}

module.exports = downloadMp3;