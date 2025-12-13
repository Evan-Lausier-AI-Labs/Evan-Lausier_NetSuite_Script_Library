/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
define(['N/sftp', 'N/file'],
    function(sftp, file) {
		
        function execute(context) {
            var connection = createConnection(sftp);
            
            var myFileToUpload = file.create({
                name : 'originalname.txt',
                fileType : file.Type.PLAINTEXT,
                contents : 'I am a test file. Hear me roar.'
            });
            
            var fileObj = file.load({
                id: '10540'
            });
            
            myFileToUpload = fileObj;
            
            connection.upload({
                file : myFileToUpload
            });
        }

        return {
            execute: execute
        };
    }
);

function uploadFile(connection, file){
    var myFileToUpload = file.create({
        name : 'originalname.txt',
        fileType : file.Type.PLAINTEXT,
        contents : 'I am a test file. Hear me roar.'
    });
    
    connection.upload({
        directory : 'toupload',
        filename : 'uploadtest.txt',
        file : myFileToUpload,
        replaceExisting : true
    });
}

function downloadFile(connection){
    var downloadedFile = connection.download({
        filename : '102.txt'
    });
    downloadedFile.folder = 1059;
    downloadedFile.save();
}

function createConnection(sftp){
    var myPwdGuid = "8b9b2a859199444898c01e20de3028c2";
    var myHostKey = "AAAAB3NzaC1yc2EAAAADAQABAAABgQCqdCk8N46BPopvEoflggoABjyCdxXQZaZuTh0EOgjxsDlrF+RQWOYJutlZzbvdgzHGnGNqFV2tzVSpwiZuF4kK90xxclbOpJNcyZMw+vndZ2CtvxBp59MkJPR0jQnEKuB60kxQvSJBv5Ld0j44pZ/B+To3RwSeudqJ6XTrvlQ/QmS0MbOZFQrwM4AbU2uh+ktkPQVmnv96xnR2EJkaIumq/DVFhNH0tvPb2G+oLHz1oknWuWix4E3Q2TwJU15hQ226KqvvQ4gRUwJnGCQG8SLdCY19UxcmarrwDchlySzAXYa6KWz97t3M4apZt1pI9IksBKXApbhZFrh+WQeyX/RcokUsD38iGHqqceM5n+gfdSktwmu2UpI7cHe3M+SMdTBrilW+WJfBEiQAwaXgLN37hV38aa1Ak2AHTJUVyy4lgyhMxrRm/FIT/qb2upjz6LTkshPLmpRatpGzRItYO+S8++6gmJYB0ojb8rPYh1DgfQEJRx9fk2wmSzL/KzCZ/1s=";

    var connection = sftp.createConnection({
        username : 'vaccount1',
        passwordGuid : myPwdGuid,
        url : 'markoramius.myftp.biz',
        directory : 'toupload',
        hostKey : myHostKey
    });
    
    return connection;
}
