const { Client } = require('discord.js')
const chalk = require('chalk')
const open = require('open')
const sqlite = require('sqlite')
const { Database } = require('sqlite3')
const sql = require('sql-template-strings')
const shortEmoji = require('emoji-to-short-name')
const path = require('path')

const config = require('./config.js')
const { safeToString, handlePlaceholders, sleep, userHasItem } = require('./util.js')
const actionFunctions = require('./actions.js')
const conditionFunctions = require('./conditions.js')
const { version } = require('../package.json')

const client = new Client()
let guild, db

const EventEmitter = require('events')

let send

module.exports = {
    Wahtson: class Bot extends EventEmitter {
        constructor(botOptions) {
            super()
            this.botOptions = botOptions || { configPath: path.join(__dirname, '../config.toml'), dbPath: path.join(__dirname, '../database.sqlite') }
            this.version = version

            send = async event => {
                this.emit('event', event)
            }
            module.exports.send = async event => {
                this.emit('event', event)
            }
        }
        async start() {
            await module.exports.send

            let configPath = this.botOptions.configPath
            config
                .load(configPath)
                .then(() =>
                    sqlite.open({
                        filename: this.botOptions.dbPath,
                        driver: Database,
                    }),
                )
                .then(async _db => {
                    db = _db
                    await db.migrate()
                    this.emit('ready', config)
                })
                .then(async () => {
                    config.get('bot_token', async token => {
                        await client.login(token)
                        return true
                    })
                })
                .catch(err => {
                    send({ type: 'FATAL', text: err })
                })
        }
    },
}

client.once('ready', async () => {
    send({ type: 'STATUS', text: 'Connected' })

    const serverId = await config.get('server_id')

    guild = client.guilds.cache.find(g => g.id === serverId)
    if (!guild) {
        send({ type: 'WARN', text: 'Bot is not present in configured server!' })
        send({ type: 'WARN', text: 'Please invite it using your browser.' })

        const { id } = await client.fetchApplication()
        await open(
            `https://discordapp.com/oauth2/authorize?client_id=${id}&scope=bot&guild_id=${serverId}`,
        )

        while (true) {
            await sleep(1000)

            guild = client.guilds.cache.find(g => g.id === serverId)
            if (guild) {
                break
            }
        }
    }

    send({ type: 'STATUS', text: 'Server found. listening for commands...' })
})

client.on('message', async msg => {
    if (!guild) return
    if (msg.guild && msg.guild.id !== guild.id) return
    if (msg.author.bot) return

    if (await config.has('commands')) {
        const { commandAttempted, commandString, commandConfig, args } = await parseMessage(msg)

        if (!commandAttempted) {
            const member = msg.member || (await guild.members.fetch(msg.author))
            if (!(await config.has('on_message'))) return
            await executeActionChain(await config.get('on_message'), {
                event_call: 'on_message',
                message: msg,
                channel: msg.channel,
                member: msg.member,
                command: null,
                limitLog: (await config.get('on_message')).limit_log,
                args: [],
            })
        } else {
            const member = msg.member || (await guild.members.fetch(msg.author))

            if (!member) return // Not a member of the server

            send({
                type: 'INFO',
                text: `@${member.displayName} issued command: ${msg.cleanContent}`,
            })

            if (commandConfig) {
                await executeActionChain(commandConfig.actions, {
                    event_call: 'command',
                    message: msg,
                    channel: msg.channel,
                    member: member,
                    command: commandString,
                    limitLog: commandConfig.limit_log,
                    args: args.filter(el => el != ''),
                })
            } else {
                await executeActionChain(await config.get('on_unknown_command'), {
                    event_call: 'on_unknown_command',
                    message: msg,
                    channel: msg.channel,
                    member: member,
                    command: commandString,
                    args: args.filter(el => el != ''),
                })
            }
        }
    }
})

client.on('guildMemberAdd', async member => {
    if (!guild) return
    if (member.guild.id !== guild.id) return

    send({ type: 'INFO', text: `@${member.displayName} joined`, cyan })

    await executeActionChain(await config.get('on_new_member'), {
        event_call: 'on_new_member',
        message: null,
        channel: null,
        member: member,
        command: null,
        args: [],
    })
})

// Emit messageReactionAdd/Remove events even for uncached messages.
client.on('raw', async packet => {
    if (!['MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE'].includes(packet.t)) return

    const channel = client.channels.cache.get(packet.d.channel_id)

    // Cached message; event will fire anyway.
    if (channel.messages.cache.has(packet.d.message_id)) return

    const message = await channel.messages.fetch(packet.d.message_id)
    const emoji = packet.d.emoji.id
        ? `${packet.d.emoji.name}:${packet.d.emoji.id}`
        : packet.d.emoji.name

    const reaction = message.reactions.cache.get(emoji)
    if (reaction)
        reaction.users.cache.set(packet.d.user_id, client.users.cache.get(packet.d.user_id))

    if (packet.t === 'MESSAGE_REACTION_ADD') {
        client.emit('messageReactionAdd', reaction, client.users.cache.get(packet.d.user_id))
    } else if (packet.t === 'MESSAGE_REACTION_REMOVE') {
        client.emit('messageReactionRemove', reaction, client.users.cache.get(packet.d.user_id))
    }
})

client.on('messageReactionAdd', async (reaction, user) => {
    if (!guild) return
    if (!reaction || reaction.message.guild.id !== guild.id) return

    const member = await guild.members.fetch(user)

    if (await config.has('pin')) {
        await handlePossiblePin(reaction)
    }

    if (await config.has('reactions')) {
        for (const rConfig of await config.get('reactions')) {
            if (rConfig.message && rConfig.message !== reaction.message.id) {
                continue
            }

            const opts = makeResolvable(rConfig)
            const wantedEmoji = opts.getEmoji('emoji')

            if (reaction.emoji.name === wantedEmoji) {
                send({ type: 'INFO', text: `@${member.displayName} added ${wantedEmoji} reaction` })

                await executeActionChain(rConfig.add_actions, {
                    event_call: 'reaction_add',
                    message: reaction.message,
                    channel: reaction.message.channel,
                    member,
                    command: null,
                    limitLog: rConfig.limit_log,
                    args: [],
                })
            }
        }
    }
})

client.on('messageReactionRemove', async (reaction, user) => {
    if (!guild) return
    if (!reaction || reaction.message.guild.id !== guild.id) return

    const member = await guild.members.fetch(user)

    if (await config.has('reactions')) {
        for (const rConfig of await config.get('reactions')) {
            if (rConfig.message && rConfig.message !== reaction.message.id) {
                continue
            }

            const opts = makeResolvable(rConfig)
            const wantedEmoji = opts.getEmoji('emoji')

            if (reaction.emoji.name === wantedEmoji) {
                send({
                    type: 'INFO',
                    text: `@${member.displayName} removed ${wantedEmoji} reaction`,
                })

                await executeActionChain(rConfig.remove_actions, {
                    event_call: 'reaction_remove',
                    message: reaction.message,
                    channel: reaction.message.channel,
                    member,
                    command: null,
                    args: [],
                })
            }
        }
    }
})

async function handlePossiblePin(reaction) {
    const pinConfig = await config.get('pin')
    const opts = makeResolvable(pinConfig)

    const { getChannel: getDisallowChannel } = makeResolvable(pinConfig.disallow_from)
    for (let i = 0; i < pinConfig.disallow_from.length; i++) {
        const channel = getDisallowChannel(0)

        if (reaction.message.channel.id === channel.id) return
    }

    if (
        reaction.count >= opts.getNumber('count') &&
        reaction.emoji.name === opts.getEmoji('emoji')
    ) {
        const isPinned = !!(await db.get(
            sql`SELECT * FROM pins WHERE msgid=${reaction.message.id}`,
        ))

        if (!isPinned) {
            send({ type: 'INFO', text: `Pinning message` })

            await db.run(sql`INSERT INTO pins VALUES (${reaction.message.id})`)

            await executeActionChain(pinConfig.actions, {
                event_call: 'pin',
                message: reaction.message,
                channel: reaction.message.channel,
                member: reaction.message.member,
                command: null,
                args: [],
            })
        }
    }
}

async function executeActionChain(actions, source) {
    let state = {
        previousActionsSkipped: [false],
        db: db,
        config: config,
        executeActionChain: executeActionChain,
        avatar: client.user.displayAvatarURL(),
    }

    for (let idx = 0; idx < actions.length; idx++) {
        let action = JSON.parse(JSON.stringify(actions[idx]))

        if (action.modifiers) {
            for (let i = 0; i < Object.keys(action.modifiers).length; i++) {
                let mod = action.modifiers[Object.keys(action.modifiers)[i]]

                if (await userHasItem(source.member.id, mod.item, db)) {
                    for (key in mod.options) {
                        action[key] = mod.options[key]
                    }
                }
            }
        }
        action = await placeholdersInOpts(action, source)

        if (action.when) {
            const conditions = Array.isArray(action.when) ? action.when : [action.when]
            let conditionsOk = true

            for (const condition of conditions) {
                const conditionFn = conditionFunctions[condition.type]

                if (!conditionFn) {
                    send({
                        type: 'ERROR',
                        text: `Error: unknown condition type '${condition.type}'`,
                    })
                    conditionsOk = false
                    break
                }

                let ok
                try {
                    ok = await conditionFn(source, makeResolvable(condition), state)
                } catch (err) {
                    send({ type: 'ERROR', text: `Error: '${err}'` })
                    conditionsOk = false
                    break
                }

                if (condition.negate) {
                    ok = !ok
                }

                if (!ok) {
                    conditionsOk = false
                    break
                }
            }

            if (!conditionsOk) {
                state.previousActionsSkipped.push(true)
                send({
                    type: 'ACTION',
                    index: idx + 1,
                    data: action,
                    skipped: true,
                    length: actions.length,
                })
                continue
            }
        }

        const fn = actionFunctions[action.type]

        if (!fn) {
            send({ type: 'ERROR', text: 'Error: unknown action type' })
            continue
        }

        await fn(source, makeResolvable(action), state).catch(err => {
            send({ type: 'ERROR', text: `Error: ${err}` })
        })

        state.previousActionsSkipped.push(false)

        send({
            type: 'ACTION',
            index: idx + 1,
            data: action,
            skipped: false,
            length: actions.length,
        })
    }
}

async function parseMessage(msg) {
    const prefix = await config.get('command_prefix')

    let substring
    if (msg.content.startsWith(prefix)) {
        substring = msg.content.substring(prefix.length)
    } else if (msg.channel.type === 'dm') {
        // In DMs, leaving the command prefix out is allowed.
        substring = msg.content
    } else {
        // Message is not a command.
        return { commandAttempted: false }
    }

    const [commandString, ...rest] = substring.split(' ')
    const argString = rest.join(' ')

    return {
        commandAttempted: true,

        commandString,
        commandConfig: (await config.get('commands')).find(cmd => {
            const [commandName] = cmd.usage.split(' ') // TODO: parse properly
            return commandName === commandString
        }),

        args: argString.split(' '), // TODO: parse properly
    }
}

function makeResolvable(map) {
    const resolveKey = key => {
        if (typeof map[key] === 'undefined') {
            throw `action option '${key}' is missing`
        }

        return map[key]
    }

    return {
        getKeys() {
            return Object.keys(map)
        },

        has(key) {
            return map.hasOwnProperty(key)
        },

        getString(key) {
            return safeToString(resolveKey(key))
        },

        // Resolves to a string intended as message content.
        getText(key) {
            const value = resolveKey(key)

            // TODO: text parsing (variable substitution, #channel resolution, etc)

            return value
        },

        getNumber(key) {
            if (isNaN(+resolveKey(key))) throw `'${key}' is not a number`
            return +resolveKey(key)
        },

        getBoolean(key, defaultVal = false) {
            try {
                return resolveKey(key)
            } catch (e) {
                return defaultVal
            }
        },

        // Resolves to a Role by name or id.
        getRole(key) {
            const roleNameOrId = resolveKey(key)
            const role = guild.roles.cache.find(role => {
                return role.name === roleNameOrId || role.id === roleNameOrId
            })

            if (!role) {
                throw `unable to resolve role '${roleNameOrId}'`
            }

            return role
        },

        // Resolves to a TextChannel by #name or id (DM).
        getChannel(key) {
            const raw = resolveKey(key)

            let channel
            if (raw.startsWith('#')) {
                // By name
                const channelName = raw.substr(1)

                channel = guild.channels.cache.find(c => c.name === channelName)
            } else {
                // By ID
                channel = guild.channels.cache.find(c => c.id === raw)
            }

            if (!channel) {
                throw `unable to resolve channel '${raw}'`
            }

            return channel
        },

        // Resolves an emoji to its Emoji#name. Enclosing colons are optional.
        getEmoji(key) {
            const maybeWithColons = resolveKey(key)
            const withoutColons = maybeWithColons.startsWith(':')
                ? maybeWithColons.substr(1, maybeWithColons.length - 2)
                : maybeWithColons

            const emoji = guild.emojis.cache.find(emoji => {
                return emoji.name === withoutColons
            })

            if (!emoji) {
                const decoded = shortEmoji.decode(`:${withoutColons}:`)

                if (decoded.startsWith(':')) {
                    throw `unable to resolve emoji: ${maybeWithColons}`
                }

                return decoded
            }

            return emoji.name
        },
    }
}

const placeholdersInOpts = (opts, source) => {
    const newOpts = opts
    for (key in opts) {
        if (typeof opts[key] == 'string') {
            newOpts[key] = handlePlaceholders(opts[key], { opts: opts, source: source })
        }
        if (typeof opts[key] == 'number') {
            newOpts[key] = Number(
                handlePlaceholders(opts[key].toString(), { opts: opts, source: source }),
            )
        }
        if (typeof opts[key] == 'object') {
            newOpts[key] = JSON.parse(
                placeholdersInOpts(JSON.stringify(opts[key]), { opts: opts, source: source }),
            )
        }
    }
    return newOpts
}

process.on('unhandledRejection', error => {
    send({ type: 'ERROR', text: `Error: '${error.stack || error}'` })
})
