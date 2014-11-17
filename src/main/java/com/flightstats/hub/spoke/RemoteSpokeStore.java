package com.flightstats.hub.spoke;

import com.flightstats.hub.model.ContentKey;
import com.google.inject.Inject;
import com.sun.jersey.api.client.Client;
import com.sun.jersey.api.client.ClientResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.UnsupportedEncodingException;
import java.util.*;
import java.util.concurrent.*;

public class RemoteSpokeStore {

    private final static Logger logger = LoggerFactory.getLogger(RemoteSpokeStore.class);

    private final static Client client = create();

    private final SpokeCluster cluster;
    private final ExecutorService executorService;

    @Inject
    public RemoteSpokeStore(SpokeCluster cluster) {
        this.cluster = cluster;
        //todo - gfm - 11/13/14 - name this executorService
        executorService = Executors.newCachedThreadPool();
    }

    private static Client create() {
        Client client = Client.create();
        client.setConnectTimeout((int) TimeUnit.SECONDS.toMillis(5));
        client.setReadTimeout((int) TimeUnit.SECONDS.toMillis(5));
        return client;
    }

    public boolean write(String path, byte[] payload) throws InterruptedException {
        String[] servers = cluster.getServers();
        //todo - gfm - 11/13/14 - change this to be cluster aware
        int quorum = Math.max(1, servers.length - 1);
        /**
         * todo - gfm - 11/15/14 - this balloons to 60s if a spoke server is down
         */
        CountDownLatch countDownLatch = new CountDownLatch(quorum);

        for (final String server : servers) {
            //todo - gfm - 11/13/14 - we need to upgrade to Jersey 2.x for lambdas
            //noinspection Convert2Lambda
            executorService.submit(new Runnable() {
                @Override
                public void run() {
                    ClientResponse response = client.resource("http://" + server + "/spoke/payload/" + path)
                            .put(ClientResponse.class, payload);
                    if (response.getStatus() == 201) {
                        countDownLatch.countDown();
                    }
                    logger.trace("server {} path {} response {}", server, path, response);
                }
            });
        }
        //todo - gfm - 11/13/14 - this should be smarter with waiting.  should we return success if one succeeds?
        return countDownLatch.await(60, TimeUnit.SECONDS);
    }

    public com.flightstats.hub.model.Content read(String path, ContentKey key) {
        //todo - gfm - 11/13/14 - this could do read repair
        List<String> servers = Arrays.asList(cluster.getServers());
        Collections.shuffle(servers);
        /**
         * todo - gfm - 11/15/14 - this method returns some nulls during a rolling restart.
         * could be due to trying the down server last?
         */
        for (String server : servers) {
            try {
                ClientResponse response = client.resource("http://" + server + "/spoke/payload/" + path)
                        .get(ClientResponse.class);
                logger.trace("server {} path {} response {}", server, path, response);
                if (response.getStatus() == 200) {
                    byte[] entity = response.getEntity(byte[].class);
                    return SpokeMarshaller.toContent(entity, key);
                }
            } catch (Exception e) {
                logger.warn("unable to get content " + path, e);
            }
        }
        return null;
    }

    // read from 3 servers and do set intersection and sort
    public Collection<ContentKey> readTimeBucket(String path)throws InterruptedException {
        String[] servers = cluster.getServers();
        //todo - gfm - 11/13/14 - change this to be cluster aware
        // TODO bc 11/17/14: Can we make this read from a subset of the cluster and get all results?
        int quorum = servers.length;

        CompletionService<List<String>> compService = new ExecutorCompletionService<>(
                Executors.newFixedThreadPool(quorum));

        SortedSet<String> keySet = new TreeSet<>();  // result accumulator

        // Futures for all submitted Callables that have not yet been checked
        Set<Future<List<String>>> futures = new HashSet<>();

        for (final String server : servers) {
            // keep track of the futures that get created so we can cancel them if necessary
            futures.add(compService.submit(new Callable<List<String>>(){
                @Override public List<String> call(){
                    ClientResponse response = client.resource("http://" + server + "/spoke/time/" + path)
                            .get(ClientResponse.class);
                    logger.trace("server {} path {} response {}", server, path, response);

                    if (response.getStatus() == 200) {
                        byte[] entity = response.getEntity(byte[].class);
                        String keysString = null;
                        try {
                            keysString = new String(entity, "UTF-8");
                        } catch (UnsupportedEncodingException e) {
                            // TODO bc 11/17/14: better way to handle this?
                            e.printStackTrace();
                        }
                        String[] keys = keysString.split(",");
                        return Arrays.asList(keys);
                    }
                    logger.trace("server {} path {} response {}", server, path, response);
                    return new Vector<>(); // TODO bc 11/17/14: should this be an exception?
                }
            }));
        }

        int received = 0;
        boolean errors = false;

        //todo - gfm - 11/17/14 - I think this needs a different definition of quorum
        while(received < quorum && !errors) {
            Future<List<String>> resultFuture = compService.take(); //blocks if none available
            try {
                List<String> keys = resultFuture.get();
                keySet.addAll(keys);
                received ++;
            }
            catch(Exception e) {
                //log
                errors = true;
            }
        }
        Vector<ContentKey> contentKeys = new Vector<>();
        for(String key : keySet){
            ContentKey.fromUrl(key);
        }
        return contentKeys;
    }


    public boolean delete(String path) throws Exception {
        //todo - gfm - 11/13/14 - this could be merged with some of the write code
        String[] servers = cluster.getServers();
        //todo - gfm - 11/13/14 - change this to be cluster aware
        int quorum = Math.max(1, servers.length - 1);
        CountDownLatch countDownLatch = new CountDownLatch(quorum);
        for (final String server : servers) {
            //todo - gfm - 11/13/14 - we need to upgrade to Jersey 2.x for lambdas
            //noinspection Convert2Lambda
            executorService.submit(new Runnable() {
                @Override
                public void run() {
                    ClientResponse response = client.resource("http://" + server + "/spoke/payload/" + path)
                            .delete(ClientResponse.class);
                    if (response.getStatus() < 400) {
                        countDownLatch.countDown();
                    }
                    logger.trace("server {} path {} response {}", server, path, response);
                }
            });
        }

        //todo - gfm - 11/13/14 - this should be smarter with waiting.  should we return success if one succeeds?
        return countDownLatch.await(60, TimeUnit.SECONDS);
    }
}