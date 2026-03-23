/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 *
 * ICJE Provider Bulk Update
 *
 * Reads a CSV file from the File Cabinet containing ICJE transaction line
 * updates, matches each line by uniquekey, sets the Provider custom field,
 * and saves the record. Designed to handle 44K+ lines across ~8K transactions.
 *
 * BEFORE DEPLOYING:
 * 1. Set PROVIDER_FIELD_ID to the correct transaction line custom field ID.
 *    Find it at: Customization > Lists, Records & Fields > Transaction Line Fields
 *    Search for "Provider" and copy the Field ID (e.g. custcol_provider).
 * 2. Upload the source CSV to the File Cabinet and set CSV_FILE_CABINET_ID
 *    to that file's internal ID.
 * 3. Create a Map/Reduce script record pointing to this file.
 *    Recommended deployment settings: Yield Point every 50 records.
 *
 * CSV FORMAT (zero-indexed column positions, header row on row 1):
 *   0  Internal ID       - transaction internal ID
 *   1  Document Number
 *   2  Line ID
 *   3  Line Unique Key   - transactionline.uniquekey (used for line matching)
 *   4  Date
 *   5  JE Acct
 *   6  JE Amt
 *   7  Amount
 *   8  Department
 *   9  Region Site
 *   10 Practice/Business Unit
 *   11 Related Vendor Bill
 *   12 bill #
 *   13 full string
 *   14 Provider          - value to write to PROVIDER_FIELD_ID
 *
 * PROCESSING:
 *   getInputData  - reads CSV, emits one entry per row keyed by transaction ID
 *   map           - passes each row through keyed on transaction internal ID
 *   reduce        - loads each ICJE once, updates all matching lines, saves once
 *   summarize     - logs totals and any errors to the script execution log
 */

define(['N/record', 'N/file', 'N/log'], (record, file, log) => {

  /*
   * -------------------------------------------------------------------------
   * CONFIGURATION -- fill these in before deploying
   * -------------------------------------------------------------------------
   */

  /* Internal ID of the Provider transaction line custom field.
   * Example: 'custcol_provider'
   * Find at: Customization > Lists, Records & Fields > Transaction Line Fields */
  const PROVIDER_FIELD_ID = 'FILL_IN_PROVIDER_FIELD_ID';

  /* Internal ID of the CSV file in the NetSuite File Cabinet.
   * Upload the source CSV first, then paste the file internal ID here. */
  const CSV_FILE_CABINET_ID = 'FILL_IN_FILE_CABINET_ID';

  /* -------------------------------------------------------------------------
   * END CONFIGURATION
   * -------------------------------------------------------------------------
   */

  const getInputData = () => {
    log.debug('getInputData', `Reading file ID ${CSV_FILE_CABINET_ID}`);

    const csvFile   = file.load({ id: CSV_FILE_CABINET_ID });
    const csvLines  = csvFile.getContents().split('\n');
    const results   = [];

    /* Skip header row (index 0) */
    for (let i = 1; i < csvLines.length; i++) {
      const raw = csvLines[i].trim();
      if (!raw) continue;

      const cols         = raw.split(',');
      const transId      = cols[0]  ? cols[0].trim()  : null;
      const uniqueKey    = cols[3]  ? parseInt(cols[3].trim(), 10) : null;
      const providerVal  = cols[14] ? cols[14].trim() : null;

      if (!transId || !uniqueKey || !providerVal) {
        log.audit('getInputData:skip', `Row ${i} missing required fields: transId=${transId} uniqueKey=${uniqueKey} provider=${providerVal}`);
        continue;
      }

      results.push({
        transId    : transId,
        uniqueKey  : uniqueKey,
        provider   : providerVal
      });
    }

    log.debug('getInputData', `Total rows to process: ${results.length}`);
    return results;
  };

  const map = (context) => {
    /* Key on transaction internal ID so all lines for a transaction
     * are grouped together in the reduce stage. */
    const row = JSON.parse(context.value);
    context.write({
      key   : row.transId,
      value : JSON.stringify({
        uniqueKey : row.uniqueKey,
        provider  : row.provider
      })
    });
  };

  const reduce = (context) => {
    const transId    = context.key;
    const lineValues = context.values.map(v => JSON.parse(v));

    /* Build a lookup map of uniqueKey -> provider for fast line matching */
    const updateMap = {};
    lineValues.forEach(lv => {
      updateMap[lv.uniqueKey] = lv.provider;
    });

    try {
      const transRecord = record.load({
        type               : record.Type.INTER_COMPANY_JOURNAL_ENTRY,
        id                 : parseInt(transId, 10),
        isDynamic          : false
      });

      const lineCount  = transRecord.getLineCount({ sublistId: 'line' });
      let   linesUpdated = 0;

      for (let i = 0; i < lineCount; i++) {
        const lineUniqueKey = transRecord.getSublistValue({
          sublistId : 'line',
          fieldId   : 'uniquekey',
          line      : i
        });

        if (updateMap[lineUniqueKey]) {
          transRecord.setSublistValue({
            sublistId : 'line',
            fieldId   : PROVIDER_FIELD_ID,
            line      : i,
            value     : updateMap[lineUniqueKey]
          });
          linesUpdated++;
        }
      }

      if (linesUpdated > 0) {
        transRecord.save({ ignoreMandatoryFields: true });
        log.audit('reduce:saved', `Transaction ${transId}: updated ${linesUpdated} of ${lineCount} lines`);
      } else {
        log.audit('reduce:noMatch', `Transaction ${transId}: no matching uniquekeys found in record`);
      }

    } catch (e) {
      /* Non-fatal: log and continue to next transaction */
      log.error('reduce:error', `Transaction ${transId} failed: ${e.message}`);
    }
  };

  const summarize = (summary) => {
    log.audit('summarize:inputStage',  `Errors: ${summary.inputSummary.error}`);
    log.audit('summarize:mapStage',    `Errors: ${summary.mapSummary.errors.iterator().hasNext()}`);
    log.audit('summarize:reduceStage', `Errors: ${summary.reduceSummary.errors.iterator().hasNext()}`);
    log.audit('summarize:totalTime',   `${summary.seconds} seconds`);
    log.audit('summarize:usageUnits',  `${summary.usage}`);

    /* Log any reduce errors */
    summary.reduceSummary.errors.iterator().each((key, error) => {
      log.error('summarize:reduceError', `Key: ${key} | Error: ${error}`);
      return true;
    });

    log.audit('summarize', 'ICJE Provider update complete.');
  };

  return { getInputData, map, reduce, summarize };
});
