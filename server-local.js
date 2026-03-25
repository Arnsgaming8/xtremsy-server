/**
 * Xtremsy Files - File Storage Server
 * 
 * Stores files on the server's disk (Render free tier)
 * Note: Files may be deleted when server sleeps/restarts
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const roomId = req.params.roomId || 'default';
        const roomDir = path.join(uploadsDir, roomId);
        if (!fs.existsSync(roomDir)) {
            fs.mkdirSync(roomDir, { recursive: true });
        }
        cb(null, roomDir);
    },
    filename: (req, file, cb) => {
        const uniqueId = crypto.randomBytes(8).toString('hex');
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${uniqueId}_${safeName}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: Infinity }
});

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// File metadata storage
const fileMetadata = new Map();

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', storage: 'local-disk' });
});

// Upload file
app.post('/api/rooms/:roomId/files', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const roomId = req.params.roomId;
        const fileId = crypto.randomBytes(8).toString('hex');

        const fileInfo = {
            id: fileId,
            name: req.file.originalname,
            size: req.file.size,
            type: req.file.mimetype,
            path: req.file.path,
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
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Get files
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

// Download file
app.get('/api/rooms/:roomId/files/:fileId', (req, res) => {
    const { roomId, fileId } = req.params;
    const roomFiles = fileMetadata.get(roomId);
    
    if (!roomFiles) {
        return res.status(404).json({ error: 'File not found' });
    }

    const file = roomFiles.get(fileId);
    if (!file) {
        return res.status(404).json({ error: 'File not found' });
    }

    if (!fs.existsSync(file.path)) {
        return res.status(404).json({ error: 'File not found on disk' });
    }

    res.sendFile(file.path);
});

// Delete file
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

    // Delete from disk
    if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
    }

    roomFiles.delete(fileId);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Xtremsy file storage server running on port ${PORT}`);
    console.log(`Using local disk storage (Render free tier)`);
});
