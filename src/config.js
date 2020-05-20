const { promisify: p } = require('util')
const path = require('path')
const fs = require('fs')
const toml = require('toml')
const open = require('open')

const CONFIG_EXAMPLE_PATH = path.join(__dirname, '../config-example.toml')

let cache,
    isWatching = false

module.exports = {
    async load(CONFIG_TOML_PATH) {
        const { send } = require('./bot.js')
        const source = await p(fs.readFile)(CONFIG_TOML_PATH).catch(async err => {
            send('warning', 'config.toml not found! copying the example file...')
            await p(fs.copyFile)(CONFIG_EXAMPLE_PATH, CONFIG_TOML_PATH)
            return await p(fs.readFile)(CONFIG_TOML_PATH)
        })

        if (!isWatching) {
            isWatching = true
            fs.watch(CONFIG_TOML_PATH, () => {
                send('info', ['config.toml changed, reloading...', 'grey'])
                module.exports.load()
            })
        }

        try {
            return (cache = toml.parse(source))
        } catch (err) {
            send('error', `syntax error in config.toml on line ${err.line} column ${err.column}`)

            await open(CONFIG_TOML_PATH, { app: 'notepad', wait: true })
            await this.load()
        }
    },

    async get(key, testFn = () => true) {
        if (!cache) {
            await this.load()
        }

        if (typeof cache[key] === 'undefined') {
            send('config_error', `config.toml '${key}' is missing`)

            return await this.get(key, testFn)
        }

        let isOk = false
        try {
            isOk = await testFn(cache[key])
        } finally {
            if (!isOk) {
                send('config_error', `config.toml '${key}' is invalid`)

                return await this.get(key, testFn)
            }
        }

        return cache[key]
    },

    async has(key) {
        if (!cache) {
            await this.load()
        }

        return typeof cache[key] !== 'undefined'
    },
}
