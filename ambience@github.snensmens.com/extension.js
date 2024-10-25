/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import St from "gi://St";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import Gst from "gi://Gst?version=1.0";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";
import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";
import {
  QuickMenuToggle,
  SystemIndicator,
} from "resource:///org/gnome/shell/ui/quickSettings.js";

import Player from "./player.js";
import {
  checkIfYtDlpInstalled,
  getYoutubeLinkFromUri,
} from "./communication.js";

const AmbienceQuickToggle = GObject.registerClass(
  class AmbienceQuickToggle extends QuickMenuToggle {
    constructor(settings, icon, onEntryClicked) {
      super({
        title: _("Ambience"),
        toggleMode: true,
      });

      this._settings = settings;
      this._settings.connect("changed::sounds", () => this.syncEntries());

      this.gicon = icon;
      this.menu.setHeader(icon, _("Ambience"), null);

      this._onEntryClicked = onEntryClicked;

      this._itemsSection = new PopupMenu.PopupMenuSection();
      this.menu.addMenuItem(this._itemsSection);

      this._ytdlpInstalled = checkIfYtDlpInstalled();

      this.activeRow = null;
      this.syncEntries();
    }

    syncEntries() {
      const entries = this._settings.get_value("sounds").recursiveUnpack();

      this._itemsSection.removeAll();

      entries.forEach((entry) => {
        const item = new PopupMenu.PopupMenuItem(entry.name);
        const handlerId = item.connect("activate", () =>
          this._onEntryClicked(entry),
        );

        if (this.activeRow && this.activeRow.id === entry.id) {
          item.setOrnament(PopupMenu.Ornament.CHECK);
        }

        if (!(!this._ytdlpInstalled && entry.type === 2)) {
          this._itemsSection.addMenuItem(item);
        }
      });
    }
  },
);

const AmbienceIndicator = GObject.registerClass(
  class AmbienceIndicator extends SystemIndicator {
    constructor() {
      super();
    }
  },
);

export default class AmbienceExtension extends Extension {
  enable() {
    this._settings = this.getSettings();

    this._player = new Player((error) => this._onPlayerError(error));
    this._playerUriHandlerId = this._player._playbin.connect(
      "notify::uri",
      () => {
        if (this._toggle.checked) {
          this._player.start();
          this._toggle.subtitle = this._toggle.activeRow.name;
          this._toggle.syncEntries();
        }
      },
    );

    this._appIcon = Gio.icon_new_for_string(
      `${this.path}/resources/sound-wave-symbolic.svg`,
    );

    this._toggle = new AmbienceQuickToggle(
      this._settings,
      this._appIcon,
      (entry) => this._onEntryClicked(entry),
    );
    this._toggleHandlerId = this._toggle.connect("notify::checked", () => {
      if (this._toggle.checked) {
        const lastPlayedId = this._settings.get_int64("last-played");

        this._settings
          .get_value("sounds")
          .recursiveUnpack()
          .forEach((resource) => {
            if (resource.id === lastPlayedId) {
              this._onEntryClicked(resource);
            }
          });
      } else {
        this._player.stop();
        this._toggle.subtitle = null;
        this._toggle.activeRow = null;
        this._toggle.syncEntries();
      }
    });

    this._ambience_toggle_indicator = new AmbienceIndicator();
    this._ambience_toggle_indicator.quickSettingsItems.push(this._toggle);

    Main.panel.statusArea.quickSettings.addExternalIndicator(
      this._ambience_toggle_indicator,
    );
  }

  disable() {
    this._toggle.disconnect(this._toggleHandlerId);
    this._toggle = null;

    this._player._playbin.disconnect(this._playerUriHandlerId);
    this._player.destroy();
    this._player = null;

    this._ambience_toggle_indicator.quickSettingsItems.forEach((item) =>
      item.destroy(),
    );
    this._ambience_toggle_indicator.destroy();

    this._settings = null;
    this._appIcon = null;
  }

  async _onEntryClicked(entry) {
    if (this._toggle.activeRow && this._toggle.activeRow.id === entry.id) {
      return;
    }

    this._toggle.subtitle = null;
    this._player.stop();

    this._toggle.checked = true;
    this._toggle.activeRow = entry;
    this._settings.set_int64("last-played", entry.id);

    if (entry.type === 2) {
      // if the entry refers to a youtube-link, we have to resolve the audio-url with yt-dlp
      // the player handles the playback, when the changed uri is detected
      const query = await getYoutubeLinkFromUri(entry.uri);
      if (query.wasSuccessful) {
        this._player.setUri(query.result);
      }
    } else {
      this._player.setUri(entry.uri);
    }
  }
}
