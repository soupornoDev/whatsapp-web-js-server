const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
require('dotenv').config();

// ---------- 1. Generate the QR code as a PNG buffer ----------
async function generateQrBuffer(url) {
  const buffer = await QRCode.toBuffer(url, {
    type: 'png',
    width: 400,
    margin: 1,
    color: { dark: '#000000', light: '#FFFFFF' }
  });
  return buffer;
}

// ---------- 2. Set up the Gmail transporter ----------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// ---------- 3. Send the email with the QR attached + inline ----------
async function sendQrByEmail(url, toEmail) {
  const qrBuffer = await generateQrBuffer(url);

  const info = await transporter.sendMail({
    from: `"QR Bot" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'Your QR code',
    text: `Scan this QR code to open: ${url}`,
    html: `
      <p>Scan the QR code below to open:</p>
      <p><a href="${url}">${url}</a></p>
      <img src="cid:qrcode@nodemailer" alt="QR code" />
    `,
    attachments: [
      {
        filename: 'qrcode.png',
        content: qrBuffer,
        contentType: 'image/png',
        cid: 'qrcode@nodemailer' // referenced by <img src="cid:...">
      }
    ]
  });

  console.log('Email sent:', info.messageId);
}

/* ---------- 4. Run it ----------
(async () => {
  try {
    await sendQrByEmail('https://example.com', 'friend@example.com');
  } catch (err) {
    console.error('Failed:', err);
  }
})();
*/

