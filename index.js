const { basename: pathBasename, join, resolve } = require('path')
const fs = require('fs')
const penthouse = require('penthouse')
const webalize = require('webalize')
const RawModule = require('webpack/lib/RawModule')

const PLUGIN_NAME = 'critical-css-webpack-plugin'
const CHUNK_NAME = 'criticalcss'

class CriticalCssWebpackPlugin {
  constructor (options = {}) {

    if (options.penthouse) {
      // remove unsupported options from penthouse settings
      delete options.penthouse.url
      delete options.penthouse.cssString
      delete options.penthouse.css
    }

    this.options = { ...this.getDefaultOptions(), ...options }
  }

  apply (compiler) {

    compiler.hooks.make.tap(PLUGIN_NAME, compilation => {
      // create criticalcss chunk
      this.createChunk(compilation)

      compilation.hooks.optimizeAssets.tap(PLUGIN_NAME, () => {
        const chunk = compilation.namedChunks.get(CHUNK_NAME)
        delete compilation.assets[chunk.files[0]]
        chunk.files = []
        for (let name in this.options.urls) {
          const filename = this.getOutputFilename(name, compilation)
          const file = join(compilation.outputOptions.path, filename)

          chunk.files.push(filename)
          fs.writeFileSync(file, '')
          this.addAsset(file, compilation)
        }
      })
    })

    compiler.hooks.afterCompile.tap(PLUGIN_NAME, compilation => {
      if (!this.options.urls) {
        // Stop processing when urls are missing in option object
        return false
      }

      // Find css files and test againt options defined `cssMatch` property.
      const { cssMatch } = this.options
      const cssString = Object.keys(compilation.assets).
        filter(filename => /\.css$/.test(filename)).
        filter(filename => cssMatch ? cssMatch.test(filename) : true).
        map(filename => compilation.assets[filename].source()).join('')

      if (!cssString) {
        return false
      }

      this.options.penthouse.cssString = cssString
    })

    compiler.hooks.afterEmit.tapAsync(PLUGIN_NAME, async (compilation, callback) => {
      if (!this.options.penthouse.cssString) {
        return callback()
      }

      const tasks = []
      for (let name in this.options.urls) {
        const url = this.options.urls[name]
        tasks.push(this.generate(name, url, compilation))
      }


      try {
        // Run three tasks in paralel
        await Promise.all(tasks)
      } catch (err) {
        compilation.errors.push(err)
        return callback()
      }

      return callback()
    })
  }

  generate (name, url, compilation) {
    if (!url || !name) {
      return Promise.resolve()
    }

    return penthouse({ url, ...this.options.penthouse }).then(criticalCss => {
      const filename = this.getOutputFilename(name, compilation)
      const file = join(compilation.outputOptions.path, filename)

      fs.writeFileSync(file, criticalCss)
    })
  }

  addAsset (filename, compilation) {
    const file = fs.readFileSync(filename, 'utf-8')
    filename = resolve(compilation.compiler.context, filename)

    const basename = pathBasename(filename)
    compilation.assets[basename] = {
      source: () => file,
      size: () => Buffer.byteLength(file, 'utf8'),
    }
  }

  getOutputFilename (name, compilation) {
    let { filename } = this.options
    name = webalize.webalize(name)

    // handle [name]
    if (filename.includes('[name]')) {
      filename = filename.replace('[name]', name)
    } else {
      filename += `${name}.`
    }

    // handle [hash]
    if (filename.includes('[hash]')) {
      filename = filename.replace('[hash]', compilation.hash)
    }

    return filename
  }

  createChunk (compilation) {
    const chunk = compilation.addChunk(CHUNK_NAME)
    const webpackModule = new RawModule('', `${CHUNK_NAME}-module`)
    webpackModule.buildInfo = {}
    webpackModule.buildMeta = {}
    webpackModule.hash = ''
    chunk.addModule(webpackModule)
  }

  nextUrl () {
    const keys = Object.keys(this.options.urls)

    if (keys) {
      const output = {
        name: keys[0],
        url: this.options.urls[keys[0]],
      }

      delete this.options.urls[keys[0]]
      return output
    }

    return {}
  }

  getDefaultOptions () {
    return {
      urls: {},
      filename: '[name].critical.css',
      cssMatch: false,
      penthouse: {
        width: 1920,
        height: 1920,
      },
    }
  }
}

module.exports = CriticalCssWebpackPlugin
