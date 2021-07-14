//let gameJs = require('./game')


module.exports = class mcCommandRunner {
    /**
     * 
     * @param {import('./game')} game The interaction to reply or manage
     * @param {String} command The name of the source that it came from, for example commands from discord will report 'discord'
     * @param {Array<String>} args The command being run
     * @param {String} sender Array of arguments
     * @param {String} source Username of player who sent the command
     */
    constructor(game, command, args, sender, source) {
        this.game = game;
        this.source = source;
        this.command = command;
        this.args = args;
        this.sender = sender;
    }
    /**@type {import('./game')} The interaction to reply or manage*/
    game;
    /**@type {String} The name of the source that it came from, for example commands from discord will report 'discord' */
    source;
    /**@type {String} The command being run */
    command;
    /**@type {Array<String>} Array of arguments */
    args;
    /**@type {String} Username of player who sent the command */
    sender;
};