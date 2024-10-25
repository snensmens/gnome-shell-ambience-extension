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

      this.gicon = icon;
      this.menu.setHeader(icon, _("Ambience"), null);

      this._onEntryClicked = onEntryClicked;

      this._itemsSection = new PopupMenu.PopupMenuSection();
      this.menu.addMenuItem(this._itemsSection);

      this._ytdlpInstalled = false;
      this.activeRow = null;

      checkIfYtDlpInstalled().then((isInstalled) => {
        this._ytdlpInstalled = isInstalled;
        this.syncEntries();
      });
    }

    syncEntries() {
      const entries = this._settings.get_value("resources").recursiveUnpack();

      this._itemsSection.removeAll();

      entries.forEach((entry) => {
        const item = new PopupMenu.PopupMenuItem(entry.name, {
          reactive: !(!this._ytdlpInstalled && entry.type === 2),
        });
        item.connect("activate", () => this._onEntryClicked(entry));

        if (this.activeRow && this.activeRow.id === entry.id) {
          item.setOrnament(PopupMenu.Ornament.CHECK);
        }

        this._itemsSection.addMenuItem(item);
      });
    }

    reset() {
      this.subtitle = null;
      this.activeRow = null;
      this.syncEntries();
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

    this._appIcon = Gio.icon_new_for_string(
      `${this.path}/resources/sound-wave-symbolic.svg`,
    );

    this._player = new Player();
    this._playerErrorSignalId = this._player.connect("error", () =>
      this._onPlaybinError(),
    );
    this._playbinUriSignalId = this._player._playbin.connect(
      "notify::uri",
      () => this._onPlaybinUriChanged(),
    );

    this._toggle = new AmbienceQuickToggle(
      this._settings,
      this._appIcon,
      (entry) => this._onEntryClicked(entry),
    );
    this._toggleChangedSignalId = this._toggle.connect("notify::checked", () =>
      this._onToggleChanged(),
    );

    this._ambience_toggle_indicator = new AmbienceIndicator();
    this._ambience_toggle_indicator.quickSettingsItems.push(this._toggle);

    this._resourcesChangedSignalId = this._settings.connect(
      "changed::resources",
      () => this._toggle.syncEntries(),
    );

    Main.panel.statusArea.quickSettings.addExternalIndicator(
      this._ambience_toggle_indicator,
    );
  }

  disable() {
    this._toggle.disconnect(this._toggleChangedSignalId);

    this._ambience_toggle_indicator.quickSettingsItems.forEach((item) =>
      item.destroy(),
    );
    this._ambience_toggle_indicator.destroy();

    this._player._playbin.disconnect(this._playbinUriSignalId);
    this._player.disconnect(this._playerErrorSignalId);
    this._player.destroy();
    this._player = null;

    this._appIcon = null;

    this._settings.disconnect(this._resourcesChangedSignalId);
    this._settings = null;
  }

  _getResources() {
    return this._settings.get_value("resources").recursiveUnpack();
  }

  _onToggleChanged() {
    if (this._toggle.checked) {
      const lastPlayedId = this._settings.get_int64("last-played");

      this._getResources().forEach((resource) => {
        if (resource.id === lastPlayedId) {
          this._onEntryClicked(resource);
        }
      });
    } else {
      this._player.stop();
      this._toggle.reset();
    }
  }

  _onPlaybinUriChanged() {
    // if the toggle is active we start playback right along
    if (this._toggle.checked) {
      this._player.start();
      this._toggle.subtitle = this._toggle.activeRow.name;
      this._toggle.syncEntries();
    }
  }

  _onPlaybinError() {
    this._toggle.checked = false;
  }

  async _onEntryClicked(entry) {
    if (this._toggle.activeRow && this._toggle.activeRow.id === entry.id) {
      // do nothing if the user clicked on the already active entry
      return;
    }

    this._toggle.subtitle = null;
    this._player.stop();

    this._toggle.activeRow = entry;
    this._settings.set_int64("last-played", entry.id);

    // we only have to set the uri of the new resource
    // playback is handled in the _onPlaybinUriChanged method when the player notifies us that the uri has changed
    if (entry.type === 2) {
      // if the entry refers to a youtube-link, we have to resolve the audio-url with yt-dlp
      const query = await getYoutubeLinkFromUri(entry.uri);
      if (query.wasSuccessful) {
        this._player.setUri(query.result);
      }
    } else {
      this._player.setUri(entry.uri);
    }

    this._toggle.checked = true;
  }
}
