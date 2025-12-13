/*
* postSubmitFunction stub:
*
* The name of the function can be changed to anything you like.
*
* The function will be passed one 'options' argument that has the following fields:
*  'preMapData' - an array of records representing the page of data before it was mapped.
*  'postMapData' - an array of records representing the page of data after it was mapped.
*  'responseData' - an array of responses for the page of data that was submitted to the import application.
*    'statusCode' - 200 is a success.  422 is a data error.  403 means the connection went offline.
*    'errors' - [{code: '', message: '', source: ''}]
*    'ignored' - true if the record was filtered/skipped, false otherwise.
*    'id' - the id from the import application response.
*    '_json' - the complete response data from the import application.
*    'dataURI' - if possible, a URI for the data in the import application (populated only for errored records).
*  '_importId' - the _importId currently running.
*  '_connectionId' - the _connectionId currently running.
*  '_flowId' - the _flowId currently running.
*  '_integrationId' - the _integrationId currently running.
*  'settings' - all custom settings in scope for the import currently running.
*
* The function needs to return the responseData array provided by options.responseData.
* Throwing an exception will fail the entire page of records.
*/

// Fulfillment split script v2

function postSubmit (options) {
  return options.responseData
}

/*
* postMapFunction stub:
*
* The function will be passed one argument 'options' that has the following fields:
*   'preMapData' - an array of records representing the page of data before it was mapped.
*   'postMapData' - an array of records representing the page of data after it was mapped.
*   '_importId' - the _importId currently running.
*   '_connectionId' - the _connectionId currently running.
*   '_flowId' - the _flowId currently running.
*   '_integrationId' - the _integrationId currently running.
*   'settings' - all custom settings in scope for the import currently running.
*
* The function needs to return an array, and the length MUST match the options.data array length.
* Each element in the array represents the actions that should be taken on the record at that index.
* Each element in the array should have the following fields:
*   'data' - the modified/unmodified record that should be passed along for processing.
*   'errors' - used to report one or more errors for the specific record.
* Returning an empty object {} for a specific record will indicate that the record should be ignored.
* Throwing an exception will fail the entire page of records.
*/

// Enlinx integration

function postResponseMap (options) {
  return options.postResponseMapData.map((newJSONObj) => {
   
    var data = options.postResponseMapData[0].data;
    var newDataObj = [];

    for (var i = 0; i < data.length; i++) {
      for (var m = 0; m < data[i].lineItems.length; m++) {
        var key = Object.keys(data[i]);
        var tempObj = {}
        for (var k = 0; k < key.length; k++) {
          tempObj[key[k]] = data[i][key[k]]
        }
        delete tempObj.lineItems;
       
        tempObj['lineItems'] = [];
        tempObj.lineItems.push(data[i].lineItems[m])
        tempObj['externalIdNew'] = data[i].lineItems[m]['externalLineId'].split('_')[0];
        tempObj['LineIDNew'] = data[i].lineItems[m]['externalLineId'].split('_')[1];     
       
        newDataObj.push(tempObj)
      }
    }

    return {
      "final_response_data": newDataObj
    };
  })
}
