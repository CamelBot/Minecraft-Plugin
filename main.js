const Discord = require('discord.js');
const { EventEmitter } = require('events');
const mcgame = require('./game');
const mappedClass = require('../../mappedClass');
const chatCallbackJs = require('./chatCallback');
/**@type {import('winston').Logger} */

let logger;
/**@type {import('../../camelLib')} */
let camellib;
const tcpServer = require('net').createServer();
const port = 42070;
let mcServers = [];
let chatCallbacks = [];
let pluginsLoaded = false;
module.exports = class mineplug extends EventEmitter {
    constructor(parameters) {
        super();
        logger = parameters.logger;
        camellib = parameters.camellib;

        tcpServer.listen(port, '0.0.0.0', () => {
            logger.info('Minecraft plugin listening on port ' + port + '.');
        });

        camellib.database.forEach(guild => {
            if (Object.prototype.hasOwnProperty.call(guild, 'minecraft') && guild.enabledPlugins.includes('minecraft')) {
                guild.minecraft.servers.forEach(game => {
                    mcServers.push(new mcgame(camellib, game, guild, logger, mcServers, chatCallbacks));
                });
            }
        });

        camellib.on('pluginsLoaded', () => {
            pluginsLoaded = true;
            this.mcServers = mcServers;
            camellib.plugins.forEach(element => {
                /**@type {import('../../plugClass')} */
                let plugin = element;

                if (Object.prototype.hasOwnProperty.call(plugin.manifest, 'minecraft')) {
                    if (Object.prototype.hasOwnProperty.call(plugin.manifest.minecraft, 'chat')) {
                        if (!camellib.mappedClasses.has(plugin.name + '/' + plugin.manifest.minecraft.chat.class)) {
                            let tempObject = require('../' + plugin.name + '/' + plugin.manifest.minecraft.chat.class);
                            camellib.mappedClasses.set(plugin.name + '/' + plugin.manifest.minecraft.chat.class, new tempObject(new mappedClass(logger, camellib)));
                        }
                        chatCallbacks.push(new chatCallbackJs(camellib.mappedClasses.get(plugin.name + '/' + plugin.manifest.minecraft.chat.class)[plugin.manifest.minecraft.chat.method], camellib.mappedClasses.get(plugin.name + '/' + plugin.manifest.minecraft.chat.class), plugin.name));
                    }
                }

            });
        });

        camellib.on('pluginEnabled', (guildid, plugin) => {
            if (plugin == 'minecraft') {
                let guild = camellib.database.get(guildid);
                guild.minecraft.servers.forEach(game => {
                    mcServers.push(new mcgame(camellib, game, guild, logger, mcServers, chatCallbacks));
                });
            }
        });

        camellib.on('pluginDisabled', (guildid, plugin) => {
            if (plugin == 'minecraft') {
                mcServers.forEach(game => {
                    if (game.guild == guildid) {
                        game.socket.write(JSON.stringify({
                            'packet': 'status',
                            'message': 'The Minecraft plugin has been disabled on your Discord server.'
                        }) + '\n');

                        game.socket.destroy();
                        mcServers.splice(mcServers.indexOf(game));
                    }
                });
            }
        });

        camellib.on('guildKicked', guild => {
            mcServers.forEach(game => {
                if (game.guild == guild.id) {
                    game.socket.write(JSON.stringify({
                        'packet': 'status',
                        'message': 'You have kicked CamelBot from your Discord server.'
                    }) + '\n');
                    game.socket.destroy();
                    mcServers.splice(mcServers.indexOf(game));
                }
            });
        });



    }

    /**@type {Array<mcgame>} */
    mcServers

    /**
     * 
     * @param {import('../../commandRunner')} commandRunner 
     */
    addServer(commandRunner) {
        if (!commandRunner.interaction.member.permissions.has('ADMINISTRATOR')) {
            let toSend = new Discord.MessageEmbed()
                .setColor('#FF0000')
                .setTitle('Error')
                .addField('Permission', 'You do not have administrator permission to add a Mineraft server');
            commandRunner.interaction.reply({ embeds: [toSend], ephemeral: true });
            return;
        }
        let key = generateKey(100);
        let toSend = new Discord.MessageEmbed()
            .setColor('#008000')
            .setTimestamp()
            .setTitle('CamelMod')
            .setThumbnail('https://cdn.discordapp.com/avatars/775045401434783746/37d7479c5ca6cf0842fcaa17e02a51fa.png')
            .setURL('https://www.curseforge.com/minecraft/mc-mods/camelmod')
            .addField('Instructions', 'To get started, download CamelMod from the link above. Add the Fabric API to your mod folder.\n' +
                'Start your Minecraft server and run ``camelkey ' + key + '``. Do not share your key with anyone, it is specific for your server.\n' +
                'Your server will then be connected to the greatest bot! To set a chat channel and log channel, run ``/serverchat`` and ``/serverlog``'
            );
        commandRunner.interaction.reply({ embeds: [toSend], ephemeral: true });
        let oldLength = camellib.database.get(commandRunner.interaction.guild.id).minecraft.servers.length;
        camellib.database.get(commandRunner.interaction.guild.id).minecraft.servers.push({
            'key': key,
            'name': commandRunner.interaction.options.get('name').value,
            'channel': commandRunner.interaction.channel.id,
            'log': ''
        });
        camellib.saveDatabase();
        let guild = camellib.database.get(commandRunner.interaction.guild.id);
        mcServers.push(new mcgame(camellib, guild.minecraft.servers[oldLength], guild, logger, chatCallbacks));
    }

    /**
     * 
     * @param {import('../../commandRunner')} commandRunner
     */
    deleteServer(commandRunner) {
        if (!commandRunner.interaction.member.permissions.has('ADMINISTRATOR')) {
            let toSend = new Discord.MessageEmbed()
                .setColor('#FF0000')
                .setTitle('Error')
                .addField('Permission', 'You do not have administrator permission to remove a Mineraft server');
            commandRunner.interaction.reply({ embeds: [toSend], ephemeral: true });
            return;
        }
        let toSplice = undefined;
        camellib.database.get(commandRunner.interaction.guild.id).minecraft.servers.forEach(element => {
            if (element.name == commandRunner.interaction.options.get('name').value) {
                toSplice = element;
            }
        });
        if (toSplice == undefined) {
            let toSend = new Discord.MessageEmbed()
                .setColor('#FF0000')
                .setTitle('Error')
                .addField('Not found', 'A server couldn\'t be found by that name, run ``/serverstatus`` to see all servers.');
            commandRunner.interaction.reply({ embeds: [toSend] });
            return;
        }
        camellib.database.get(commandRunner.interaction.guild.id).minecraft.servers.splice(camellib.database.get(commandRunner.interaction.guild.id).minecraft.servers.indexOf(toSplice), 1);
        camellib.saveDatabase();
        let game;
        mcServers.forEach(element => {
            if (element.serverName == commandRunner.interaction.options.get('name').value && element.guild == commandRunner.interaction.guild.id) {
                game = element;
            }
        });
        game.socket.write(JSON.stringify({
            'packet': 'status',
            'message': 'This server has been deleted from CamelBot.'
        }) + '\n');
        game.socket.destroy();
        mcServers.splice(mcServers.indexOf(game));
        let toSend = new Discord.MessageEmbed()
            .setColor('#008000')
            .setTitle('Success')
            .addField('Removed server', 'The Minecraft server has been removed and disconnected.');
        commandRunner.interaction.reply({ embeds: [toSend] });
    }

    /**
     * 
     * @param {import('../../commandRunner')} commandRunner 
     */
    serverStatus(commandRunner) {
        let toSend = new Discord.MessageEmbed()
            .setColor('#7D099A')
            .setTimestamp();
        mcServers.forEach(game => {
            if (game.guild != commandRunner.interaction.guild.id) return;
            if (game.connected && game.guild == commandRunner.interaction.guild.id) {
                toSend.addField(game.serverName, 'Online');
            } else {
                toSend.addField(game.serverName, 'Offline');
            }
        });
        if (toSend.fields.length < 1) {
            toSend.addField('Error', 'You don\'t seem to have any servers. Add one now with ``/addserver``.');
        }
        commandRunner.interaction.reply({ embeds: [toSend] });
    }

    /**
     * 
     * @param {import('../../commandRunner')} commandRunner 
     */
    serverchat(commandRunner) {
        if (!commandRunner.interaction.member.permissions.has('ADMINISTRATOR')) {
            let toSend = new Discord.MessageEmbed()
                .setColor('#FF0000')
                .setTitle('Error')
                .addField('Permission', 'You do not have administrator permission to set Minecraft channels');
            commandRunner.interaction.reply({ embeds: [toSend], ephemeral: true });
            return;

        }
        let game = undefined;
        mcServers.forEach(element => {
            if (element.serverName == commandRunner.interaction.options.get('name').value && element.guild == commandRunner.interaction.guild.id) {
                game = element;
            }
        });
        let database = undefined;
        camellib.database.get(commandRunner.interaction.guild.id).minecraft.servers.forEach(element => {
            if (element.name == commandRunner.interaction.options.get('name').value) {
                database = element;
            }
        });
        if (game == undefined || database == undefined) {
            let toSend = new Discord.MessageEmbed()
                .setColor('#FF0000')
                .setTitle('Error')
                .addField('Not found', 'A server couldn\'t be found by that name, run ``/serverstatus`` to see all servers.');
            commandRunner.interaction.reply({ embeds: [toSend] });
            return;
        }
        if (commandRunner.interaction.options.has('channel')) {
            game.channel = commandRunner.interaction.options.get('channel').channel.id;
            database.channel = commandRunner.interaction.options.get('channel').channel.id;
            let toSend = new Discord.MessageEmbed()
                .setColor('#008000')
                .setTitle('Success')
                .addField('Success', 'Chat will be sent to #' + commandRunner.interaction.options.get('channel').channel.name + ' now.');
            commandRunner.interaction.reply({ embeds: [toSend] });
        } else {
            game.channel = commandRunner.interaction.channel.id;
            database.channel = commandRunner.interaction.channel.id;
            let toSend = new Discord.MessageEmbed()
                .setColor('#008000')
                .setTitle('Success')
                .addField('Success', 'Chat will be sent here now.');
            commandRunner.interaction.reply({ embeds: [toSend] });
        }
        camellib.saveDatabase();

    }


    /**
     * 
     * @param {import('../../commandRunner')} commandRunner 
     */
    serverlog(commandRunner) {
        if (!commandRunner.interaction.member.permissions.has('ADMINISTRATOR')) {
            let toSend = new Discord.MessageEmbed()
                .setColor('#FF0000')
                .setTitle('Error')
                .addField('Permission', 'You do not have administrator permission to set Minecraft channels');
            commandRunner.interaction.reply({ embeds: [toSend], ephemeral: true });
            return;

        }
        let game = undefined;
        mcServers.forEach(element => {
            if (element.serverName == commandRunner.interaction.options.get('name').value && element.guild == commandRunner.interaction.guild.id) {
                game = element;
            }
        });
        let database = undefined;
        camellib.database.get(commandRunner.interaction.guild.id).minecraft.servers.forEach(element => {
            if (element.name == commandRunner.interaction.options.get('name').value) {
                database = element;
            }
        });
        if (game == undefined || database == undefined) {
            let toSend = new Discord.MessageEmbed()
                .setColor('#FF0000')
                .setTitle('Error')
                .addField('Not found', 'A server couldn\'t be found by that name, run ``/serverstatus`` to see all servers.');
            commandRunner.interaction.reply({ embeds: [toSend] });
            return;
        }
        if (commandRunner.interaction.options.has('channel')) {
            game.logChannel = commandRunner.interaction.options.get('channel').channel.id;
            database.log = commandRunner.interaction.options.get('channel').channel.id;
            let toSend = new Discord.MessageEmbed()
                .setColor('#008000')
                .setTitle('Success')
                .addField('Success', 'Log messages will be sent to ' + commandRunner.interaction.options.get('channel').channel.name + ' now.');
            commandRunner.interaction.reply({ embeds: [toSend] });
        } else {
            game.logChannel = commandRunner.interaction.channel.id;
            database.log = commandRunner.interaction.channel.id;
            let toSend = new Discord.MessageEmbed()
                .setColor('#008000')
                .setTitle('Success')
                .addField('Success', 'Log messages will be sent here now.');
            commandRunner.interaction.reply({ embeds: [toSend] });
        }
        camellib.saveDatabase();
    }

};

tcpServer.on('connection', client => {
    if (!pluginsLoaded) {
        logger.error('A CamelMod server tried to connect but the plugins are not loaded yet');
        client.destroy();
        return;
    }
    // The client will send the connection request packet immediately after connecting
    client.once('data', data => {
        try {
            let packet;
            try {
                packet = JSON.parse(data.toString('utf-8').substring(2).split('endmessage')[0]);
            } catch (err) {
                logger.error(err);
                return;
            }
            if (packet.version != '4.0.0') {
                client.write(JSON.stringify({
                    'packet': 'status',
                    'message': 'You are using an old version of CamelMod, please get the newest version at https://www.curseforge.com/minecraft/mc-mods/camelmod'
                }) + '\n');
                client.destroy();
                return;
            }
            if (packet.packet != 'key') {
                client.write(JSON.stringify({
                    'packet': 'status',
                    'message': 'You seem to be using an invalid mod, CamelBot received the wrong packet.'
                }) + '\n');
                client.destroy();
                return;
            }
            let found = false;
            mcServers.forEach(server => {
                if (packet.key == server.key) {
                    server.connected = true;
                    server.socket = client;
                    client.write(JSON.stringify({
                        'packet': 'status',
                        'message': 'Connection verified'
                    }) + '\n');
                    server.initConnection();
                    // server.initCommands();
                    try {
                        camellib.client.channels.cache.get(server.logChannel).send('Server Connected').catch(() => { });
                    } catch (err) {
                        // I do what I want, stop lint
                    }


                    found = true;
                }
            });
            if (found) return;
            client.write(JSON.stringify({
                'packet': 'status',
                'message': 'Your key is invalid or missing, check your key in ./config/CamelMod/key.txt'
            }) + '\n');
            client.destroy();
            return;
        } catch (err) {
            console.log(err);
            try {
                client.write(JSON.stringify({
                    'packet': 'status',
                    'message': 'An error has occured, CamelBot has terminated the connection. Have a nice day.'
                }) + '\n');
                client.destroy();
            } catch (err) {
                logger.error(err);
            }

        }



    });
});

function generateKey(length) {
    // Declare all characters
    let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    // Pick characers randomly
    let str = '';
    for (let i = 0; i < length; i++) {
        str += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return str;

}


