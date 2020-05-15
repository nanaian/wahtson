module.exports = {
    // Sends a message (option: 'text') to the source channel.
    async REPLY(source, opts) {
        await source.channel.send(opts.getText('text'))
    },

    // Sends a DM (option: 'text') to the source user.
    async REPLY_DM(source, opts) {
        await source.member.send(opts.getText('text'))
    },

    // Grants a role (option: 'role') to the source member.
    //
    // If the member already has the role, nothing happens.
    // If the named role does not exist, an error is thrown.
    async GRANT_ROLE(source, opts) {
        await source.member.roles.add(opts.getRole('role'))
    },

    // Revokes a role (option: 'role') from the source member.
    //
    // If the member doesn't have the role, nothing happens.
    // If the named role does not exist, an error is thrown.
    async REVOKE_ROLE(source, opts) {
        await source.member.roles.remove(opts.getRole('role'))
    },

    // Deletes the source message (ie. the message with the command in it).
    async DELETE_SOURCE_MESSAGE(source) {
        await source.message.delete()
    },

    // Copies the source message to a target channel (option: 'to').
    async COPY_SOURCE_MESSAGE(source, opts) {
        const channel = opts.getChannel('to')

        const attachments = [...source.message.attachments.values()]
        const primaryAttachment = attachments.shift()

        let attachmentEmbed = {}, files = []

        if (primaryAttachment) {
            switch (attachmentType(primaryAttachment)) {
                case 'image':
                    attachmentEmbed = {
                        image: { url: primaryAttachment.proxyURL }
                    }
                    break
                case 'video':
                    files = [
                        { attachment: primaryAttachment.proxyURL }
                    ]
                    break
                default:
                    // Unknown; we'll handle it with all the other attachments
                    attachments.unshift(primaryAttachment)
            }
        }

        const fields = []

        // Add reamining attachments to an extra field
        if (attachments.length) {
            fields.push({
                name: 'Attachments',
                value: attachments
                    .map(a => `[${a.proxyURL.substring(a.proxyURL.lastIndexOf('/')+1)}](${a.proxyURL})`)
                    .join('\n')
            })
        }

        channel.send({
            files,
            embed: {
                author: {
                    name: source.message.member.displayName,
                    icon_url: await source.message.author.displayAvatarURL(),
                },

                description: `${escapeMarkdown(source.message.content)}\n\n[Jump to Message](${source.message.url})`,
                timestamp: source.message.createdTimestamp,                
                fields,

                ...attachmentEmbed,
            },
        })
    },
    
    async GET_BALANCE(source, opts, state) {
        var balance = await getBalance(source.member.id, state)
        var placeholders = { "$balance": balance }
        source.channel.send(replacePlaceholders(opts.getText('text'), placeholders))
    },

    async PURCHASE_ITEM(source, opts, state) {
        var purchase = await state.db.get('SELECT * FROM purchases WHERE userid = ? AND item = ?', source.member.id, opts.getText('item'));
        var balance = await getBalance(source.member.id, state)

        var placeholders = { "$item" : opts.getText('item'), "$balance" : balance, "$outstanding" : opts.getNumber('price')-balance };

        if(purchase == undefined) {
            if(balance >= opts.getNumber('price')) {
                state.db.run('UPDATE users SET balance = ? WHERE id = ?', balance-opts.getNumber('price'), source.member.id);
                await state.db.run('INSERT INTO purchases (userid, item) VALUES (?, ?)', source.member.id, opts.getText('item'));
                source.channel.send(replacePlaceholders(opts.getText('text_success'), placeholders))
            } else {
                source.channel.send(replacePlaceholders(opts.getText('text_poor'), placeholders))
            }
        } else {
            source.channel.send(replacePlaceholders(opts.getText('text_duplicate'), placeholders))
        }
    },

    async GIVE_COINS(source, opts, state) {
        var balance = await getBalance(source.member.id, state)
        state.db.run('UPDATE users SET balance = ? WHERE id = ?', balance+opts.getNumber('amount'), source.member.id);
    },
}

const replacePlaceholders = (str, placeholders) => {
    Object.keys(placeholders).forEach((p) => {
        str = str.replace(p, placeholders[p]);
    });
    return str;
}

const escapeMarkdown = s => s.replace(/([\[\]\(\)])/g, '\\$&')

const extensionTypes = {
    'png': 'image',
    'jpg': 'image',
    'jpeg': 'image',
    'gif': 'image',
    'webp': 'image',
    'mp4': 'video',
    'mov': 'video',
    'webm': 'video'
}

const attachmentType = a => extensionTypes[fileExtension(a.url)]

const fileExtension = url => {
    if (!url) return

    return url.split('.').pop().split(/\#|\?/)[0]
}

const getBalance = async (id, state) => {
    var balance = await state.db.get('SELECT * FROM users WHERE id = ?', id);
    if(balance == undefined || isNaN(balance.balance)) {
        await state.db.run('INSERT INTO users (id, balance) VALUES (?, ?)', id, (await state.config.get('economy')).starting_coins);
    }
    balance = await state.db.get('SELECT * FROM users WHERE id = ?', id);

    return balance.balance
}