import GObject from "gi://GObject";
import Gst from "gi://Gst?version=1.0";

const Player = GObject.registerClass(
  {
    Signals: {
      error: {},
    },
  },
  class Player extends GObject.Object {
    constructor() {
      super({});
      Gst.init(null);

      this._pipeline = new Gst.Pipeline({
        name: "AmbienceAudioStream",
      });

      this._playbin = Gst.ElementFactory.make("playbin3", "source");
      this._pipeline.add(this._playbin);

      this._playbinBus = this._pipeline.get_bus();
      this._playbinBus.add_signal_watch();
      this._playbinBusId = this._playbinBus.connect(
        "message",
        (_bus, message) => this.handleMessage(message),
      );
    }

    handleMessage(message) {
      if (message !== null) {
        switch (message.type) {
          case Gst.MessageType.ERROR:
            console.log("ambience.player::", message.parse_error());
            this.stop();
            this.emit("error");
            break;

          case Gst.MessageType.EOS:
            // repeat track when end of stream is reached
            this.setUri(this._playbin.get_property("current-uri"));
            break;
        }
      }
    }

    start() {
      this._pipeline.set_state(Gst.State.PLAYING);
    }

    stop() {
      this._pipeline.set_state(Gst.State.NULL);
    }

    setUri(uri) {
      this._playbin.set_property("uri", uri);
    }

    destroy() {
      this.stop();
      this._playbinBus.disconnect(this._playbinBusId);
    }
  },
);
export default Player;
