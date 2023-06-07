const { execute } = require('../providers/db');
const { SQL } = require('../../config');
const { CryptoProviders } = require('../helpers/properties');
const { getAnalysesResultScores } = require('./evaluation.service');
const moment = require('moment/moment');
const { formatAccordionData } = require('../helpers');

module.exports = {
	getDiagnostics: async function () {
		let data = await execute(SQL.diagnosticsQueries.getDiagnostics);

		return data[0];
	},
	getDiagnosticDetails: async function (diagnosisId, session) {
		// get the existing session of the diagnosis
		const existingSession = await execute(SQL.diagnosticsQueries.getDiagnosisSessionDetails(session));
		const childAgeInMonths = existingSession?.[0]?.[0]?.child_age_in_months;
		const sessionStartedStatus = existingSession?.[0]?.[0]?.started;

		// get diagnosis details for the given diagnosisId and childAgeInMonths
		let data = await execute(
			SQL.diagnosticsQueries.getDiagnosisDetails(diagnosisId, childAgeInMonths, sessionStartedStatus)
		);

		if (session) {
			// get details of the current session
			const sessionDetails = await execute(SQL.diagnosticsQueries.getDiagnosisSessionDetails(session));

			// assign the session details to the diagnosis details
			Object.assign(data[0]?.[0], { session: sessionDetails[0]?.[0] });
		}

		return await data[0];
	},

	getDiagnosticGroups: async function (query) {
		// Create a connection to the database

		// Fetch the diagnostic groups from the database
		let data = await execute(SQL.diagnosticsQueries.getDiagnosticGroups);

		// If there are any diagnostic groups, fetch their details
		if (data[0].length > 0) {
			// Use Promise.all to execute all the database queries concurrently
			await Promise.all(
				data[0].map(async (group, index) => {
					let req;
					if (query.childId) {
						// Fetch the diagnostic groups details by child ID
						req = SQL.diagnosticsQueries.getDiagnosticGroupsDetailsByChild(group.id, query.childId);
					} else {
						// Fetch the diagnostic groups details by group ID
						req = SQL.diagnosticsQueries.getDiagnosticGroupsDetails(group.id);
					}
					// Fetch the diagnostic results for the group
					let diagResult = await execute(req);
					// Attach the diagnostic results to the group object
					data[0][index].diagnostics = diagResult[0];
				})
			);
		}

		// Release the database connection

		// Return the diagnostic groups with their details
		return data[0];
	},

	getDiagnosticSessions: async function (userId, query) {
		// Establish a database connection

		// Build the SQL query to fetch diagnostic sessions based on user ID and query parameters
		let sql = SQL.diagnosticsQueries.diagnosticSessions.getDiagnosticSession(userId);

		// Append query parameters to the SQL query if they exist
		if (query.childId) sql += SQL.diagnosticsQueries.diagnosticSessions.withChild(query.childId);
		if (query.diagnosisId) sql += SQL.diagnosticsQueries.diagnosticSessions.withDiagnosis(query.diagnosisId);
		if (query.searchFor && query.searchFor != '')
			sql += SQL.diagnosticsQueries.diagnosticSessions.withSearch(query.searchFor);

		// Set the order of the results based on the "orderBy" query parameter, or default to descending order by date initialized
		let order_by = query.orderBy ? query.orderBy : 'diagnostic_session.date_initialized desc';
		sql += SQL.diagnosticsQueries.diagnosticSessions.orderBy(order_by);

		// Execute the SQL query to fetch diagnostic sessions, and release the database connection
		let data = await execute(sql);

		// Return the results of the SQL query
		return data[0];
	},
	deleteDiagnosticSessionById: async function (sessionId) {
		// Get a database connection

		// Execute the query to delete the diagnostic session with the specified ID
		let data = await execute(SQL.diagnosticsQueries.deleteDiagnosticSessionById(sessionId));
		// Release the connection back to the connection pool

		// Return the deleted data
		return data[0];
	},
	InsetDiagnosticSession: async function (data) {
		// execute the query to insert the diagnostic session data
		let response = await execute(SQL.diagnosticsQueries.insertSession(data));

		// if the response is truthy (i.e., a row was inserted), update the session token
		if (response) {
			let session = CryptoProviders(JSON.stringify({ sessionId: response[0].insertId })).token();
			await execute(
				SQL.diagnosticsQueries.updateSessionToken({
					id: response[0].insertId,
					body: { session }
				})
			);

			// add the session token to the response data
			response[0].session = session;
		}

		// release the connection and return the response data

		return response[0];
	},
	updateDiagnosticSession: async function (id, body, session) {
		try {
			if (body?.status === 'finished') {
				Object.assign(body, { date_finished: moment().format('YYYY-MM-DD HH:mm:ss') });
			} else if (body?.status === 'paused') {
				Object.assign(body, { date_paused: moment().format('YYYY-MM-DD HH:mm:ss') });
			} else if (body?.status === 'played') {
				Object.assign(body, { date_played: moment().format('YYYY-MM-DD HH:mm:ss') });
			} else if (body?.status === 'canceled') {
				Object.assign(body, { date_canceled: moment().format('YYYY-MM-DD HH:mm:ss') });
			}

			// Remove old results if initializing in practice mode
			if (body.contentIds && body?.status === 'initialized') {
				for (const contentId of body.contentIds) {
					await execute(SQL.diagnosticsQueries.deleteDiagnosticResult(session, contentId));
				}
				delete body.contentIds; // Remove unused content ID from update body
			}

			let response = await execute(SQL.diagnosticsQueries.updateSessionToken({ id, body, session }));

			// Save last completed session as default
			if (body.status && body.status == 'finished') {
				await this.addDiagnosisResultAnalyses(session);
			}

			return response[0];
		} catch (e) {
			console.log(e);
		}
	},

	getDiagnosticContentByDiagnosticId: async function (id, session) {
		// Establish a connection to the database

		// Get session details to extract child age in months
		let sessionDetails = await execute(SQL.diagnosticsQueries.getDiagnosisSessionDetails(session));
		let childAgeInMonths = sessionDetails?.[0]?.[0]?.child_age_in_months;

		// Get the question IDs for diagnostic extensions, if any
		let questionIds = await execute(SQL.diagnosticsQueries.getDiagnosticExtendsIds(id, session, childAgeInMonths));

		// Check if the diagnostic has any extensions
		let hasDiagnosticExtension = false;
		if (questionIds?.[0]?.[0]?.answer_ids && questionIds?.[0]?.[0]?.answer_ids.length > 0) {
			hasDiagnosticExtension = true;
		}

		// Get the diagnostic content
		let response = await execute(
			SQL.diagnosticsQueries.getDiagnosisContent(
				id,
				session,
				childAgeInMonths,
				questionIds?.[0]?.[0]?.answer_ids,
				hasDiagnosticExtension
			)
		);

		// Check if the diagnostic has ID 5, which requires additional processing
		if (id == 5) {
			// Map over the response and process the additional content
			let additionalResult = await Promise.all(
				response[0].map(async content => {
					// Query all additional question data including stand classifications  details
					let data = await execute(
						SQL.diagnosticsQueries.getDiagnosisExtendedQuestionContent(session, content?.id)
					);

					// Query the selected classifications
					let selectedClassification = await execute(
						SQL.diagnosticsQueries.getDiagnosisClassificationQuestionContent(session, content?.id)
					);

					// Create an object to store the classification results
					let classificationAnswers = { classificationResults: [] };

					// Separate classifications with other questions details
					let othersQuestions = data[0].filter(item =>
						['text', 'checkbox', 'classification'].includes(item.type)
					);

					// Combine all classifications results into a single result object
					selectedClassification[0]
						.sort((a, b) => a.belonging_id - b.belonging_id)
						.forEach(({ additional, answer, belonging_id, id }) =>
							classificationAnswers.classificationResults.push({ id, answer, belonging_id, additional })
						);

					return {
						...content,
						// Merge all questions with classifications answers
						extraContent: [...othersQuestions, classificationAnswers]
					};
				})
			);

			response[0] = additionalResult;
		}
		// Check if the diagnostic has ID 9 or 10, which requires additional processing
		if (id == 10 || id == 9) {
			let additionalResult = await Promise.all(
				response[0].map(async content => {
					// Query all additional question data including extended question for evaluation
					let data = await execute(
						SQL.diagnosticsQueries.getDiagnosisExtendedQuestionContent(session, content?.id)
					);
					return {
						...content,
						extraContent: [...data[0]]
					};
				})
			);
			response[0] = additionalResult;
		}
		// Release the connection to the database

		// Return the diagnostic content
		return response[0];
	},

	addDiagnosisResult: async function (content, body) {
		let data;

		try {
			// If additional content is provided, update the classification additional option
			if (body.additionalContent) {
				data = await execute(
					SQL.diagnosticsQueries.DiagnosticUpdateClassificationAdditionalOption(
						body.additionalContent.id,
						body.additionalContent.value
					)
				);
			}
			// If extra content is provided, update or set a new extras question result
			else if (body.extraContent) {
				// for diagnostic 5 when adding extended answer progress bar should change
				if (body.result) {
					// Check if the diagnostic result already exists
					let check = await execute(
						SQL.diagnosticsQueries
							.DiagnosticResultQueries(body.session, content, body.result)
							.checkForExistingItem()
					);

					// If it does, update the result
					if (check[0].length > 0) {
						data = await execute(
							SQL.diagnosticsQueries.DiagnosticResultQueries(body.session, content, body.result).update()
						);
					}
					// Otherwise, set a new result
					else {
						data = await execute(
							SQL.diagnosticsQueries
								.DiagnosticResultQueries(body.session, content, body.result)
								.setNewOne()
						);
					}
				}
				// Check if the extras question result already exists
				let check = await execute(
					SQL.diagnosticsQueries
						.DiagnosticExtrasQuestionResultQueries(body.session, content, body.extraContent)
						.checkForExistingItem()
				);

				// If it does, update the result
				if (check[0].length > 0) {
					data = await execute(
						SQL.diagnosticsQueries
							.DiagnosticExtrasQuestionResultQueries(body.session, content, body.extraContent)
							.update()
					);
				}

				// Otherwise, set a new result
				else {
					data = await execute(
						SQL.diagnosticsQueries
							.DiagnosticExtrasQuestionResultQueries(body.session, content, body.extraContent)
							.setNewOne()
					);
				}
			}
			// If an extended result is provided, update or set a new extended result
			else if (body.extended) {
				// Get the details of the extended result for the given session and diagnostic
				let extendedResult = await execute(
					SQL.diagnosticsQueries.getDiagnosticExtendedResultDetails(body.session, content, body.diagnostic)
				);

				// If no extended result exists, set a new one
				if (extendedResult[0].length === 0) {
					data = await execute(
						SQL.diagnosticsQueries.insetANewExtendedResult(
							body.session,
							content,
							body.diagnostic,
							body.extended
						)
					);
				}
				// Otherwise, update the existing extended result
				else {
					data = await execute(
						SQL.diagnosticsQueries.updateExtendedResult(
							body.session,
							content,
							body.diagnostic,
							body.extended
						)
					);
				}
			}
			// Otherwise, update or set a new diagnostic result
			else if (body.result) {
				// Check if the diagnostic result already exists
				const check = await execute(
					SQL.diagnosticsQueries
						.DiagnosticResultQueries(body.session, content, body.result)
						.checkForExistingItem()
				);

				// If it does, update the result
				if (check[0].length > 0) {
					data = await execute(
						SQL.diagnosticsQueries.DiagnosticResultQueries(body.session, content, body.result).update()
					);
				}
				// Otherwise, set a new result
				else {
					data = await execute(
						SQL.diagnosticsQueries.DiagnosticResultQueries(body.session, content, body.result).setNewOne()
					);
				}
				// custom logic for test2 and test7 to insert extendedResult answers to incorrect if answer is already incorrect
				// for test 2 we set answer_01, answer_03, answer_08,answer_09 to incorrect
				// for test 7 we set answer_01, answer_02, to incorrect
				// correct score in evaluation
				if (body.result.answer === 'incorrect' && (body.diagnostic === 2 || body.diagnostic === 7)) {
					let extendedResult = await execute(
						SQL.diagnosticsQueries.getDiagnosticExtendedResultDetails(
							body.session,
							content,
							body.diagnostic
						)
					);

					// If no extended result exists, set a new one
					if (extendedResult[0].length === 0) {
						// prepare extraData
						const extendedData =
							body.diagnostic === 2
								? {
										'answer_01,answer_03,answer_08,answer_09':
											'incorrect,incorrect,incorrect,incorrect'
								  }
								: { 'answer_01,answer_02': 'incorrect,incorrect' };
						await execute(
							SQL.diagnosticsQueries.insetANewExtendedResult(
								body.session,
								content,
								body.diagnostic,
								extendedData
							)
						);
					}
				}
			}
		} catch (err) {
			console.error(err);
			// Handle the error as needed
		} finally {
			// Release the connection
		}
		return data[0];
	},

	setDiagnosticClassificationResult: async function (session, content, body, questionNumber) {
		// Extract the answer from the request body and sanitize it to prevent SQL injection attacks
		const answer = body.answer ? body.answer.trim().replace(/'/g, "\\'") : '';

		// Check if the answer is not empty
		if (answer) {
			// Prepare the SQL statements for deleting and inserting classification results
			const deleteSql = SQL.diagnosticsQueries
				.DiagnosticExtrasQuestionClassificationResultQueries(
					session,
					content,
					answer.split('.'),
					questionNumber
				)
				.deleteOneByQuestionNumber();

			const insertSql = SQL.diagnosticsQueries
				.DiagnosticExtrasQuestionClassificationResultQueries(
					session,
					content,
					answer.split('.'),
					questionNumber
				)
				.setNewOnes();

			// Use a transaction to ensure atomicity and consistency of the database operations

			try {
				// Delete any existing classification results for the given question number
				await execute(deleteSql);

				// Set the new classification results for the given question number
				await execute(insertSql);
			} catch (err) {
				throw err;
			}
		}
	},
	getDiagnosisSessionById: async function (sessionId) {
		const data = await execute(SQL.diagnosticsQueries.getDiagnosisSessionDetails(sessionId));

		return data[0];
	},

	addDiagnosisResultAnalyses: async function (session) {
		try {
			if (session) {
				// Prepare the request body for getting analysis result scores
				const body = { session: session };

				// Get the analysis result scores and diagnostic session details
				const { scores, diagnostic_session } = await getAnalysesResultScores(body);

				// Update the diagnosis result in the database
				await execute(
					SQL.diagnosticsQueries.updateDiagnosisResult(
						diagnostic_session.diagnostic,
						diagnostic_session.child
					)
				);

				// Loop through the analysis result scores and insert them into the database
				for (const score of scores) {
					let data = {};
					// Prepare the data for insertion based on the score type
					switch (score.type) {
						case 'values':
							let result = {};
							switch (score.scoreName) {
								case 'MLU':
								case 'Vollständigkeit':
								case 'Score A':
								case 'Score B':
									result = {
										values: score.values,
										decimals: score.decimals,
										interpretation: score.interpretation
									};
									break;
								default:
									result = { values: score.values, interpretation: score.interpretation };
							}
							data = result;
							break;
						case 'table':
							data = { head: score.head, values: score.values };
							break;
						case 'message':
							data = { label: score.label, link: score.link };
							break;
						case 'compact_values':
						case 'questions':
						case 'answers':
							data = { values: score.values };
							break;
						case 'accordion':
							data = { accordion: formatAccordionData(score.accordion) };
							break;
						case 'text':
							data = { label: score.label };
							break;
						default:
							data = score.values;
					}

					// Set default values for tvalue and visibility if they are not present
					let tvalue = score.tvalue || 0;
					let visible = score.visible || 'yes';

					// Prepare the SQL statement for inserting the diagnosis result analysis
					const sql = SQL.diagnosticsQueries.insertDiagnosisResult(
						diagnostic_session.diagnostic,
						session,
						diagnostic_session.child,
						score.scoreName,
						score.type,
						visible,
						tvalue,
						data
					);

					// Execute the SQL statement to insert the diagnosis result analysis
					await execute(sql);
				}
			}
		} finally {
			// Release the connection back to the connection pool
		}
	},

	getDiagnosticContentByContentId: async function (id, session, contentId) {
		// Get session details to extract child age in months
		let sessionDetails = await execute(SQL.diagnosticsQueries.getDiagnosisSessionDetails(session));
		let childAgeInMonths = sessionDetails?.[0]?.[0]?.child_age_in_months;

		// Get the question IDs for diagnostic extensions, if any
		let questionIds = await execute(SQL.diagnosticsQueries.getDiagnosticExtendsIds(id, session, childAgeInMonths));

		// Check if the diagnostic has any extensions
		let hasDiagnosticExtension = false;
		if (questionIds?.[0]?.[0]?.answer_ids && questionIds?.[0]?.[0]?.answer_ids.length > 0) {
			hasDiagnosticExtension = true;
		}

		// Get the diagnostic content
		let response = await execute(
			SQL.diagnosticsQueries.getDiagnosisContentByIdContent(
				contentId,
				id,
				session,
				childAgeInMonths,
				questionIds?.[0]?.[0]?.answer_ids,
				hasDiagnosticExtension
			)
		);

		// Check if the diagnostic has ID 5, which requires additional processing
		if (id == 5) {
			// Map over the response and process the additional content
			let additionalResult = await Promise.all(
				response[0].map(async content => {
					// Query all additional question data including stand classifications  details
					let data = await execute(
						SQL.diagnosticsQueries.getDiagnosisExtendedQuestionContent(session, content?.id)
					);

					// Query the selected classifications
					let selectedClassification = await execute(
						SQL.diagnosticsQueries.getDiagnosisClassificationQuestionContent(session, content?.id)
					);

					// Create an object to store the classification results
					let classificationAnswers = { classificationResults: [] };

					// Separate classifications with other questions details
					let othersQuestions = data[0].filter(item =>
						['text', 'checkbox', 'classification'].includes(item.type)
					);

					// Combine all classifications results into a single result object
					selectedClassification[0]
						.sort((a, b) => a.belonging_id - b.belonging_id)
						.forEach(({ additional, answer, belonging_id, id }) =>
							classificationAnswers.classificationResults.push({ id, answer, belonging_id, additional })
						);

					return {
						...content,
						// Merge all questions with classifications answers
						extraContent: [...othersQuestions, classificationAnswers]
					};
				})
			);

			response[0] = additionalResult;
		}
		// Check if the diagnostic has ID 10, which requires additional processing
		if (id == 10 || id == 9) {
			let additionalResult = await Promise.all(
				response[0].map(async content => {
					// Query all additional question data including extended question for evaluation
					let data = await execute(
						SQL.diagnosticsQueries.getDiagnosisExtendedQuestionContent(session, content?.id)
					);
					return {
						...content,
						extraContent: [...data[0]]
					};
				})
			);
			response[0] = additionalResult;
		}

		// Return the diagnostic content
		return response[0];
	},

	getDiagnosticContentForEvaluation: async function (id, session) {
		// Get session details to extract child age in months
		let sessionDetails = await execute(SQL.diagnosticsQueries.getDiagnosisSessionDetails(session));
		let childAgeInMonths = sessionDetails?.[0]?.[0]?.child_age_in_months;

		// Get the question IDs for diagnostic extensions, if any
		let questionIds = await execute(SQL.diagnosticsQueries.getDiagnosticExtendsIds(id, session, childAgeInMonths));

		// Check if the diagnostic has any extensions
		let hasDiagnosticExtension = false;
		if (questionIds?.[0]?.[0]?.answer_ids && questionIds?.[0]?.[0]?.answer_ids.length > 0) {
			hasDiagnosticExtension = true;
		}

		// Get the diagnostic content
		let response = await execute(SQL.diagnosticsQueries.getDiagnosisContentForEval(session, id, childAgeInMonths));
		// Return the diagnostic content
		return response[0];
	}
};
