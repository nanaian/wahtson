const chalk = require('chalk')
const { getBalance, checkCooldown, timeObjToMs } = require('./util.js')

module.exports = {
    // Skips the action if the source user does not have the given role (option: 'role').
    async HAS_ROLE(source, opts) {
        return source.member.roles.cache.some(role => role.id === opts.getRole('role').id)
    },

    // Skips the action if the source user is not a nitro booster of the server.
    //
    // You can also specify a number of months (option?: 'month')
    // to allow ex-boosters of n months ago to pass this condition too.
    async IS_NITRO_BOOSTER(source, opts) {
        const ONE_MONTH = 2629800000
        let timeRequired = (opts.months || 1) * ONE_MONTH

        return Date.now() - source.member.premiumSince < timeRequired
    },

    async PREVIOUS_ACTION_SKIPPED(source, opts, state) {
        return state.previousActionSkipped
    },

    async REQUIRE_COINS(source, opts, state) {
        var balance = await getBalance(source.member.id, state)

        if (opts.getBoolean('deduct') && balance >= opts.getNumber('amount')) {
            state.db.run(
                'UPDATE users SET balance = ? WHERE id = ?',
                balance - opts.getNumber('amount'),
                source.member.id,
            )
        }

        return balance >= opts.getNumber('amount')
    },
    async HAS_ITEM(source, opts, state) {
        const purchase = await state.db.get(
            'SELECT * FROM purchases WHERE userid = ? AND item = ?',
            source.member.id,
            opts.getText('item'),
        )
        return purchase != undefined
    },

    async TIME_SINCE(source, opts, state) {
        let timeRequired = timeObjToMs(opts.getText('time'))

        const lastUsed = await checkCooldown(
            source.member.id,
            opts.cooldown_group || source.command,
            state,
            await opts.getBoolean('count_use', true),
        )

        return Date.now() - lastUsed > timeRequired
    },

    async HAS_ARGS(source, opts, state) {
        return source.args.length >= (await opts.getNumber('length'))
    },
    async ARG_EQUALS(source, opts, state) {
        var target = source.args[opts.getNumber('index')]
        return target != undefined && target == opts.getText('value')
    },
    async ARG_TYPE(source, opts, state) {
        var target = source.args[opts.getNumber('index')]

        const guild = source.member.guild

        if (opts.getText('value') == 'String') {
            return true
        }
        if (opts.getText('value') == 'Number') {
            return !isNaN(Number(target))
        }
        if (opts.getText('value') == 'Channel') {
            let channel
            if (target.startsWith('<#')) {
                const channelId = target.substr(2).slice(0, -1)
                channel = guild.channels.cache.find(c => c.id === channelId)
            }
            return channel != undefined
        }
        if (opts.getText('value') == 'Member') {
            let member
            if (target.startsWith('<@!')) {
                const memberId = target.substr(3).slice(0, -1)
                member = guild.members.cache.find(m => m.id === memberId)
            }
            return member != undefined
        }
        if (opts.getText('value') == 'Role') {
            let role
            if (target.startsWith('<@&')) {
                const roleId = target.substr(3).slice(0, -1)
                role = guild.roles.cache.find(r => r.id === roleId)
            }
            return role != undefined
        }
        if (opts.getText('value') == 'Emoji') {
            const re = /[\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}]/gu
            let emoji
            if (target.match(re)) {
                emoji = target
            }
            if(target.match(/(^(\<\:)[a-z0-9]+(\:)[0-9]+(\>)$)/gi)) {
                emoji = target
                emoji = source.member.client.emojis.resolve(target.split(":")[2].slice(0, -1))
            }
            return emoji != undefined
        }
        // Type is not handled
        throw `type ${opts.getText('value')} is not supported`
    },
}
