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
        var target = source.args[opts.getNumber("index")];
        return (target != undefined && target == opts.getText("value"))
    },
    async ARG_TYPE(source, opts, state) {
        var target = source.args[opts.getNumber("index")];
        
        return (target != undefined && false)
    },
}
