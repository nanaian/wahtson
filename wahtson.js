const chalk = require('chalk')
const { Wahtson } = require('./src/bot.js')
let bot = new Wahtson();

process.title = `WAHtson ${bot.version}`
console.log(`WAHtson ${bot.version}`)

bot.start();

bot.on('info', (event) => {
    process.stdout.write('\n')
    process.stdout.write(chalk[event[1]](event[0]))
})
bot.on('action', (event) => {
    process.stdout.write(`${(event[3] == true) ? ' | ' : '\n' }`)
    process.stdout.write(chalk.grey(`${event[0]}. ${event[1].type}`))
    if(event[2]) {
        process.stdout.write(chalk.magenta(' skipped'))
    }
})
bot.on('warning', (event) => {
    console.log(chalk.orange(event))
})
bot.on('error', (event) => {
    console.log(chalk.red(event))
})
bot.on('fatal_error', (event) => {
    console.log(chalk.red(`Fatal error: ${event}`))
    proccess.exit(1);
})

bot.on('config_errror', (event) => {
    console.log(chalk.red(event))
    open(CONFIG_TOML_PATH, { app: 'notepad', wait: true })
})