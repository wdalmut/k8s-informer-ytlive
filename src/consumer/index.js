const k8s = require('@kubernetes/client-node');
const redis = require('redis')
const bluebird = require('bluebird')
bluebird.promisifyAll(redis);

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const client = redis.createClient({ host: process.env.REDIS_HOST })

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

;(function get_from_queue(client) {
  client.brpoplpush(process.env.GET_QUEUE_NAME, process.env.PROCESSING_QUEUE_NAME, 0, (err, data) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }

    let key = data
    data = JSON.parse(data)

    k8sApi
      .readNamespacedPod(data.metadata.name, data.metadata.namespace, true)
      .then(pod => {
        if (!pod.body.metadata.labels || !pod.body.metadata.labels.uai) {
          console.log(`Updating pod: ${data.metadata.name}`)
          return k8sApi.patchNamespacedPod(
            pod.body.metadata.name,
            pod.body.metadata.namespace,
            {
              apiVersion: 'v1',
              kind: 'Pod',
              metadata: {
                labels: {
                  delete: "missing-uai"
                }
              }
            },
            true,
            undefined,
            undefined,
            undefined,
            {
              headers: {
                "content-type": "application/strategic-merge-patch+json"
              }
            }
          )
        }

        console.log(`Nothing to do on pod: ${pod.body.metadata.name}`)
        return pod
      })
      .then(pod => console.log(`All operations completed on pod: ${pod.body.metadata.name}`))
      .then(_ => client.lremAsync(process.env.PROCESSING_QUEUE_NAME, 0, key))
      .then(() => console.log(`Message completed for pod: ${data.metadata.name}`))
      .catch(err => {
        if (err.response && err.response.statusCode == 404) {
          console.log(`missing pod ${data.metadata.name}`)
          return client.lremAsync(process.env.PROCESSING_QUEUE_NAME, 0, key)
        }

        console.error(`error on ${data.metadata.name}`, err.response.body.message)
      })
      .finally(() => {
        return setImmediate(() => get_from_queue(client))
      })
  })
})(client);
