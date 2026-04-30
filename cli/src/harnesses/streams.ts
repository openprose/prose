import type { WritableStreamLike } from "./types.js";

export function writeLine(stream: WritableStreamLike, text: string): void {
	if (!text) {
		return;
	}
	stream.write(text);
	if (!text.endsWith("\n")) {
		stream.write("\n");
	}
}
