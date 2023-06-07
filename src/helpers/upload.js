const multer = require('multer');
const fs = require('fs');
const maxFileSize = 5242880;
const maxContentLength = maxFileSize + 100; // Add a buffer to the max file size

const storage = multer.diskStorage({
	destination(req, file, cb) {
		const path = `files/uploads/${req.body.session}/`;
		fs.mkdirSync(path, { recursive: true });
		cb(null, path);
	},
	limits: {
		fileSize: maxFileSize
	},
	filename(req, file, cb) {
		const date = Date.now();
		cb(null, `${req.body.session}-${date}.${file.mimetype.split('/')[1]}`);
		req.body.filename = `${req.body.session}-${date}.${file.mimetype.split('/')[1]}`;
		req.body.filepath = `files/uploads/${req.body.session}/`;
	}
});

const upload = multer({
	storage,
	limits: {
		fileSize: maxFileSize
	},
	fileFilter(req, file, cb) {
		try {
			if (file.size <= maxFileSize) {
				cb(null, true);
			} else {
				throw new Error('File size exceeds the limit.');
			}
		} catch (error) {
			console.log('Error:', error);
			cb(error);
		}
	}
});

module.exports = { upload };
