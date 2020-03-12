const k8s = require('@kubernetes/client-node')
const redis = require('redis')

const client = redis.createClient({ host: process.env.REDIS_HOST });

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.CoreV1Api)

const informer = k8s.makeInformer(kc, '/api/v1/pods', () => {
  return k8sApi.listPodForAllNamespaces()
})

informer.on('add', obj => { client.lpush(process.env.ADD_QUEUE_NAME, JSON.stringify(obj), redis.print) })
informer.on('update', obj =>{ client.lpush(process.env.ADD_QUEUE_NAME, JSON.stringify(obj), redis.print) })

informer.start();


