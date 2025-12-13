/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/record', 'N/log', 'N/search', 'N/format'],
	function(record, log, search, format) {

		function afterSubmit(context) {
			try {

				if (context.type == context.UserEventType.DELETE)
					return;

				var responseRecId = context.newRecord.id;
				var responseRecObj = context.newRecord;

				var soId = responseRecObj.getValue('custrecord_4p_salesorder_idnew');
				var soLineId = responseRecObj.getValue('custrecord_4p_line_idnew');
				var responseRecStatus = responseRecObj.getValue('custrecord_4p_success');
				log.debug('Resp rec values', JSON.stringify({
					soId: soId,
					soLineId: soLineId,
					responseRecStatus: responseRecStatus
				}))

				var soRecObj = record.load({
					type: 'salesorder',
					id: soId
				});
                var lineNumber = soRecObj.findSublistLineWithValue({
                    sublistId: 'item',
                    fieldId: 'line',
                    value: soLineId
                });
                log.debug('LineNumber', JSON.stringify({
					lineNumber: lineNumber
				}))
				soRecObj.setSublistValue({
					sublistId: 'item',
                    line: lineNumber,
					fieldId: 'custcol_mfc_so_sent_to_3pl',
					value: true
				});

				var savedSOId = soRecObj.save(true, true);
				log.debug('savedSOId', savedSOId)
				if (savedSOId) {
					record.submitFields({
						type: 'customrecord_4p_3plresponse',
						id: responseRecId,
						values: {
							custrecord_4p_processed: true
						}
					})
				}

			} catch (e) {
				log.error('error in afterSubmit', e)
			}
		}

		return {
			afterSubmit: afterSubmit
		};
	});
