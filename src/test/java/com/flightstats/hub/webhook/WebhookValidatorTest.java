package com.flightstats.hub.webhook;

import com.flightstats.hub.app.HubProperties;
import com.flightstats.hub.exception.InvalidRequestException;
import com.google.common.base.Strings;
import org.junit.Before;
import org.junit.Test;

public class WebhookValidatorTest {

    private WebhookValidator webhookValidator;
    private Webhook webhook;

    @Before
    public void setUp() throws Exception {
        webhookValidator = new WebhookValidator();
        webhook = Webhook.builder()
                .callbackUrl("http://client/url")
                .channelUrl("http://hub/channel/channelName")
                .parallelCalls(1)
                .build();
    }

    @Test
    public void testName() throws Exception {
        webhook = webhook.withDefaults();
        webhookValidator.validate(webhook.withName("aA9_-"));
    }

    @Test
    public void testNameLarge() throws Exception {
        webhook = webhook.withDefaults();
        webhookValidator.validate(webhook.withName(Strings.repeat("B", 128)));
    }

    @Test(expected = InvalidRequestException.class)
    public void testNameSizeTooBig() throws Exception {
        webhookValidator.validate(webhook.withName(Strings.repeat("B", 129)));
    }

    @Test(expected = InvalidRequestException.class)
    public void testZeroCalls() throws Exception {
        webhookValidator.validate(webhook.withParallelCalls(0));
    }

    @Test(expected = InvalidRequestException.class)
    public void testNameChars() throws Exception {
        webhookValidator.validate(webhook.withName("aA9:"));
    }

    @Test(expected = InvalidRequestException.class)
    public void testNonChannelUrl() throws Exception {
        webhookValidator.validate(Webhook.builder()
                .callbackUrl("http:/client/url")
                .channelUrl("http:\\hub/channel/channelName")
                .parallelCalls(1)
                .name("nothing")
                .build());
    }

    @Test(expected = InvalidRequestException.class)
    public void testInvalidCallbackUrl() throws Exception {
        webhookValidator.validate(Webhook.builder()
                .callbackUrl("not a url")
                .channelUrl("http://hub/channel/channelName")
                .parallelCalls(1)
                .name("nothing")
                .build());
    }

    @Test(expected = InvalidRequestException.class)
    public void testInvalidChannelUrl() throws Exception {
        webhookValidator.validate(Webhook.builder()
                .callbackUrl("http:/client/url")
                .channelUrl("http://hub/channe/channelName")
                .parallelCalls(1)
                .name("testInvalidChannelUrl")
                .build());
    }

    @Test(expected = InvalidRequestException.class)
    public void testInvalidBatch() throws Exception {
        webhook = webhook.withBatch("non").withName("blah");
        webhookValidator.validate(webhook);
    }

    @Test
    public void testBatchLowerCase() throws Exception {
        webhook = webhook.withBatch("single").withCallbackTimeoutSeconds(10).withName("blah");
        webhookValidator.validate(webhook);
    }

    @Test()
    public void testValidCallbackTimeout() throws Exception {
        webhook = webhook.withCallbackTimeoutSeconds(1000).withBatch("SINGLE").withName("blah");
        webhookValidator.validate(webhook);
    }

    @Test(expected = InvalidRequestException.class)
    public void testInvalidCallbackTimeout() throws Exception {
        webhook = webhook.withCallbackTimeoutSeconds(10 * 1000).withBatch("SINGLE").withName("blah");
        webhookValidator.validate(webhook);
    }

    @Test(expected = InvalidRequestException.class)
    public void testInvalidCallbackTimeoutZero() throws Exception {
        webhook = webhook.withCallbackTimeoutSeconds(0).withBatch("SINGLE").withName("blah");
        webhookValidator.validate(webhook);
    }

    @Test(expected = InvalidRequestException.class)
    public void testInvalidLocalhost() throws Exception {
        HubProperties.setProperty("hub.type", "aws");
        webhook = Webhook.builder()
                .callbackUrl("http:/localhost:8080/url")
                .channelUrl("http://hub/channel/channelName")
                .parallelCalls(1)
                .name("testInvalidChannelUrl")
                .batch("SINGLE")
                .callbackTimeoutSeconds(1)
                .build();

        webhookValidator.validate(webhook);
    }

}