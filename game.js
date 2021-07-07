// Represents a minecraft game

const { EventEmitter } = require('events')
const { Socket } = require('net');
const winston = require('winston');
const { cli } = require('winston/lib/winston/config');
const camelLibjs = require('../../camelLib');
const chatMessage = require('./chatMessage');
const chatCallBack = require('./chatCallback');
const commandRunnerJs = require('./mcCommandRunner');

module.exports = class mcgame extends EventEmitter{
    /**
     * 
     * @param {Socket} client 
     * @param {camelLibjs} camellib 
     * @param {Object} serverDatabase 
     * @param {Object} parentDatabase 
     * @param {winston.Logger} logger
     */
    constructor(camellib, serverDatabase, parentDatabase, logger, serverList, chatCallbacks){
        super();
        this.camellib=camellib;
        this.parentDatabase=parentDatabase;
        this.logger=logger
        this.channel=serverDatabase.channel
        this.key=serverDatabase.key;
        this.serverName=serverDatabase.name;
        this.guild=parentDatabase.id
        this.logChannel=serverDatabase.log
        this.serverList=serverList;
        this.socket=new Socket();
        this.connected=false;
        this.chatCallbacks=chatCallbacks;
        this.loadedOnce = false;
        /**
         * @type {Map}
         */
        

    }
    camellib;
    parentDatabase;
    logger;
    channel;
    key;
    serverName;
    guild;
    logChannel;
    serverList;
    loadedOnce;

    socket;
    /**@type {Boolean} Whether the Minecraft server is connected or not*/
    connected;
    /**@type {Array[Method]} List of all methods that must be called to determine what to do when a Minecraft message is sent*/
    chatCallbacks

    initConnection(){
        this.socket.on('data',data=>{
            let parsedPackets = []
            let parsedGarbage = data.toString("utf-8").substring(2);
            let garbageArray = parsedGarbage.split('endmessage')
            garbageArray.pop();
            garbageArray.forEach(element=>{
                if(element.length<2) return;
                let doctoredString = element
                if(!element.endsWith("}")){
                    doctoredString=doctoredString.substr(0,doctoredString.length-1)
                }
                if(!element.startsWith("{")){
                    doctoredString=doctoredString.substring(2)
                }
                try{
                    parsedPackets.push(JSON.parse(doctoredString))
                }catch(err){
                    this.logger.error("Unable to parse packet "+element)
                }
                
            })
            parsedPackets.forEach(packet=>{

                if(packet.packet=="chat"){
                    let tempObject = new chatMessage(packet.message,packet.sender,this)
                    let cancel = false
                    this.chatCallbacks.forEach(cb=>{
                        /**@type {chatCallBack} */
                        let callBack = cb
                        if(!this.camellib.database.get(this.guild).enabledPlugins.includes(callBack.plugin)) return;
                        if(callBack.method(tempObject)){
                            cancel = true;
                        }
                    })
                    let message = tempObject.content
                    if(!cancel){
                        if(tempObject.sendToDiscord) this.camellib.client.channels.cache.get(this.channel).send("**"+packet.sender+":** "+message);
                        if(!tempObject.sendToMinecraft) return;
                        this.serverList.forEach(server=>{
                            if(server.connected&&server.channel==this.channel){
                                server.sendChat(message,packet.sender)
                            }
                        })
                    }
                    return;
                }
                if(packet.packet=="event"){
                    if(packet.event=="No player was found") return;
                    if(packet.event.endsWith("joined the game")){
                        this.camellib.client.channels.cache.get(this.channel).send("**"+packet.event+"**").catch(()=>{});
                        return;
                    }
                    if(packet.event.endsWith("left the game")){
                        this.camellib.client.channels.cache.get(this.channel).send("**"+packet.event+"**").catch(()=>{});
                        return;
                    }
                    try{
                        this.camellib.client.channels.cache.get(this.logChannel).send(packet.event).catch(()=>{})
                        return;
                    }catch(err){
                        
                    }
                    
                }
                if(packet.packet=="death"){
                    this.camellib.client.channels.cache.get(this.channel).send("**"+packet.message+"**").catch(()=>{});
                }
                if(packet.packet=="command"){
                    let args = packet.command.replace('/','').split(' ')
                    let command = args.shift();
                    let toRun = new chatMessage(this,command,args,packet.sender,'minecraft')
                    this.camellib.mappedCommands.get(command).method(new commandRunnerJs(this,command,args,packet.sender,'minecraft'))
                }
            })
            
            
        })
        this.socket.on('close',()=>{
            this.connected = false
            try{
                this.camellib.client.channels.cache.get(this.logChannel).send("Server Disconnected").catch(()=>{})
            }catch(err){

            }
            this.socket.removeAllListeners();
        })
        this.socket.on('error',()=>{
            this.connected = false
            this.camellib.client.channels.cache.get(this.logChannel).send("Server error, disconnected").catch(()=>{})
            this.socket.removeAllListeners();
        })

        if(!this.loadedOnce){
            this.camellib.client.on('message',message=>{
                if(!this.connected) return;
                if(message.author==this.camellib.client.user) return;
                if(message.channel.id==this.channel){
                    if(message.content.length>0){
                        this.sendChat(message.content,message.author.username)
                        return;
                    }
                    if(message.attachments.size>0){
                        this.sendCommand("tellraw @a "+JSON.stringify({
                            "text":message.author.username+" has sent an image. You can see it in Discord.",
                            "italic":true,
                            "color":"gray"
                        }))
                    }
                }
                if(message.channel.id==this.logChannel&&!message.author.bot){
                    this.sendCommand(message.content)
                    return;
                }
            })
    
            this.camellib.on('pluginDisabled',(guildid,plugin)=>{
                this.camellib.mappedCommands.forEach(command=>{
                    if(command.plugin!=plugin) return;
                    this.socket.write(JSON.stringify({
                        "packet":"unregister",
                        "command":command.manifest.name
                    })+"\n")
                })
            });
            
    
            this.camellib.on('pluginEnabled',(guildid,plugin)=>{
                if(!this.camellib.database.get(guildid).hasOwnProperty("minecraft")){
                    this.camellib.database.get(guildid)["minecraft"]={
                        "servers":[]
                    }
                }
                this.camellib.mappedCommands.forEach(command=>{
                    if(command.plugin!=plugin) return;
                    if(this.camellib.database.get(this.guild).enabledPlugins.includes(command.plugin)&&command.manifest.source.includes('minecraft')){
                        let toSend = {
                            'name':command.manifest.name,
                            'argument' : {
                                'type': 'brigadier:literal'
                            },
                            "children" : []
                        }
                        command.manifest.options.forEach(option=>{
                            let toType = DiscordToBrigadier(option.type);
                            if (toType=='unknown') return;
                            let toPush = {
                                'name' : option.name,
                                "argument": {
                                    "type": toType
                                },
                                "executes" : "com.jkcoxson.camelmod.CommandReg::camelCommand"
                            }
                            toSend.children.push(toPush)
                        });
                        this.socket.write(JSON.stringify({
                            "packet":"register",
                            "command":toSend
                        })+"\n")
                    }
                })
            });
            this.loadedOnce = true;
        }
        
        
        

    }

    initCommands(){
        this.camellib.mappedCommands.forEach(command=>{
            if(this.camellib.database.get(this.guild).enabledPlugins.includes(command.plugin)&&command.manifest.source.includes('minecraft')){
                let toSend = {
                    'name':command.manifest.name,
                    'argument' : {
                        'type': 'brigadier:literal'
                    },
                    "children" : []
                }
                command.manifest.options.forEach(option=>{
                    let toType = DiscordToBrigadier(option.type);
                    if (toType=='unknown') return;
                    let toPush = {
                        'name' : option.name,
                        "argument": {
                            "type": toType
                        },
                        "executes" : "com.jkcoxson.camelmod.CommandReg::camelCommand"
                    }
                    toSend.children.push(toPush)
                });
                this.socket.write(JSON.stringify({
                    "packet":"register",
                    "command":toSend
                })+"\n")
            }
        })
    }
    /**
     * 
     * @param {String} message 
     * @param {String} sender 
     */
    sendChat(message, sender){
        message = message.replaceAll("\"","''")
        let toSends = message.split('\n')
        this.socket.write(JSON.stringify({
            "packet":"command",
            "command":"tellraw @a  {\"text\":\"<"+sender+"> "+toSends[0]+"\"}"
        })+"\n")
        toSends.shift();
        toSends.forEach(element => {
            this.socket.write(JSON.stringify({
                "packet":"command",
                "command":"tellraw @a "+toSends[0]
            })+"\n")
        });
    }
    sendCommand(command){
        this.socket.write(JSON.stringify({
            "packet":"command",
            "command":command
        })+'\n')
    }
    addCommand(){

    }
}

function DiscordToBrigadier(type){
    switch (type){
        case "STRING":
            return("brigadier:string");
        case "INTEGER":
            return("brigadier:integer");
        case "BOOLEAN":
            return("brigadier:boolean");
        default:
            return("unknown")
    }
}