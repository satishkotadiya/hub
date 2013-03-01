var chai = require('chai');
var expect = chai.expect;
var assert = require('chai').assert;
var superagent = require('superagent');
var crypto = require('crypto');
var request = require('request');
var moment = require('moment');
var async = require('async');
var fs = require('fs');
var http = require('http');


var testRandom = require('./js_testing_utils/randomUtils.js');


// DH Content Types
var appContentTypes = require('./js_testing_utils/contentTypes.js').applicationTypes;
var imageContentTypes = require('./js_testing_utils/contentTypes.js').imageTypes;
var messageContentTypes = require('./js_testing_utils/contentTypes.js').messageTypes;
var textContentTypes = require('./js_testing_utils/contentTypes.js').textTypes;


var URL_ROOT = 'http://datahub-01.cloud-east.dev:8080';

var GET_LATEST_SUCCESS_RESPONSE = 303;

var CAT_TOILET_PIC = './artifacts/cattoilet.jpg';
var MY_2MB_FILE = './artifacts/Iam2_5Mb.txt';
var MY_2KB_FILE = './artifacts/Iam200kb.txt';



// Test variables that are regularly overwritten
var agent
    , payload
    , spamChannelNames
    , fileAsAStream
    , req
    , uri
    , verAgent
    , contentType;

var channelName;

before(function(myCallback){
    channelName = makeRandomChannelName();
    agent = superagent.agent();
    makeChannel(channelName, function(res){
        if ((res.error) || (res.status != 200)) {
            myCallback(res.error);
        };
        console.log('Main test channel:'+ channelName);
        myCallback();
    });
});

beforeEach(function(){
    agent = superagent.agent();
    payload = uri = req = contentType = '';
})


//<editor-fold desc="*** Helpers ***">

var getValidationString = function (myUri, myPayload, myDone)
{
    var myData = '';
    http.get(myUri, function(res) {
        res.on('data', function (chunk) {
            myData += chunk;
        }).on('end', function(){
                expect(myData).to.equal(myPayload);
                myDone();
            });
    }).on('error', function(e) {
            console.log("Got error: " + e.message);
            myDone();
        });
};


var getValidationChecksum = function (myUri, expChecksum, myDone)
{
    var md5sum = crypto.createHash('md5');
    var actChecksum;

    http.get(myUri, function(res) {
        res.on('data', function (chunk) {
            md5sum.update(chunk);
        }).on('end', function(){
                actChecksum = md5sum.digest('hex');
                expect(actChecksum).to.equal(expChecksum);
                myDone();
            });
        }).on('error', function(e) {
            console.log("Got error: " + e.message);
            myDone();
        });

};

// returns the POST response
var makeChannel = function(myChannelName, myCallback) {

    var myPayload = '{"name":"'+ myChannelName +'"}';

    superagent.agent().post(URL_ROOT +'/channel')
        .set('Content-Type', 'application/json')
        .send(myPayload)
        .end(function(err, res) {
            //console.log('\nCreated channel with name:'+ myChannelName);
            myCallback(res);
        }).on('error', function(e) {
            myCallback(e);
        });
}

var makeRandomChannelName = function() {
    return testRandom.randomString(testRandom.randomNum(31), testRandom.limitedRandomChar);
}

//     Current metadata structure for GET on a channel:
/*
 {  _links:
        {   self:
                {   href: 'http://datahub-01.cloud-east.dev:8080/channel/philcollinssucks' },
            latest:
                {   href: 'http://datahub-01.cloud-east.dev:8080/channel/philcollinssucks/latest' }
        },
    name: 'philcollinssucks',
    creationDate: '2013-02-25T23:57:49.477Z'
 }
 */
function channelMetadata(responseBody) {
    this.getChannelUri = function() {
        return responseBody._links.self.href;
    }

    this.getLatestUri = function() {
        return responseBody._links.latest.href;
    }

    this.getName = function() {
        return responseBody.name;
    }

    this.getCreationDate = function() {
        return responseBody.creationDate;
    }
}

var getChannel = function(myChannelName, myCallback) {
    superagent.agent().get(URL_ROOT +'/channel/'+ myChannelName)
        .end(function(err, res) {
            if (err) {throw err};
            myCallback(res);
        });
};

// Current metadata structure for POSTing data:
/*
 {
    "_links": {
                "channel": {
                            "href": "http://datahub-01.cloud-east.dev:8080/channel/philcollinssucks"
                            },
                "self": {
                            "href": "http://datahub-01.cloud-east.dev:8080/channel/philcollinssucks/00002F8NRMFQK000"
                            }
                },
    "id": "00002F8NRMFQK000",
    "timestamp": "2013-02-26T18:57:13.130Z"
 }
 */
function packetMetadata(responseBody) {

    this.getChannelUri = function() {
        return responseBody._links.channel.href;
    }

    this.getPacketUri = function() {
        return responseBody._links.self.href;
    }

    this.getId = function() {
        return responseBody.id;
    }

    this.getTimestamp = function() {
        return responseBody.timestamp;
    }
}

// Headers in a response to GET on a packet of data
function packetHeader(responseHeader){

    // returns null if no 'previous' header found
    this.getNext = function() {
        //console.log("Called getNext() with responseHeader: ");
        //console.dir(responseHeader);

        if (responseHeader.hasOwnProperty("link")) {
            var m = /<([^<]+)>;rel=\"next\"/.exec(responseHeader["link"]);
            return (null == m) ? null : m[1];
        }
        else {
            return null;
        }
    }

    // returns null if no 'previous' header found
    this.getPrevious = function() {
        //console.log("Called getPrevious() with responseHeader: ");
        //console.dir(responseHeader);

        if (responseHeader.hasOwnProperty("link")) {
            var m = /<([^<]+)>;rel=\"previous\"/.exec(responseHeader["link"]);
            return (null == m) ? null : m[1];
        }
        else {
            return null;
        }
    }
}

// Posts data and returns (response, URI)
var postData = function(myChannelName, myData, myCallback) {
    uri = URL_ROOT +'/channel/'+ myChannelName;
    var dataUri;

    superagent.agent().post(uri)
        .send(myData)
        .end(function(err, res) {
            if (err) throw err;

            if (200 != res.status) {
                dataUri = null;
            }
            else {
                var pMetadata = new packetMetadata(res.body);
                dataUri = pMetadata.getPacketUri();
            }

            myCallback(res, dataUri);
        });
};

// Returns GET response in callback
var postDataAndConfirmContentType = function(myChannelName, myContentType, myCallback) {

    payload = testRandom.randomString(testRandom.randomNum(51));
    uri = URL_ROOT +'/channel/'+ myChannelName;
    var getAgent = superagent.agent();
    agent = superagent.agent();

    agent.post(uri)
        .set('Content-Type', myContentType)
        .send(payload)
        .end(function(err, res) {
            if (err) throw err;
            expect(res.status).to.equal(200);
            uri = res.body._links.self.href;

            getAgent.get(uri)
                .end(function(err2, res2) {
                    if (err2) throw err2;
                    expect(res2.type.toLowerCase()).to.equal(myContentType.toLowerCase());
                    myCallback(res2);
                });

        });
};

// Returns data
var getLatestFromChannel = function(myChannelName, myCallback) {
    var getUri = URL_ROOT +'/channel/'+ myChannelName +'/latest';

    async.waterfall([
        function(callback){
            superagent.agent().get(getUri)
                .redirects(0)
                .end(function(err, res) {
                    expect(res.status).to.equal(GET_LATEST_SUCCESS_RESPONSE);
                    expect(res.headers['location']).not.to.be.null;

                    callback(null, res.headers['location']);
                });
        },
        function(newUri, callback){
            var myData = '';

            http.get(newUri, function(res) {
                res.on('data', function (chunk) {
                    myData += chunk;
                }).on('end', function(){
                        callback(null, myData);
                    });
            }).on('error', function(e) {
                    callback(e, null);
                });
        }
    ], function (err, finalData) {
        if (err) throw err;
        myCallback(finalData);
    });

};

/* DEPRECATED by postData() above

var postDataAndReturnUri = function(myChannelName, myPayload, myCallback) {
    uri = URL_ROOT +'/channel/'+ myChannelName;

    superagent.agent().post(uri)
        .send(myPayload)
        .end(function(err, res) {
            if (err) throw err;
            expect(res.status).to.equal(200);
            var cnMetadata = new channelMetadata(res.body);
            uri = cnMetadata.getChannelUri();

            myCallback(uri);
        });
};
*/

//</editor-fold>



//<editor-fold desc="*** Tests ***">
describe('Create Channel:', function(){

   // 404 trying to GET channel before it exists
    it('should return a 404 trying to GET channel before it exists', function(done){
        var myChannel = makeRandomChannelName();
        getChannel(myChannel, function(res) {
            expect(res.status).to.equal(404)
            done();
        });
    });


    it('Cannot create channel with blank name: 500 response', function(done){
       makeChannel('', function(res) {
            expect(res.status).to.equal(500);
            done();
        });

    });

    it('Cannot create channel with no/empty payload: 500 response', function(done) {
        agent.post(URL_ROOT +'/channel')
            .set('Content-Type', 'application/json')
            .send('')
            .end(function(err, res) {
                expect(res.status).to.equal(500);
                done();
            });
    });


    it('should return a 200 trying to GET channel after creation', function(done){
        getChannel(channelName, function(res) {
            expect(res.status).to.equal(200);
            done();
        });
    });

    // https://www.pivotaltracker.com/story/show/44113267
    // Attempting to create a channel with a name already in use will return an error. NOT IMPLEMENTED YET.
    it.skip('HTTP 500 if attempting to create channel with a name already in use', function(done) {
        makeChannel(channelName, function(res) {
            expect(res.status).to.equal(500);
            done();
        });
    });

});

describe('GET Channel metadata:', function() {

    it('Contains expected metadata', function(done) {
        var cnMetadata;
        var thisChannel = makeRandomChannelName();

        makeChannel(thisChannel, function(makeRes) {
            expect(makeRes.status).to.equal(200);

            postData(thisChannel, testRandom.randomString(testRandom.randomNum(51)), function(postRes, uri) {
                expect(postRes.status).to.equal(200);

                getChannel(thisChannel, function(cnRes) {
                    expect(cnRes.status).to.equal(200);

                    cnMetadata = new channelMetadata(cnRes.body);
                    expect(cnMetadata.getChannelUri()).to.not.be.null;
                    expect(moment(cnMetadata.getCreationDate()).isValid()).to.be.true;
                    expect(cnMetadata.getLatestUri()).to.not.be.null;
                    expect(cnMetadata.getName()).to.equal(thisChannel);

                    done();
                })
            });
        });

    });
});

// Tests for this story:
//  Allow a client to save an arbitrary value to a channel.
//  https://www.pivotaltracker.com/story/show/43221623


describe('POST data to channel:', function(){


    it('Acceptance - should return a 200 for POSTing data', function(done){

        payload = testRandom.randomString(Math.round(Math.random() * 50));

        postData(channelName, payload, function(res, uri) {
            expect(res.status).to.equal(200);

            getValidationString(uri, payload, done);
        });

    });


    it('POST should return a 404 trying to save to nonexistent channel', function(done){
        var myChannel = makeRandomChannelName();
        payload = testRandom.randomString(Math.round(Math.random() * 50));

        postData(myChannel, payload, function(res, uri) {
            expect(res.status).to.equal(404);
            done();
        });

    });


    it('POST same set of data twice to channel', function(done){
        payload = testRandom.randomString(Math.round(Math.random() * 50));

        postData(channelName, payload, function(res, uri) {
            expect(res.status).to.equal(200);

            postData(channelName, payload, function(res2, uri2) {
                expect(res2.status).to.equal(200);

                getValidationString(uri, payload, done);
            });
        });
    });

    it('POST same set of data to two different channels', function(done) {
        var otherChannelName = makeRandomChannelName();
        var cnMetadata, pMetadata;

        makeChannel(otherChannelName, function(res) {
            expect(res.status).to.equal(200);
            cnMetadata = new channelMetadata(res.body);
            expect(cnMetadata.getChannelUri()).to.equal(URL_ROOT +'/channel/'+ otherChannelName);

            payload = testRandom.randomString(Math.round(Math.random() * 50));

            postData(channelName, payload, function(res, uri) {
                expect(res.status).to.equal(200);
                pMetadata = new packetMetadata(res.body);
                var actualUri = pMetadata.getPacketUri();

                getValidationString(actualUri, payload, function() {

                    postData(otherChannelName, payload, function(res2, uri2) {
                        expect(res2.status).to.equal(200);

                        getValidationString(uri2, payload, done)
                    });

                });
            });

        });
    });


    it('POST empty data set to channel', function(done){
        payload = '';

        postData(channelName, payload, function(res, uri) {
            expect(res.status).to.equal(200);

            getValidationString(uri, payload, done);
        });

    });

    it('POST 200kb file to channel', function(done) {
        payload = fs.readFileSync(MY_2KB_FILE, "utf8");

        postData(channelName, payload, function(res, uri) {
            expect(res.status).to.equal(200);

            getValidationString(uri, payload, done);
        });
    });

    it('POST 1,000 characters to channel', function(done) {
        payload = testRandom.randomString(1000, testRandom.simulatedTextChar);

        postData(channelName, payload, function(res, uri) {
            expect(res.status).to.equal(200);

            getValidationString(uri, payload, done);
        });
    });

    // Confirms via md5 checksum
    it('POST image file to channel and recover', function(done) {
        uri = URL_ROOT +'/channel/'+ channelName;

        fileAsAStream = fs.createReadStream(CAT_TOILET_PIC);

        fileAsAStream.pipe(request.post(uri,
            function(err, res, body) {
                if (err) {
                    throw err;
                }
                expect(res.statusCode).to.equal(200);
                var cnMetadata = new channelMetadata(JSON.parse(body));
                uri = cnMetadata.getChannelUri();

                var md5sum = crypto.createHash('md5');
                var s = fs.ReadStream(CAT_TOILET_PIC);

                s.on('data', function(d) {
                    md5sum.update(d);
                }).on('end', function() {
                    var expCheckSum = md5sum.digest('hex');

                    getValidationChecksum(uri, expCheckSum, done);
                });

            })
        );

    });


    describe.skip('Load tests - POST data:', function(){

        var loadChannels = {};
        var loadChannelKeys = [];  // channel.uri (to fetch data) and channel.data, e.g. { con {uri: x, data: y}}

        // To ignore the Loadtest cases:  mocha -R nyan --timeout 4000 --grep Load --invert
        it('Loadtest - POST rapidly to ten different channels, then confirm data retrieved via GET is correct', function(done){
            var cnMetadata;

            for (var i = 1; i <= 10; i++)
            {
                var thisName = makeRandomChannelName();
                var thisPayload = testRandom.randomString(Math.round(Math.random() * 50));
                loadChannels[thisName] = {"uri":'', "data":thisPayload};

            }

            for (var x in loadChannels){
                if (loadChannels.hasOwnProperty(x)) {
                    loadChannelKeys.push(x);
                }
            }

            async.each(loadChannelKeys, function(cn, callback) {
                makeChannel(cn, function(res) {
                    expect(res.status).to.equal(200);
                    cnMetadata = new channelMetadata(res.body);
                    expect(cnMetadata.getChannelUri()).to.equal(URL_ROOT +'/channel/'+ cn);
                    callback();
                });

            }, function(err) {
                if (err) {
                    throw err;
                };

                async.each(loadChannelKeys, function(cn, callback) {

                    postData(cn,loadChannels[cn].data, function(res, uri) {
                        loadChannels[cn].uri = uri;
                        callback();
                    });

                }, function(err) {
                    if (err) {
                        throw err;
                    };

                    async.eachSeries(loadChannelKeys, function(cn, callback) {
                        uri = loadChannels[cn].uri;
                        payload = loadChannels[cn].data;

                        getValidationString(uri, payload, function(){
                            //console.log('Confirmed data retrieval from channel: '+ cn);
                            callback();
                        });
                    }, function(err) {
                        if (err) {
                            throw err;
                        };

                        done();
                    });

                });

            });

        });
    });


    // For story:  Provide the client with a creation-timestamp in the response from a data storage request.k
    // https://www.pivotaltracker.com/story/show/43221779

    describe('POST - Creation timestamps returned:', function() {

        it('Creation timestamp returned on data storage', function(done){

            var timestamp = '';

            payload = testRandom.randomString(Math.round(Math.random() * 50));
            uri = URL_ROOT +'/channel/'+ channelName;

            postData(channelName, payload, function(res, uri) {
                expect(res.status).to.equal(200);
                timestamp = moment(res.body.timestamp);

                expect(moment(timestamp).isValid()).to.be.true;
                done();
            });
        });

        it('Multiple POSTings of data to a channel should return ever-increasing creation timestamps.', function(done) {
            var respMoment;

            // will be set to the diff between now and initial response time plus five minutes, just to ensure there
            //      aren't any egregious shenanigans afoot. In milliseconds.
            var serverTimeDiff;

            async.waterfall([
                function(callback){
                    setTimeout(function(){
                        payload = testRandom.randomString(testRandom.randomNum(51));
                        uri = URL_ROOT +'/channel/'+ channelName;

                        postData(channelName, payload, function(res, uri) {
                            expect(res.status).to.equal(200);
                            respMoment = moment(res.body.timestamp);
                            //console.log('Creation time was: '+ respMoment.format('X'));

                            expect(respMoment.isValid()).to.be.true;
                            serverTimeDiff = moment().diff(respMoment) + 300000;

                            callback(null, respMoment);
                        });
                    }, 1000);
                }
                ,function(lastResp, callback){
                    setTimeout(function(){
                        payload = testRandom.randomString(testRandom.randomNum(51));

                        postData(channelName, payload, function(res, uri) {
                            expect(res.status).to.equal(200);
                            respMoment = moment(res.body.timestamp);
                            //console.log('Creation time was: '+ respMoment.format('X'));

                            expect(respMoment.isValid()).to.be.true;
                            expect(respMoment.isAfter(lastResp)).to.be.true;
                            expect(moment().diff(respMoment)).to.be.at.most(serverTimeDiff);

                            callback(null, respMoment);
                        });
                    }, 1000);

                }
                ,function(lastResp, callback){
                    setTimeout(function(){

                        payload = testRandom.randomString(testRandom.randomNum(51));

                        postData(channelName, payload, function(res, uri) {
                            expect(res.status).to.equal(200);
                            respMoment = moment(res.body.timestamp);
                            //console.log('Creation time was: '+ respMoment.format('X'));

                            expect(respMoment.isValid()).to.be.true;
                            expect(respMoment.isAfter(lastResp)).to.be.true;
                            expect(moment().diff(respMoment)).to.be.at.most(serverTimeDiff);

                            callback(null);
                        });
                    }, 1000);
                }
            ]
             ,function(err) {
                    if (err) throw err;
                    done();
             });
        });


        // TODO: POST data from different timezone and confirm timestamp is correct?




    });


});

describe('GET data:', function() {

    describe('returns Creation time:', function() {

        it('(Acceptance) Creation time returned in header', function(done) {
            payload = testRandom.randomString(Math.round(Math.random() * 50));

            postData(channelName, payload, function(res, packetUri) {
                expect(res.status).to.equal(200);

                var pMetadata = new packetMetadata(res.body)
                var timestamp = moment(pMetadata.getTimestamp());

                agent.get(packetUri)
                    .end(function(err, res){
                        expect(res.status).to.equal(200);
                        expect(res.header['creation-date']).to.not.be.null;
                        var returnedTimestamp = moment(res.header['creation-date']);
                        expect(returnedTimestamp.isSame(timestamp)).to.be.true;

                        done();
                    });
            });
        });

        it('Save two sets of data to one channel, and ensure correct creation timestamps on GETs', function(done) {
            var pMetadata, timestamp;

            async.series([
                function(callback){
                    postData(channelName, testRandom.randomString(testRandom.randomNum(51)), function(res, packetUri) {
                        pMetadata = new packetMetadata(res.body);
                        timestamp = moment(pMetadata.getTimestamp());

                        callback(null, {"uri":packetUri, "timestamp": timestamp});
                    });
                },
                function(callback){
                    postData(channelName, testRandom.randomString(testRandom.randomNum(51)), function(res, packetUri) {
                        pMetadata = new packetMetadata(res.body);
                        timestamp = moment(pMetadata.getTimestamp());

                        callback(null, {"uri":packetUri, "timestamp": timestamp});
                    });
                }
            ],
                function(err, rArray){
                    agent.get(rArray[0].uri)
                        .end(function(err1, res1){
                            timestamp = rArray[0].timestamp;
                            expect(res1.status).to.equal(200);
                            expect(res1.header['creation-date']).to.not.be.null;
                            var returnedTimestamp = moment(res1.header['creation-date']);
                            expect(returnedTimestamp.isSame(timestamp)).to.be.true;

                            //console.log(returnedTimestamp);

                            superagent.agent().get(rArray[1].uri)
                                .end(function(err2, res2) {
                                    timestamp = rArray[1].timestamp;
                                    expect(res2.status).to.equal(200);
                                    expect(res2.header['creation-date']).to.not.be.null;
                                    returnedTimestamp = moment(res2.header['creation-date']);
                                    expect(returnedTimestamp.isSame(timestamp)).to.be.true;

                                    //console.log(returnedTimestamp);

                                    done();
                                });
                        });
                });

        });

        it('Save data to two different channels, and ensure correct creation timestamps on GETs', function(done) {
            var pMetadata, timestamp;
            var channelA = {"name":null, "dataUri":null, "dataTimestamp":null};
            var channelB = {"name":null, "dataUri":null, "dataTimestamp":null};

            channelA.name = makeRandomChannelName();
            channelB.name = makeRandomChannelName();

            async.series([
                function(callback){
                    makeChannel(channelA.name, function(res) {
                       expect(res.status).to.equal(200);

                        makeChannel(channelB.name, function(res2) {
                            expect(res2.status).to.equal(200);
                            callback(null, null);
                        });
                    });
                },
                function(callback){
                    postData(channelA.name, testRandom.randomString(testRandom.randomNum(51)), function(res, packetUri) {
                        pMetadata = new packetMetadata(res.body);
                        timestamp = moment(pMetadata.getTimestamp());
                        channelA.dataUri = packetUri;
                        channelA.dataTimestamp = timestamp;

                        callback(null, null);
                    });
                },
                function(callback){
                    postData(channelName, testRandom.randomString(testRandom.randomNum(51)), function(res, packetUri) {
                        pMetadata = new packetMetadata(res.body);
                        timestamp = moment(pMetadata.getTimestamp());
                        channelB.dataUri = packetUri;
                        channelB.dataTimestamp = timestamp;

                        callback(null, null);
                    });
                }
            ],
                function(err, rArray){
                    agent.get(channelA.dataUri)
                        .end(function(err1, res1){
                            timestamp = channelA.dataTimestamp;
                            expect(res1.status).to.equal(200);
                            expect(res1.header['creation-date']).to.not.be.null;
                            var returnedTimestamp = moment(res1.header['creation-date']);
                            expect(returnedTimestamp.isSame(timestamp)).to.be.true;

                            //console.log(returnedTimestamp);

                            superagent.agent().get(channelB.dataUri)
                                .end(function(err2, res2) {
                                    timestamp = channelB.dataTimestamp;
                                    expect(res2.status).to.equal(200);
                                    expect(res2.header['creation-date']).to.not.be.null;
                                    returnedTimestamp = moment(res2.header['creation-date']);
                                    expect(returnedTimestamp.isSame(timestamp)).to.be.true;

                                    //console.log(returnedTimestamp);

                                    done();
                                });
                        });
                });

        });

        it('Get latest returns creation timestamp', function(done) {
            var thisChannel = makeRandomChannelName();

            payload = testRandom.randomString(testRandom.randomNum(51));

            async.waterfall([
                function(callback){
                    makeChannel(thisChannel, function(res) {
                        expect(res.status).to.equal(200);

                        callback(null);
                    });
                },
                function(callback){
                    postData(thisChannel, payload, function(myRes, myUri) {
                        expect(myRes.status).to.equal(200);
                        uri = URL_ROOT +'/channel/'+ thisChannel +'/latest';

                        agent.get(uri)
                            .end(function(err, res) {
                                expect(res.status).to.equal(200);
                                expect(res.header['creation-date']).to.not.be.null;

                                callback(null);
                            });
                    });
                }
            ], function (err) {
                done();
            });
        });
    });

    // Provide a client with the content type when retrieving a value. https://www.pivotaltracker.com/story/show/43221431
    describe('Content type is returned in response:', function() {
        // (acceptance)  Submit a request to save some data with a specified content type (image/jpeg, for example).
        //          Verify that the same content type is returned when retrieving the data.
        // Test where specified content type doesn't match actual content type (shouldn't matter, the DH should return specified content type).
        // Test with a range of content types.

        it('Acceptance - Content Type that was specified when POSTing data is returned on GET', function(done){

            postDataAndConfirmContentType(channelName, 'text/plain', function(res) {
                done();
            });

        });

        // application Content-Types
        it('Content-Type for application/* (19 types)', function(done){
            async.each(appContentTypes, function(ct, nullCallback) {
                //console.log('CT: '+ ct);
                postDataAndConfirmContentType(channelName, ct, function(res) {
                    nullCallback();
                });
            }, function(err) {
                if (err) {
                    throw err;
                };
                done();
            });
        });

        // image Content-Types
        it('Content-Type for image/* (7 types)', function(done){
            async.each(imageContentTypes, function(ct, nullCallback) {
                //console.log('CT: '+ ct);
                postDataAndConfirmContentType(channelName, ct, function(res) {
                    nullCallback();
                });
            }, function(err) {
                if (err) {
                    throw err;
                };
                done();
            });
        });

        // message Content-Types
        it('Content-Type for message/* (4 types)', function(done){
            async.each(messageContentTypes, function(ct, nullCallback) {
                //console.log('CT: '+ ct);
                postDataAndConfirmContentType(channelName, ct, function(res) {
                    nullCallback();
                });
            }, function(err) {
                if (err) {
                    throw err;
                };
                done();
            });
        });

        // text Content-Types
        it('Content-Type for textContentTypes/* (8 types)', function(done){
            async.each(textContentTypes, function(ct, nullCallback) {
                //console.log('CT: '+ ct);
                postDataAndConfirmContentType(channelName, ct, function(res) {
                    nullCallback();
                });
            }, function(err) {
                if (err) {
                    throw err;
                };
                done();
            });
        });


        it('Made-up legal Content-Type should be accepted and returned', function(done) {
            // Note that the DH accepts illegal Content-Types, but does require a slash between two strings, so that's
            //  the standard I'm going with.
            var myContentType = testRandom.randomString(testRandom.randomNum(10), testRandom.limitedRandomChar);
            myContentType += '/'+ testRandom.randomString(testRandom.randomNum(10), testRandom.limitedRandomChar);

            var getAgent = superagent.agent();

            payload = testRandom.randomString(Math.round(Math.random() * 50));
            uri = URL_ROOT +'/channel/'+ channelName;

            agent.post(uri)
                .set('Content-Type', myContentType)
                .send(payload)
                .end(function(err, res) {
                    if (err) throw err;
                    expect(res.status).to.equal(200);
                    var cnMetadata = new channelMetadata(res.body);
                    uri = cnMetadata.getChannelUri();

                    getAgent.get(uri)
                        .end(function(err2, res2) {
                            if (err2) throw err2;
                            expect(res2.status).to.equal(200);
                            expect(res2.type.toLowerCase()).to.equal(myContentType.toLowerCase());
                            done();
                        });

                });

        });

        // TODO ? multi-part type testing?

    });

    describe('Get previous item link:', function() {

        it('(Acceptance) No Prev link with only one value set; Prev link does show on second value set.', function(done) {
            var myChannel = makeRandomChannelName();
            var firstValueUri;  // Uri for the first value set
            var pHeader;

            async.series([
                function(callback){
                    makeChannel(myChannel, function(res) {
                        expect(res.status).to.equal(200);

                        callback(null, null);
                    });
                },
                function(callback){
                    postData(myChannel, testRandom.randomString(testRandom.randomNum(51)), function(res, myUri) {
                        expect(res.status).to.equal(200);
                        firstValueUri = myUri;

                        superagent.agent().get(myUri)
                            .end(function(err, res) {
                                pHeader = new packetHeader(res.headers);
                                expect(pHeader.getPrevious()).to.be.null;

                                callback(null, null);
                            });
                    });
                },
                function(callback){
                    postData(myChannel, testRandom.randomString(testRandom.randomNum(51)), function(res, myUri) {
                        expect(res.status).to.equal(200);

                        superagent.agent().get(myUri)
                            .end(function(err, res) {
                                pHeader = new packetHeader(res.headers);
                                expect(pHeader.getPrevious()).to.equal(firstValueUri);

                                callback(null, null);
                            });
                    });
                }
            ],
                function(err, results){
                    done();
                });
        });

        // Create a new channel with three values in it. Starting with the latest value, confirm each prev points to the
        //  correct value and doesn't skip to the oldest.
        it('Three values in a sequence in a channel show proper Previous link behavior', function(done) {
            var myChannel = makeRandomChannelName();
            var firstValueUri, secondValueUri;
            var pHeader;

            async.series([
                function(callback){
                    makeChannel(myChannel, function(res) {
                        expect(res.status).to.equal(200);

                        callback(null, null);
                    });
                },
                function(callback){
                    postData(myChannel, testRandom.randomString(testRandom.randomNum(51)), function(res, myUri) {
                        expect(res.status).to.equal(200);
                        firstValueUri = myUri;

                      superagent.agent().get(myUri)
                            .end(function(err, res) {
                                pHeader = new packetHeader(res.headers);
                                expect(pHeader.getPrevious()).to.be.null;

                                callback(null, null);
                            });
                    });
                },
                function(callback){
                    postData(myChannel, testRandom.randomString(testRandom.randomNum(51)), function(res, myUri) {
                        expect(res.status).to.equal(200);
                        secondValueUri = myUri;

                        superagent.agent().get(myUri)
                            .end(function(err, res) {
                                pHeader = new packetHeader(res.headers);
                                expect(pHeader.getPrevious()).to.equal(firstValueUri);

                                callback(null, null);
                            });
                    });
                },
                function(callback){
                    postData(myChannel, testRandom.randomString(testRandom.randomNum(51)), function(res, myUri) {
                        expect(res.status).to.equal(200);

                        superagent.agent().get(myUri)
                            .end(function(err, res) {
                                pHeader = new packetHeader(res.headers);
                                expect(pHeader.getPrevious()).to.equal(secondValueUri);

                                callback(null, null);
                            });
                    });
                }
            ],
                function(err, results){
                    done();
                });
        });

        // TODO: Future: if the first value in a channel expires, the value after it in the channel should no longer show a 'prev' link.

        // TODO: Future: if the first value in a channel is deleted, the value after it in the channel should no longer show a 'prev' link.

        // TODO: Future: if a value that is not the first value in a channel expires, the value after it in the channel should
        //          accurately point its 'prev' link to the value before the just-expired value.
        // TODO: Future: if a value that is not the first value in a channel is deleted, the value after it in the channel should
        //          accurately point its 'prev' link to the value before the just-expired value.
    });

    describe('Get next item link:', function() {

        it('(Acceptance) No Next link with only one value set; Next link does show after following value set.', function(done) {
            var myChannel = makeRandomChannelName();
            var firstValueUri;
            var pHeader;

            async.series([
                function(callback){
                    makeChannel(myChannel, function(res) {
                        expect(res.status).to.equal(200);

                        callback(null, null);
                    });
                },
                function(callback){
                    postData(myChannel, testRandom.randomString(testRandom.randomNum(51)), function(res, myUri) {
                        expect(res.status).to.equal(200);
                        firstValueUri = myUri;

                        superagent.agent().get(myUri)
                            .end(function(err, res) {
                                pHeader = new packetHeader(res.headers);
                                expect(pHeader.getNext()).to.be.null;

                                callback(null, null);
                            });
                    });
                },
                function(callback){
                    postData(myChannel, testRandom.randomString(testRandom.randomNum(51)), function(res, myUri) {
                        expect(res.status).to.equal(200);

                        superagent.agent().get(firstValueUri)
                            .end(function(err, res) {
                                pHeader = new packetHeader(res.headers);
                                expect(pHeader.getNext()).to.equal(myUri);

                                callback(null, null);
                            });
                    });
                }
            ],
                function(err, results){
                    done();
                });
        });

        it('Check Next behavior and a value with both Next and Prev links', function(done) {
            var myChannel = makeRandomChannelName();
            var firstValueUri, secondValueUri, thirdValueUri;
            var pHeader;

            async.series([
                function(callback){
                    makeChannel(myChannel, function(res) {
                        expect(res.status).to.equal(200);

                        callback(null, null);
                    });
                },
                function(callback){
                    postData(myChannel, testRandom.randomString(testRandom.randomNum(51)), function(res, myUri) {
                        expect(res.status).to.equal(200);
                        firstValueUri = myUri;
                        callback(null,null);
                    });
                },
                function(callback){
                    postData(myChannel, testRandom.randomString(testRandom.randomNum(51)), function(res, myUri) {
                        expect(res.status).to.equal(200);
                        secondValueUri = myUri;
                        callback(null,null);
                    });
                },
                function(callback){
                    postData(myChannel, testRandom.randomString(testRandom.randomNum(51)), function(res, myUri) {
                        expect(res.status).to.equal(200);
                        thirdValueUri = myUri;

                        superagent.agent().get(myUri)
                            .end(function(err, res) {
                                pHeader = new packetHeader(res.headers);
                                expect(pHeader.getPrevious()).to.equal(secondValueUri);
                                expect(pHeader.getNext()).to.be.null;

                                callback(null,null);
                            });
                    });
                },
                function(callback){
                    superagent.agent().get(secondValueUri)
                        .end(function(err, res) {
                            pHeader = new packetHeader(res.headers);
                            expect(pHeader.getPrevious()).to.equal(firstValueUri);
                            expect(pHeader.getNext()).to.equal(thirdValueUri);

                            callback(null,null);
                        });
                },
                function(callback){
                    superagent.agent().get(firstValueUri)
                        .end(function(err, res) {
                            pHeader = new packetHeader(res.headers);
                            expect(pHeader.getPrevious()).to.be.null;
                            expect(pHeader.getNext()).to.equal(secondValueUri);

                            callback(null,null);
                        });
                }
            ],
                function(err, results){
                    done();
                });
        });

        // TODO: Future: if the last value in a channel expires, the value before it in the channel should no longer show a 'next' link.

        // TODO: Future: if the last value in a channel is deleted, the value before it in the channel should no longer show a 'next' link.

        // TODO: Future: if a value that is not the last value in a channel expires, the value before it in the channel should
        //          accurately point its 'next' link to the value after the just-expired value.
        // TODO: Future: if a value that is not the last value in a channel is deleted, the value before it in the channel should
        //          accurately point its 'next' link to the value after the just-deleted value.
    });
});


// Allow a client to access the most recently saved item in a channel.
// https://www.pivotaltracker.com/story/show/43222579
describe('Access most recently saved item in channel:', function() {
    // Future tests
    /* (Future tests): if a data set expires, the 'get latest' call should respect that and reset to:
     the previous data set in the channel if one exists, or
     return a 404 if there were no other data sets
     */

    //    *Complex case*: this covers both retrieving the URI for latest data and ensuring that it yields the latest data.
    //    Verify at each step that the "most recent" URI returns what was most recently saved.
    //    Response to a channel creation *or* to a GET on the channel will include the URI to the latest resource in that channel.
    //    NOTE: response is 303 ("see other") – it's a redirect to the latest set of data stored in the channel.
    it('(Acceptance) Save sequence of data to channel, confirm that latest actually returns latest', function(done) {
        var thisChannel = makeRandomChannelName();
        var latestUri, myData;

        var payload1 = testRandom.randomString(testRandom.randomNum(51));
        var payload2 = testRandom.randomString(testRandom.randomNum(51));
        var payload3 = testRandom.randomString(testRandom.randomNum(51));

        //console.log('Payload1:'+ payload1);
        //console.log('Payload2:'+ payload2);
        //console.log('Payload3:'+ payload3);

        async.waterfall([
            function(callback){
                makeChannel(thisChannel, function(res) {
                        expect(res.status).to.equal(200);
                        var cnMetadata = new channelMetadata(res.body);
                        latestUri = cnMetadata.getLatestUri();

                        callback(null);
                });
            },
            function(callback){
                postData(thisChannel, payload1, function(myRes, myUri) {
                    expect(myRes.status).to.equal(200);

                    getLatestFromChannel(thisChannel, function(myData) {
                        //console.log('payload1:'+ payload1);
                        //console.log('data returned:'+ myData);

                        expect(myData).to.equal(payload1);

                        callback(null);
                    });
                });
            },
            function(callback){
                postData(thisChannel, payload2, function(myRes, myUri) {
                    expect(myRes.status).to.equal(200);

                    getLatestFromChannel(thisChannel, function(myData) {
                        //console.log('payload2:'+ payload2);
                        //console.log('data returned:'+ myData);

                        expect(myData).to.equal(payload2);

                        callback(null);
                    });
                });
            },
            function(callback){
                postData(thisChannel, payload3, function(myRes, myUri) {
                    expect(myRes.status).to.equal(200);

                    getLatestFromChannel(thisChannel, function(myData) {
                        //console.log('payload3:'+ payload3);
                        //console.log('data returned:'+ myData);

                        expect(myData).to.equal(payload3);

                        callback(null);
                    });
                });
            }
        ], function (err) {
            done();
        });
    });

    it('Return 404 on Get Latest if channel has no data', function(done) {
        var thisChannel = testRandom.randomString(30, testRandom.limitedRandomChar);

        makeChannel(thisChannel, function(res) {
            expect(res.status).to.equal(200);

            uri = URL_ROOT +'/channel/'+ thisChannel +'/latest';

            agent.get(uri)
                .end(function(err, res) {
                    expect(res.status).to.equal(404);
                    done();
                });
        });
    });

    it('Channel creation returns link to latest data set', function(done) {
        var thisChannel = makeRandomChannelName();

        makeChannel(thisChannel, function(res) {
            expect(res.status).to.equal(200);
            var cnMetadata = new channelMetadata(res.body);
            expect(cnMetadata.getChannelUri()).to.not.be.null;

            done();
        });

    });

    it('GET on Channel returns link to latest data set', function(done) {
        getChannel(channelName, function(res) {
            expect(res.status).to.equal(200);
            var cnMetadata = new channelMetadata(res.body);
            expect(cnMetadata.getChannelUri()).to.not.be.null;

            done();
        });
    });


    it('Get latest works when latest data set is an empty set, following a previous non-empty set', function(done) {
        var thisChannel = makeRandomChannelName();
        var latestUri, myData;

        payload = testRandom.randomString(testRandom.randomNum(51));

        async.waterfall([
            function(callback){
                makeChannel(thisChannel, function(res) {
                    expect(res.status).to.equal(200);

                    var cnMetadata = new channelMetadata(res.body);
                    latestUri = cnMetadata.getLatestUri();

                    callback(null);
                });
            },
            function(callback){
                postData(thisChannel, payload, function(myRes, myUri) {
                    expect(myRes.status).to.equal(200);

                    getLatestFromChannel(thisChannel, function(myData) {
                        expect(myData).to.equal(payload);
                        callback(null);
                    });
                });
            },
            function(callback){
                postData(thisChannel, '', function(myRes, myUri) {
                    expect(myRes.status).to.equal(200);

                    getLatestFromChannel(thisChannel, function(myData) {
                        expect(myData).to.equal('');
                        callback(null);
                    });
                });
            }
        ], function (err) {
            done();
        });
    });

    // As of 2/26, cannot be done (you cannot set the creation timestamp, and despite having the two POST calls done
    //  in parallel, the times aren't quite the same :(
    // TODO:  Save two sets of data with the same creation timestamp.
    //  Note: the client can't control which is the 'latest', but once the server has made that determination, it should stick.
    //  So repeated calls to this method will always return the same data set.
    it.skip('(*Not yet possible*) Internal sequence of data with same timestamp is preserved', function(done) {
        var thisChannel = makeRandomChannelName();
        var payload1 = testRandom.randomString(testRandom.randomNum(51));
        var payload2 = testRandom.randomString(testRandom.randomNum(51));
        var timestamp1, timestamp2;

        makeChannel(thisChannel, function(res) {
            expect(res.status).to.equal(200);


            async.parallel([
                    function(callback){
                        postData(thisChannel, payload1, function(myRes, uri) {
                            expect(myRes.status).to.equal(200);
                            timestamp1 = moment(myRes.body.timestamp);
                            expect(moment(timestamp1).isValid()).to.be.true;
                            //console.log('time1 '+ timestamp1.valueOf());
                            console.log(myRes.body.timestamp);

                            callback(null);
                        });
                    },
                    function(callback){
                        postData(thisChannel, payload2, function(myRes, uri) {
                            expect(myRes.status).to.equal(200);
                            timestamp2 = moment(myRes.body.timestamp);
                            expect(moment(timestamp2).isValid()).to.be.true;
                            //console.log('time2 '+ timestamp2.valueOf());
                            console.log(myRes.body.timestamp);

                            callback(null);
                        });
                    }
                ],
                function(err, results){
                   done();
                }
            );
        });
    });
});




describe.skip('Known failing cases that may not be legitimate:', function() {

    it('Should be able to create a channel name of 50 characters', function(done){
        var longChannelName = testRandom.randomString(50, testRandom.limitedRandomChar);

        //console.log('Channel Name: '+ longChannelName);
        payload = '{"name":"'+ longChannelName +'"}';

        agent.post(URL_ROOT +'/channel')
            .set('Content-Type', 'application/json')
            .send(payload)
            .end(function(err, res) {
                expect(res.status).to.equal(200);
                var cnMetadata = new channelMetadata(res.body);
                expect(cnMetadata.getChannelUri()).to.equal(URL_ROOT +'/channel/'+ channelName);
                done();
            });
    });


    // !!!! this is stopping / hosing the server...do not run w/o checking with devs first
    it('POST large file (2.5 MB) to channel', function(done) {
        uri = URL_ROOT +'/channel/'+ channelName;

        payload = fs.readFileSync(MY_2MB_FILE);

        agent.post(uri)
            .send(payload)
            .end(function(err, res) {
                expect(res.status).to.equal(200);
                var cnMetadata = new channelMetadata(res.body);
                uri = cnMetadata.getChannelUri();

                console.log('URI:'+ uri);

                getValidationString(uri, payload, done);
            });
    });
});
//</editor-fold>




// TODO:  stress tests -- handled elsewhere?



