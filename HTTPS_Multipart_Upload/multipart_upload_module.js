/**
 * multiPartUpload.js
 * @NApiVersion 2.x
 * @NModuleScope SameAccount
 * 
 * Utility module for creating multipart/form-data uploads in NetSuite
 */
define(["require", "exports", "N/https", "N/file", "N/log"], function (require, exports, http, file, log) {
    Object.defineProperty(exports, "__esModule", { value: true });
    
    // MIME type mapping for NetSuite file types
    var types = {};
    types[file.Type.AUTOCAD] = 'application/x-autocad';
    types[file.Type.BMPIMAGE] = 'image/x-xbitmap';
    types[file.Type.CSV] = 'text/csv';
    types[file.Type.EXCEL] = 'application/vnd.ms-excel';
    types[file.Type.FLASH] = 'application/x-shockwave-flash';
    types[file.Type.GIFIMAGE] = 'image/gif';
    types[file.Type.GZIP] = 'application/?x-?gzip-?compressed';
    types[file.Type.HTMLDOC] = 'text/html';
    types[file.Type.ICON] = 'image/ico';
    types[file.Type.JAVASCRIPT] = 'text/javascript';
    types[file.Type.JPGIMAGE] = 'image/jpeg';
    types[file.Type.JSON] = 'application/json';
    types[file.Type.MESSAGERFC] = 'message/rfc822';
    types[file.Type.MP3] = 'audio/mpeg';
    types[file.Type.MPEGMOVIE] = 'video/mpeg';
    types[file.Type.MSPROJECT] = 'application/vnd.ms-project';
    types[file.Type.PDF] = 'application/pdf';
    types[file.Type.PJPGIMAGE] = 'image/pjpeg';
    types[file.Type.PLAINTEXT] = 'text/plain';
    types[file.Type.PNGIMAGE] = 'image/x-png';
    types[file.Type.POSTSCRIPT] = 'application/postscript';
    types[file.Type.POWERPOINT] = 'application/?vnd.?ms-?powerpoint';
    types[file.Type.QUICKTIME] = 'video/quicktime';
    types[file.Type.RTF] = 'application/rtf';
    types[file.Type.SMS] = 'application/sms';
    types[file.Type.STYLESHEET] = 'text/css';
    types[file.Type.TIFFIMAGE] = 'image/tiff';
    types[file.Type.VISIO] = 'application/vnd.visio';
    types[file.Type.WORD] = 'application/msword';
    types[file.Type.XMLDOC] = 'text/xml';
    types[file.Type.ZIP] = 'application/zip';
    
    function getContentType(f) {
        var mime = types[f.fileType];
        var charset = f.encoding;
        var ct = 'Content-Type: ' + mime + (charset ? ';charset=' + charset : '');
        log.debug({ title: 'content for ' + f.name, details: ct });
        return ct;
    }
    
    function isFile(o) {
        return (typeof o == 'object' && typeof o.fileType != 'undefined');
    }
    
    /**
     * Creates a multipart upload
     * @param {string} url - URL to post to
     * @param {object} headers - key/value of headers; include Auth headers if needed
     * @param {array} parts - array of {name:string, value:file|string}
     * @returns {object} HTTP response
     */
    function uploadParts(url, headers, parts) {
        var boundary = 'someuniqueboundaryasciistring';
        headers['content-type'] = 'multipart/form-data; boundary=' + boundary;
        
        // Build body
        var body = [];
        parts.forEach(function (p, idx) {
            var partIsFile = isFile(p.value);
            body.push('--' + boundary);
            body.push('Content-Disposition: form-data; name="' + p.name + '"' + (partIsFile ? ('; filename="' + p.value.name + '"') : ''));
            if (partIsFile) {
                body.push(getContentType(p.value));
            }
            body.push('');
            body.push(partIsFile ? p.value.getContents() : p.value);
            if (idx == parts.length - 1) {
                body.push('--' + boundary + '--');
                body.push('');
            }
        });
        
        // Submit Request
        try {
            var response = http.post({
                url: url,
                headers: headers,
                body: body.join('\r\n')
            });
            return response;
        }
        catch (e) {
            log.error({ title: 'Failed to submit file', details: (e.message || e.toString()) + (e.getStackTrace ? (' \n \n' + e.getStackTrace().join(' \n')) : '') });
        }
    }
    exports.uploadParts = uploadParts;
});
