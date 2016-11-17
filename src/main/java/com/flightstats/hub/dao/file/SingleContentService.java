package com.flightstats.hub.dao.file;

import com.flightstats.hub.dao.ContentMarshaller;
import com.flightstats.hub.dao.ContentService;
import com.flightstats.hub.exception.FailedWriteException;
import com.flightstats.hub.metrics.ActiveTraces;
import com.flightstats.hub.metrics.Traces;
import com.flightstats.hub.model.*;
import com.flightstats.hub.spoke.FileSpokeStore;
import com.flightstats.hub.util.TimeUtil;
import com.google.common.base.Optional;
import org.joda.time.DateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.*;
import java.util.function.Consumer;

/**
 * SingleContentService allows for the singleHub to have different characteristics than using Spoke in the clustered hub.
 * Spoke is designed to hold a short period's cache, while the singleHub may hold data spanning much large periods of time.
 */
public class SingleContentService implements ContentService {
    private final static Logger logger = LoggerFactory.getLogger(SingleContentService.class);

    private final FileSpokeStore fileSpokeStore;

    public SingleContentService() {
        String contentPath = FileUtil.getContentPath();
        logger.info("using {}", contentPath);
        fileSpokeStore = new FileSpokeStore(contentPath);
    }

    @Override
    public ContentKey insert(String channelName, Content content) throws Exception {
        ContentKey key = content.getContentKey().get();
        String path = getPath(channelName, content.getContentKey().get());
        if (!fileSpokeStore.insert(path, content.getData())) {
            throw new FailedWriteException("unable to write to file syste, " + path);
        }
        return key;
    }

    @Override
    public Collection<ContentKey> insert(BulkContent bulkContent) throws Exception {
        Collection<ContentKey> keys = new ArrayList<>();
        logger.info("inserting {}", bulkContent);
        for (Content content : bulkContent.getItems()) {
            logger.info("inserting item key {}", content.getContentKey().get());
            content.setData(ContentMarshaller.toBytes(content));
            keys.add(insert(bulkContent.getChannel(), content));
        }
        return keys;
    }

    @Override
    public boolean historicalInsert(String channelName, Content content) {
        return false;
    }

    private String getPath(String channelName, ContentKey key) {
        return channelName + "/" + key.toUrl();
    }

    @Override
    public Optional<Content> get(String channelName, ContentKey key) {
        String path = getPath(channelName, key);
        try {
            byte[] bytes = fileSpokeStore.read(path);
            if (null != bytes) {
                return Optional.of(ContentMarshaller.toContent(bytes, key));
            }
        } catch (Exception e) {
            logger.warn("unable to get data: " + path, e);
        }
        return Optional.absent();
    }

    @Override
    public void get(String channel, SortedSet<ContentKey> keys, Consumer<Content> callback) {
        for (ContentKey key : keys) {
            Optional<Content> contentOptional = get(channel, key);
            if (contentOptional.isPresent()) {
                callback.accept(contentOptional.get());
            }
        }
    }

    @Override
    public Collection<ContentKey> queryByTime(TimeQuery query) {
        String path = query.getChannelName() + "/" + query.getUnit().format(query.getStartTime());
        Traces traces = ActiveTraces.getLocal();
        traces.add("query by time", path);
        TreeSet<ContentKey> keySet = new TreeSet<>();
        ContentKeyUtil.convertKeyStrings(fileSpokeStore.readKeysInBucket(path), keySet);
        traces.add(query.getChannelName(), keySet);
        return keySet;
    }

    @Override
    public void delete(String channelName) {
        try {
            fileSpokeStore.delete(channelName);
        } catch (Exception e) {
            logger.warn("unable to delete channel " + channelName, e);
        }
    }

    @Override
    public Collection<ContentKey> queryDirection(DirectionQuery query) {
        TreeSet<ContentKey> keys = new TreeSet<>();
        TimeUtil.Unit hours = TimeUtil.Unit.HOURS;
        DateTime time = query.getContentKey().getTime();
        if (query.isNext()) {
            handleNext(query, keys);
        } else {
            DateTime limitTime = query.getTtlTime().minusDays(1);
            while (keys.size() < query.getCount() && time.isAfter(limitTime)) {
                addKeys(query, keys, hours, time);
                time = time.minus(hours.getDuration());
            }
        }
        return keys;
    }

    private void handleNext(DirectionQuery query, Set<ContentKey> keys) {
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            fileSpokeStore.getNext(query.getChannelName(), query.getContentKey().toUrl(), query.getCount(), baos);
            String keyString = baos.toString();
            ContentKeyUtil.convertKeyStrings(keyString, keys);
        } catch (IOException e) {
            logger.warn("wah?" + query, e);
        }
    }

    private void addKeys(DirectionQuery query, TreeSet<ContentKey> keys, TimeUtil.Unit hours, DateTime time) {
        String path = query.getChannelName() + "/" + hours.format(time);
        ContentKeyUtil.convertKeyStrings(fileSpokeStore.readKeysInBucket(path), keys);
    }

    @Override
    public Optional<ContentKey> getLatest(String channel, ContentKey limitKey, Traces traces, boolean stable) {
        return ContentKeyUtil.convertKey(fileSpokeStore.getLatest(channel, limitKey.toUrl()));
    }

    @Override
    public void deleteBefore(String name, ContentKey limitKey) {
        throw new UnsupportedOperationException("deleteBefore is not supported");
    }

}