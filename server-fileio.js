/**
 * Xtremsy Files - Free File Storage Server
 * 
 * Uses file.io API for free file storage (no account needed!)
 * Files are stored on file.io servers - truly unlimited!
 * 
 * Features:
 * - No size limit
 * - Files stored for 24 hours (or forever if never downloaded)
 * - Simple API
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// File metadata storage (maps fileId -> file.io info)
const fileMetadata = new Map();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '100mb' }));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', storage: 'file.io' });
});

// Upload file to file.io
app.post('/api/rooms/:roomId/files', multer({ storage: multer.memoryStorage() }).single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const roomId = req.params.roomId;
        const fileId = crypto.randomBytes(8).toString('hex');

        // Prepare form data for file.io
        const boundary = '----FormBoundary' + crypto.randomBytes(16).toString('hex');
        const fileBuffer = req.file.buffer;
        
        // Build multipart form data
        const formData = Buffer.alloc(4 + boundary.length + fileBuffer.length + 100);
        let offset = 0;
        
        // Add file field
        const header = Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="file"; filename="${req.file.originalname}"\r\n` +
            `Content-Type: ${req.file.mimetype}\r\n\r\n`
        );
        header.copy(formData, offset);
        offset += header.length;
        
        fileBuffer.copy(formData, offset);
        offset += fileBuffer.length;
        
        const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
        footer.copy(formData, offset);

        // Send to file.io
        const postData = formData;
        
        const options = {
            hostname: 'file.io',
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': postData.length
            }
        };

        const result = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch(e) {
                        reject(e);
                    }
                });
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
        });

        if (!result.success) {
            console.error('file.io error:', result);
            return res.status(500).json({ error: 'Failed to upload to file.io' });
        }

        // Store metadata
        const fileInfo = {
            id: fileId,
            name: req.file.originalname,
            type: req.file.mimetype,
            size: req.file.size,
            link: result.link,
            expiresAt: result.expires,
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

// Download/view file - redirect to file.io
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

    // Redirect to file.io download link
    res.redirect(file.link);
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

    roomFiles.delete(fileId);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Xtremsy file.io storage server running on port ${PORT}`);
    console.log(`Files stored on file.io - truly free and unlimited!`);
});
