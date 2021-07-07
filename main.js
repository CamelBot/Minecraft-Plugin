const { GuildAuditLogs } = require('discord.js');
const { EventEmitter } = require('events');
const winston = require('winston');
const CamelLibjs = require('../../camelLib');
const mcgame = require('./game');
const plugClass = require('../../plugClass');
const mappedClass = require('../../mappedClass');
const chatCallbackJs = require('./chatCallback')

/**@type {winston.Logger} */
let logger;
/**@type {CamelLibjs} */
let camellib;
const tcpServer = require('net').createServer();
const port = 42070;
let mcServers = [];
let chatCallbacks = [];

module.exports = class mineplug extends EventEmitter {
    constructor(parameters){
        super();
        logger = parameters.logger
        camellib = parameters.camellib

        tcpServer.listen(port,"0.0.0.0", ()=>{
            logger.info("Minecraft plugin listening on port "+port+".")
        });

        camellib.database.forEach(guild=>{
            if(guild.hasOwnProperty("minecraft")&&guild.enabledPlugins.includes("minecraft")){
                guild.minecraft.servers.forEach(game=>{
                    mcServers.push(new mcgame(camellib,game,guild,logger,mcServers, chatCallbacks))
                })
            }
        })

        camellib.on('pluginsLoaded',()=>{
            camellib.plugins.forEach(element=>{
                /**@type {plugClass} */
                let plugin = element

                if(plugin.manifest.hasOwnProperty("minecraft")){
                    if(plugin.manifest.minecraft.hasOwnProperty("chat")){
                        if(!camellib.mappedClasses.has(plugin.name+"/"+plugin.manifest.minecraft.chat.class)){
                            let tempObject = require('../'+plugin.name+"/"+plugin.manifest.minecraft.chat.class)
                            camellib.mappedClasses.set(plugin.name+"/"+plugin.manifest.minecraft.chat.class,new tempObject(new mappedClass(logger,camellib)))
                        }
                        chatCallbacks.push(new chatCallbackJs(camellib.mappedClasses.get(plugin.name+"/"+plugin.manifest.minecraft.chat.class)[plugin.manifest.minecraft.chat.method],camellib.mappedClasses.get(plugin.name+"/"+plugin.manifest.minecraft.chat.class),plugin.name))
                    }
                }

            })
        })

        camellib.on('pluginEnabled',(guildid,plugin)=>{
            if(plugin=='minecraft'){
                let guild = camellib.database.get(guildid);
                guild.minecraft.servers.forEach(game=>{
                    mcServers.push(new mcgame(camellib, game, guild, logger, mcServers, chatCallbacks))
                });
            }
        })

        camellib.on('pluginDisabled',(guildid,plugin)=>{
            if(plugin=='minecraft'){
                mcServers.forEach(game=>{
                    if(game.guild==guildid){
                        game.socket.destroy();
                        mcServers.splice(mcServers.indexOf(game));
                    }
                })
            }
        })
        
        
    }

}

tcpServer.on('connection', client=>{
    // The client will send the connection request packet immediately after connecting
    client.once('data', data=>{
        try{
            let packet
            try{
                packet = JSON.parse(data.toString('utf-8').substring(2).split('endmessage')[0])
            }catch(err){
                logger.error(err)
                return;
            }
            if(packet.version!="4.0.0"){
                client.write(JSON.stringify({
                    "packet":"status",
                    "message":"You are using an old version of CamelMod, please get the newest version at https://www.curseforge.com/minecraft/mc-mods/camelmod"
                })+"\n")
                client.destroy();
                return;
            }
            if(packet.packet!="key"){
                client.write(JSON.stringify({
                    "packet":"status",
                    "message":"You seem to be using an invalid mod, CamelBot received the wrong packet."
                })+"\n")
                client.destroy();
                return;
            }
            let found = false
            mcServers.forEach(server=>{
                if(packet.key==server.key){
                    server.connected = true;
                    server.socket = client;
                    client.write(JSON.stringify({
                        "packet":"status",
                        "message":"Connection verified"
                    })+"\n")
                    server.initConnection();
                    server.initCommands();
                    camellib.client.channels.cache.get(server.logChannel).send("Server Connected")
                    found = true;
                }
            })
            if (found) return;
            client.write(JSON.stringify({
                "packet":"status",
                "message":"Your key is invalid or missing, check your key in ./config/CamelMod/key.txt"
            })+"\n")
            client.destroy();
            return;
        }catch(err){
            console.log(err)
            try{
                client.write(JSON.stringify({
                    "packet":"status",
                    "message":"An error has occured, CamelBot has terminated the connection. Have a nice day."
                })+"\n")
                client.destroy();
            }catch(err){
                logger.error(err)
            }
            
        }
        
        
        
    })
})




