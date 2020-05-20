const chalk = require('chalk')
const open = require('open')
const { Wahtson, log_level } = require('./src/bot.js')
let bot = new Wahtson()

process.title = `WAHtson ${bot.version}`
console.log(chalk.bold(`WAHtson ${bot.version}`))

let logLevel = 0
const eventLevels = { DEBUG: 0, INFO: 1, ACTION: 2, STATUS: 3, WARN: 4, ERROR: 5, FATAL: 6 }

bot.on('ready', async event => {
    logLevel = await event.get('log_level')
    const logTypes = Object.keys(eventLevels).filter(l => eventLevels[l] >= logLevel)
    console.log(chalk.cyan(`Logging level ${logLevel}: `) + chalk.grey(logTypes.join(', ')))
})

let prevEvent = {}
bot.on('event', event => {
    if (eventLevels[event.type] < logLevel) return

    if (JSON.stringify(event) == JSON.stringify(prevEvent)) return
    prevEvent = event
    setTimeout(() => {
        if (JSON.stringify(event) != JSON.stringify(prevEvent)) return
        prevEvent = {}
    }, 100)

    if (event.type == 'DEBUG') {
        console.log(chalk.grey(event.text))
    }
    if (event.type == 'INFO') {
        console.log(chalk.cyan(event.text))
    }
    if (event.type == 'ACTION') {
        process.stdout.write(
            chalk.grey(`${event.index}. ${event.data.type}`) +
                (event.skipped ? chalk.magenta(' skipped') : ''),
        )
        if (event.index == event.length) process.stdout.write('\n')
        else process.stdout.write(' | ')
    }
    if (event.type == 'STATUS') {
        console.log(chalk.green(event.text))
    }
    if (event.type == 'WARN') {
        console.log(chalk.yellow(event.text))
    }
    if (event.type == 'ERROR') {
        process.stdout.write(chalk.red(event.text) + " ")

        if (event.precaution == 'COPY_EXAMPLE_CONFIG') {
        }
        if (event.precaution == 'OPEN_CONFIG') {
            open(bot.botOptions.configPath, { app: 'notepad', wait: true })
        }
    }
    if (event.type == 'FATAL') {
        console.error(chalk.red(event.text))
    }
})

bot.start()
