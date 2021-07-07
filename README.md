# Minecraft-Plugin
The official Minecraft plugin for extending CamelBot's plugin system to your favorite block game.

## Usage
1. Enable the plugin with the /plugins command, use the /addserver command to get a key for your game.
2. Download the Fabric mod from [here](https://www.curseforge.com/minecraft/mc-mods/camelmod). Get the fabric API as well.
3. Run ``camelkey [your key]`` from the console of your Minecraft server.

## For Devs
This plugin taps directly into the plugin's general manifest.

Add 'minecraft' to the source of each command you want synchronized, add a 'minecraft' key to the root of the JSON. For example:
```json
"minecraft": {
    "chat": {
        "class": "main.js",
        "method": "onChat"
    }
}
For more information, check the [example plugin](https://github.com/CamelBot/Example-Plugin)

## License
This work is licensed under the Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License. To view a copy of this license, visit http://creativecommons.org/licenses/by-nc-nd/4.0/ or send a letter to Creative Commons, PO Box 1866, Mountain View, CA 94042, USA.
