/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/record', 'N/search', 'N/runtime'],
    (record, search) => {
        /**
        * Retrieves the input data for the Map/Reduce script.
        * @return {Array|Object|search.ResultSet|search.Result[]|String} - The input data.
        */
        const getInputData = (inputContext) => {
            try{
                var recordSearch = search.load({id: 'customsearch_mfc_so_billing'});
                return recordSearch;
            }
            catch(e){
                log.error('Error in Get Input Data stage', e);
            }
        };

        /**
        * Processes each data input in the Map stage.
        * @param {map.Context} context
        */
        const map = (context) => {
            var searchResult = JSON.parse(context.value);
            var id = searchResult.values["GROUP(internalid)"].value;
            var date = searchResult.values["MAX(trandate.applyingTransaction)"];
            context.write({
                key: id,
                value: date
            });
        };

        /**
        * Processes the mapped data in the Reduce stage.
        * @param {reduce.Context} context
        */
        const reduce = (context) => {
            try{
                var id = context.key;
                var date = context.values[0];
                log.debug('Reduce Log: Invoice Log: ID & Date', id +' - '+date);
                let fulfill_date = new Date(date);

                // Transform sales order to invoice 
                let inv = record.transform({
                    fromType: record.Type.SALES_ORDER,
                    fromId: id,
                    toType: record.Type.INVOICE,
                    isDynamic: true
                });

                // Set field values
                inv.setValue({
                    fieldId: 'trandate',
                    value: fulfill_date
                });

                // Submit record
                var invId = inv.save();
            }
            catch(e){
                log.debug('Sales Order ID Error' + id, e);
            }
        }

        return {
            getInputData: getInputData,
            map: map,
            reduce: reduce
        };
    });
