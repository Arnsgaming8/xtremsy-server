const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
        // Use unique ID + original name
        const uniqueId = crypto.randomBytes(8).toString('hex');
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${uniqueId}_${safeName}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: Infinity } // No limit
});

app.use(cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// File metadata storage (in memory for now - could use database)
const fileMetadata = new Map();

// Upload file endpoint
app.post('/api/rooms/:roomId/files', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const roomId = req.params.roomId;
        const fileData = {
            id: crypto.randomBytes(8).toString('hex'),
            name: req.file.originalname,
            size: req.file.size,
            type: req.file.mimetype,
            path: req.file.path,
            uploadedAt: Date.now(),
            expiresAt: Date.now() + (2 * 24 * 60 * 60 * 1000) // 2 days
        };

        // Store metadata
        if (!fileMetadata.has(roomId)) {
            fileMetadata.set(roomId, new Map());
        }
        fileMetadata.get(roomId).set(fileData.id, fileData);

        res.json({
            success: true,
            file: {
                id: fileData.id,
                name: fileData.name,
                size: fileData.size,
                type: fileData.type,
                url: `/api/rooms/${roomId}/files/${fileData.id}`,
                uploadedAt: fileData.uploadedAt,
                expiresAt: fileData.expiresAt
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Get files for a room
app.get('/api/rooms/:roomId/files', (req, res) => {
    const roomId = req.params.roomId;
    const roomFiles = fileMetadata.get(roomId);
    
    if (!roomFiles) {
        return res.json({ files: [] });
    }

    const now = Date.now();
    const files = Array.from(roomFiles.values())
        .filter(f => f.expiresAt > now)
        .map(f => ({
            id: f.id,
            name: f.name,
            size: f.size,
            type: f.type,
            url: `/api/rooms/${roomId}/files/${f.id}`,
            uploadedAt: f.uploadedAt,
            expiresAt: f.expiresAt
        }));

    res.json({ files });
});

// Download/view file
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

    // Check if expired
    if (file.expiresAt < Date.now()) {
        roomFiles.delete(fileId);
        return res.status(410).json({ error: 'File expired' });
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

// Clean up expired files (run periodically)
function cleanupExpiredFiles() {
    const now = Date.now();
    for (const [roomId, roomFiles] of fileMetadata) {
        for (const [fileId, file] of roomFiles) {
            if (file.expiresAt < now) {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
                roomFiles.delete(fileId);
            }
        }
    }
}

// Clean up every hour
setInterval(cleanupExpiredFiles, 60 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`Xtremsy server running on port ${PORT}`);
});
