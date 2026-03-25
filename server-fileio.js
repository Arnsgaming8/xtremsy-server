/**
 * Xtremsy Files - File Storage using file.io
 * 
 * file.io is a free file hosting service:
 * - No account needed
 * - No size limit
 * - Files stored for 24 hours (then deleted)
 * - Completely free!
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// File metadata storage
const fileMetadata = new Map();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '500mb' }));

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

        console.log(`Uploading ${req.file.originalname} (${req.file.size} bytes) to file.io...`);

        // Upload to file.io
        const result = await uploadToFileIO(req.file.buffer, req.file.originalname, req.file.mimetype);

        if (!result.success) {
            console.error('file.io error:', result);
            return res.status(500).json({ error: 'Failed to upload: ' + (result.error || 'Unknown error') });
        }

        console.log(`Uploaded successfully: ${result.url}`);

        // Store metadata
        const fileInfo = {
            id: fileId,
            name: req.file.originalname,
            type: req.file.mimetype,
            size: req.file.size,
            link: result.url,
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

// Upload to file.io
function uploadToFileIO(buffer, filename, mimetype) {
    return new Promise((resolve) => {
        const boundary = '----FormBoundary' + crypto.randomBytes(16).toString('hex');
        
        const header = Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="file\"; filename="${filename}"\r\n` +
            `Content-Type: ${mimetype}\r\n\r\n`
        );
        
        const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
        
        const postData = Buffer.concat([header, buffer, footer]);
        
        const options = {
            hostname: 'file.io',
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': postData.length
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.success && json.link) {
                        resolve({ success: true, url: json.link });
                    } else {
                        resolve({ success: false, error: json.message || 'Upload failed' });
                    }
                } catch(e) {
                    resolve({ success: false, error: data });
                }
            });
        });
        
        req.on('error', (e) => {
            resolve({ success: false, error: e.message });
        });
        
        req.write(postData);
        req.end();
    });
}

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

// Download file - proxy from file.io
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

    // Fetch from file.io and stream to client
    https.get(file.link, (fileRes) => {
        res.setHeader('Content-Type', file.type);
        res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
        fileRes.pipe(res);
    }).on('error', (e) => {
        res.status(500).json({ error: 'Failed to download file' });
    });
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
    console.log(`Xtremsy file storage server running on port ${PORT}`);
    console.log(`Using file.io - FREE storage!`);
});
