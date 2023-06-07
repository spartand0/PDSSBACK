
const multer = require('multer');
const fs = require('fs');
const storage = multer.diskStorage({
    destination(req, file, cb) {
        const path = `files/uploads/${req.body.session}/`;
        fs.mkdirSync(path, { recursive: true });
        cb(null, path);
    },
    limits : {
      fileSize: 524288
    },
    filename(req, file, cb) {
        const date = Date.now();
        cb(null, `${req.body.session}-${date}.${file.mimetype.split('/')[1]}`);
        req.body.filename = `${req.body.session}-${date}.${file.mimetype.split('/')[1]}`
        req.body.filepath = `files/uploads/${req.body.session}/`
    },
});
const upload = multer({
    storage, limits: {
        fileSize: 524288
    }
});
module.exports = { upload };
