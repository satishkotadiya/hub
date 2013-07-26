package com.flightstats.datahub.cluster;

import com.flightstats.datahub.model.DataHubKey;
import com.flightstats.datahub.service.eventing.Consumer;
import com.flightstats.datahub.util.DataHubKeyRenderer;
import com.hazelcast.core.Message;
import com.hazelcast.core.MessageListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A Hazelcast subscriber that listens for on a specific channel. There is one HazelcastSubscriber for each websocket client.
 */
public class HazelcastSubscriber implements MessageListener<String> {

	private final static Logger logger = LoggerFactory.getLogger(HazelcastSubscriber.class);
	static final short BUFFER_SIZE = (short) 1000;

	private final Consumer<String> consumer;
	private final DataHubKeyRenderer keyRenderer;
	private final Map<Short, String> futureMessages = new ConcurrentHashMap<>();
	private short nextExpected = -1;


	public HazelcastSubscriber(Consumer<String> consumer, DataHubKeyRenderer keyRenderer) {
		this.consumer = consumer;
		this.keyRenderer = keyRenderer;
	}

	@Override
	public void onMessage(Message<String> message) {
		String stringKey = message.getMessageObject();
		short messageSequence = getKeyFromUri(stringKey).getSequence();

		if (isFirst()) {
			consumer.apply(stringKey);
			nextExpected = getNextExpected(messageSequence);
		}
		else if (isFuture(messageSequence)) {
			futureMessages.put(messageSequence, stringKey);    //buffer it up
		}
		else if (isOld(messageSequence)) {
			logger.error("Ignoring old message(expected=" + nextExpected + ", ignored=" + messageSequence + "):" + message.getMessageObject());
		}
		else {
			futureMessages.put(messageSequence, stringKey);
			dispatchBufferedInOrder();
		}
	}

	private void dispatchBufferedInOrder() {
		String nextUri;
		while ((nextUri = futureMessages.remove(nextExpected)) != null){
			consumer.apply(nextUri);
			nextExpected = getNextExpected(nextExpected);
		}
	}

	private boolean isFirst() {
		return nextExpected == -1;
	}

	private boolean isFuture(short received) {
		boolean isFutureBeforeRollover = (received > nextExpected) && (received < Math.min(nextExpected + BUFFER_SIZE, Short.MAX_VALUE));
		boolean isFutureAfterRollover = received < (nextExpected + BUFFER_SIZE - Short.MAX_VALUE);
		return isFutureBeforeRollover || isFutureAfterRollover;
	}

	private boolean isOld(short messageSequence) {
		return !(isFirst() || isExpected(messageSequence) || isFuture(messageSequence));
	}

	private boolean isExpected(short messageSequence) {
		return nextExpected == messageSequence;
	}

	private short getNextExpected(short current) {
		return (short) (current == Short.MAX_VALUE ? 0 : current + 1);
	}

	private DataHubKey getKeyFromUri(String stringKey) {
		return keyRenderer.fromString(stringKey);
	}
}
