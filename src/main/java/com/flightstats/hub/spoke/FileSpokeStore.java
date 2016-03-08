package com.flightstats.hub.spoke;

import com.flightstats.hub.app.HubProperties;
import com.flightstats.hub.model.ContentKey;
import com.flightstats.hub.model.MinutePath;
import com.flightstats.hub.util.TimeUtil;
import com.google.common.annotations.VisibleForTesting;
import com.google.common.io.ByteStreams;
import com.google.inject.Inject;
import com.google.inject.name.Named;
import org.apache.commons.io.FileUtils;
import org.apache.commons.io.filefilter.WildcardFileFilter;
import org.apache.commons.lang3.StringUtils;
import org.joda.time.DateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.*;
import java.util.Arrays;
import java.util.Collection;

/**
 * Direct interactions with the file system
 */
public class FileSpokeStore {

    private final static Logger logger = LoggerFactory.getLogger(FileSpokeStore.class);

    private final String storagePath;
    private static final int ttlMinutes = HubProperties.getProperty("spoke.ttlMinutes", 60);

    @Inject
    public FileSpokeStore(@Named("spoke.path") String storagePath) {
        this.storagePath = StringUtils.appendIfMissing(storagePath, "/");
        logger.info("starting with storage path " + this.storagePath);
        if (!write("hub-startup/" + new ContentKey().toUrl(), ("" + System.currentTimeMillis()).getBytes())) {
            throw new RuntimeException("unable to create startup file");
        }
    }

    public boolean write(String path, byte[] payload) {
        return write(path, new ByteArrayInputStream(payload));
    }

    public boolean write(String path, InputStream input) {
        File file = spokeFilePathPart(path);
        logger.trace("writing {}", file);
        file.getParentFile().mkdirs();
        try (FileOutputStream output = new FileOutputStream(file)) {
            ByteStreams.copy(input, output);
            return true;
        } catch (IOException e) {
            logger.info("unable to write to " + path, e);
            return false;
        }
    }

    public byte[] read(String path) {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        read(path, baos);
        return baos.toByteArray();
    }

    public void read(String path, OutputStream output) {
        File file = spokeFilePathPart(path);
        logger.trace("reading {}", file);
        try (FileInputStream input = new FileInputStream(file)) {
            ByteStreams.copy(input, output);
        } catch (FileNotFoundException e) {
            logger.debug("file not found {}", path);
        } catch (IOException e) {
            logger.info("unable to read from " + path, e);
        }
    }

    public String readKeysInBucket(String path) {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        keysInBucket(path, baos);
        return baos.toString();
    }

    public void readKeysInBucket(String path, OutputStream output) {
        keysInBucket(path, output);
    }

    public boolean delete(String path) throws Exception {
        FileUtils.deleteDirectory(new File(storagePath + path));
        return true;
    }

    // given a url containing a key, return the file format
    // example: "test_0_4274725520517677/2014/11/18/00/57/24/015/NV2cl5"
    @VisibleForTesting
    File spokeFilePathPart(String urlPathPart) {
        String[] split = StringUtils.split(urlPathPart, "/");
        if (split.length >= 7 && split.length <= 8)
            return new File(storagePath + split[0] + "/" + split[1] + "/" + split[2] + "/" + split[3] + "/" + split[4]
                    + "/" + split[5]);
        if (split.length < 7)
            return new File(storagePath + urlPathPart);
        return new File(storagePath + split[0] + "/" + split[1] + "/" + split[2] + "/" + split[3] + "/" + split[4]
                + "/" + split[5] + "/" + split[6] + split[7] + split[8]);
    }


    //Given a File, return a key part (full key, or time path part)
    String spokeKeyFromPath(String path) {
        if (path.contains(storagePath))
            path = path.substring(storagePath.length());

        // file or directory?
        int i = path.lastIndexOf("/");
        String suffix = path.substring(i + 1);
        if (suffix.length() > 4) {
            // presence of second proves file aims at a full payload path
            String folderPath = path.substring(0, i);
            String seconds = suffix.substring(0, 2);
            String milliseconds = suffix.substring(2, 5);
            String hash = suffix.substring(5);
            return folderPath + "/" + seconds + "/" + milliseconds + "/" + hash;
        }
        // file is a directory
        return path;
    }

    void keysInBucket(String key, OutputStream output) {
        String path = spokeFilePathPart(key).getAbsolutePath();
        logger.trace("path {}", path);
        String resolution = SpokePathUtil.smallestTimeResolution(key);
        File directory = new File(path);

        if (!directory.exists()) {
            return;
        }
        try {
            Collection<File> files;
            if (resolution.equals("second")) {
                // filter all files in the minute folder that start with seconds
                FileFilter fileFilter = new WildcardFileFilter(SpokePathUtil.second(key) + "*");
                files = Arrays.asList(directory.listFiles(fileFilter));
            } else {
                files = FileUtils.listFiles(new File(path), null, true);
            }
            for (File aFile : files) {
                String filePath = aFile.getPath();
                logger.trace("filePath {}", filePath);
                String keyFromPath = spokeKeyFromPath(aFile.getAbsolutePath());
                writeKey(output, keyFromPath);
            }
        } catch (Exception e) {
            logger.info("error with " + path, e);
        }
    }

    private void writeKey(OutputStream output, String keyFromPath) throws IOException {
        output.write(keyFromPath.getBytes());
        output.write(",".getBytes());
    }

    @VisibleForTesting
    Collection<String> keysInBucket(String key) {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        keysInBucket(key, baos);
        String[] split = baos.toString().split(",");
        return Arrays.asList(split);
    }

    public String getLatest(String channel, String limitPath) {
        logger.trace("latest {} {}", channel, limitPath);
        String[] split = StringUtils.split(limitPath, "/");
        split = new String[]{split[0], split[1], split[2], split[3], split[4], split[5] + split[6] + split[7]};
        String last = recurseLatest(channel, split, 0, channel);
        if (last == null) {
            DateTime ttlTime = TimeUtil.now().minusMinutes(ttlMinutes);
            DateTime limitTime = TimeUtil.millis(StringUtils.substringBeforeLast(limitPath, "/") + "/");
            DateTime previous = limitTime.minusHours(1).withMinuteOfHour(59).withSecondOfMinute(59).withMillisOfSecond(999);
            logger.trace("previous {} ttltime {}", previous, ttlTime);
            if (previous.isBefore(ttlTime)) {
                logger.trace("Previous is before ttlTime returning null");
                return null;
            }
            logger.trace("Previous is after ttlTime getting latest for previous {}", ContentKey.lastKey(previous).toUrl());
            return getLatest(channel, ContentKey.lastKey(previous).toUrl());
        } else {
            String latest = spokeKeyFromPath(last);
            logger.trace("returning latest {} for limit {}", latest, limitPath);
            return latest;
        }
    }

    private String recurseLatest(String path, String[] limitPath, int count, String channel) {
        logger.trace("recurseLatest path {}, limitPath {}, count {}, channel {}", path, limitPath, count, channel);
        String base = " ";
        String pathname = storagePath + path;
        String[] items = new File(pathname).list();
        if (items == null) {
            logger.trace("path not found {}", pathname);
            return null;
        }
        String limitCompare = channel + "/";
        for (int i = 0; i <= count; i++) {
            limitCompare += limitPath[i] + "/";
        }
        for (String item : items) {
            if (item.compareTo(base) > 0) {
                if ((path + "/" + item).compareTo(limitCompare) <= 0) {
                    base = item;
                }
            }
        }
        if (base.equals(" ")) {
            return null;
        }
        logger.trace("count {} base {} path {}", count, base, path);
        if (count == 5) {
            return path + "/" + base;
        }
        count++;
        return recurseLatest(path + "/" + base, limitPath, count, channel);
    }

    /**
     * This may return more than the request count, as this does not do any sorting.
     */
    public void getNext(String channel, String startKey, int count, OutputStream output) throws IOException {
        DateTime now = TimeUtil.now();
        String channelPath = storagePath + channel + "/";
        logger.trace("next {} {} {}", channel, startKey, now);
        ContentKey start = ContentKey.fromUrl(startKey).get();
        int found = 0;
        MinutePath minutePath = new MinutePath(start.getTime());
        boolean firstMinute = true;
        do {
            String minuteUrl = minutePath.toUrl();
            String minute = channelPath + minuteUrl;
            logger.trace("minute {}", minute);
            String[] items = new File(minute).list();
            if (items != null) {
                for (String item : items) {
                    String keyFromPath = spokeKeyFromPath(minuteUrl + "/" + item);
                    if (firstMinute) {
                        ContentKey key = ContentKey.fromUrl(keyFromPath).get();
                        if (key.compareTo(start) > 0) {
                            found++;
                            writeKey(output, channel + "/" + keyFromPath);
                        }
                    } else {
                        found++;
                        writeKey(output, channel + "/" + keyFromPath);
                    }
                }
            }
            minutePath = new MinutePath(minutePath.getTime().plusMinutes(1));
            firstMinute = false;
        } while (found < count && minutePath.getTime().isBefore(now));
    }

    public void enforceTtl(String channel, DateTime dateTime) {
        String limitPath = TimeUtil.minutes(dateTime);
        logger.debug("enforceTtl {} {}", channel, limitPath);
        String[] split = StringUtils.split(limitPath, "/");
        split = new String[]{split[0], split[1], split[2], split[3], split[4]};
        recurseDelete(channel, split, 0, channel);
    }

    private void recurseDelete(String path, String[] limitPath, int count, String channel) {
        logger.trace("recurse delete {} {}", path, count);
        String pathname = storagePath + path;
        String[] items = new File(pathname).list();
        if (items == null) {
            logger.trace("path not found {}", pathname);
            return;
        }
        String limitCompare = channel + "/";
        for (int i = 0; i <= count; i++) {
            limitCompare += limitPath[i] + "/";
        }
        for (String item : items) {
            logger.info("looking at {} {}", item, limitCompare);
            String current = path + "/" + item + "/";
            if (current.compareTo(limitCompare) <= 0) {
                if (count < 4) {
                    recurseDelete(path + "/" + item, limitPath, count + 1, channel);
                } else {
                    logger.info("deleting {}", storagePath + "/" + current);
                    FileUtils.deleteQuietly(new File(storagePath + "/" + current));
                }
            }
        }
        if (count == 4) {
            return;
        }
    }

}
