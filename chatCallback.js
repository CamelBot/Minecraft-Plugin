// Represents a method for chat

module.exports = class chatCallback {
    /**
     * 
     * @param {Function} method 
     * @param {import('../../mappedClass')} mappedClass 
     * @param {String} plugin 
     */
    constructor(method, mappedClass, plugin) {
        this.method = method;
        this.mappedClass = mappedClass;
        this.plugin = plugin;
    }
    method;
    mappedClass;
    plugin;
};