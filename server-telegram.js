/**
 * Xtremsy Files - Telegram Bot Storage
 * 
 * This creates a Telegram bot that stores files in your Telegram account.
 * Completely free and truly unlimited!
 * 
 * Setup:
 * 1. Create a bot via @BotFather on Telegram
 * 2. Get the bot token
 * 3. Run this code locally or on any free host
 * 
 * No server needed - files are stored in your Telegram account!
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');

// You'll need to set these:
// TELEGRAM_BOT_TOKEN=your_bot_token_here
// TELEGRAM_CHAT_ID=your_chat_id_here (get from @userinfobot)

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const app = express();
const PORT = process.env.PORT || 3000;

// File metadata storage (maps fileId -> telegram message info)
const fileMetadata = new Map();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '100mb' }));

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        storage: 'telegram',
        configured: !!BOT_TOKEN
    });
});

// Upload file to Telegram
app.post('/api/rooms/:roomId/files', multer({ storage: multer.memoryStorage() }).single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!BOT_TOKEN || !CHAT_ID) {
            return res.status(500).json({ error: 'Telegram bot not configured' });
        }

        const roomId = req.params.roomId;
        const fileId = crypto.randomBytes(8).toString('hex');

        // Save file temporarily
        const tempPath = path.join(__dirname, `temp_${fileId}_${req.file.originalname}`);
        fs.writeFileSync(tempPath, req.file.buffer);

        // Send to Telegram
        const formData = new FormData();
        formData.append('chat_id', CHAT_ID);
        formData.append('document', fs.createReadStream(tempPath));
        formData.append('caption', JSON.stringify({ fileId, roomId }));

        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        // Clean up temp file
        fs.unlinkSync(tempPath);

        if (!result.ok) {
            console.error('Telegram error:', result);
            return res.status(500).json({ error: 'Failed to upload to Telegram' });
        }

        const messageId = result.result.message_id;
        const fileIdOnTelegram = result.result.document.file_id;

        // Store metadata
        const fileInfo = {
            id: fileId,
            name: req.file.originalname,
            type: req.file.mimetype,
            size: req.file.size,
            telegramFileId: fileIdOnTelegram,
            messageId: messageId,
            roomId: roomId,
            uploadedAt: Date.now()
        };

        if (!fileMetadata.has(roomId)) {
            fileMetadata.set(roomId, new Map());
        }
        fileMetadata.get(roomId).set(fileId, fileInfo);

        res.json({
            success: true,
            file: {
                id: fileId,
                name: req.file.originalname,
                size: req.file.size,
                type: req.file.mimetype,
                url: `/api/rooms/${roomId}/files/${fileId}`,
                uploadedAt: fileInfo.uploadedAt
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed: ' + error.message });
    }
});

// Get files for a room
app.get('/api/rooms/:roomId/files', (req, res) => {
    const roomId = req.params.roomId;
    const roomFiles = fileMetadata.get(roomId);
    
    if (!roomFiles) {
        return res.json({ files: [] });
    }

    const files = Array.from(roomFiles.values()).map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        type: f.type,
        url: `/api/rooms/${roomId}/files/${f.id}`,
        uploadedAt: f.uploadedAt
    }));

    res.json({ files });
});

// Download file from Telegram
app.get('/api/rooms/:roomId/files/:fileId', async (req, res) => {
    const { roomId, fileId } = req.params;
    const roomFiles = fileMetadata.get(roomId);
    
    if (!roomFiles) {
        return res.status(404).json({ error: 'File not found' });
    }

    const file = roomFiles.get(fileId);
    if (!file) {
        return res.status(404).json({ error: 'File not found' });
    }

    try {
        // Get file from Telegram
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${file.telegramFileId}`);
        const result = await response.json();

        if (!result.ok) {
            return res.status(500).json({ error: 'Failed to get file from Telegram' });
        }

        const filePath = result.result.file_path;
        const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

        // Redirect to the file URL so browser can download it
        res.redirect(downloadUrl);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Delete file (just removes metadata - file stays in Telegram unless manually deleted)
app.delete('/api/rooms/:roomId/files/:fileId', (req, res) => {
    const { roomId, fileId } = req.params;
    const roomFiles = fileMetadata.get(roomId);
    
    if (!roomFiles) {
        return res.status(404).json({ error: 'File not found' });
    }

    const file = roomFiles.get(fileId);
    if (!file) {
        return res.status(404).json({ error: 'File not found' });
    }

    roomFiles.delete(fileId);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Xtremsy Telegram storage server running on port ${PORT}`);
    console.log(`Telegram bot ${BOT_TOKEN ? 'configured' : 'NOT configured'}`);
});
