require('../integration_config');

var request = require('request');
var channelName = utils.randomChannelName();
var channelResource = channelUrl + "/" + channelName;

describe(__filename, function () {
    utils.createChannel(channelName);

    it("deletes channel " + channelName, function (done) {
        request.del({url: channelResource},
            function (err, response, body) {
                console.log('body', body);
                expect(err).toBeNull();
                expect(response.statusCode).toBe(202);
                done();
            });

    }, 65000);

    it("gets deleted channel " + channelName, function (done) {
        request.get({url: channelResource + '?cached=false'},
            function (err, response, body) {
                expect(err).toBeNull();
                expect(response.statusCode).toBe(404);
                done();
            });
    });

});
