package com.flightstats.hub.websocket;

import com.codahale.metrics.Counter;
import com.codahale.metrics.MetricRegistry;
import com.flightstats.hub.service.ChannelLinkBuilder;
import com.flightstats.hub.util.ChannelNameUtils;
import com.google.inject.Inject;
import org.eclipse.jetty.websocket.servlet.ServletUpgradeRequest;
import org.eclipse.jetty.websocket.servlet.ServletUpgradeResponse;
import org.eclipse.jetty.websocket.servlet.WebSocketCreator;

import java.net.URI;

public class MetricsWebSocketCreator implements WebSocketCreator {

	private final MetricRegistry registry;
    private final WebsocketSubscribers subscriptions;
    private final ChannelNameUtils channelNameUtils;
	private final Object mutex = new Object();
	private final ChannelLinkBuilder linkBuilder;

	@Inject
	public MetricsWebSocketCreator(MetricRegistry registry, WebsocketSubscribers subscriptions, ChannelNameUtils channelNameUtils, ChannelLinkBuilder linkBuilder) {
		this.registry = registry;
        this.subscriptions = subscriptions;
        this.channelNameUtils = channelNameUtils;
		this.linkBuilder = linkBuilder;
	}

    @Override
    public Object createWebSocket(ServletUpgradeRequest req, ServletUpgradeResponse resp) {
        URI requestUri = req.getRequestURI();
        final String channelName = channelNameUtils.extractFromWS(requestUri);
        final String meterName = "websocket-clients.channels." + channelName;

        synchronized (mutex) {
            registry.counter(meterName).inc();
        }

        return new HubWebSocket( subscriptions, channelNameUtils, linkBuilder, new Runnable() {
            @Override
            public void run() {
                synchronized (mutex) {
                    Counter counter = registry.counter(meterName);
                    counter.dec();
                    if (counter.getCount() == 0) {    //Last remaining client for this channel
                        registry.remove(meterName);
                    }
                }
            }
        });
    }
}
