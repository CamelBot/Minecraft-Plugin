const Discord = require('discord.js');
const { EventEmitter } = require('events');
const winston = require('winston');
const CamelLibjs = require('../../camelLib');
const mcgame = require('./game');
const plugClass = require('../../plugClass');
const mappedClass = require('../../mappedClass');
const chatCallbackJs = require('./chatCallback')
const commandRunnerJs = require('../../commandRunner');
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
                        game.socket.write(JSON.stringify({
                            "packet":"status",
                            "message":"The Minecraft plugin has been disabled on your Discord server."
                        })+"\n")
                        game.socket.destroy();
                        mcServers.splice(mcServers.indexOf(game));
                    }
                })
            }
        })

        camellib.on('guildKicked',guild=>{
            mcServers.forEach(game=>{
                if(game.guild==guild.id){
                    game.socket.write(JSON.stringify({
                        "packet":"status",
                        "message":"You have kicked CamelBot from your Discord server."
                    })+"\n");
                    game.socket.destroy();
                    mcServers.splice(mcServers.indexOf(game));
                }
            })
        });
        
        
    }
    /**
     * 
     * @param {commandRunnerJs} commandRunner 
     */
    addServer(commandRunner){
        if(!commandRunner.interaction.member.permissions.has("ADMINISTRATOR")){
            let toSend = new Discord.MessageEmbed()
                .setColor("#FF0000")
                .setTitle("Error")
                .addField("Permission","You do not have administrator permission to add a Mineraft server")
            commandRunner.interaction.reply({embeds:[toSend],ephemeral:true});
            return;
        }
        let key = generateKey(100);
        let toSend = new Discord.MessageEmbed()
            .setColor("#008000")
            .setTimestamp()
            .setTitle("CamelMod")
            .setThumbnail("https://cdn.discordapp.com/avatars/775045401434783746/37d7479c5ca6cf0842fcaa17e02a51fa.png")
            .setURL("https://www.curseforge.com/minecraft/mc-mods/camelmod")
            .addField("Instructions","To get started, download CamelMod from the link above. Add the Fabric API to your mod folder.\n"+
                      "Start your Minecraft server and run ``camelkey "+key+"``. Do not share your key with anyone, it is specific for your server.\n"+
                      "Your server will then be connected to the greatest bot! To set a chat channel and log channel, run ``/serverchat`` and ``/serverlog``"
                    );
        commandRunner.interaction.reply({embeds:[toSend],ephemeral:true});
        let oldLength = camellib.database.get(commandRunner.interaction.guild.id).minecraft.servers.length;
        camellib.database.get(commandRunner.interaction.guild.id).minecraft.servers.push({
            "key":key,
            "name":commandRunner.interaction.options.get("name").value,
            "channel":commandRunner.interaction.channel.id,
            "log":""
        });
        camellib.saveDatabase();
        let guild = camellib.database.get(commandRunner.interaction.guild.id);
        mcServers.push(new mcgame(camellib,guild.minecraft.servers[oldLength],guild,logger,chatCallbacks));
    }

    /**
     * 
     * @param {commandRunnerJs} commandRunner
     */
    deleteServer(commandRunner){
        let toSplice = undefined;
        camellib.database.get(commandRunner.interaction.guild.id).minecraft.servers.forEach(element=>{
            if(element.name==commandRunner.interaction.options.get("name").value){
                toSplice = element
            }
        })
        if(toSplice==undefined){
            let toSend = new Discord.MessageEmbed()
            .setColor("#FF0000")
            .setTitle("Error")
            .addField("Not found","A server couldn't be found by that name, run ``/serverstatus`` to see all servers.");
            commandRunner.interaction.reply({embeds:[toSend]});
            return;
        }
        camellib.database.get(commandRunner.interaction.guild.id).minecraft.servers.splice(camellib.database.get(commandRunner.interaction.guild.id).minecraft.servers.indexOf(toSplice),1);
        camellib.saveDatabase();
        let game
        mcServers.forEach(element=>{
            if(element.serverName==commandRunner.interaction.options.get('name').value){
                game = element;
            }
        })
        game.socket.write(JSON.stringify({
            "packet":"status",
            "message":"This server has been deleted from CamelBot."
        })+"\n");
        game.socket.destroy();
        mcServers.splice(mcServers.indexOf(game));
        let toSend = new Discord.MessageEmbed()
            .setColor("#008000")
            .setTitle("Success")
            .addField("Removed server","The Minecraft server has been removed and disconnected.");
        commandRunner.interaction.reply({embeds:[toSend]});
    }

    /**
     * 
     * @param {commandRunnerJs} commandRunner 
     */
    serverStatus(commandRunner){
        let toSend = new Discord.MessageEmbed()
            .setColor("#7D099A")
            .setTimestamp();
        mcServers.forEach(game=>{
            if(game.guild!=commandRunner.interaction.guild.id) return;
            if(game.connected&&game.guild==commandRunner.interaction.guild.id){
                toSend.addField(game.serverName,"Online");
            }else{
                toSend.addField(game.serverName,"Offline");
            }
        })
        if(toSend.fields.length<1){
            toSend.addField("Error","You don't seem to have any servers. Add one now with ``/addserver``.")
        }
        commandRunner.interaction.reply({embeds:[toSend]});
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
                    try{
                        camellib.client.channels.cache.get(server.logChannel).send("Server Connected").catch(()=>{});
                    }catch(err){

                    }
                    
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

function generateKey(length){
    // Declare all characters
    let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    // Pick characers randomly
    let str = '';
    for (let i = 0; i < length; i++) {
        str += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return str;

}


