// Represents a method for chat
const mappedClassJs = require('../../mappedClass')

module.exports = class chatCallback {
    /**
     * 
     * @param {Function} method 
     * @param {mappedClassJs} mappedClass 
     * @param {String} plugin 
     */
    constructor(method,mappedClass,plugin){
        this.method=method;
        this.mappedClass=mappedClass;
        this.plugin=plugin
    }
    method;
    mappedClass;
    plugin;
}