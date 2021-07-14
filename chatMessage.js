



module.exports = class chatMessage {
    constructor(message, sender, game) {
        this.content = message;
        this.sender = sender;
        this.game = game;
        this.sendToDiscord = true;
        this.sendToMinecraft = true;
    }
    content;
    sender;
    game;
    sendToDiscord;
    sendToMinecraft;
};