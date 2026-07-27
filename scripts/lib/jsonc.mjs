// Minimal JSONC support for the wrangler configs — no dependency.
//
// `blankComments` replaces comment characters with spaces instead of deleting
// them, so the result is the SAME LENGTH as the input. That lets the setup
// script locate the `"env": {` brace in the blanked text and splice into the
// original text at the same offset, keeping every comment intact.

/** Replace `//` and block comments with spaces, preserving length and newlines. */
export function blankComments(text) {
  const out = [...text];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];

    // Skip over string literals so `https://` inside a value isn't eaten.
    if (c === '"') {
      i++;
      while (i < n) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (c === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") out[i++] = " ";
      continue;
    }

    if (c === "/" && text[i + 1] === "*") {
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] !== "\n") out[i] = " ";
        i++;
      }
      // Blank the closing `*/` too.
      if (i < n) out[i++] = " ";
      if (i < n) out[i++] = " ";
      continue;
    }

    i++;
  }

  return out.join("");
}

/** Strip trailing commas (`,}` / `,]`) outside of strings. */
function stripTrailingCommas(text) {
  const out = [...text];
  let i = 0;
  const n = text.length;

  while (i < n) {
    if (text[i] === '"') {
      i++;
      while (i < n) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (text[i] === ",") {
      let j = i + 1;
      while (j < n && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") out[i] = " ";
    }

    i++;
  }

  return out.join("");
}

/** Parse a JSONC document (comments + trailing commas tolerated). */
export function parseJsonc(text) {
  return JSON.parse(stripTrailingCommas(blankComments(text)));
}
