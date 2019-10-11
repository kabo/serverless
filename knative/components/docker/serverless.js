const Dockerode = require('dockerode')
const { mergeDeepRight } = require('ramda')
const { Component } = require('@serverless/core')

const defaults = {
  dockerHost: '127.0.0.1',
  dockerPort: 3000,
  dockerfile: 'Dockerfile',
  context: process.cwd(),
  registryAddress: 'https://index.docker.io/v1',
  push: false
}

class Docker extends Component {
  async default(inputs = {}) {
    const config = mergeDeepRight(defaults, inputs)
    const {
      dockerfile,
      context,
      dockerHost,
      dockerPort,
      push,
      repository,
      tag,
      registryAddress
    } = config

    const docker = this.getDockerClient({ dockerHost, dockerPort })
    await this.isDockerRunning(docker)

    await this.buildImage(docker, { dockerfile, context, repository, tag })

    if (push) {
      const { username, password } = this.context.instance.credentials.docker
      const auth = {
        username,
        password,
        serveraddress: registryAddress
      }
      await this.pushImage(docker, { repository, tag, auth })
    }

    this.state = config
    await this.save()
    return this.state
  }

  async remove(inputs = {}) {
    const config = mergeDeepRight(defaults, inputs)
    const { dockerHost, dockerPort, repository, tag } = config || this.state

    const docker = this.getDockerClient({ dockerHost, dockerPort })
    await this.isDockerRunning(docker)

    await this.removeImage(docker, { repository, tag })

    this.state = {}
    await this.save()

    return {}
  }

  // "private" methods
  getDockerClient({ dockerHost, dockerPort }) {
    return new Dockerode({ dockerHost, dockerPort })
  }

  async isDockerRunning(docker) {
    try {
      await docker.listContainers()
    } catch (error) {
      throw new Error('Docker is not running. Please check your config and try again...')
    }
  }

  async buildImage(docker, { dockerfile, context, repository, tag }) {
    const t = `${repository}:${tag}`
    const stream = await docker.buildImage({ context }, { dockerfile, t })
    return new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => {
        if (err) {
          return reject(err)
        }
        return resolve(res)
      })
    })
  }

  async removeImage(docker, { repository, tag }) {
    const imageName = `${repository}:${tag}`
    const image = docker.getImage(imageName)
    return image.remove({ name: repository })
  }

  async pushImage(docker, { repository, tag, auth }) {
    const imageName = `${repository}:${tag}`
    const image = docker.getImage(imageName)
    return image.push(
      { name: repository, tag },
      async (err, stream) => {
        if (err) {
          throw new Error(err)
        }
        return new Promise((resolve, reject) => {
          docker.modem.followProgress(stream, (err, res) => {
            if (err) {
              return reject(err)
            }
            return resolve(res)
          })
        })
      },
      auth
    )
  }
}

module.exports = Docker
