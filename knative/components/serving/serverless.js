const path = require('path')
const { mergeDeepRight } = require('ramda')
const kubernetes = require('@kubernetes/client-node')
const { Component } = require('@serverless/core')

const defaults = {
  kubeConfigPath: path.join(process.env.HOME, '.kube', 'config'),
  apiVersion: '1.13',
  registryAddress: 'https://index.docker.io/v1',
  namespace: 'default'
}

class KnativeServing extends Component {
  async default(inputs = {}) {
    const config = mergeDeepRight(defaults, inputs)

    const { name, repository, tag, registryAddress, namespace, apiVersion, kubeConfigPath } = config

    const k8s = this.getKubernetesClient(kubeConfigPath, apiVersion)

    const manifest = this.createManifest({
      name,
      namespace,
      registryAddress,
      repository,
      tag
    })
    const res = await this.createService(k8s, { namespace, manifest })

    console.log(JSON.stringify(res, null, 2))

    this.state = config

    await this.save()
    return this.state
  }

  async remove(inputs = {}) {
    const config = mergeDeepRight(defaults, inputs)
    const { apiVersion, kubeConfigPath } = config || this.state

    const k8s = this.getKubernetesClient(kubeConfigPath, apiVersion)
    // await this.foo(k8s, { foo: 'bar' })

    this.state = {}
    await this.save()

    return {}
  }

  // "private" methods
  getKubernetesClient(configPath, version) {
    // TODO: update to use kube config path and api version
    let kc = new kubernetes.KubeConfig()
    kc.loadFromDefault()
    kc = kc.makeApiClient(kubernetes.CustomObjectsApi)
    return kc
  }

  createManifest({ name, namespace, registryAddress, repository, tag }) {
    return {
      apiVersion: 'serving.knative.dev/v1alpha1',
      kind: 'Service',
      metadata: {
        name,
        namespace
      },
      spec: {
        template: {
          spec: {
            containers: [
              {
                image: `${registryAddress}/${repository}:${tag}`
              }
            ]
          }
        }
      }
    }
  }

  async createService(k8s, { namespace, manifest }) {
    return k8s.createNamespacedCustomObject(
      'serving.knative.dev',
      'v1alpha1',
      namespace,
      'services',
      manifest
    )
  }
}

module.exports = KnativeServing
