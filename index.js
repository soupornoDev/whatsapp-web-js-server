const {client} = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const downloadMp3 = require("./src/download-mp3");


client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("Client is ready!");
});

client.on("message", async (msg) =>{
    if (msg.body.startsWith(".play")){
        const url = msg.body.split(" ")[1];
        const outputPath = `./downloads/${Date.now()}.mp3`;

        try {
            await downloadMp3(url, outputPath);
            await msg.reply("MP3 downloaded successfully!");
        } catch (error) {
            await msg.reply("Failed to download MP3.");
        }
    }
})

client.initialize();