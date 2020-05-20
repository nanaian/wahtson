const chalk = require('chalk')
const bot = require("./src/bot.js");
bot.start();

process.title = `WAHtson ${bot.version}`
console.log(`WAHtson ${bot.version}`)

bot.events.on("info", (event) => {
    console.log(chalk[event[1]](event[0]))
})
bot.events.on("action", (event) => {
    if(event[0] != 1) process.stdout.write("\n")
    process.stdout.write(chalk.grey(`${event[0]}. ${event[1].type}`))
    if(event[2]) {
        console.log(chalk.magenta(' skipped'))
    }
})
bot.events.on("warning", (event) => {
    console.log(chalk.orange(event))
})
bot.events.on("error", (event) => {
    console.log(chalk.red(event))
})
bot.events.on("fatal_error", (event) => {
    console.log(chalk.red(`Fatal error: ${event}`))
    proccess.exit(1);
})