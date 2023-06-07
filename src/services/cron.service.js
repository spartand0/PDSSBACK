const { execute } = require('../providers/db');
const { SQL } = require('../../config');
const fs = require('fs');
const path = require('path');

// Changes made and reasons for the changes:

// Converted the exported function to an arrow function and changed the export style: This change is made to maintain a consistent coding style throughout the codebase, as arrow functions are more modern and have a more concise syntax.

// Replaced the fs.statSync() and fs.unlinkSync() functions with their asynchronous counterparts, fs.promises.stat() and fs.promises.unlink(): This change is made to avoid blocking the event loop with synchronous I/O operations, which can negatively impact performance.

// Added missing semicolons and removed extra line breaks: This change is made to improve the code's readability and maintain a consistent style.

// These changes don't affect the functionality of the code but improve its readability, consistency, and performance.

const permanentDeleteRecordsCron = async () => {
	const root = path.join(__dirname, '../../files/uploads/');
	const now = Date.now();
	const sixMonthsDuration = now - 100;

	try {
		const directories = await fs.promises.readdir(root);

		for (const directory of directories) {
			const directoryPath = path.join(root, directory);
			const files = await fs.promises.readdir(directoryPath);

			for (const file of files) {
				try {
					const filePath = path.join(directoryPath, file);
					const stats = await fs.promises.stat(filePath);
					const modifiedAt = stats.mtime.getTime();

					if (modifiedAt < sixMonthsDuration) {
						await fs.promises.unlink(filePath);
						await execute(SQL.recordQueries.removeRecords(file));
					}
				} catch (error) {
					console.error(error);
				}
			}
		}
	} catch (error) {
		console.error(error);
	}
};

module.exports = {
	permanentDeleteRecordsCron
};
