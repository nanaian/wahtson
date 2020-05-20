const { promisify: p } = require('util')
const path = require('path')
const fs = require('fs')
const toml = require('toml')
const CONFIG_EXAMPLE_PATH = path.join(__dirname, '../config-example.toml')

let cache,
    isWatching = false

module.exports = {
    async load(CONFIG_TOML_PATH) {
        let { send } = require('./bot.js')

        const source = await p(fs.readFile)(CONFIG_TOML_PATH).catch(async err => {
            send({
                type: 'ERROR',
                precaution: 'COPY_EXAMPLE_CONFIG',
                text: 'config.toml not found! copying the example file...',
            })
            await p(fs.copyFile)(CONFIG_EXAMPLE_PATH, CONFIG_TOML_PATH)

            return await p(fs.readFile)(CONFIG_TOML_PATH)
        })

        if (!isWatching) {
            isWatching = true
            fs.watch(CONFIG_TOML_PATH, () => {
                send({ type: 'DEBUG', text: 'config.toml changed, reloading...' })
                module.exports.load(CONFIG_TOML_PATH)
            })
        }

        try {
            return (cache = toml.parse(source))
        } catch (err) {
            send({
                type: 'ERROR',
                precaution: 'OPEN_CONFIG',
                text: `syntax error in config.toml on line ${err.line} column ${err.column}`,
            })

            //await this.load(CONFIG_TOML_PATH)
        }
    },

    async get(key, testFn = () => true) {
        let { send } = require('./bot.js')
    
        if (!cache) {
            await this.load(CONFIG_TOML_PATH)
        }

        if (typeof cache[key] === 'undefined') {
            send({
                type: 'ERROR',
                precaution: 'OPEN_CONFIG',
                text: `config.toml '${key}' is missing`,
            })
        }

        let isOk = false
        try {
            isOk = await testFn(cache[key])
        } finally {
            if (!isOk) {
                send({
                    type: 'ERROR',
                    precaution: 'OPEN_CONFIG',
                    text: `config.toml '${key}' is invalid`,
                })

                return await this.get(key, testFn)
            }
        }

        return cache[key]
    },

    async has(key) {
        if (!cache) {
            await this.load(CONFIG_TOML_PATH)
        }

        return typeof cache[key] !== 'undefined'
    },
}
