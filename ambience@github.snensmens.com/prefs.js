import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { checkIfYtDlpInstalled } from "./communication.js";

Gio._promisify(Gtk.FileDialog.prototype, "open", "open_finish");
Gio._promisify(Adw.AlertDialog.prototype, "choose", "choose_finish");

export default class AmbiencePreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    window.add(new SoundSettings(window, this.getSettings()));
  }
}

const SoundSettings = GObject.registerClass(
  {
    GTypeName: "SoundSettings",
    Template: GLib.uri_resolve_relative(
      import.meta.url,
      "./resources/ui/sound-settings.ui",
      GLib.UriFlags.NONE,
    ),
    InternalChildren: ["ytdlpInfo", "ytdlpInfoIcon", "soundGroup"],
  },
  class SoundSettings extends Adw.PreferencesPage {
    constructor(window, settings) {
      super({});
      this.title = _("Settings");

      this._window = window;

      this._settings = settings;
      this._settings.connect("changed::resources", () => {
        this._updateResourcesList(
          this._settings.get_value("resources").recursiveUnpack(),
        );
      });

      checkIfYtDlpInstalled().then((isInstalled) => {
        if (isInstalled) {
          this._ytdlpInfo.title = _("yt-dlp is installed");
          this._ytdlpInfo.subtitle = "";
          this._ytdlpInfo.css_classes = ["success"];
          this._ytdlpInfoIcon.icon_name = "emblem-ok-symbolic";
        } else {
          this._ytdlpInfo.title = _("yt-dlp is not installed");
          this._ytdlpInfo.subtitle = _(
            "install yt-dlp to listen to audio from youtube",
          );
          this._ytdlpInfo.css_classes = ["warning"];
          this._ytdlpInfoIcon.icon_name = "dialog-warning-symbolic";
        }
      });

      this._soundGroup.title = _("Ambient Sounds");

      this._entries = [];
      this._updateResourcesList(
        this._settings.get_value("resources").recursiveUnpack(),
      );
    }

    _addAmbientSound(_button) {
      const dialog = new AddResourceDialog({ window: this._window });

      dialog
        .choose(this._window, null)
        .then((action) => {
          if (action === "save") {
            this._saveResource({
              resourceType: dialog._resourceType.selected,
              name: dialog._nameRow.text,
              uri:
                dialog._resourceType.selected === 0
                  ? dialog._fileRow.text
                  : dialog._urlRow.text,
              id: dialog._resourceId,
            });
          }
        })
        .catch((error) => console.log(error));
    }

    _saveResource({ resourceType, name, uri, id }) {
      var resourceExists = false;
      const resources = this._settings.get_value("resources").recursiveUnpack();

      resources.every((resource) => {
        if (resource.id === id) {
          resource.type = resourceType;
          resource.name = name;
          resource.uri = uri;

          resourceExists = true;
        }

        return resource.id !== id;
      });

      if (!resourceExists) {
        resources.push({
          type: resourceType,
          name: name,
          uri: uri,
          id: id,
        });
      }

      this._persistResources(resources);
    }

    _persistResources(resources) {
      const builder = new GLib.VariantBuilder(GLib.VariantType.new("aa{sv}"));

      resources.forEach((resource) => {
        builder.add_value(
          new GLib.Variant("a{sv}", {
            type: GLib.Variant.new_uint32(resource.type),
            name: GLib.Variant.new_string(resource.name),
            uri: GLib.Variant.new_string(resource.uri),
            id: GLib.Variant.new_uint64(resource.id),
          }),
        );
      });

      this._settings.set_value("resources", builder.end());
    }

    _updateResourcesList(resources) {
      this._entries.forEach((entry) => {
        this._soundGroup.remove(entry);
      });

      this._entries = [];

      resources.forEach((resource) => {
        const entry = new ResourceEntry(
          resource,
          (entry) => this._editEntry(entry),
          (entry) => this._deleteEntry(entry),
        );
        this._entries.push(entry);
        this._soundGroup.add(entry);
      });
    }

    _editEntry(entry) {
      const dialog = new AddResourceDialog({
        window: this._window,
        editable: {
          name: entry.title,
          type: entry._resourceType,
          uri: entry._uri,
          id: entry._id,
        },
      });

      dialog
        .choose(this._window, null)
        .then((action) => {
          if (action === "save") {
            this._saveResource({
              resourceType: dialog._resourceType.selected,
              name: dialog._nameRow.text,
              uri:
                dialog._resourceType.selected === 0
                  ? dialog._fileRow.text
                  : dialog._urlRow.text,
              id: dialog._resourceId,
            });
          }
        })
        .catch((error) => console.log(error));
    }

    _deleteEntry(entry) {
      const resources = this._settings
        .get_value("resources")
        .recursiveUnpack()
        .filter((resource) => resource.id !== entry.id);

      this._persistResources(resources);
      this._updateResourcesList(resources);
    }
  },
);

const ResourceEntry = GObject.registerClass(
  {
    GTypeName: "ResourceEntry",
    Template: GLib.uri_resolve_relative(
      import.meta.url,
      "./resources/ui/resource-entry.ui",
      GLib.UriFlags.NONE,
    ),
    InternalChildren: [],
  },
  class ResourceEntry extends Adw.ActionRow {
    constructor(resource, onEdit, onDelete) {
      super({ title: resource.name });
      this._resourceType = resource.type;
      this._uri = resource.uri;
      this._id = resource.id;

      this._onEdit = onEdit;
      this._onDelete = onDelete;
    }
    get id() {
      return this._id;
    }

    _onEditClicked(_button) {
      this._onEdit(this);
    }

    _onDeleteClicked(_button) {
      this._onDelete(this);
    }
  },
);

const AddResourceDialog = GObject.registerClass(
  {
    GTypeName: "AddResourceDialog",
    Template: GLib.uri_resolve_relative(
      import.meta.url,
      "./resources/ui/add-resource-dialog.ui",
      GLib.UriFlags.NONE,
    ),
    InternalChildren: ["resourceType", "nameRow", "fileRow", "urlRow"],
  },
  class AddResourceDialog extends Adw.AlertDialog {
    constructor({ window, editable }) {
      super({});

      this._window = window;
      this._resourceId = editable ? editable.id : Date.now();

      this._resourceType.title = _("Type");
      this._resourceType.model = Gtk.StringList.new([
        _("Local File"),
        _("URL"),
        _("YouTube"),
      ]);
      this._resourceType.connect("notify::selected-item", () => {
        this._fileRow.visible = this._resourceType.selected === 0;
        this._onInputChanged();
      });
      this._resourceType.set_selected(editable ? editable.type : 0);

      this.heading = editable
        ? _("Edit ambient sound")
        : _("Add ambient sound");
      this.body = _(
        "You can add ambient sounds from your local files, a web url or a YouTube Video/LiveStream",
      );

      this._nameRow.title = _("Name");
      this._nameRow.text = editable ? editable.name : "";

      this._urlRow.title = _("Weblink");
      this._urlRow.text = editable && editable.type !== 0 ? editable.uri : "";

      this._fileRow.title = _("File");
      this._fileRow.text = editable && editable.type === 0 ? editable.uri : "";

      this.add_response("cancel", _("Cancel"));
      this.add_response("save", _("Save"));
      this.set_response_appearance("save", 1);
      this.set_response_enabled("save", editable !== null);
    }

    /*
     * called when one of the inputs changes
     * disables the save button when inputes are invalid
     */
    _onInputChanged() {
      if (this._nameRow.text.trim() === "") {
        this.set_response_enabled("save", false);
      } else {
        if (this._resourceType.selected === 0) {
          this.set_response_enabled("save", this._fileRow.text.trim() !== "");
        } else {
          this.set_response_enabled("save", this._urlRow.text.trim() !== "");
        }
      }
    }

    async _openFileChooser(_button) {
      const fileDialog = new Gtk.FileDialog();
      fileDialog
        .open(this._window, null)
        .then((file) => (this._fileRow.text = file.get_uri()))
        .catch((error) =>
          console.error("ambience.prefs:: choosing file failed:", error),
        );
    }
  },
);
