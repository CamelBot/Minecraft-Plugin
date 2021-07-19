



module.exports = class chatMessage {
    constructor(message, sender, color, game) {
        this.content = message;
        this.sender = sender;
        this.game = game;
        this.sendToDiscord = true;
        this.sendToMinecraft = true;
        this.color = color;
    }
    content;
    sender;
    game;
    sendToDiscord;
    sendToMinecraft;
    color;
};