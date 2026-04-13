export function encodeSseDataMessage(data: string): string {
  const normalized = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  return `${lines.map((line) => `data: ${line}`).join("\n")}\n\n`;
}

function decodeSseDataLine(line: string): string | null {
  if (!line.startsWith("data:")) {
    return null;
  }

  const value = line.slice("data:".length);
  return value.startsWith(" ") ? value.slice(1) : value;
}

export function readSseMessages(buffer: string): { messages: string[]; remaining: string } {
  const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const messages: string[] = [];
  let remaining = normalized;

  while (true) {
    const boundaryIndex = remaining.indexOf("\n\n");
    if (boundaryIndex === -1) {
      break;
    }

    const block = remaining.slice(0, boundaryIndex);
    remaining = remaining.slice(boundaryIndex + 2);

    const dataLines = block
      .split("\n")
      .map((line) => decodeSseDataLine(line))
      .filter((line): line is string => line !== null);

    if (dataLines.length > 0) {
      messages.push(dataLines.join("\n"));
    }
  }

  return { messages, remaining };
}
