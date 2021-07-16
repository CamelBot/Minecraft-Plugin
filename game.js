// Represents a minecraft game

const { EventEmitter } = require('events');
const { Socket } = require('net');
const chatMessage = require('./chatMessage');
const commandRunnerJs = require('./mcCommandRunner');


/**@type {import('../../camelLib')} */
let externalCamellib;

module.exports = class mcgame extends EventEmitter {

    /**
     * 
     * @param {Socket} client 
     * @param {import('../../camelLib')} camellib 
     * @param {Object} serverDatabase 
     * @param {Object} parentDatabase 
     * @param {import('winston').Logger} logger
     */
    constructor(camellib, serverDatabase, parentDatabase, logger, serverList, chatCallbacks) {
        super();
        this.camellib = camellib;
        this.parentDatabase = parentDatabase;
        this.logger = logger;
        this.channel = serverDatabase.channel;
        this.key = serverDatabase.key;
        this.serverName = serverDatabase.name;
        this.guild = parentDatabase.id;
        this.logChannel = serverDatabase.log;
        this.serverList = serverList;
        this.socket = new Socket();
        this.connected = false;
        this.chatCallbacks = chatCallbacks;
        this.loadedOnce = false;
        this.lastSent = new Map();
        externalCamellib = camellib;

        /**
         * @type {Map}
         */


    }
    /**@type {import('../../camelLib')} CamelLib reference*/
    camellib;
    /**@type {Object} Database of the guild that this server belongs to I think?*/
    parentDatabase;
    /**@type {import('winston').Logger} Logger for the Minecraft plugin */
    logger;
    /**@type {String} ID of the channel that this server sends chat to*/
    channel;
    /**@type {String} Key of the server from CamelMod when it connects */
    key;
    /**@type {String} Name of the server defined by the user at creation */
    serverName;
    /**@type {String} ID of the guild that this server belongs to*/
    guild;
    /**@type {String} ID of the channel that this server sends logs to*/
    logChannel;
    /**@type {Array} List of all servers loaded into CamelBot */
    serverList;
    /**@type {Boolean} Whether the server has been connected before or not */
    loadedOnce;
    /**@type {Socket} The socket that the server is connected through */

    socket;
    /**@type {Boolean} Whether the Minecraft server is connected or not*/
    connected;
    /**@type {Array[Method]} List of all methods that must be called to determine what to do when a Minecraft message is sent*/
    chatCallbacks
    /**@type {Map} */
    lastSent
    initConnection() {
        this.socket.on('data', data => {
            let parsedPackets = [];
            let parsedGarbage = data.toString('utf-8').substring(2);
            let garbageArray = parsedGarbage.split('endmessage');
            garbageArray.pop();
            garbageArray.forEach(element => {
                if (element.length < 2) return;
                let doctoredString = element;
                if (!element.endsWith('}')) {
                    doctoredString = doctoredString.substr(0, doctoredString.length - 1);
                }
                if (!element.startsWith('{')) {
                    doctoredString = doctoredString.substring(2);
                }
                try {
                    parsedPackets.push(JSON.parse(doctoredString));
                } catch (err) {
                    this.logger.error('Unable to parse packet ' + element);
                }

            });
            parsedPackets.forEach(packet => {

                if (packet.packet == 'chat') {
                    let tempObject = new chatMessage(packet.message, packet.sender, this);
                    let cancel = false;
                    this.chatCallbacks.forEach(cb => {
                        /**@type {import('./chatCallback')} */
                        let callBack = cb;
                        if (!this.camellib.database.get(this.guild).enabledPlugins.includes(callBack.plugin)) return;
                        if (callBack.method(tempObject)) {
                            cancel = true;
                        }
                    });
                    let message = tempObject.content;
                    if (!cancel) {
                        if (this.lastSent.has(this.channel)) {
                            if (this.lastSent.get(this.channel) == packet.sender) {
                                if (tempObject.sendToDiscord) this.camellib.client.channels.cache.get(this.channel).send(message);
                            } else {
                                if (tempObject.sendToDiscord) this.camellib.client.channels.cache.get(this.channel).send('__**' + packet.sender + '**__\n' + message);
                                this.lastSent.set(this.channel, packet.sender);

                            }
                        } else {
                            this.lastSent.set(this.channel, packet.sender);
                            if (tempObject.sendToDiscord) this.camellib.client.channels.cache.get(this.channel).send('__**' + packet.sender + '**__\n' + message);
                        }
                        if (!tempObject.sendToMinecraft) return;
                        this.serverList.forEach(server => {
                            if (server.connected && server.channel == this.channel) {
                                server.sendChat(message, packet.sender);
                            }
                        });
                    }
                    return;
                }
                if (packet.packet == 'event') {
                    if (packet.event == 'No player was found') return;
                    if (packet.event.endsWith('joined the game')) {
                        this.camellib.client.channels.cache.get(this.channel).send('**' + packet.event + '**').catch(() => { });
                        this.lastSent.set(this.channel, '[discord]');
                        return;
                    }
                    if (packet.event.endsWith('left the game')) {
                        this.camellib.client.channels.cache.get(this.channel).send('**' + packet.event + '**').catch(() => { });
                        this.lastSent.set(this.channel, '[discord]');
                        return;
                    }
                    try {
                        this.camellib.client.channels.cache.get(this.logChannel).send(packet.event).catch(() => { });
                        return;
                    } catch (err) {
                        // your mom stop
                    }

                }
                if (packet.packet == 'death') {
                    this.camellib.client.channels.cache.get(this.channel).send('**' + packet.message + '**').catch(() => { });
                    this.lastSent.set(this.channel, '[discord]');

                }
                if (packet.packet == 'command') {
                    let args = packet.command.replace('/', '').split(' ');
                    let command = args.shift();
                    this.camellib.mappedCommands.get(command).method(new commandRunnerJs(this, command, args, packet.sender, 'minecraft'));
                }
                if (packet.packet == 'coords') {
                    let coords = packet.coords.split(',');
                    let roundedCoords = [];
                    coords.forEach(coord => {
                        roundedCoords.push(parseFloat(coord).toFixed(0).toString());
                    });
                    this.emit('coords', ({
                        'player': packet.player,
                        'coords': roundedCoords,
                        'dimension': packet.dimension
                    }));
                }
                if (packet.packet == 'players') {
                    this.emit('players', packet.players);
                }
                if (packet.packet == 'ready') {
                    if (packet.ready) {
                        this.emit('ready');
                    }
                }
            });


        });
        this.socket.on('close', () => {
            this.connected = false;
            try {
                this.camellib.client.channels.cache.get(this.logChannel).send('Server Disconnected').catch(() => { });
            } catch (err) {
                // this does nothing
            }
            this.socket.removeAllListeners();
        });
        this.socket.on('error', () => {
            this.connected = false;
            this.camellib.client.channels.cache.get(this.logChannel).send('Server error, disconnected').catch(() => { });
            this.socket.removeAllListeners();
        });
        let intervalId = setInterval(() => {
            this.socket.write(JSON.stringify({
                'packet': 'ready'
            }) + '\n');
        }, 10000);
        this.once('ready', () => {
            clearInterval(intervalId);
            this.initCommands();
        });
        if (!this.loadedOnce) {
            this.camellib.client.on('messageCreate', message => {
                if (!this.connected) return;
                if (message.author == this.camellib.client.user) {
                    if (this.camellib.plugins.has('multiplexer') && message.channel.id == this.channel) {
                        let that = this;
                        setTimeout(function () {
                            if (externalCamellib.plugins.get('multiplexer').class.multiplexedMessages.includes(message.id)) {
                                externalCamellib.plugins.get('multiplexer').class.multihosts.forEach(multihost => {
                                    if (multihost.channel.id == message.channel.id) {
                                        let toSend = message.content;
                                        let sender = multihost.lastSender;
                                        if (toSend.startsWith('__**' + sender + '**__\n')) {
                                            let toSendSplit = toSend.split('\n');
                                            toSendSplit.shift();
                                            toSend = toSendSplit.join('\n');
                                        }
                                        that.sendChat(toSend, sender);
                                        return;
                                    }
                                    if (multihost.clients.has(message.channel.id)) {
                                        let toSend = message.content;
                                        let sender = multihost.clients.get(message.channel.id).lastSender;
                                        if (toSend.startsWith('__**' + sender + '**__\n')) {
                                            let toSendSplit = toSend.split('\n');
                                            toSendSplit.shift();
                                            toSend = toSendSplit.join('\n');
                                        }
                                        that.sendChat(toSend, sender);
                                        return;
                                    }
                                });
                            }
                        }, 150);
                    }
                    return;
                }
                if (message.channel.id == this.channel) {
                    this.lastSent.set(message.channel.id, '[discord]');
                    if (message.content.length > 0) {
                        this.sendChat(message.content, message.author.username);
                        return;
                    }
                    if (message.attachments.size > 0) {
                        this.sendCommand('tellraw @a ' + JSON.stringify({
                            'text': message.author.username + ' has sent an image. You can see it in Discord.',
                            'italic': true,
                            'color': 'gray'
                        }));
                    }
                }
                if (message.channel.id == this.logChannel && !message.author.bot) {
                    this.sendCommand(message.content);
                    return;
                }
            });

            this.camellib.on('pluginDisabled', (guildid, plugin) => {
                this.camellib.mappedCommands.forEach(command => {
                    if (command.plugin != plugin) return;
                    this.socket.write(JSON.stringify({
                        'packet': 'unregister',
                        'command': command.manifest.name
                    }) + '\n');
                });
            });


            this.camellib.on('pluginEnabled', (guildid, plugin) => {
                if (!Object.prototype.hasOwnProperty.call(this.camellib.database.get(guildid), 'minecraft')) {
                    this.camellib.database.get(guildid)['minecraft'] = {
                        'servers': []
                    };
                }
                this.camellib.mappedCommands.forEach(command => {
                    if (command.plugin != plugin) return;
                    if (this.camellib.database.get(this.guild).enabledPlugins.includes(command.plugin) && command.manifest.source.includes('minecraft')) {
                        let toSend = {
                            'name': command.manifest.name,
                            'argument': {
                                'type': 'brigadier:literal'
                            },
                            'children': []
                        };
                        if (command.manifest.options.length == 0) {
                            toSend['executes'] = 'com.jkcoxson.camelmod.CommandReg::camelCommand';
                        }
                        command.manifest.options.forEach(option => {
                            let toType = DiscordToBrigadier(option.type);
                            if (toType == 'unknown') return;
                            let toPush = {
                                'name': option.name,
                                'argument': {
                                    'type': toType
                                },
                                'executes': 'com.jkcoxson.camelmod.CommandReg::camelCommand'
                            };
                            toSend.children.push(toPush);
                        });
                        this.socket.write(JSON.stringify({
                            'packet': 'register',
                            'command': toSend
                        }) + '\n');
                    }
                });
            });
            this.loadedOnce = true;

        }





    }

    initCommands() {
        this.camellib.mappedCommands.forEach(command => {
            if (this.camellib.database.get(this.guild).enabledPlugins.includes(command.plugin) && command.manifest.source.includes('minecraft')) {
                let toSend = {
                    'name': command.manifest.name,
                    'argument': {
                        'type': 'brigadier:literal'
                    },
                    'children': []
                };
                if (command.manifest.options.length == 0) {
                    toSend['executes'] = 'com.jkcoxson.camelmod.CommandReg::camelCommand';
                }
                command.manifest.options.forEach(option => {
                    let toType = DiscordToBrigadier(option.type);
                    if (toType == 'unknown') return;
                    let toPush = {
                        'name': option.name,
                        'argument': {
                            'type': toType
                        },
                        'executes': 'com.jkcoxson.camelmod.CommandReg::camelCommand'
                    };
                    toSend.children.push(toPush);
                });
                this.socket.write(JSON.stringify({
                    'packet': 'register',
                    'command': toSend
                }) + '\n');
            }
        });
    }
    /**
     * 
     * @param {String} message 
     * @param {String} sender 
     */
    sendChat(message, sender) {
        message = message.replaceAll('"', '\'\'');
        let toSends = message.split('\n');
        this.socket.write(JSON.stringify({
            'packet': 'command',
            'command': 'tellraw @a  {"text":"<' + sender + '> ' + toSends[0] + '"}'
        }) + '\n');
        toSends.shift();
        toSends.forEach(() => {
            this.socket.write(JSON.stringify({
                'packet': 'command',
                'command': 'tellraw @a ' + toSends[0]
            }) + '\n');
        });
    }
    sendCommand(command) {
        this.socket.write(JSON.stringify({
            'packet': 'command',
            'command': command
        }) + '\n');
    }
    addCommand() {

    }

    /**
     * Sends a tellraw command to the server
     * @param {String} message Message to send
     * @param {String} target Player to send it to, "@a" for all players
     * @param {Object} options Options to format the text
     * @param {String} options.color The color of the text, must be a Minecraft color
     * @param {Boolean} options.bold Make it bold?
     * @param {Boolean} options.italic Make it italic?
     * @param {Boolean} options.underlined Make it underlined?
     * @param {Boolean} options.obfuscated Make it obfuscated?
     */
    tellraw(message, target = '@a', options = { color: 'white', bold: false, italic: false, underlined: false, obfuscated: false }) {
        this.socket.write(JSON.stringify({
            'packet': 'command',
            'command': 'tellraw ' + target + ' ' + JSON.stringify({
                'text': message,
                'color': options.color,
                'bold': options.bold,
                'italic': options.italic,
                'underlined': options.underlined,
                'obfuscated': options.obfuscated
            })
        }) + '\n');
    }

    /**
     * 
     * @param {String} player Player of what to get the coordinates of
     * @returns {Promise}
     */
    async getCoordinates(player) {
        let that = this;
        // eslint-disable-next-line no-unused-vars
        return new Promise((resolve, reject) => {
            this.socket.write(JSON.stringify({
                'packet': 'coords',
                'player': player
            }) + '\n');
            that.once('coords', (packet) => {
                if (packet.player == player) {
                    resolve({
                        'coords': packet.coords,
                        'dimension': packet.dimension
                    });
                }
            });
        });
    }

    /**
     * @returns {Promise}
     */
    async getPlayers() {
        let that = this;
        // eslint-disable-next-line no-unused-vars
        return new Promise((resolve, reject) => {
            this.socket.write(JSON.stringify({
                'packet': 'players'
            }) + '\n');
            that.on('players', (players) => {
                resolve(players);
            });
        });
    }


};

function DiscordToBrigadier(type) {
    switch (type) {
        case 'STRING':
            return ('brigadier:string');
        case 'INTEGER':
            return ('brigadier:integer');
        case 'BOOLEAN':
            return ('brigadier:boolean');
        default:
            return ('unknown');
    }
}
