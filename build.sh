#! /bin/bash

blueprint-compiler compile ./resources/sound-settings.blp --output ./ambience@github.snensmens.com/resources/ui/sound-settings.ui
blueprint-compiler compile ./resources/resource-entry.blp --output ./ambience@github.snensmens.com/resources/ui/resource-entry.ui
blueprint-compiler compile ./resources/add-resource-dialog.blp --output ./ambience@github.snensmens.com/resources/ui/add-resource-dialog.ui

cd ambience@github.snensmens.com

gnome-extensions pack --force --extra-source=resources/ --extra-source="communication.js" --extra-source="player.js"
gnome-extensions install ambience@github.snensmens.com.shell-extension.zip --force

rm ambience@github.snensmens.com.shell-extension.zip
