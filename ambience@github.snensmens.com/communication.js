import Gio from "gi://Gio";
import GLib from "gi://GLib";

Gio._promisify(
  Gio.Subprocess.prototype,
  "communicate_utf8_async",
  "communicate_utf8_finish",
);

export async function getYoutubeLinkFromUri(uri) {
  return await execCommunicate(
    ["yt-dlp", "-f", "bestaudio", "--get-url", uri],
    Gio.Cancellable.new(),
  );
}

export async function checkIfYtDlpInstalled() {
  const result = await execCommunicate(
    ["which", "yt-dlp"],
    Gio.Cancellable.new(),
  );

  return result.wasSuccessful;
}

/**
 * Execute a command asynchronously and return the result.
 * @cancellable can be used to stop the process before it finishes.
 *
 * @param {string[]} argv - a list of string arguments
 * @param {Gio.Cancellable} [cancellable] - cancellable object
 */
async function execCommunicate(argv, cancellable) {
  let flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;

  const proc = new Gio.Subprocess({ argv, flags });
  proc.init(cancellable);

  const cancelId = cancellable.connect(() => proc.force_exit());

  const result = {
    wasSuccessful: false,
    result: null,
    error: null,
  };

  try {
    const [stdout, stderr] = await proc.communicate_utf8_async(
      null,
      cancellable,
    );

    result.wasSuccessful = proc.get_exit_status() == 0;
    result.result = stdout.trim();
    result.error = stderr.trim();
  } catch (e) {
    console.error(
      `ambience.communication:: executing command ${argv} failed:`,
      e,
    );
  }

  cancellable.disconnect(cancelId);

  return result;
}
