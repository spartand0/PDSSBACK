const { upload } = require('../helpers/upload'); // Replace with the correct path to your upload module
const fs = require('fs');

jest.mock('fs');

describe('upload', () => {
	let req;
	let file;
	let cb;

	beforeEach(() => {
		req = {
			body: {
				session: '0776080d6144d387fe7da83bfd020f9206218c8b',
				filename: '0776080d6144d387fe7da83bfd020f9206218c8b-123456789.jpeg',
				filepath: `files/uploads/0776080d6144d387fe7da83bfd020f9206218c8b`
			}
		};

		file = {
			mimetype: 'image/jpeg'
		};

		cb = jest.fn();
	});

	it('should set req.body.filename and req.body.filepath correctly', () => {
		const date = 123456789; // Replace with the desired date value

		fs.mkdirSync.mockImplementation((path, options) => {
			expect(path).toBe(`files/uploads/${req.body.session}/`);
			expect(options).toEqual({ recursive: true });
		});

		upload.storage.destination(req, file, cb);

		expect(fs.mkdirSync).toHaveBeenCalledTimes(1);

		upload.storage.filename(req, file, cb);

		expect(cb).toHaveBeenCalledTimes(1);
		expect(cb).toHaveBeenCalledWith(null, `${req.body.session}-${date}.${file.mimetype.split('/')[1]}`);

		expect(req.body.filename).toBe(`${req.body.session}-${date}.${file.mimetype.split('/')[1]}`);
		expect(req.body.filepath).toBe(`files/uploads/${req.body.session}/`);
	});
});
