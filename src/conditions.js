module.exports = {
	// Skips the action if the source user does not have the given role (option: 'role').
	async HAS_ROLE(source, opts) {
		return source.member.roles.cache.some(role => role.id === opts.getRole('role').id)
	},

	// Skips the action if the source user is not a nitro booster of the server.
	//
	// You can also specify a number of months (option?: 'month')
	// to allow ex-boosters of n months ago to pass this condition too.
	async IS_NITRO_BOOSTER(source) {
		const ONE_MONTH = 2629800000
		let timeRequired = (source.months || 1) * ONE_MONTH

		return (Date.now() - source.member.premiumSince) < timeRequired
	},

	async PREVIOUS_ACTION_SKIPPED(source, opts, state) {
		return state.previousActionSkipped
	},

	async REQUIRE_COINS(source, opts, state) {
		var balance = await getBalance(source.member.id, state)

		if(opts.getBoolean('deduct') && balance >= opts.getNumber('amount')) {
			state.db.run('UPDATE users SET balance = ? WHERE id = ?', balance-opts.getNumber('amount'), source.member.id);
		}

		return balance >= opts.getNumber('amount');
	},
}

const replacePlaceholders = (str, placeholders) => {
    Object.keys(placeholders).forEach((p) => {
        var re = new RegExp(RegExp.quote(p),"g")
        str = str.replace(re, placeholders[p]);
    });
    return str;
}
RegExp.quote = function(str) {
    return str.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
};

const getBalance = async (id, state) => {
	var balance = await state.db.get('SELECT * FROM users WHERE id = ?', id);
    if(balance == undefined || isNaN(balance.balance)) {
        await state.db.run('INSERT INTO users (id, balance) VALUES (?, ?)', id, (await state.config.get('economy')).starting_coins);
    }
    balance = await state.db.get('SELECT * FROM users WHERE id = ?', id);

    return balance.balance
}